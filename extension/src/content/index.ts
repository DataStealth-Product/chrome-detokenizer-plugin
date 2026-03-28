import {
  BackgroundProcessJobUpdateMessageSchema,
  BackgroundPushRuntimeConfigMessageSchema,
  ContentDetectedTokensMessageSchema,
  DetectedTokensResponseSchema,
  MessageType,
  RuntimeConfigSchema,
  VisualOverlayResponseSchema,
  parseMessage
} from "../shared/contracts";
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_SENSITIVE_TTL_MS,
  getDetokenizationScope,
  isSupportedDownloadTarget,
  isSupportedPageUrl
} from "../shared/config";
import { shouldProcessCurrentFrame } from "./frameScope";
import { IncrementalObserver } from "./observer";
import { ReplaceEngine } from "./replaceEngine";
import { ScanEngine } from "./scanEngine";
import { filterDetectionForOutbound } from "./tokenSendPolicy";
import { DefaultTokenPatternProvider } from "./tokenPatternProvider";
import { VisualOverlayManager } from "./visualOverlayManager";
import { VisualSurfaceScanner } from "./visualSurfaceScanner";

const provider = new DefaultTokenPatternProvider();
const scanEngine = new ScanEngine(provider);
const replaceEngine = new ReplaceEngine();
const observer = new IncrementalObserver((roots) => enqueueRoots(roots), DEFAULT_DEBOUNCE_MS);
const visualOverlayManager = new VisualOverlayManager(DEFAULT_SENSITIVE_TTL_MS);
const visualSurfaceScanner = new VisualSurfaceScanner();

const pendingRoots = new Set<Node>();
const defaultRuntimeConfig = RuntimeConfigSchema.parse({
  enabled: true,
  crossOriginIframesEnabled: true,
  visualOcrEnabled: true,
  automaticDownloadsEnabled: true
});
let runtimeConfig = defaultRuntimeConfig;
let observing = false;
let processing = false;
let visualScanTimer: number | undefined;
let visualScanInFlight = false;
let visualScanQueued = false;
let visualScanBlockedUntil = 0;
let visualScanDisabledError: string | undefined;
let lastVisualScanError: string | undefined;
let bypassDownloadInterception = false;
const pageScope = getDetokenizationScope(window.location.href);
const supportedPage = isSupportedPageUrl(window.location.href) && pageScope !== null;

chrome.runtime.onMessage.addListener((message: unknown) => {
  const runtimeUpdate = parseMessage(BackgroundPushRuntimeConfigMessageSchema, message);
  if (runtimeUpdate) {
    applyRuntimeConfig(runtimeUpdate.payload);
    return false;
  }

  const jobUpdate = parseMessage(BackgroundProcessJobUpdateMessageSchema, message);
  if (jobUpdate?.payload.job.status === "purged") {
    visualOverlayManager.clear();
    scheduleVisualSurfaceScan();
    return false;
  }

  return false;
});

if (!supportedPage) {
  console.debug("[detokenizer] skipped unsupported page url");
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  const resolvedConfig = await loadRuntimeConfig();
  applyRuntimeConfig(resolvedConfig);
  document.addEventListener("click", handleDownloadClick, true);
  window.addEventListener("scroll", () => scheduleVisualSurfaceScan(), true);
  window.addEventListener("resize", () => scheduleVisualSurfaceScan(), true);
}

function enqueueRoots(roots: Node[]): void {
  if (!isProcessingAllowed()) {
    return;
  }

  for (const root of roots) {
    pendingRoots.add(root);
  }

  scheduleVisualSurfaceScan();
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (processing || !isProcessingAllowed()) {
    return;
  }

  processing = true;

  try {
    while (pendingRoots.size > 0) {
      const roots = [...pendingRoots];
      pendingRoots.clear();

      const detection = filterDetectionForOutbound(scanEngine.scanRoots(roots));
      if (detection.tokens.length === 0 || detection.occurrences.length === 0) {
        continue;
      }

      const response = await requestMappings(detection.tokens);
      if (!response || !isProcessingAllowed()) {
        continue;
      }

      const replaced = observer.runWithoutObservation(() =>
        replaceEngine.applyMappings(detection.occurrences, response.mappings)
      );

      if (replaced > 0) {
        console.debug(`[detokenizer] replaced=${replaced} requestId=${response.requestId} latencyMs=${response.latencyMs}`);
      }

      if (response.error) {
        console.warn(`[detokenizer] detokenize error: ${response.error}`);
      }
    }
  } finally {
    processing = false;
  }
}

async function requestMappings(tokens: string[]) {
  const candidateMessage = {
    type: MessageType.CONTENT_DETECTED_TOKENS,
    payload: {
      domain: pageScope ?? "unknown",
      tokens
    }
  };

  const parsedMessage = parseMessage(ContentDetectedTokensMessageSchema, candidateMessage);
  if (!parsedMessage) {
    console.warn("[detokenizer] invalid content->background payload");
    return null;
  }

  try {
    const response = await chrome.runtime.sendMessage(parsedMessage);
    const parsedResponse = parseMessage(DetectedTokensResponseSchema, response);
    if (!parsedResponse) {
      console.warn("[detokenizer] invalid background response");
      return null;
    }

    return parsedResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown runtime error";
    console.warn(`[detokenizer] messaging failed: ${message}`);
    return null;
  }
}

async function loadRuntimeConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.CONTENT_GET_RUNTIME_CONFIG,
      payload: {}
    });
    const parsed = parseMessage(RuntimeConfigSchema, response);
    if (!parsed) {
      console.warn("[detokenizer] invalid runtime config response");
      return defaultRuntimeConfig;
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown runtime error";
    console.warn(`[detokenizer] runtime config lookup failed: ${message}`);
    return defaultRuntimeConfig;
  }
}

function applyRuntimeConfig(nextConfig: typeof defaultRuntimeConfig): void {
  const previousConfig = runtimeConfig;
  runtimeConfig = nextConfig;

  if (!supportedPage) {
    return;
  }

  if (!isProcessingAllowed()) {
    pendingRoots.clear();
    resetVisualScanState();
    visualOverlayManager.clear();
    if (observing) {
      observer.disconnect();
      observing = false;
    }
    return;
  }

  if (
    previousConfig.enabled !== nextConfig.enabled ||
    previousConfig.crossOriginIframesEnabled !== nextConfig.crossOriginIframesEnabled ||
    previousConfig.visualOcrEnabled !== nextConfig.visualOcrEnabled
  ) {
    resetVisualScanState();
  }

  if (!observing) {
    observer.observeDocument(document);
    observing = true;
  }

  enqueueRoots([document]);
  scheduleVisualSurfaceScan();
}

function isProcessingAllowed(): boolean {
  return runtimeConfig.enabled && shouldProcessCurrentFrame(runtimeConfig.crossOriginIframesEnabled);
}

function handleDownloadClick(event: MouseEvent): void {
  if (bypassDownloadInterception || !runtimeConfig.enabled || !runtimeConfig.automaticDownloadsEnabled || !supportedPage) {
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(target instanceof HTMLAnchorElement) || !target.href) {
    return;
  }

  const fileName = target.download || target.href.split("/").pop() || "download";
  if (!isSupportedDownloadTarget(target.href, fileName)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  void chrome.runtime.sendMessage({
    type: MessageType.CONTENT_PROCESS_DOWNLOAD,
    payload: {
      url: target.href,
      fileName
    }
  }).then((response: unknown) => {
    if (
      !response ||
      typeof response !== "object" ||
      !("ok" in response) ||
      response.ok !== true
    ) {
      const error = typeof response === "object" && response && "error" in response && typeof response.error === "string"
        ? response.error
        : "download_intercept_failed";
      console.warn(`[detokenizer] download intercept failed: ${error}`);
      replayNativeDownload(target);
    }
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "download_intercept_failed";
    console.warn(`[detokenizer] download intercept failed: ${message}`);
    replayNativeDownload(target);
  });
}

function replayNativeDownload(target: HTMLAnchorElement): void {
  bypassDownloadInterception = true;
  try {
    const nativeAnchor = document.createElement("a");
    nativeAnchor.href = target.href;
    if (target.download) {
      nativeAnchor.download = target.download;
    }
    if (target.target) {
      nativeAnchor.target = target.target;
    }
    if (target.rel) {
      nativeAnchor.rel = target.rel;
    }

    nativeAnchor.style.display = "none";
    document.body.append(nativeAnchor);
    nativeAnchor.click();
    nativeAnchor.remove();
  } finally {
    window.setTimeout(() => {
      bypassDownloadInterception = false;
    }, 0);
  }
}

function scheduleVisualSurfaceScan(): void {
  if (!runtimeConfig.visualOcrEnabled || !isProcessingAllowed()) {
    resetVisualScanState();
    visualOverlayManager.clear();
    return;
  }

  if (visualScanDisabledError || Date.now() < visualScanBlockedUntil) {
    return;
  }

  if (visualScanTimer !== undefined) {
    return;
  }

  if (visualScanInFlight) {
    visualScanQueued = true;
    return;
  }

  visualScanTimer = window.setTimeout(() => {
    visualScanTimer = undefined;
    void scanVisualSurfaces();
  }, 200);
}

async function scanVisualSurfaces(): Promise<void> {
  if (visualScanInFlight) {
    visualScanQueued = true;
    return;
  }

  visualScanInFlight = true;

  try {
    const batch = visualSurfaceScanner.scan();
    if (batch.descriptors.length === 0 || !pageScope) {
      visualOverlayManager.clear();
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.CONTENT_SCAN_VISUAL_SURFACES,
        payload: {
          domain: pageScope,
          surfaces: batch.descriptors,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        }
      });

      const parsed = parseMessage(VisualOverlayResponseSchema, response);
      if (!parsed) {
        logVisualScanError("invalid_visual_overlay_response");
        return;
      }

      if (parsed.error) {
        handleVisualScanError(parsed.error);
        return;
      }

      clearVisualScanErrorState();
      visualOverlayManager.apply(parsed.overlays, batch.elementBySurfaceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "visual_scan_failed";
      handleVisualScanError(message);
    }
  } finally {
    visualScanInFlight = false;
    if (visualScanQueued) {
      visualScanQueued = false;
      scheduleVisualSurfaceScan();
    }
  }
}

function handleVisualScanError(message: string): void {
  visualOverlayManager.clear();

  if (message === "text_detector_unavailable") {
    visualScanDisabledError = message;
    logVisualScanError(message);
    return;
  }

  if (message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
    visualScanBlockedUntil = Date.now() + 1_500;
    logVisualScanError(message, "debug");
    return;
  }

  if (message.includes("Either the '<all_urls>' or 'activeTab' permission is required.")) {
    visualScanBlockedUntil = Date.now() + 5_000;
    logVisualScanError(message);
    return;
  }

  logVisualScanError(message);
}

function clearVisualScanErrorState(): void {
  visualScanBlockedUntil = 0;
  visualScanDisabledError = undefined;
  lastVisualScanError = undefined;
}

function resetVisualScanState(): void {
  if (visualScanTimer !== undefined) {
    window.clearTimeout(visualScanTimer);
    visualScanTimer = undefined;
  }

  visualScanInFlight = false;
  visualScanQueued = false;
  clearVisualScanErrorState();
}

function logVisualScanError(message: string, level: "warn" | "debug" = "warn"): void {
  if (message === lastVisualScanError) {
    return;
  }

  lastVisualScanError = message;
  if (level === "debug") {
    console.debug(`[detokenizer] visual scan backoff: ${message}`);
    return;
  }

  if (message === "invalid_visual_overlay_response") {
    console.warn("[detokenizer] invalid visual overlay response");
    return;
  }

  console.warn(`[detokenizer] visual scan error: ${message}`);
}

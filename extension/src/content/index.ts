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
  runtimeConfig = nextConfig;

  if (!supportedPage) {
    return;
  }

  if (!isProcessingAllowed()) {
    pendingRoots.clear();
    visualOverlayManager.clear();
    if (observing) {
      observer.disconnect();
      observing = false;
    }
    return;
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
  if (!runtimeConfig.automaticDownloadsEnabled || !supportedPage) {
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
  }).catch((error) => {
    const message = error instanceof Error ? error.message : "download_intercept_failed";
    console.warn(`[detokenizer] download intercept failed: ${message}`);
  });
}

function scheduleVisualSurfaceScan(): void {
  if (!runtimeConfig.visualOcrEnabled || !isProcessingAllowed()) {
    visualOverlayManager.clear();
    return;
  }

  if (visualScanTimer !== undefined) {
    return;
  }

  visualScanTimer = window.setTimeout(() => {
    visualScanTimer = undefined;
    void scanVisualSurfaces();
  }, 200);
}

async function scanVisualSurfaces(): Promise<void> {
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
      console.warn("[detokenizer] invalid visual overlay response");
      return;
    }

    if (parsed.error) {
      console.warn(`[detokenizer] visual scan error: ${parsed.error}`);
      return;
    }

    visualOverlayManager.apply(parsed.overlays, batch.elementBySurfaceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "visual_scan_failed";
    console.warn(`[detokenizer] visual scan failed: ${message}`);
  }
}

import {
  BackgroundPushRuntimeConfigMessageSchema,
  ContentDetectedTokensMessageSchema,
  ContentGetRuntimeConfigMessageSchema,
  ContentProcessDownloadMessageSchema,
  ContentScanVisualSurfacesMessageSchema,
  DetectedTokensResponseSchema,
  MessageType,
  PopupClearSensitiveStateMessageSchema,
  PopupGetStatusMessageSchema,
  PopupSetAutomaticDownloadsEnabledMessageSchema,
  PopupSetCrossOriginIframesMessageSchema,
  PopupSetEnabledMessageSchema,
  PopupSetVisualOcrEnabledMessageSchema,
  PopupStatusResponseSchema,
  type ArtifactKind,
  type ProcessingJob,
  type ReplacementRegion,
  parseMessage
} from "../shared/contracts";
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_SENSITIVE_TTL_MS,
  getDetokenizationScope,
  getSupportedDownloadExtension
} from "../shared/config";
import { findApprovedTokens } from "../shared/tokenMatching";
import { TokenCache } from "./cache";
import { DetokenizeClient } from "./detokenizeClient";
import { ProcessingJobManager } from "./jobManager";
import { OffscreenClient } from "./offscreenClient";
import { TabStateStore } from "./state";
import { prepareJsonArtifact, prepareTextArtifact } from "./textArtifactProcessor";
import type { PdfArtifactScanResult } from "../offscreen/messages";

const cache = new TokenCache(DEFAULT_CACHE_TTL_MS);
const client = new DetokenizeClient(cache);
const stateStore = new TabStateStore();
const jobManager = new ProcessingJobManager(DEFAULT_SENSITIVE_TTL_MS);
const offscreenClient = new OffscreenClient();

chrome.runtime.onInstalled.addListener(() => {
  console.log("[detokenizer] extension installed");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearSensitiveState(tabId, "tab_removed");
  stateStore.removeTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearSensitiveState(tabId, "tab_navigated");
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  const typedMessage = message as { type?: string };

  if (typedMessage.type === MessageType.CONTENT_DETECTED_TOKENS) {
    const parsed = parseMessage(ContentDetectedTokensMessageSchema, message);
    if (!parsed) {
      sendResponse(buildResponse({}, "invalid_content_payload", 0));
      return false;
    }

    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse(buildResponse({}, "missing_tab_context", 0));
      return false;
    }

    stateStore.recordDetected(tabId, parsed.payload.tokens.length);

    if (!stateStore.isEnabled(tabId)) {
      sendResponse(buildResponse({}, undefined, 0));
      return false;
    }

    void client
      .fetchMappings(parsed.payload.domain, parsed.payload.tokens)
      .then((result) => {
        stateStore.recordLatency(tabId, result.latencyMs);
        stateStore.recordDetokenized(tabId, Object.keys(result.mappings).length);

        if (result.error) {
          stateStore.recordError(tabId, result.error);
        } else {
          stateStore.clearError(tabId);
        }

        sendResponse(buildResponse(result.mappings, result.error, result.latencyMs, result.requestId));
      })
      .catch((error) => {
        const messageText = error instanceof Error ? error.message : "detokenize_unexpected_error";
        stateStore.recordError(tabId, messageText);
        sendResponse(buildResponse({}, messageText, 0));
      });

    return true;
  }

  if (typedMessage.type === MessageType.CONTENT_PROCESS_DOWNLOAD) {
    const parsed = parseMessage(ContentProcessDownloadMessageSchema, message);
    if (!parsed) {
      sendResponse({ ok: false, error: "invalid_download_payload" });
      return false;
    }

    const tabId = sender.tab?.id;
    const tabUrl = sender.tab?.url;
    if (tabId === undefined) {
      sendResponse({ ok: false, error: "missing_tab_context" });
      return false;
    }

    if (!stateStore.getStatus(tabId).automaticDownloadsEnabled) {
      sendResponse({ ok: false, error: "automatic_downloads_disabled" });
      return false;
    }

    void handleDownloadRequest(tabId, parsed.payload.url, parsed.payload.fileName, parsed.payload.contentType, tabUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        const messageText = error instanceof Error ? error.message : "download_processing_failed";
        stateStore.recordError(tabId, messageText);
        sendResponse({ ok: false, error: messageText });
      });

    return true;
  }

  if (typedMessage.type === MessageType.CONTENT_SCAN_VISUAL_SURFACES) {
    const parsed = parseMessage(ContentScanVisualSurfacesMessageSchema, message);
    if (!parsed) {
      sendResponse({
        overlays: [],
        requestId: crypto.randomUUID(),
        latencyMs: 0,
        error: "invalid_visual_scan_payload"
      });
      return false;
    }

    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (tabId === undefined || windowId === undefined) {
      sendResponse({
        overlays: [],
        requestId: crypto.randomUUID(),
        latencyMs: 0,
        error: "missing_tab_context"
      });
      return false;
    }

    if (!stateStore.getStatus(tabId).visualOcrEnabled) {
      sendResponse({
        overlays: [],
        requestId: crypto.randomUUID(),
        latencyMs: 0
      });
      return false;
    }

    void handleVisualScanRequest(tabId, windowId, parsed.payload.domain, parsed.payload.surfaces, parsed.payload.devicePixelRatio)
      .then(sendResponse)
      .catch((error) => {
        const messageText = error instanceof Error ? error.message : "visual_scan_failed";
        stateStore.recordError(tabId, messageText);
        sendResponse({
          overlays: [],
          requestId: crypto.randomUUID(),
          latencyMs: 0,
          error: messageText
        });
      });

    return true;
  }

  if (typedMessage.type === MessageType.POPUP_GET_STATUS) {
    const parsed = parseMessage(PopupGetStatusMessageSchema, message);
    if (!parsed) {
      sendResponse(buildInvalidPopupResponse("invalid_popup_get_status_payload"));
      return false;
    }

    sendResponse(PopupStatusResponseSchema.parse(stateStore.getStatus(parsed.payload.tabId)));
    return false;
  }

  if (typedMessage.type === MessageType.POPUP_SET_ENABLED) {
    const parsed = parseMessage(PopupSetEnabledMessageSchema, message);
    if (!parsed) {
      sendResponse(buildInvalidPopupResponse("invalid_popup_set_enabled_payload"));
      return false;
    }

    const response = PopupStatusResponseSchema.parse(stateStore.setEnabled(parsed.payload.tabId, parsed.payload.enabled));
    void pushRuntimeConfigToTab(parsed.payload.tabId);
    sendResponse(response);
    return false;
  }

  if (typedMessage.type === MessageType.POPUP_SET_CROSS_ORIGIN_IFRAMES) {
    const parsed = parseMessage(PopupSetCrossOriginIframesMessageSchema, message);
    if (!parsed) {
      sendResponse(buildInvalidPopupResponse("invalid_popup_set_cross_origin_iframes_payload"));
      return false;
    }

    const response = PopupStatusResponseSchema.parse(
      stateStore.setCrossOriginIframesEnabled(parsed.payload.tabId, parsed.payload.enabled)
    );
    void pushRuntimeConfigToTab(parsed.payload.tabId);
    sendResponse(response);
    return false;
  }

  if (typedMessage.type === MessageType.POPUP_SET_VISUAL_OCR_ENABLED) {
    const parsed = parseMessage(PopupSetVisualOcrEnabledMessageSchema, message);
    if (!parsed) {
      sendResponse(buildInvalidPopupResponse("invalid_popup_set_visual_ocr_enabled_payload"));
      return false;
    }

    const response = PopupStatusResponseSchema.parse(stateStore.setVisualOcrEnabled(parsed.payload.tabId, parsed.payload.enabled));
    void pushRuntimeConfigToTab(parsed.payload.tabId);
    sendResponse(response);
    return false;
  }

  if (typedMessage.type === MessageType.POPUP_SET_AUTOMATIC_DOWNLOADS_ENABLED) {
    const parsed = parseMessage(PopupSetAutomaticDownloadsEnabledMessageSchema, message);
    if (!parsed) {
      sendResponse(buildInvalidPopupResponse("invalid_popup_set_automatic_downloads_enabled_payload"));
      return false;
    }

    const response = PopupStatusResponseSchema.parse(
      stateStore.setAutomaticDownloadsEnabled(parsed.payload.tabId, parsed.payload.enabled)
    );
    void pushRuntimeConfigToTab(parsed.payload.tabId);
    sendResponse(response);
    return false;
  }

  if (typedMessage.type === MessageType.POPUP_CLEAR_SENSITIVE_STATE) {
    const parsed = parseMessage(PopupClearSensitiveStateMessageSchema, message);
    if (!parsed) {
      sendResponse(buildInvalidPopupResponse("invalid_popup_clear_sensitive_state_payload"));
      return false;
    }

    clearSensitiveState(parsed.payload.tabId, "manual_clear");
    sendResponse(PopupStatusResponseSchema.parse(stateStore.getStatus(parsed.payload.tabId)));
    return false;
  }

  if (typedMessage.type === MessageType.CONTENT_GET_RUNTIME_CONFIG) {
    const parsed = parseMessage(ContentGetRuntimeConfigMessageSchema, message);
    if (!parsed) {
      sendResponse({
        enabled: false,
        crossOriginIframesEnabled: true,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true
      });
      return false;
    }

    const tabId = sender.tab?.id;
    if (tabId === undefined) {
      sendResponse({
        enabled: false,
        crossOriginIframesEnabled: true,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true
      });
      return false;
    }

    sendResponse(stateStore.getRuntimeConfig(tabId));
    return false;
  }

  return false;
});

function buildResponse(
  mappings: Record<string, string>,
  error: string | undefined,
  latencyMs: number,
  requestId: string = crypto.randomUUID()
) {
  return DetectedTokensResponseSchema.parse({
    mappings,
    requestId,
    latencyMs,
    ...(error ? { error } : {})
  });
}

function buildInvalidPopupResponse(error: string) {
  return {
    enabled: false,
    crossOriginIframesEnabled: true,
    visualOcrEnabled: true,
    automaticDownloadsEnabled: true,
    activeSensitiveJobsCount: 0,
    metrics: {
      detectedCount: 0,
      detokenizedCount: 0,
      errorCount: 1,
      avgLatencyMs: 0
    },
    lastError: error
  };
}

async function pushRuntimeConfigToTab(tabId: number): Promise<void> {
  try {
    const message = BackgroundPushRuntimeConfigMessageSchema.parse({
      type: MessageType.BACKGROUND_PUSH_RUNTIME_CONFIG,
      payload: stateStore.getRuntimeConfig(tabId)
    });
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "unknown_send_error";
    console.debug(`[detokenizer] runtime config push skipped: ${messageText}`);
  }
}

async function handleDownloadRequest(
  tabId: number,
  url: string,
  fileName: string,
  contentTypeHint: string | undefined,
  tabUrl: string | undefined
): Promise<void> {
  const extension = getSupportedDownloadExtension(url, fileName);
  if (!extension) {
    throw new Error("unsupported_download_target");
  }

  const artifactKind = extension === "txt"
    ? "text"
    : extension === "json"
      ? "json"
      : extension === "pdf"
        ? "pdf"
        : "image";
  const job = trackJob(tabId, artifactKind, {
    url,
    fileName,
    contentType: contentTypeHint
  });

  try {
    updateJob(job.id, "fetching");
    const response = await fetch(url, {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`download_fetch_failed:${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    const contentType = contentTypeHint ?? response.headers.get("Content-Type") ?? inferContentType(artifactKind);
    const domain = getDetokenizationScope(tabUrl ?? url) ?? "unknown";

    updateJob(job.id, "extracting");

    if (artifactKind === "text" || artifactKind === "json") {
      const initial = artifactKind === "text"
        ? prepareTextArtifact(bytes, fileName, {})
        : prepareJsonArtifact(bytes, fileName, {});
      const result = await client.fetchMappings(domain, initial.tokens);
      updateMetrics(tabId, result);
      updateJob(job.id, "rewriting");
      const rewritten = artifactKind === "text"
        ? prepareTextArtifact(bytes, fileName, result.mappings)
        : prepareJsonArtifact(bytes, fileName, result.mappings);
      await downloadBlob(new Blob([rewritten.rewrittenBytes], { type: rewritten.contentType }), rewritten.outputFileName);
      finishJob(job.id, tabId);
      return;
    }

    if (artifactKind === "image") {
      const scanned = await offscreenClient.scanImageArtifact(bytes, contentType);
      updateJob(job.id, "ocr");
      const tokens = [...new Set(scanned.matches.map((match) => match.token))];
      const result = await client.fetchMappings(domain, tokens);
      updateMetrics(tabId, result);
      updateJob(job.id, "rewriting");
      const replacements = scanned.matches
        .map((match) => toReplacementRegion(match.token, result.mappings[match.token], match.left, match.top, match.width, match.height))
        .filter((item): item is ReplacementRegion => item !== null);
      const objectUrl = await offscreenClient.rewriteImageArtifact(bytes, contentType, replacements);
      await downloadObjectUrl(objectUrl, fileName);
      finishJob(job.id, tabId, objectUrl);
      return;
    }

    const pdfScan = await offscreenClient.scanPdfArtifact(bytes);
    const tokens = collectPdfTokens(pdfScan);
    updateJob(job.id, tokens.length > 0 ? "ocr" : "rewriting");
    const result = await client.fetchMappings(domain, tokens);
    updateMetrics(tabId, result);
    updateJob(job.id, "rewriting");
    const pages = pdfScan.pages.map((page) => ({
      pageIndex: page.pageIndex,
      renderMode: page.renderMode,
      replacements: page.textMatches
        .map((match) =>
          toReplacementRegion(match.token, result.mappings[match.token], match.left, match.top, match.width, match.height)
        )
        .filter((item): item is ReplacementRegion => item !== null)
    }));
    const objectUrl = await offscreenClient.rewritePdfArtifact(bytes, pages);
    await downloadObjectUrl(objectUrl, fileName);
    finishJob(job.id, tabId, objectUrl);
  } catch (error) {
    updateJob(job.id, "failed", error instanceof Error ? error.message : "download_processing_failed");
    throw error;
  }
}

async function handleVisualScanRequest(
  tabId: number,
  windowId: number,
  domain: string,
  surfaces: Parameters<typeof offscreenClient.scanVisualSurfaces>[1],
  devicePixelRatio: number
) {
  const job = trackJob(tabId, "visual-surface", {
    url: domain,
    fileName: "visual-scan",
    contentType: "image/png"
  });

  const startedAt = performance.now();
  try {
    updateJob(job.id, "ocr");
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    const scanned = await offscreenClient.scanVisualSurfaces(screenshotDataUrl, surfaces, devicePixelRatio);
    const tokens = [...new Set(scanned.flatMap((surface) => surface.matches.map((match) => match.token)))];
    updateJob(job.id, "detokenizing");
    const result = await client.fetchMappings(domain, tokens);
    updateMetrics(tabId, result);
    updateJob(job.id, "complete");
    jobManager.schedulePurge(job.id, (purgedJob) => handlePurgedJob(purgedJob, "ttl_expired"));
    return {
      overlays: scanned.map((surface) => ({
        surfaceId: surface.surfaceId,
        replacementRegions: surface.matches
          .map((match) => toReplacementRegion(match.token, result.mappings[match.token], match.left, match.top, match.width, match.height))
          .filter((item): item is ReplacementRegion => item !== null)
      })),
      requestId: result.requestId,
      latencyMs: Number((performance.now() - startedAt + result.latencyMs).toFixed(2)),
      ...(result.error ? { error: result.error } : {})
    };
  } catch (error) {
    updateJob(job.id, "failed", error instanceof Error ? error.message : "visual_scan_failed");
    throw error;
  }
}

function inferContentType(kind: ArtifactKind): string {
  switch (kind) {
    case "json":
      return "application/json";
    case "pdf":
      return "application/pdf";
    case "image":
      return "image/png";
    default:
      return "text/plain;charset=utf-8";
  }
}

function trackJob(tabId: number, artifactKind: ArtifactKind, source: ProcessingJob["source"]): ProcessingJob {
  const job = jobManager.create(tabId, artifactKind, source);
  stateStore.setActiveSensitiveJobsCount(tabId, jobManager.getActiveCount(tabId));
  void notifyJobUpdate(job);
  return job;
}

function updateJob(jobId: string, status: ProcessingJob["status"], lastError?: string): void {
  const job = jobManager.updateStatus(jobId, status);
  if (!job) {
    return;
  }

  stateStore.setActiveSensitiveJobsCount(job.tabId, jobManager.getActiveCount(job.tabId));
  if (lastError) {
    stateStore.recordError(job.tabId, lastError);
  }
  void notifyJobUpdate(job, lastError);
}

function finishJob(jobId: string, tabId: number, objectUrl?: string): void {
  updateJob(jobId, "complete");
  jobManager.schedulePurge(jobId, (purgedJob) => handlePurgedJob(purgedJob, "ttl_expired"));
  if (objectUrl) {
    globalThis.setTimeout(() => {
      void offscreenClient.revokeObjectUrl(objectUrl).catch(() => undefined);
    }, 10_000);
  }
  stateStore.setActiveSensitiveJobsCount(tabId, jobManager.getActiveCount(tabId));
}

function clearSensitiveState(tabId: number, reason: string): void {
  const purgedJobs = jobManager.purgeTab(tabId);
  stateStore.setActiveSensitiveJobsCount(tabId, jobManager.getActiveCount(tabId));
  stateStore.setLastPurgeReason(tabId, reason);
  for (const job of purgedJobs) {
    void notifyJobUpdate(job);
  }
}

function handlePurgedJob(job: ProcessingJob, reason: string): void {
  stateStore.setActiveSensitiveJobsCount(job.tabId, jobManager.getActiveCount(job.tabId));
  stateStore.setLastPurgeReason(job.tabId, reason);
  void notifyJobUpdate(job);
}

async function notifyJobUpdate(job: ProcessingJob, lastError?: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(job.tabId, {
      type: MessageType.BACKGROUND_PROCESS_JOB_UPDATE,
      payload: {
        job,
        ...(lastError ? { lastError } : {})
      }
    });
  } catch {
    // Ignore tabs without active content listeners.
  }
}

function updateMetrics(tabId: number, result: { mappings: Record<string, string>; latencyMs: number; error?: string }): void {
  stateStore.recordLatency(tabId, result.latencyMs);
  stateStore.recordDetected(tabId, Object.keys(result.mappings).length);
  stateStore.recordDetokenized(tabId, Object.keys(result.mappings).length);
  if (result.error) {
    stateStore.recordError(tabId, result.error);
  } else {
    stateStore.clearError(tabId);
  }
}

async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  await downloadObjectUrl(objectUrl, fileName);
  globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

async function downloadObjectUrl(objectUrl: string, fileName: string): Promise<void> {
  await chrome.downloads.download({
    url: objectUrl,
    filename: fileName,
    saveAs: false
  });
}

function toReplacementRegion(
  token: string,
  replacement: string | undefined,
  left: number,
  top: number,
  width: number,
  height: number
): ReplacementRegion | null {
  if (!replacement) {
    return null;
  }

  return {
    token,
    replacement,
    left,
    top,
    width,
    height
  };
}

function collectPdfTokens(scan: PdfArtifactScanResult): string[] {
  return [...new Set(scan.pages.flatMap((page) => page.textMatches.map((match) => match.token)))];
}

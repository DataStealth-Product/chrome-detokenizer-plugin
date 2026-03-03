import {
  ContentDetectedTokensMessageSchema,
  DetectedTokensResponseSchema,
  MessageType,
  PopupGetStatusMessageSchema,
  PopupSetEnabledMessageSchema,
  PopupStatusResponseSchema,
  parseMessage
} from "../shared/contracts";
import { DEFAULT_CACHE_TTL_MS } from "../shared/config";
import { TokenCache } from "./cache";
import { DetokenizeClient } from "./detokenizeClient";
import { TabStateStore } from "./state";

const cache = new TokenCache(DEFAULT_CACHE_TTL_MS);
const client = new DetokenizeClient(cache);
const stateStore = new TabStateStore();

chrome.runtime.onInstalled.addListener(() => {
  console.log("[detokenizer] extension installed");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stateStore.removeTab(tabId);
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

  if (typedMessage.type === MessageType.POPUP_GET_STATUS) {
    const parsed = parseMessage(PopupGetStatusMessageSchema, message);
    if (!parsed) {
      sendResponse({
        enabled: false,
        metrics: {
          detectedCount: 0,
          detokenizedCount: 0,
          errorCount: 1,
          avgLatencyMs: 0
        },
        lastError: "invalid_popup_get_status_payload"
      });
      return false;
    }

    sendResponse(PopupStatusResponseSchema.parse(stateStore.getStatus(parsed.payload.tabId)));
    return false;
  }

  if (typedMessage.type === MessageType.POPUP_SET_ENABLED) {
    const parsed = parseMessage(PopupSetEnabledMessageSchema, message);
    if (!parsed) {
      sendResponse({
        enabled: false,
        metrics: {
          detectedCount: 0,
          detokenizedCount: 0,
          errorCount: 1,
          avgLatencyMs: 0
        },
        lastError: "invalid_popup_set_enabled_payload"
      });
      return false;
    }

    sendResponse(PopupStatusResponseSchema.parse(stateStore.setEnabled(parsed.payload.tabId, parsed.payload.enabled)));
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

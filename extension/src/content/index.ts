import { ContentDetectedTokensMessageSchema, DetectedTokensResponseSchema, MessageType, parseMessage } from "../shared/contracts";
import { DEFAULT_DEBOUNCE_MS, isAllowedUrl } from "../shared/config";
import { IncrementalObserver } from "./observer";
import { ReplaceEngine } from "./replaceEngine";
import { ScanEngine } from "./scanEngine";
import { filterDetectionForOutbound } from "./tokenSendPolicy";
import { DefaultTokenPatternProvider } from "./tokenPatternProvider";

const provider = new DefaultTokenPatternProvider();
const scanEngine = new ScanEngine(provider);
const replaceEngine = new ReplaceEngine();
const observer = new IncrementalObserver((roots) => enqueueRoots(roots), DEFAULT_DEBOUNCE_MS);

const pendingRoots = new Set<Node>();
let processing = false;

if (isAllowedUrl(window.location.href)) {
  observer.observeDocument(document);
  enqueueRoots([document]);
} else {
  console.debug("[detokenizer] skipped non-allowlisted url");
}

function enqueueRoots(roots: Node[]): void {
  for (const root of roots) {
    pendingRoots.add(root);
  }

  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (processing) {
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
      if (!response) {
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
      domain: window.location.hostname,
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

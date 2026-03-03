import { APPROVED_TOKEN_SET, TOKEN_SEND_MODE } from "../shared/tokenCatalog";
import type { ResolvedDetectionResult, ResolvedOccurrence } from "./types";

export interface OutboundDetectionResult {
  tokens: string[];
  occurrences: ResolvedOccurrence[];
}

export function filterDetectionForOutbound(detection: ResolvedDetectionResult): OutboundDetectionResult {
  const shouldSend = (token: string): boolean => {
    if (TOKEN_SEND_MODE === "allowlist_only") {
      return APPROVED_TOKEN_SET.has(token);
    }

    return true;
  };

  const allowedTokens = [...new Set(detection.tokens.filter(shouldSend))];
  const allowedTokenSet = new Set(allowedTokens);
  const allowedOccurrences = detection.occurrences.filter((occurrence) => allowedTokenSet.has(occurrence.token));

  return {
    tokens: allowedTokens,
    occurrences: allowedOccurrences
  };
}

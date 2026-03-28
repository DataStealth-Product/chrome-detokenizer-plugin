import { findApprovedTokens, replaceMappedTokens } from "../shared/tokenMatching";

export interface PreparedTextArtifact {
  tokens: string[];
  rewrittenBytes: Uint8Array;
  outputFileName: string;
  contentType: string;
}

export function prepareTextArtifact(bytes: ArrayBuffer, fileName: string, mappings: Record<string, string>): PreparedTextArtifact {
  const text = new TextDecoder().decode(bytes);
  const rewritten = replaceMappedTokens(text, mappings);

  return {
    tokens: findApprovedTokens(text),
    rewrittenBytes: new TextEncoder().encode(rewritten),
    outputFileName: fileName,
    contentType: "text/plain;charset=utf-8"
  };
}

export function prepareJsonArtifact(bytes: ArrayBuffer, fileName: string, mappings: Record<string, string>): PreparedTextArtifact {
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text) as unknown;
  const rewrittenValue = rewriteJsonValue(parsed, mappings);
  const rewritten = JSON.stringify(rewrittenValue, null, detectIndentation(text));

  return {
    tokens: findApprovedTokens(text),
    rewrittenBytes: new TextEncoder().encode(rewritten),
    outputFileName: fileName,
    contentType: "application/json"
  };
}

function rewriteJsonValue(value: unknown, mappings: Record<string, string>): unknown {
  if (typeof value === "string") {
    return replaceMappedTokens(value, mappings);
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteJsonValue(item, mappings));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[replaceMappedTokens(key, mappings)] = rewriteJsonValue(child, mappings);
    }
    return result;
  }

  return value;
}

function detectIndentation(content: string): number {
  const match = content.match(/\n( +)"/);
  return match?.[1]?.length ?? 2;
}

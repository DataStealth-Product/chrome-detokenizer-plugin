import { APPROVED_TOKEN_SET, TOKEN_SEND_MODE } from "./tokenCatalog";
import { DefaultTokenPatternProvider, collectMatchRanges } from "../content/tokenPatternProvider";

const provider = new DefaultTokenPatternProvider();

export interface ApprovedMatchRange {
  token: string;
  start: number;
  end: number;
}

export function findApprovedTokenRanges(content: string): ApprovedMatchRange[] {
  const ranges = collectMatchRanges(content, provider);
  if (TOKEN_SEND_MODE !== "allowlist_only") {
    return ranges;
  }

  return ranges.filter((range) => APPROVED_TOKEN_SET.has(range.token));
}

export function findApprovedTokens(content: string): string[] {
  return [...new Set(findApprovedTokenRanges(content).map((range) => range.token))];
}

export function replaceMappedTokens(content: string, mappings: Record<string, string>): string {
  let replaced = content;
  for (const range of [...findApprovedTokenRanges(content)].reverse()) {
    const nextValue = mappings[range.token];
    if (nextValue === undefined) {
      continue;
    }

    replaced = `${replaced.slice(0, range.start)}${nextValue}${replaced.slice(range.end)}`;
  }

  return replaced;
}

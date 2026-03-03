import { TOKEN_HINT_PREFIX } from "../shared/config";
import type { MatchRange } from "./types";

export interface TokenPatternProvider {
  getDetectionPatterns(): RegExp[];
  normalizeToken(raw: string): string;
}

export class DefaultTokenPatternProvider implements TokenPatternProvider {
  private static readonly TOKEN_REGEX = /\[\[TOKEN-[A-Za-z0-9-]+\]\]/g;

  getDetectionPatterns(): RegExp[] {
    // Return new regex instances so callers can safely mutate lastIndex.
    return [new RegExp(DefaultTokenPatternProvider.TOKEN_REGEX.source, "g")];
  }

  normalizeToken(raw: string): string {
    return raw.trim();
  }
}

export function collectMatchRanges(content: string, provider: TokenPatternProvider): MatchRange[] {
  if (!content.includes(TOKEN_HINT_PREFIX)) {
    return [];
  }

  const ranges: MatchRange[] = [];
  const seen = new Set<string>();

  for (const pattern of provider.getDetectionPatterns()) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const token = provider.normalizeToken(match[0]);
      const start = match.index;
      const end = start + match[0].length;
      const key = `${token}:${start}:${end}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push({ token, start, end });
      }

      if (match.index === pattern.lastIndex) {
        pattern.lastIndex += 1;
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

import { filterDetectionForOutbound } from "../../extension/src/content/tokenSendPolicy";
import type { ResolvedDetectionResult } from "../../extension/src/content/types";

describe("token send policy", () => {
  it("keeps only approved tokens for outbound payload and occurrences", () => {
    const detection: ResolvedDetectionResult = {
      tokens: ["[<TOKEN-Name-J>]", "[<TOKEN-Name-X>]", "[<TOKEN-Name-M>]"],
      occurrences: [
        {
          token: "[<TOKEN-Name-J>]",
          targetType: "text",
          nodePath: "document/0",
          startOffset: 0,
          endOffset: 16,
          segments: []
        },
        {
          token: "[<TOKEN-Name-X>]",
          targetType: "text",
          nodePath: "document/1",
          startOffset: 17,
          endOffset: 33,
          segments: []
        },
        {
          token: "[<TOKEN-Name-M>]",
          targetType: "text",
          nodePath: "document/2",
          startOffset: 34,
          endOffset: 50,
          segments: []
        }
      ]
    };

    const filtered = filterDetectionForOutbound(detection);

    expect(filtered.tokens).toEqual(["[<TOKEN-Name-J>]", "[<TOKEN-Name-M>]"]);
    expect(filtered.occurrences).toHaveLength(2);
    expect(filtered.occurrences.some((item) => item.token === "[<TOKEN-Name-X>]")).toBe(false);
  });
});

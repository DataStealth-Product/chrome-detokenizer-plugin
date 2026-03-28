import { parseMessage, PopupStatusResponseSchema } from "../../extension/src/shared/contracts";
import { targetTypeFromElement } from "../../extension/src/content/types";

describe("contracts and content types", () => {
  it("parses valid messages and rejects invalid ones", () => {
    expect(
      parseMessage(PopupStatusResponseSchema, {
        enabled: true,
        crossOriginIframesEnabled: true,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true,
        activeSensitiveJobsCount: 0,
        metrics: {
          detectedCount: 1,
          detokenizedCount: 1,
          errorCount: 0,
          avgLatencyMs: 12.5
        }
      })
    ).toEqual({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 1,
        detokenizedCount: 1,
        errorCount: 0,
        avgLatencyMs: 12.5
      }
    });

    expect(parseMessage(PopupStatusResponseSchema, { enabled: true })).toBeNull();
  });

  it("accepts attribute-backed token occurrences", async () => {
    const contracts = await import("../../extension/src/shared/contracts");

    expect(
      contracts.TokenOccurrenceSchema.parse({
        token: "[<TOKEN-Name-J>]",
        targetType: "attribute",
        nodePath: "document/0",
        startOffset: 0,
        endOffset: 16,
        attributeName: "title"
      })
    ).toMatchObject({
      targetType: "attribute",
      attributeName: "title"
    });
  });

  it("maps elements to target types", () => {
    expect(targetTypeFromElement(document.createElement("textarea"))).toBe("textarea");
    expect(targetTypeFromElement(document.createElement("input"))).toBe("input");
    expect(targetTypeFromElement(document.createElement("div"))).toBe("text");
  });
});

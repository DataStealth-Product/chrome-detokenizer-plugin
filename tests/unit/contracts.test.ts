import { TokenOccurrenceSchema, parseMessage } from "../../extension/src/shared/contracts";

describe("shared contracts", () => {
  it("parses attribute-backed token occurrences", () => {
    expect(
      TokenOccurrenceSchema.parse({
        token: "[<TOKEN-Name-J>]",
        targetType: "attribute",
        nodePath: "document/0",
        startOffset: 0,
        endOffset: 16,
        attributeName: "placeholder"
      })
    ).toMatchObject({
      targetType: "attribute",
      attributeName: "placeholder"
    });
  });

  it("returns null when the message shape is invalid", () => {
    expect(parseMessage(TokenOccurrenceSchema, { targetType: "attribute" })).toBeNull();
  });
});

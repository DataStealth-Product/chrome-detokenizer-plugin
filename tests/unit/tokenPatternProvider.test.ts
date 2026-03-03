import { collectMatchRanges, DefaultTokenPatternProvider } from "../../extension/src/content/tokenPatternProvider";

describe("token pattern provider", () => {
  it("extracts deterministic token ranges", () => {
    const provider = new DefaultTokenPatternProvider();
    const text = "a [<TOKEN-Name-J>] b [<TOKEN-Account-123>] c";

    const ranges = collectMatchRanges(text, provider);

    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.token).toBe("[<TOKEN-Name-J>]");
    expect(ranges[1]?.token).toBe("[<TOKEN-Account-123>]");
  });

  it("returns empty ranges when token prefix is missing", () => {
    const provider = new DefaultTokenPatternProvider();
    const ranges = collectMatchRanges("plain text", provider);

    expect(ranges).toEqual([]);
  });
});

import {
  APPROVED_TOKENS,
  APPROVED_TOKEN_SET,
  TOKEN_SEND_MODE,
  isApprovedToken
} from "../../extension/src/shared/tokenCatalog";

describe("token catalog", () => {
  it("contains exactly the approved three-token set", () => {
    expect(APPROVED_TOKENS).toEqual([
      "[<TOKEN-Name-J>]",
      "[<TOKEN-Name-M>]",
      "[<TOKEN-Name-E>]"
    ]);
    expect(APPROVED_TOKEN_SET.has("[<TOKEN-Name-J>]")).toBe(true);
    expect(APPROVED_TOKEN_SET.has("[<TOKEN-Name-M>]")).toBe(true);
    expect(APPROVED_TOKEN_SET.has("[<TOKEN-Name-E>]")).toBe(true);
    expect(APPROVED_TOKEN_SET.has("[<TOKEN-Name-X>]")).toBe(false);
  });

  it("reports allowlist send mode", () => {
    expect(TOKEN_SEND_MODE).toBe("allowlist_only");
  });

  it("guards approved token membership", () => {
    expect(isApprovedToken("[<TOKEN-Name-J>]")).toBe(true);
    expect(isApprovedToken("[<TOKEN-Name-X>]")).toBe(false);
  });
});

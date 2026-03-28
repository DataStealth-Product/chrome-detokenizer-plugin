import { DEFAULT_MOCK_TOKEN_MAPPINGS, resolveMockMappings } from "../../shared/mockMappings";

describe("mock mappings", () => {
  it("exposes the default fixed mappings", () => {
    expect(DEFAULT_MOCK_TOKEN_MAPPINGS).toMatchObject({
      "[<TOKEN-Name-J>]": "James",
      "[<TOKEN-Name-M>]": "Marc",
      "[<TOKEN-Name-E>]": "Ed",
      "[<TOKEN-Name-JM>]": "Jay",
      "[<TOKEN-Name-D>]": "Daniel"
    });
  });

  it("resolves only known tokens", () => {
    expect(resolveMockMappings(["[<TOKEN-Name-J>]", "[<TOKEN-Name-X>]"])).toEqual({
      "[<TOKEN-Name-J>]": "James"
    });
  });
});

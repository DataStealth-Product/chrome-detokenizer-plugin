import { createDefaultSource } from "../../mock-api/src/dataSource";

describe("mock data source", () => {
  it("resolves all approved token mappings", () => {
    const source = createDefaultSource();

    const result = source.resolve([
      "[<TOKEN-Name-J>]",
      "[<TOKEN-Name-M>]",
      "[<TOKEN-Name-E>]"
    ]);

    expect(result).toEqual({
      "[<TOKEN-Name-J>]": "James",
      "[<TOKEN-Name-M>]": "Marc",
      "[<TOKEN-Name-E>]": "Ed"
    });
  });

  it("omits unknown tokens", () => {
    const source = createDefaultSource();

    const result = source.resolve(["[<TOKEN-Name-X>]", "[<TOKEN-Name-J>]"]);

    expect(result).toEqual({
      "[<TOKEN-Name-J>]": "James"
    });
  });
});

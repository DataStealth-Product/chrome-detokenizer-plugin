import { prepareJsonArtifact, prepareTextArtifact } from "../../extension/src/background/textArtifactProcessor";

describe("text artifact processor", () => {
  it("rewrites approved tokens in text files", () => {
    const bytes = new TextEncoder().encode("Employee [<TOKEN-Name-J>]").buffer;

    const result = prepareTextArtifact(bytes, "employee.txt", {
      "[<TOKEN-Name-J>]": "James"
    });

    expect(result.tokens).toEqual(["[<TOKEN-Name-J>]"]);
    expect(new TextDecoder().decode(result.rewrittenBytes)).toBe("Employee James");
    expect(result.outputFileName).toBe("employee.txt");
  });

  it("rewrites JSON object keys and string values", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify(
        {
          "[<TOKEN-Name-J>]": "[<TOKEN-Name-M>]"
        },
        null,
        2
      )
    ).buffer;

    const result = prepareJsonArtifact(bytes, "employee.json", {
      "[<TOKEN-Name-J>]": "James",
      "[<TOKEN-Name-M>]": "Marc"
    });

    expect(result.tokens).toEqual(["[<TOKEN-Name-J>]", "[<TOKEN-Name-M>]"]);
    expect(JSON.parse(new TextDecoder().decode(result.rewrittenBytes))).toEqual({
      James: "Marc"
    });
  });
});

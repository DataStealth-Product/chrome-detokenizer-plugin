export const DEFAULT_MOCK_TOKEN_MAPPINGS: Readonly<Record<string, string>> = Object.freeze({
  "[<TOKEN-Name-J>]": "James",
  "[<TOKEN-Name-M>]": "Marc",
  "[<TOKEN-Name-E>]": "Ed"
});

export function resolveMockMappings(tokens: string[]): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const token of tokens) {
    const mapped = DEFAULT_MOCK_TOKEN_MAPPINGS[token];
    if (mapped !== undefined) {
      resolved[token] = mapped;
    }
  }

  return resolved;
}

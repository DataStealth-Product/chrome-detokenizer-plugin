export interface DetokenizationSource {
  resolve(tokens: string[]): Record<string, string>;
}

export class InMemoryDetokenizationSource implements DetokenizationSource {
  private readonly mappings = new Map<string, string>();

  constructor(seedMappings: Record<string, string>) {
    for (const [token, cleartext] of Object.entries(seedMappings)) {
      this.mappings.set(token, cleartext);
    }
  }

  resolve(tokens: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    for (const token of tokens) {
      const value = this.mappings.get(token);
      if (value !== undefined) {
        result[token] = value;
      }
    }

    return result;
  }

  // TODO: Replace with mapping-file-backed loader once mapping format is provided.
}

export function createDefaultSource(): DetokenizationSource {
  return new InMemoryDetokenizationSource({
    "[[TOKEN-Name-J]]": "James",
    "[[TOKEN-Name-M]]": "Marc",
    "[[TOKEN-Name-E]]": "Ed"
  });
}

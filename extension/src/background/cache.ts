export interface CacheLookup {
  hits: Record<string, string>;
  misses: string[];
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class TokenCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number) {}

  get(domain: string, token: string): string | undefined {
    const key = this.toCacheKey(domain, token);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  getMany(domain: string, tokens: string[]): CacheLookup {
    const hits: Record<string, string> = {};
    const misses: string[] = [];

    for (const token of tokens) {
      const value = this.get(domain, token);
      if (value === undefined) {
        misses.push(token);
      } else {
        hits[token] = value;
      }
    }

    return { hits, misses };
  }

  set(domain: string, token: string, value: string): void {
    const key = this.toCacheKey(domain, token);
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private toCacheKey(domain: string, token: string): string {
    return `${domain}::${token}`;
  }
}

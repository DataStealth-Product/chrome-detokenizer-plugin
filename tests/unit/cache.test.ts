import { TokenCache } from "../../extension/src/background/cache";

describe("token cache", () => {
  it("stores and retrieves values by domain and token", () => {
    const cache = new TokenCache(60_000);
    cache.set("example.com", "[<TOKEN-Name-J>]", "James");

    expect(cache.get("example.com", "[<TOKEN-Name-J>]")).toBe("James");
    expect(cache.get("other.com", "[<TOKEN-Name-J>]")).toBeUndefined();
  });

  it("expires entries after ttl", () => {
    vi.useFakeTimers();

    const cache = new TokenCache(100);
    cache.set("example.com", "[<TOKEN-Name-J>]", "James");
    vi.advanceTimersByTime(101);

    expect(cache.get("example.com", "[<TOKEN-Name-J>]")).toBeUndefined();

    vi.useRealTimers();
  });

  it("reports mixed cache hits and misses", () => {
    const cache = new TokenCache(60_000);
    cache.set("example.com", "[<TOKEN-Name-J>]", "James");

    expect(cache.getMany("example.com", ["[<TOKEN-Name-J>]", "[<TOKEN-Name-M>]"])).toEqual({
      hits: {
        "[<TOKEN-Name-J>]": "James"
      },
      misses: ["[<TOKEN-Name-M>]"]
    });
  });

  it("clears expired entries without touching active ones", () => {
    vi.useFakeTimers();

    const cache = new TokenCache(100);
    cache.set("example.com", "[<TOKEN-Name-J>]", "James");
    vi.advanceTimersByTime(50);
    cache.set("example.com", "[<TOKEN-Name-M>]", "Marc");

    vi.advanceTimersByTime(60);
    cache.clearExpired();

    expect(cache.get("example.com", "[<TOKEN-Name-J>]")).toBeUndefined();
    expect(cache.get("example.com", "[<TOKEN-Name-M>]")).toBe("Marc");

    vi.useRealTimers();
  });
});

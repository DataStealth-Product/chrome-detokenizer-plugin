import { TokenCache } from "../../extension/src/background/cache";

describe("token cache", () => {
  it("stores and retrieves values by domain and token", () => {
    const cache = new TokenCache(60_000);
    cache.set("example.com", "[[TOKEN-Name-J]]", "James");

    expect(cache.get("example.com", "[[TOKEN-Name-J]]")).toBe("James");
    expect(cache.get("other.com", "[[TOKEN-Name-J]]")).toBeUndefined();
  });

  it("expires entries after ttl", () => {
    vi.useFakeTimers();

    const cache = new TokenCache(100);
    cache.set("example.com", "[[TOKEN-Name-J]]", "James");
    vi.advanceTimersByTime(101);

    expect(cache.get("example.com", "[[TOKEN-Name-J]]")).toBeUndefined();

    vi.useRealTimers();
  });
});

import { TokenCache } from "../../extension/src/background/cache";
import { DetokenizeClient } from "../../extension/src/background/detokenizeClient";

describe("detokenize client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_DETOKENIZER_API_URL", "https://detokenizer.example.com/detokenize");
    vi.stubEnv("VITE_DETOKENIZER_AUTH_TOKEN", "test-token");
    vi.stubEnv("VITE_ALLOW_HTTP_DEV", "false");
  });

  it("returns early when there are no tokens to fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const result = await client.fetchMappings("app.example.com", ["", ""]);

    expect(result.mappings).toEqual({});
    expect(result.latencyMs).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses cache-only results when every token is already cached", async () => {
    const cache = new TokenCache(60_000);
    cache.set("app.example.com", "[<TOKEN-Name-J>]", "James");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(cache);
    const result = await client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);

    expect(result).toEqual({
      mappings: { "[<TOKEN-Name-J>]": "James" },
      requestId: "cache-only",
      latencyMs: 0
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("batches requests and returns mappings", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mappings: { "[<TOKEN-Name-J>]": "James" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);

    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.mappings["[<TOKEN-Name-J>]"]).toBe("James");
    expect(result.error).toBeUndefined();

    vi.useRealTimers();
  });

  it("coalesces concurrent requests for the same domain into one outbound call", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mappings: {
            "[<TOKEN-Name-J>]": "James",
            "[<TOKEN-Name-M>]": "Marc"
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const first = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);
    const second = client.fetchMappings("app.example.com", ["[<TOKEN-Name-M>]"]);

    await vi.advanceTimersByTimeAsync(100);

    await expect(first).resolves.toMatchObject({
      mappings: { "[<TOKEN-Name-J>]": "James" }
    });
    await expect(second).resolves.toMatchObject({
      mappings: { "[<TOKEN-Name-M>]": "Marc" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("splits large token lists into multiple API chunks", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { tokens: string[] };
      const mappings = Object.fromEntries(body.tokens.map((token) => [token, `${token}-clear`]));

      return new Response(JSON.stringify({ mappings }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = Array.from({ length: 101 }, (_, index) => `[<TOKEN-${index}>]`);
    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", tokens);

    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.mappings)).toHaveLength(101);

    vi.useRealTimers();
  });

  it("fails open with empty mappings when API errors", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockRejectedValue(new Error("network_down"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);

    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.mappings).toEqual({});
    expect(result.error).toContain("network_down");

    vi.useRealTimers();
  });

  it("rejects insecure API URLs before calling fetch", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_DETOKENIZER_API_URL", "http://api.example.com/detokenize");
    vi.stubEnv("VITE_ALLOW_HTTP_DEV", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.error).toBe("api_url_not_secure");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("blocks API hosts that are not present in extension host permissions", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("chrome", {
      runtime: {
        getManifest: () => ({
          host_permissions: ["https://allowed.example.com/*"]
        })
      }
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(result.error).toBe("api_host_not_permitted:https://detokenizer.example.com");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("retries invalid API payloads and returns a normalized error", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ nope: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);

    await vi.runAllTimersAsync();
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.error).toBe("detokenize_invalid_response");

    vi.useRealTimers();
  });

  it("normalizes timeout failures from aborted fetches", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);

    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.error).toBe("detokenize_timeout:3000ms");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("normalizes failed network fetches for remote APIs", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]"]);

    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.error).toBe("detokenize_fetch_failed:https://detokenizer.example.com");

    vi.useRealTimers();
  });

  it("uses embedded mock mappings when localhost API is unreachable", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_DETOKENIZER_API_URL", "http://127.0.0.1:8787/detokenize");
    vi.stubEnv("VITE_ALLOW_HTTP_DEV", "true");

    const fetchMock = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DetokenizeClient(new TokenCache(60_000));
    const pending = client.fetchMappings("app.example.com", ["[<TOKEN-Name-J>]", "[<TOKEN-Name-X>]"]);

    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.mappings).toEqual({ "[<TOKEN-Name-J>]": "James" });
    expect(result.error).toBeUndefined();

    vi.useRealTimers();
  });
});

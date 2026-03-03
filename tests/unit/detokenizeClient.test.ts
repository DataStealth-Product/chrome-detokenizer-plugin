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
});

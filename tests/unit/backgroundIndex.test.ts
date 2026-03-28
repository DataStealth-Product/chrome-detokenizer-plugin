import { createChromeEventMock } from "../helpers/chrome";

type OnMessageListener = (
  message: unknown,
  sender: { tab?: { id?: number } },
  sendResponse: (response: unknown) => void
) => boolean | void;

function createChromeMock() {
  return {
    runtime: {
      onInstalled: createChromeEventMock<[]>(),
      onMessage: createChromeEventMock<[unknown, { tab?: { id?: number } }, (response: unknown) => void]>(),
      sendMessage: vi.fn(),
      getManifest: vi.fn(() => ({
        host_permissions: ["https://detokenizer.example.com/*"]
      }))
    },
    tabs: {
      onRemoved: createChromeEventMock<[number]>(),
      onUpdated: createChromeEventMock<[number, { status?: string }]>(),
      sendMessage: vi.fn().mockResolvedValue(undefined)
    },
    downloads: {
      download: vi.fn().mockResolvedValue(1)
    }
  };
}

async function importBackgroundModule() {
  vi.resetModules();
  await import("../../extension/src/background/index");
}

function getOnMessageListener(chromeMock: ReturnType<typeof createChromeMock>): OnMessageListener {
  const listener = chromeMock.runtime.onMessage.listeners[0];
  if (!listener) {
    throw new Error("background_onMessage_listener_missing");
  }

  return listener as OnMessageListener;
}

describe("background entrypoint", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_DETOKENIZER_API_URL", "https://detokenizer.example.com/detokenize");
    vi.stubEnv("VITE_DETOKENIZER_AUTH_TOKEN", "test-token");
    vi.stubEnv("VITE_ALLOW_HTTP_DEV", "false");
  });

  it("handles detokenize messages and tracks popup status", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ mappings: { "[<TOKEN-Name-J>]": "James" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await importBackgroundModule();

    const onMessage = getOnMessageListener(chromeMock);
    const responses: unknown[] = [];
    const keepChannelOpen = onMessage(
      {
        type: "CONTENT_DETECTED_TOKENS",
        payload: {
          domain: "app.example.com",
          tokens: ["[<TOKEN-Name-J>]"]
        }
      },
      { tab: { id: 5 } },
      (response) => responses.push(response)
    );

    expect(keepChannelOpen).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(responses[0]).toMatchObject({
      mappings: {
        "[<TOKEN-Name-J>]": "James"
      },
      latencyMs: expect.any(Number)
    });

    const statusResponses: unknown[] = [];
    onMessage(
      {
        type: "POPUP_GET_STATUS",
        payload: { tabId: 5 }
      },
      {},
      (response) => statusResponses.push(response)
    );

    expect(statusResponses[0]).toEqual({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 1,
        detokenizedCount: 1,
        errorCount: 0,
        avgLatencyMs: expect.any(Number)
      }
    });
  });

  it("returns validation errors for malformed or context-free content messages", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", vi.fn());

    await importBackgroundModule();

    const onMessage = getOnMessageListener(chromeMock);
    const invalidResponses: unknown[] = [];
    onMessage(
      {
        type: "CONTENT_DETECTED_TOKENS",
        payload: { domain: "", tokens: [] }
      },
      {},
      (response) => invalidResponses.push(response)
    );

    expect(invalidResponses[0]).toMatchObject({
      mappings: {},
      error: "invalid_content_payload",
      latencyMs: 0
    });

    const missingTabResponses: unknown[] = [];
    onMessage(
      {
        type: "CONTENT_DETECTED_TOKENS",
        payload: { domain: "app.example.com", tokens: ["[<TOKEN-Name-J>]"] }
      },
      {},
      (response) => missingTabResponses.push(response)
    );

    expect(missingTabResponses[0]).toMatchObject({
      mappings: {},
      error: "missing_tab_context",
      latencyMs: 0
    });
  });

  it("supports popup toggles, invalid popup payloads, and tab cleanup", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", vi.fn());

    await importBackgroundModule();

    const onMessage = getOnMessageListener(chromeMock);
    const toggleResponses: unknown[] = [];
    onMessage(
      {
        type: "POPUP_SET_ENABLED",
        payload: { tabId: 9, enabled: false }
      },
      {},
      (response) => toggleResponses.push(response)
    );

    expect(toggleResponses[0]).toEqual({
      enabled: false,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 0,
        avgLatencyMs: 0
      }
    });

    const disabledResponses: unknown[] = [];
    onMessage(
      {
        type: "CONTENT_DETECTED_TOKENS",
        payload: { domain: "app.example.com", tokens: ["[<TOKEN-Name-J>]"] }
      },
      { tab: { id: 9 } },
      (response) => disabledResponses.push(response)
    );

    expect(disabledResponses[0]).toMatchObject({
      mappings: {},
      latencyMs: 0
    });

    const invalidPopupResponses: unknown[] = [];
    onMessage(
      {
        type: "POPUP_GET_STATUS",
        payload: {}
      },
      {},
      (response) => invalidPopupResponses.push(response)
    );

    expect(invalidPopupResponses[0]).toEqual({
      enabled: false,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 1,
        avgLatencyMs: 0
      },
      lastError: "invalid_popup_get_status_payload"
    });

    const invalidToggleResponses: unknown[] = [];
    onMessage(
      {
        type: "POPUP_SET_ENABLED",
        payload: { tabId: "bad", enabled: false }
      },
      {},
      (response) => invalidToggleResponses.push(response)
    );

    expect(invalidToggleResponses[0]).toEqual({
      enabled: false,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 1,
        avgLatencyMs: 0
      },
      lastError: "invalid_popup_set_enabled_payload"
    });

    const iframeToggleResponses: unknown[] = [];
    onMessage(
      {
        type: "POPUP_SET_CROSS_ORIGIN_IFRAMES",
        payload: { tabId: 9, enabled: false }
      },
      {},
      (response) => iframeToggleResponses.push(response)
    );

    expect(iframeToggleResponses[0]).toEqual({
      enabled: false,
      crossOriginIframesEnabled: false,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 1,
        detokenizedCount: 0,
        errorCount: 0,
        avgLatencyMs: 0
      }
    });

    const invalidIframeToggleResponses: unknown[] = [];
    onMessage(
      {
        type: "POPUP_SET_CROSS_ORIGIN_IFRAMES",
        payload: { tabId: "bad", enabled: false }
      },
      {},
      (response) => invalidIframeToggleResponses.push(response)
    );

    expect(invalidIframeToggleResponses[0]).toEqual({
      enabled: false,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 1,
        avgLatencyMs: 0
      },
      lastError: "invalid_popup_set_cross_origin_iframes_payload"
    });

    const runtimeConfigResponses: unknown[] = [];
    onMessage(
      {
        type: "CONTENT_GET_RUNTIME_CONFIG",
        payload: {}
      },
      { tab: { id: 9 } },
      (response) => runtimeConfigResponses.push(response)
    );

    expect(runtimeConfigResponses[0]).toEqual({
      enabled: false,
      crossOriginIframesEnabled: false,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true
    });
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        type: "BACKGROUND_PUSH_RUNTIME_CONFIG",
        payload: {
          enabled: false,
          crossOriginIframesEnabled: false,
          visualOcrEnabled: true,
          automaticDownloadsEnabled: true
        }
      })
    );

    chromeMock.tabs.onRemoved.listeners[0]?.(9);

    const statusAfterRemoval: unknown[] = [];
    onMessage(
      {
        type: "POPUP_GET_STATUS",
        payload: { tabId: 9 }
      },
      {},
      (response) => statusAfterRemoval.push(response)
    );

    expect(statusAfterRemoval[0]).toEqual({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 0,
        avgLatencyMs: 0
      }
    });
  });

  it("returns false for unknown message types", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("fetch", vi.fn());

    await importBackgroundModule();

    const onMessage = getOnMessageListener(chromeMock);
    const returnValue = onMessage({ type: "UNKNOWN" }, {}, () => undefined);

    expect(returnValue).toBe(false);
  });

  it("rewrites supported text downloads before handing them to chrome.downloads", async () => {
    const chromeMock = createChromeMock();
    vi.stubGlobal("chrome", chromeMock);

    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      capturedBlob = blob as Blob;
      return "blob:detokenized-download";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://fixtures.example.com/sample.txt") {
          return new Response("TXT token: [<TOKEN-Name-J>] [<TOKEN-Name-X>]", {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        }

        return new Response(JSON.stringify({ mappings: { "[<TOKEN-Name-J>]": "James" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    await importBackgroundModule();

    const onMessage = getOnMessageListener(chromeMock);
    const responses: unknown[] = [];
    const keepChannelOpen = onMessage(
      {
        type: "CONTENT_PROCESS_DOWNLOAD",
        payload: {
          url: "https://fixtures.example.com/sample.txt",
          fileName: "sample.txt"
        }
      },
      { tab: { id: 4, url: "https://fixtures.example.com/page" } },
      (response) => responses.push(response)
    );

    expect(keepChannelOpen).toBe(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(responses[0]).toEqual({ ok: true });
    expect(chromeMock.downloads.download).toHaveBeenCalledWith({
      url: "blob:detokenized-download",
      filename: "sample.txt",
      saveAs: false
    });
    expect(capturedBlob).not.toBeNull();
    await expect(capturedBlob?.text()).resolves.toContain("James");
    await expect(capturedBlob?.text()).resolves.toContain("[<TOKEN-Name-X>]");
  });
});

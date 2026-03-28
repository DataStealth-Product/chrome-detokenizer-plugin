function buildPopupDom() {
  document.body.innerHTML = `
    <label>
      <input id="enabled" type="checkbox" />
    </label>
    <label>
      <input id="cross-origin-iframes" type="checkbox" />
    </label>
    <label>
      <input id="visual-ocr" type="checkbox" />
    </label>
    <label>
      <input id="automatic-downloads" type="checkbox" />
    </label>
    <button id="clear-sensitive-state" type="button"></button>
    <div id="visual-ocr-warning" data-visible="false"></div>
    <div id="status"></div>
    <div id="metrics"></div>
  `;
}

describe("popup entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    buildPopupDom();
    vi.spyOn(window, "setInterval").mockReturnValue(1 as unknown as number);
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn()
      },
      runtime: {
        sendMessage: vi.fn()
      }
    });
  });

  it("disables the UI when there is no active tab", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([]);

    await import("../../extension/src/popup/main");
    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("No active tab available.");
    });

    expect((document.querySelector("#enabled") as HTMLInputElement).disabled).toBe(true);
    expect((document.querySelector("#cross-origin-iframes") as HTMLInputElement).disabled).toBe(true);
    expect((document.querySelector("#visual-ocr") as HTMLInputElement).disabled).toBe(true);
    expect((document.querySelector("#automatic-downloads") as HTMLInputElement).disabled).toBe(true);
    expect((document.querySelector("#clear-sensitive-state") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders status, metrics, and handles toggle changes", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 12 }]);
    vi.mocked(chrome.runtime.sendMessage)
      .mockResolvedValueOnce({
        enabled: true,
        crossOriginIframesEnabled: true,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true,
        activeSensitiveJobsCount: 0,
        metrics: {
          detectedCount: 2,
          detokenizedCount: 1,
          errorCount: 0,
          avgLatencyMs: 15.5
        }
      })
      .mockResolvedValueOnce({
        enabled: false,
        crossOriginIframesEnabled: true,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true,
        activeSensitiveJobsCount: 0,
        metrics: {
          detectedCount: 2,
          detokenizedCount: 1,
          errorCount: 0,
          avgLatencyMs: 15.5
        }
      })
      .mockResolvedValueOnce({
        enabled: false,
        crossOriginIframesEnabled: false,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true,
        activeSensitiveJobsCount: 0,
        metrics: {
          detectedCount: 2,
          detokenizedCount: 1,
          errorCount: 0,
          avgLatencyMs: 15.5
        }
      });

    await import("../../extension/src/popup/main");
    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("Monitoring active.");
    });

    expect(document.querySelector("#metrics")?.textContent).toContain("Tokens Detected2");
    expect(document.querySelector("#metrics")?.textContent).toContain("Avg API Latency15.5 ms");

    const enabled = document.querySelector("#enabled") as HTMLInputElement;
    enabled.checked = false;
    enabled.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("Detokenization paused for this tab.");
    });

    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: "POPUP_SET_ENABLED",
      payload: { tabId: 12, enabled: false }
    });

    const iframeToggle = document.querySelector("#cross-origin-iframes") as HTMLInputElement;
    iframeToggle.checked = false;
    iframeToggle.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("Cross-origin iframe detokenization paused.");
    });

    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(3, {
      type: "POPUP_SET_CROSS_ORIGIN_IFRAMES",
      payload: { tabId: 12, enabled: false }
    });
  });

  it("surfaces invalid responses and runtime failures", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 21 }]);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({ invalid: true });

    await import("../../extension/src/popup/main");
    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("Status unavailable.");
    });

    vi.resetModules();
    buildPopupDom();
    vi.spyOn(window, "setInterval").mockReturnValue(1 as unknown as number);
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 21 }])
      },
      runtime: {
        sendMessage: vi.fn().mockRejectedValue(new Error("boom"))
      }
    });

    await import("../../extension/src/popup/main");
    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("Status error: boom");
    });
  });

  it("shows a visible fallback when visual OCR is unavailable", async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValue([{ id: 33 }]);
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      enabled: true,
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
      lastError: "text_detector_unavailable"
    });

    await import("../../extension/src/popup/main");
    await vi.waitFor(() => {
      expect(document.querySelector("#status")?.textContent).toBe("Visual OCR unavailable on this browser.");
    });

    expect(document.querySelector("#visual-ocr-warning")?.getAttribute("data-visible")).toBe("true");
    expect(document.querySelector("#visual-ocr-warning")?.textContent).toContain("image and canvas overlays cannot run");
  });
});

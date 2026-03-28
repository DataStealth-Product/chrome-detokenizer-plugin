import { createChromeEventMock } from "../helpers/chrome";

describe("content script entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../../extension/src/shared/config");
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: createChromeEventMock<[unknown]>()
      }
    });
  });

  it("scans the page and replaces approved tokens from background mappings", async () => {
    const employee = document.createElement("p");
    employee.textContent = "Employee: [<TOKEN-Name-J>]";
    const unknown = document.createElement("p");
    unknown.textContent = "Unknown: [<TOKEN-Name-X>]";
    const input = document.createElement("input");
    input.value = "[<TOKEN-Name-M>]";
    input.setAttribute("placeholder", "Lookup [<TOKEN-Name-JM>]");
    const textarea = document.createElement("textarea");
    textarea.value = "[<TOKEN-Name-E>]";
    const image = document.createElement("img");
    image.setAttribute("alt", "Badge [<TOKEN-Name-D>]");
    const rich = document.createElement("p");
    const richStart = document.createElement("span");
    richStart.textContent = "[<TOKEN-";
    const richEnd = document.createElement("strong");
    richEnd.textContent = "Name-D>]";
    rich.append(richStart, richEnd);
    document.body.replaceChildren(employee, unknown, input, textarea, image, rich);

    const sendMessage = vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true
    });
    sendMessage.mockResolvedValueOnce({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true
    });
    sendMessage.mockResolvedValueOnce({
      mappings: {
        "[<TOKEN-Name-J>]": "James",
        "[<TOKEN-Name-M>]": "Marc",
        "[<TOKEN-Name-E>]": "Ed",
        "[<TOKEN-Name-JM>]": "Jay",
        "[<TOKEN-Name-D>]": "Daniel"
      },
      requestId: "req-1",
      latencyMs: 12
    });

    await import("../../extension/src/content/index");
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("James");
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONTENT_GET_RUNTIME_CONFIG",
        payload: {}
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONTENT_DETECTED_TOKENS",
        payload: expect.objectContaining({
          domain: "localhost",
          tokens: expect.arrayContaining([
            "[<TOKEN-Name-J>]",
            "[<TOKEN-Name-M>]",
            "[<TOKEN-Name-E>]",
            "[<TOKEN-Name-JM>]",
            "[<TOKEN-Name-D>]"
          ])
        })
      })
    );
    expect(document.body.textContent).toContain("[<TOKEN-Name-X>]");
    expect(input.value).toBe("Marc");
    expect(input.getAttribute("placeholder")).toBe("Lookup Jay");
    expect(textarea.value).toBe("Ed");
    expect(image.getAttribute("alt")).toBe("Badge Daniel");
    expect(rich.textContent).toBe("Daniel");
  });

  it("warns when background responses are invalid", async () => {
    const employee = document.createElement("p");
    employee.textContent = "Employee: [<TOKEN-Name-J>]";
    document.body.replaceChildren(employee);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(chrome.runtime.sendMessage)
      .mockResolvedValueOnce({
        enabled: true,
        crossOriginIframesEnabled: true,
        visualOcrEnabled: true,
        automaticDownloadsEnabled: true
      })
      .mockResolvedValueOnce({ invalid: true });

    await import("../../extension/src/content/index");
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith("[detokenizer] invalid background response");
    });

    expect(document.body.textContent).toContain("[<TOKEN-Name-J>]");
  });

  it("skips unsupported page URLs entirely", async () => {
    vi.doMock("../../extension/src/shared/config", async () => {
      const actual = await vi.importActual<typeof import("../../extension/src/shared/config")>(
        "../../extension/src/shared/config"
      );

      return {
        ...actual,
        isSupportedPageUrl: () => false,
        getDetokenizationScope: () => null
      };
    });

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    await import("../../extension/src/content/index");

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith("[detokenizer] skipped unsupported page url");
  });

  it("does not process a cross-origin subframe when the toggle is off", async () => {
    const employee = document.createElement("p");
    employee.textContent = "Employee: [<TOKEN-Name-J>]";
    document.body.replaceChildren(employee);

    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      enabled: true,
      crossOriginIframesEnabled: false,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true
    });

    vi.spyOn(window, "top", "get").mockImplementation(() => {
      throw new DOMException("Blocked a frame with origin", "SecurityError");
    });

    await import("../../extension/src/content/index");
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONTENT_DETECTED_TOKENS"
      })
    );
    expect(document.body.textContent).toContain("[<TOKEN-Name-J>]");
  });
});

import {
  CONTENT_SCRIPT_MATCH_PATTERNS,
  SUPPORTED_PAGE_PROTOCOLS,
  getApiConfig,
  getDetokenizationScope,
  isSecureApiUrl,
  isSupportedPageUrl,
  wildcardMatch
} from "../../extension/src/shared/config";

describe("page scope config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs on broadly supported page URLs", () => {
    expect(CONTENT_SCRIPT_MATCH_PATTERNS).toEqual(["<all_urls>"]);
    expect(SUPPORTED_PAGE_PROTOCOLS).toEqual(["http:", "https:", "file:"]);

    expect(isSupportedPageUrl("https://contoso.sharepoint.com/sites/hr/SitePages/Home.aspx")).toBe(true);
    expect(isSupportedPageUrl("https://app.example.com/whatever")).toBe(true);
    expect(isSupportedPageUrl("http://localhost:3000/page")).toBe(true);
    expect(isSupportedPageUrl("http://127.0.0.1:5173/")).toBe(true);
    expect(isSupportedPageUrl("file:///Users/tester/Desktop/demo.html")).toBe(true);
  });

  it("rejects unsupported browser page schemes", () => {
    expect(isSupportedPageUrl("chrome://extensions")).toBe(false);
    expect(isSupportedPageUrl("chrome-extension://abc123/popup.html")).toBe(false);
    expect(isSupportedPageUrl("about:blank")).toBe(false);
  });

  it("derives a stable detokenization scope from the page URL", () => {
    expect(getDetokenizationScope("https://app.example.com/whatever")).toBe("app.example.com");
    expect(getDetokenizationScope("http://localhost:3000/page")).toBe("localhost");
    expect(getDetokenizationScope("file:///Users/tester/Desktop/demo.html")).toBe("file");
    expect(getDetokenizationScope("chrome://extensions")).toBeNull();
  });

  it("allows local dev API by default when API URL is loopback http", () => {
    const apiConfig = getApiConfig();

    expect(apiConfig.apiUrl).toBe("http://127.0.0.1:8787/detokenize");
    expect(apiConfig.allowHttpDev).toBe(true);
  });

  it("respects explicit allow-http override", () => {
    vi.stubEnv("VITE_DETOKENIZER_API_URL", "http://localhost:8787/detokenize");
    vi.stubEnv("VITE_ALLOW_HTTP_DEV", "false");

    const apiConfig = getApiConfig();
    expect(apiConfig.allowHttpDev).toBe(false);
    expect(isSecureApiUrl(apiConfig.apiUrl, apiConfig.allowHttpDev)).toBe(false);
  });

  it("never treats non-localhost http API as secure", () => {
    expect(isSecureApiUrl("http://api.example.com/detokenize", true)).toBe(false);
  });

  it("accepts secure https APIs and rejects malformed URLs", () => {
    expect(isSecureApiUrl("https://api.example.com/detokenize", false)).toBe(true);
    expect(isSecureApiUrl("not-a-url", true)).toBe(false);
    expect(isSupportedPageUrl("notaurl")).toBe(false);
    expect(getDetokenizationScope("notaurl")).toBeNull();
  });

  it("matches wildcard host permission patterns case-insensitively", () => {
    expect(wildcardMatch("https://*/*", "https://Example.com/path")).toBe(true);
    expect(wildcardMatch("http://localhost/*", "http://127.0.0.1/page")).toBe(false);
  });
});

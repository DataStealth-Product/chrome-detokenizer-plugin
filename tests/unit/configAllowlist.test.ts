import { HOST_ALLOWLIST_PATTERNS, getApiConfig, isAllowedUrl, isSecureApiUrl } from "../../extension/src/shared/config";

describe("host allowlist", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("targets sharepoint online and localhost", () => {
    expect(HOST_ALLOWLIST_PATTERNS).toEqual([
      "https://*.sharepoint.com/*",
      "http://localhost/*",
      "http://127.0.0.1/*"
    ]);

    expect(isAllowedUrl("https://contoso.sharepoint.com/sites/hr/SitePages/Home.aspx")).toBe(true);
    expect(isAllowedUrl("http://localhost:3000/page")).toBe(true);
    expect(isAllowedUrl("http://127.0.0.1:5173/")).toBe(true);
  });

  it("rejects non-sharepoint public domains", () => {
    expect(isAllowedUrl("https://app.example.com/whatever")).toBe(false);
    expect(isAllowedUrl("https://www.microsoft.com/")).toBe(false);
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
});

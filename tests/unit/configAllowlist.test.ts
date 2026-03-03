import { HOST_ALLOWLIST_PATTERNS, isAllowedUrl } from "../../extension/src/shared/config";

describe("host allowlist", () => {
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
});

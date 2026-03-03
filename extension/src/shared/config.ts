export const HOST_ALLOWLIST_PATTERNS = [
  "https://*.sharepoint.com/*",
  "http://localhost/*",
  "http://127.0.0.1/*"
] as const;

export const TOKEN_HINT_PREFIX = "[<TOKEN-";
export const DEFAULT_DEBOUNCE_MS = 75;
export const DEFAULT_MAX_BATCH_SIZE = 100;
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 3_000;
export const REQUEST_RETRIES = 2;

const DEFAULT_API_URL = "http://localhost:8787/detokenize";

export function getApiConfig(): {
  apiUrl: string;
  authToken: string;
  allowHttpDev: boolean;
} {
  const apiUrl = import.meta.env.VITE_DETOKENIZER_API_URL ?? DEFAULT_API_URL;
  const authToken = import.meta.env.VITE_DETOKENIZER_AUTH_TOKEN ?? "dev-token";
  const allowHttpDev = (import.meta.env.VITE_ALLOW_HTTP_DEV ?? "false") === "true";

  return { apiUrl, authToken, allowHttpDev };
}

export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const candidate = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    return HOST_ALLOWLIST_PATTERNS.some((pattern) => wildcardMatch(pattern, candidate));
  } catch {
    return false;
  }
}

export function isSecureApiUrl(apiUrl: string, allowHttpDev: boolean): boolean {
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol === "https:") {
      return true;
    }

    if (!allowHttpDev) {
      return false;
    }

    return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(value);
}

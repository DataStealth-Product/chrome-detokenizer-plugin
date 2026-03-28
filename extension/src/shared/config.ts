export const CONTENT_SCRIPT_MATCH_PATTERNS = ["<all_urls>"] as const;
export const SUPPORTED_PAGE_PROTOCOLS = ["http:", "https:", "file:"] as const;

export const TOKEN_HINT_PREFIX = "[<TOKEN-";
export const DEFAULT_DEBOUNCE_MS = 75;
export const DEFAULT_MAX_BATCH_SIZE = 100;
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_SENSITIVE_TTL_MS = 90 * 1000;
export const REQUEST_TIMEOUT_MS = 3_000;
export const REQUEST_RETRIES = 2;
export const SUPPORTED_DOWNLOAD_EXTENSIONS = ["txt", "json", "png", "jpg", "jpeg", "webp", "pdf", "docx", "xlsx", "pptx"] as const;
export const SUPPORTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

const DEFAULT_API_URL = "http://127.0.0.1:8787/detokenize";

export function getApiConfig(): {
  apiUrl: string;
  authToken: string;
  allowHttpDev: boolean;
} {
  const apiUrl = import.meta.env.VITE_DETOKENIZER_API_URL ?? DEFAULT_API_URL;
  const authToken = import.meta.env.VITE_DETOKENIZER_AUTH_TOKEN ?? "dev-token";
  const allowHttpDev = import.meta.env.VITE_ALLOW_HTTP_DEV !== undefined
    ? import.meta.env.VITE_ALLOW_HTTP_DEV === "true"
    : isLocalDevApiUrl(apiUrl);

  return { apiUrl, authToken, allowHttpDev };
}

export function isSupportedPageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SUPPORTED_PAGE_PROTOCOLS.includes(parsed.protocol as (typeof SUPPORTED_PAGE_PROTOCOLS)[number]);
  } catch {
    return false;
  }
}

export function getDetokenizationScope(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!isSupportedPageUrl(url)) {
      return null;
    }

    if (parsed.hostname) {
      return parsed.hostname;
    }

    if (parsed.origin && parsed.origin !== "null") {
      return parsed.origin;
    }

    return parsed.protocol.replace(/:$/, "");
  } catch {
    return null;
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

function isLocalDevApiUrl(apiUrl: string): boolean {
  try {
    const parsed = new URL(apiUrl);
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

export function getSupportedDownloadExtension(url: string, fileNameHint?: string): string | null {
  const candidates = [fileNameHint, url];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const match = candidate.toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#])/i);
    if (!match) {
      continue;
    }

    const extension = match[1];
    if (SUPPORTED_DOWNLOAD_EXTENSIONS.includes(extension as (typeof SUPPORTED_DOWNLOAD_EXTENSIONS)[number])) {
      return extension;
    }
  }

  return null;
}

export function isSupportedDownloadTarget(url: string, fileNameHint?: string): boolean {
  return getSupportedDownloadExtension(url, fileNameHint) !== null;
}

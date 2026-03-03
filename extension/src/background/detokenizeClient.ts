import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MAX_BATCH_SIZE,
  REQUEST_RETRIES,
  REQUEST_TIMEOUT_MS,
  getApiConfig,
  isSecureApiUrl
} from "../shared/config";
import { DetokenizeResponseSchema } from "../shared/contracts";
import { TokenCache } from "./cache";

export interface FetchMappingsResult {
  mappings: Record<string, string>;
  requestId: string;
  latencyMs: number;
  error?: string;
}

interface PendingRequest {
  tokens: string[];
  resolve: (result: FetchMappingsResult) => void;
}

interface DomainQueue {
  requests: PendingRequest[];
  timer?: ReturnType<typeof globalThis.setTimeout>;
}

export class DetokenizeClient {
  private readonly apiUrl: string;
  private readonly authToken: string;
  private readonly allowHttpDev: boolean;
  private readonly queueByDomain = new Map<string, DomainQueue>();

  constructor(private readonly cache: TokenCache) {
    const apiConfig = getApiConfig();
    this.apiUrl = apiConfig.apiUrl;
    this.authToken = apiConfig.authToken;
    this.allowHttpDev = apiConfig.allowHttpDev;
  }

  async fetchMappings(domain: string, tokens: string[]): Promise<FetchMappingsResult> {
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];
    if (uniqueTokens.length === 0) {
      return {
        mappings: {},
        requestId: crypto.randomUUID(),
        latencyMs: 0
      };
    }

    const { hits, misses } = this.cache.getMany(domain, uniqueTokens);
    if (misses.length === 0) {
      return {
        mappings: hits,
        requestId: "cache-only",
        latencyMs: 0
      };
    }

    const batchResult = await this.enqueue(domain, misses);
    return {
      mappings: {
        ...hits,
        ...batchResult.mappings
      },
      requestId: batchResult.requestId,
      latencyMs: batchResult.latencyMs,
      ...(batchResult.error ? { error: batchResult.error } : {})
    };
  }

  private enqueue(domain: string, tokens: string[]): Promise<FetchMappingsResult> {
    return new Promise((resolve) => {
      const queue = this.ensureQueue(domain);
      queue.requests.push({ tokens, resolve });

      if (queue.timer !== undefined) {
        return;
      }

      queue.timer = globalThis.setTimeout(() => {
        void this.flush(domain);
      }, DEFAULT_DEBOUNCE_MS);
    });
  }

  private async flush(domain: string): Promise<void> {
    const queue = this.queueByDomain.get(domain);
    if (!queue) {
      return;
    }

    if (queue.timer !== undefined) {
      globalThis.clearTimeout(queue.timer);
      queue.timer = undefined;
    }

    const requests = queue.requests.splice(0, queue.requests.length);
    if (requests.length === 0) {
      return;
    }

    const batchedTokens = [...new Set(requests.flatMap((request) => request.tokens))];

    let requestId: string = crypto.randomUUID();
    let totalLatencyMs = 0;
    let error: string | undefined;
    const aggregatedMappings: Record<string, string> = {};

    for (const chunk of chunkArray(batchedTokens, DEFAULT_MAX_BATCH_SIZE)) {
      const result = await this.callApi(domain, chunk);
      requestId = result.requestId;
      totalLatencyMs += result.latencyMs;

      if (result.error) {
        error = result.error;
      }

      Object.assign(aggregatedMappings, result.mappings);
    }

    for (const [token, value] of Object.entries(aggregatedMappings)) {
      this.cache.set(domain, token, value);
    }

    for (const request of requests) {
      const requestMappings: Record<string, string> = {};
      for (const token of request.tokens) {
        const value = aggregatedMappings[token];
        if (value !== undefined) {
          requestMappings[token] = value;
        }
      }

      request.resolve({
        mappings: requestMappings,
        requestId,
        latencyMs: totalLatencyMs,
        ...(error ? { error } : {})
      });
    }
  }

  private async callApi(domain: string, tokens: string[]): Promise<FetchMappingsResult> {
    const requestId = crypto.randomUUID();

    if (!isSecureApiUrl(this.apiUrl, this.allowHttpDev)) {
      return {
        mappings: {},
        requestId,
        latencyMs: 0,
        error: "api_url_not_secure"
      };
    }

    for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.authToken}`,
            "X-Request-ID": requestId
          },
          body: JSON.stringify({
            domain,
            tokens
          }),
          signal: controller.signal
        });

        const latencyMs = Number((performance.now() - startedAt).toFixed(2));
        if (!response.ok) {
          throw new Error(`detokenize_http_${response.status}`);
        }

        const json = await response.json();
        const parsed = DetokenizeResponseSchema.safeParse(json);
        if (!parsed.success) {
          throw new Error("detokenize_invalid_response");
        }

        return {
          mappings: parsed.data.mappings,
          requestId,
          latencyMs
        };
      } catch (error) {
        const latencyMs = Number((performance.now() - startedAt).toFixed(2));
        const message = error instanceof Error ? error.message : "detokenize_unknown_error";

        if (attempt === REQUEST_RETRIES) {
          return {
            mappings: {},
            requestId,
            latencyMs,
            error: message
          };
        }

        await sleep(backoffMs(attempt));
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    }

    return {
      mappings: {},
      requestId,
      latencyMs: 0,
      error: "detokenize_retry_exhausted"
    };
  }

  private ensureQueue(domain: string): DomainQueue {
    const existing = this.queueByDomain.get(domain);
    if (existing) {
      return existing;
    }

    const created: DomainQueue = {
      requests: []
    };

    this.queueByDomain.set(domain, created);
    return created;
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function backoffMs(attempt: number): number {
  return 100 * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

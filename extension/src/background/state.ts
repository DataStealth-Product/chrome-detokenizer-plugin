import type { DetokenizeMetrics, PopupStatusResponse } from "../shared/contracts";

interface MutableTabState {
  enabled: boolean;
  metrics: DetokenizeMetrics;
  requestCount: number;
  totalLatencyMs: number;
  lastError?: string;
}

const DEFAULT_METRICS: DetokenizeMetrics = {
  detectedCount: 0,
  detokenizedCount: 0,
  errorCount: 0,
  avgLatencyMs: 0
};

export class TabStateStore {
  private readonly byTabId = new Map<number, MutableTabState>();

  isEnabled(tabId: number): boolean {
    return this.ensure(tabId).enabled;
  }

  setEnabled(tabId: number, enabled: boolean): PopupStatusResponse {
    const state = this.ensure(tabId);
    state.enabled = enabled;
    return this.toResponse(state);
  }

  getStatus(tabId: number): PopupStatusResponse {
    return this.toResponse(this.ensure(tabId));
  }

  recordDetected(tabId: number, count: number): void {
    const state = this.ensure(tabId);
    state.metrics.detectedCount += count;
  }

  recordDetokenized(tabId: number, count: number): void {
    const state = this.ensure(tabId);
    state.metrics.detokenizedCount += count;
  }

  recordLatency(tabId: number, latencyMs: number): void {
    const state = this.ensure(tabId);
    state.requestCount += 1;
    state.totalLatencyMs += latencyMs;
    state.metrics.avgLatencyMs = Number((state.totalLatencyMs / state.requestCount).toFixed(2));
  }

  recordError(tabId: number, message: string): void {
    const state = this.ensure(tabId);
    state.metrics.errorCount += 1;
    state.lastError = message;
  }

  clearError(tabId: number): void {
    const state = this.ensure(tabId);
    state.lastError = undefined;
  }

  removeTab(tabId: number): void {
    this.byTabId.delete(tabId);
  }

  private ensure(tabId: number): MutableTabState {
    const existing = this.byTabId.get(tabId);
    if (existing) {
      return existing;
    }

    const created: MutableTabState = {
      enabled: true,
      metrics: { ...DEFAULT_METRICS },
      requestCount: 0,
      totalLatencyMs: 0
    };
    this.byTabId.set(tabId, created);
    return created;
  }

  private toResponse(state: MutableTabState): PopupStatusResponse {
    return {
      enabled: state.enabled,
      metrics: { ...state.metrics },
      ...(state.lastError ? { lastError: state.lastError } : {})
    };
  }
}

import type { DetokenizeMetrics, PopupStatusResponse, RuntimeConfig } from "../shared/contracts";

interface MutableTabState {
  enabled: boolean;
  crossOriginIframesEnabled: boolean;
  visualOcrEnabled: boolean;
  automaticDownloadsEnabled: boolean;
  activeSensitiveJobsCount: number;
  metrics: DetokenizeMetrics;
  requestCount: number;
  totalLatencyMs: number;
  lastPurgeReason?: string;
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

  getRuntimeConfig(tabId: number): RuntimeConfig {
    const state = this.ensure(tabId);
    return {
      enabled: state.enabled,
      crossOriginIframesEnabled: state.crossOriginIframesEnabled,
      visualOcrEnabled: state.visualOcrEnabled,
      automaticDownloadsEnabled: state.automaticDownloadsEnabled
    };
  }

  setEnabled(tabId: number, enabled: boolean): PopupStatusResponse {
    const state = this.ensure(tabId);
    state.enabled = enabled;
    return this.toResponse(state);
  }

  setCrossOriginIframesEnabled(tabId: number, enabled: boolean): PopupStatusResponse {
    const state = this.ensure(tabId);
    state.crossOriginIframesEnabled = enabled;
    return this.toResponse(state);
  }

  setVisualOcrEnabled(tabId: number, enabled: boolean): PopupStatusResponse {
    const state = this.ensure(tabId);
    state.visualOcrEnabled = enabled;
    return this.toResponse(state);
  }

  setAutomaticDownloadsEnabled(tabId: number, enabled: boolean): PopupStatusResponse {
    const state = this.ensure(tabId);
    state.automaticDownloadsEnabled = enabled;
    return this.toResponse(state);
  }

  getStatus(tabId: number): PopupStatusResponse {
    return this.toResponse(this.ensure(tabId));
  }

  setActiveSensitiveJobsCount(tabId: number, count: number): void {
    const state = this.ensure(tabId);
    state.activeSensitiveJobsCount = Math.max(0, count);
  }

  setLastPurgeReason(tabId: number, reason?: string): void {
    const state = this.ensure(tabId);
    state.lastPurgeReason = reason;
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
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
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
      crossOriginIframesEnabled: state.crossOriginIframesEnabled,
      visualOcrEnabled: state.visualOcrEnabled,
      automaticDownloadsEnabled: state.automaticDownloadsEnabled,
      activeSensitiveJobsCount: state.activeSensitiveJobsCount,
      ...(state.lastPurgeReason ? { lastPurgeReason: state.lastPurgeReason } : {}),
      metrics: { ...state.metrics },
      ...(state.lastError ? { lastError: state.lastError } : {})
    };
  }
}

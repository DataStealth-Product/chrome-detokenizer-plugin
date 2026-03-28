import { TabStateStore } from "../../extension/src/background/state";

describe("tab state store", () => {
  it("defaults tabs to enabled with empty metrics", () => {
    const store = new TabStateStore();

    expect(store.isEnabled(1)).toBe(true);
    expect(store.getStatus(1)).toEqual({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 0,
        avgLatencyMs: 0
      }
    });
  });

  it("tracks metrics, errors, and enablement changes", () => {
    const store = new TabStateStore();

    store.recordDetected(7, 3);
    store.recordDetokenized(7, 2);
    store.recordLatency(7, 10);
    store.recordLatency(7, 15);
    store.recordError(7, "network_down");
    store.setCrossOriginIframesEnabled(7, false);

    expect(store.setEnabled(7, false)).toEqual({
      enabled: false,
      crossOriginIframesEnabled: false,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 3,
        detokenizedCount: 2,
        errorCount: 1,
        avgLatencyMs: 12.5
      },
      lastError: "network_down"
    });

    store.clearError(7);
    expect(store.getStatus(7)).toEqual({
      enabled: false,
      crossOriginIframesEnabled: false,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 3,
        detokenizedCount: 2,
        errorCount: 1,
        avgLatencyMs: 12.5
      }
    });
  });

  it("removes tab state completely", () => {
    const store = new TabStateStore();

    store.setEnabled(11, false);
    store.recordDetected(11, 1);
    store.removeTab(11);

    expect(store.getStatus(11)).toEqual({
      enabled: true,
      crossOriginIframesEnabled: true,
      visualOcrEnabled: true,
      automaticDownloadsEnabled: true,
      activeSensitiveJobsCount: 0,
      metrics: {
        detectedCount: 0,
        detokenizedCount: 0,
        errorCount: 0,
        avgLatencyMs: 0
      }
    });
  });
});

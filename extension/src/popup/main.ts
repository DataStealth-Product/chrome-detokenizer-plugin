import { MessageType, PopupStatusResponseSchema, parseMessage } from "../shared/contracts";

const enabledInput = queryRequired<HTMLInputElement>("#enabled");
const crossOriginIframesInput = queryRequired<HTMLInputElement>("#cross-origin-iframes");
const visualOcrInput = queryRequired<HTMLInputElement>("#visual-ocr");
const automaticDownloadsInput = queryRequired<HTMLInputElement>("#automatic-downloads");
const clearSensitiveStateButton = queryRequired<HTMLButtonElement>("#clear-sensitive-state");
const visualOcrWarningElement = queryRequired<HTMLElement>("#visual-ocr-warning");
const statusElement = queryRequired<HTMLElement>("#status");
const metricsElement = queryRequired<HTMLElement>("#metrics");

let activeTabId: number | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  activeTabId = await getActiveTabId();
  if (activeTabId === null) {
    statusElement.textContent = "No active tab available.";
    renderVisualOcrWarning(undefined, false);
    enabledInput.disabled = true;
    crossOriginIframesInput.disabled = true;
    visualOcrInput.disabled = true;
    automaticDownloadsInput.disabled = true;
    clearSensitiveStateButton.disabled = true;
    return;
  }

  enabledInput.disabled = false;
  crossOriginIframesInput.disabled = false;
  visualOcrInput.disabled = false;
  automaticDownloadsInput.disabled = false;
  clearSensitiveStateButton.disabled = false;
  enabledInput.addEventListener("change", () => {
    if (activeTabId === null) {
      return;
    }
    void setEnabled(activeTabId, enabledInput.checked);
  });
  crossOriginIframesInput.addEventListener("change", () => {
    if (activeTabId === null) {
      return;
    }
    void setCrossOriginIframesEnabled(activeTabId, crossOriginIframesInput.checked);
  });
  visualOcrInput.addEventListener("change", () => {
    if (activeTabId === null) {
      return;
    }
    void setVisualOcrEnabled(activeTabId, visualOcrInput.checked);
  });
  automaticDownloadsInput.addEventListener("change", () => {
    if (activeTabId === null) {
      return;
    }
    void setAutomaticDownloadsEnabled(activeTabId, automaticDownloadsInput.checked);
  });
  clearSensitiveStateButton.addEventListener("click", () => {
    if (activeTabId === null) {
      return;
    }
    void clearSensitiveState(activeTabId);
  });

  await refresh();
  window.setInterval(() => {
    void refresh();
  }, 1_000);
}

async function refresh(): Promise<void> {
  if (activeTabId === null) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.POPUP_GET_STATUS,
      payload: { tabId: activeTabId }
    });

    const parsed = parseMessage(PopupStatusResponseSchema, response);
    if (!parsed) {
      statusElement.textContent = "Status unavailable.";
      return;
    }

    enabledInput.checked = parsed.enabled;
    crossOriginIframesInput.checked = parsed.crossOriginIframesEnabled;
    visualOcrInput.checked = parsed.visualOcrEnabled;
    automaticDownloadsInput.checked = parsed.automaticDownloadsEnabled;
    renderMetrics(parsed.metrics, parsed.activeSensitiveJobsCount);
    renderVisualOcrWarning(parsed.lastError, parsed.visualOcrEnabled);
    statusElement.textContent = parsed.lastError
      ? formatLastError(parsed.lastError)
      : parsed.lastPurgeReason
        ? `Last purge: ${parsed.lastPurgeReason}`
        : "Monitoring active.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    renderVisualOcrWarning(undefined, false);
    statusElement.textContent = `Status error: ${message}`;
  }
}

async function setEnabled(tabId: number, enabled: boolean): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.POPUP_SET_ENABLED,
      payload: { tabId, enabled }
    });

    const parsed = parseMessage(PopupStatusResponseSchema, response);
    if (!parsed) {
      statusElement.textContent = "Failed to update toggle.";
      return;
    }

    enabledInput.checked = parsed.enabled;
    crossOriginIframesInput.checked = parsed.crossOriginIframesEnabled;
    visualOcrInput.checked = parsed.visualOcrEnabled;
    automaticDownloadsInput.checked = parsed.automaticDownloadsEnabled;
    renderMetrics(parsed.metrics, parsed.activeSensitiveJobsCount);
    renderVisualOcrWarning(parsed.lastError, parsed.visualOcrEnabled);
    statusElement.textContent = parsed.lastError
      ? formatLastError(parsed.lastError)
      : parsed.enabled
        ? "Detokenization enabled."
        : "Detokenization paused for this tab.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    statusElement.textContent = `Toggle failed: ${message}`;
  }
}

async function setCrossOriginIframesEnabled(tabId: number, enabled: boolean): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.POPUP_SET_CROSS_ORIGIN_IFRAMES,
      payload: { tabId, enabled }
    });

    const parsed = parseMessage(PopupStatusResponseSchema, response);
    if (!parsed) {
      statusElement.textContent = "Failed to update iframe toggle.";
      return;
    }

    enabledInput.checked = parsed.enabled;
    crossOriginIframesInput.checked = parsed.crossOriginIframesEnabled;
    visualOcrInput.checked = parsed.visualOcrEnabled;
    automaticDownloadsInput.checked = parsed.automaticDownloadsEnabled;
    renderMetrics(parsed.metrics, parsed.activeSensitiveJobsCount);
    renderVisualOcrWarning(parsed.lastError, parsed.visualOcrEnabled);
    statusElement.textContent = parsed.lastError
      ? formatLastError(parsed.lastError)
      : parsed.crossOriginIframesEnabled
        ? "Cross-origin iframe detokenization enabled."
        : "Cross-origin iframe detokenization paused.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    statusElement.textContent = `Iframe toggle failed: ${message}`;
  }
}

async function setVisualOcrEnabled(tabId: number, enabled: boolean): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.POPUP_SET_VISUAL_OCR_ENABLED,
      payload: { tabId, enabled }
    });

    const parsed = parseMessage(PopupStatusResponseSchema, response);
    if (!parsed) {
      statusElement.textContent = "Failed to update visual OCR toggle.";
      return;
    }

    enabledInput.checked = parsed.enabled;
    crossOriginIframesInput.checked = parsed.crossOriginIframesEnabled;
    visualOcrInput.checked = parsed.visualOcrEnabled;
    automaticDownloadsInput.checked = parsed.automaticDownloadsEnabled;
    renderMetrics(parsed.metrics, parsed.activeSensitiveJobsCount);
    renderVisualOcrWarning(parsed.lastError, parsed.visualOcrEnabled);
    statusElement.textContent = parsed.lastError
      ? formatLastError(parsed.lastError)
      : parsed.visualOcrEnabled
        ? "Visual OCR enabled."
        : "Visual OCR paused.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    statusElement.textContent = `Visual OCR toggle failed: ${message}`;
  }
}

async function setAutomaticDownloadsEnabled(tabId: number, enabled: boolean): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.POPUP_SET_AUTOMATIC_DOWNLOADS_ENABLED,
      payload: { tabId, enabled }
    });

    const parsed = parseMessage(PopupStatusResponseSchema, response);
    if (!parsed) {
      statusElement.textContent = "Failed to update automatic downloads toggle.";
      return;
    }

    enabledInput.checked = parsed.enabled;
    crossOriginIframesInput.checked = parsed.crossOriginIframesEnabled;
    visualOcrInput.checked = parsed.visualOcrEnabled;
    automaticDownloadsInput.checked = parsed.automaticDownloadsEnabled;
    renderMetrics(parsed.metrics, parsed.activeSensitiveJobsCount);
    renderVisualOcrWarning(parsed.lastError, parsed.visualOcrEnabled);
    statusElement.textContent = parsed.lastError
      ? formatLastError(parsed.lastError)
      : parsed.automaticDownloadsEnabled
        ? "Automatic download detokenization enabled."
        : "Automatic download detokenization paused.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    statusElement.textContent = `Automatic downloads toggle failed: ${message}`;
  }
}

async function clearSensitiveState(tabId: number): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageType.POPUP_CLEAR_SENSITIVE_STATE,
      payload: { tabId }
    });

    const parsed = parseMessage(PopupStatusResponseSchema, response);
    if (!parsed) {
      statusElement.textContent = "Failed to purge sensitive state.";
      return;
    }

    enabledInput.checked = parsed.enabled;
    crossOriginIframesInput.checked = parsed.crossOriginIframesEnabled;
    visualOcrInput.checked = parsed.visualOcrEnabled;
    automaticDownloadsInput.checked = parsed.automaticDownloadsEnabled;
    renderMetrics(parsed.metrics, parsed.activeSensitiveJobsCount);
    renderVisualOcrWarning(parsed.lastError, parsed.visualOcrEnabled);
    statusElement.textContent = parsed.lastError
      ? formatLastError(parsed.lastError)
      : parsed.lastPurgeReason
        ? `Sensitive state purged: ${parsed.lastPurgeReason}`
        : "Sensitive state purged.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    statusElement.textContent = `Purge failed: ${message}`;
  }
}

function renderVisualOcrWarning(lastError: string | undefined, visualOcrEnabled: boolean): void {
  const unavailable = visualOcrEnabled && lastError === "text_detector_unavailable";
  visualOcrWarningElement.dataset.visible = unavailable ? "true" : "false";
  visualOcrWarningElement.textContent = unavailable
    ? "Visual OCR unavailable on this browser. DOM detokenization still works, but image and canvas overlays cannot run."
    : "";
}

function formatLastError(lastError: string): string {
  if (lastError === "text_detector_unavailable") {
    return "Visual OCR unavailable on this browser.";
  }

  return `Last error: ${lastError}`;
}

function renderMetrics(metrics: {
  detectedCount: number;
  detokenizedCount: number;
  errorCount: number;
  avgLatencyMs: number;
}, activeSensitiveJobsCount: number = 0): void {
  metricsElement.replaceChildren(
    createMetricRow("Tokens Detected", String(metrics.detectedCount)),
    createMetricRow("Tokens Detokenized", String(metrics.detokenizedCount)),
    createMetricRow("Errors", String(metrics.errorCount)),
    createMetricRow("Avg API Latency", `${metrics.avgLatencyMs} ms`),
    createMetricRow("Sensitive Jobs", String(activeSensitiveJobsCount))
  );
}

function createMetricRow(label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";

  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;

  const valueStrong = document.createElement("strong");
  valueStrong.textContent = value;

  row.append(labelSpan, valueStrong);
  return row;
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  return tab?.id ?? null;
}

function queryRequired<TElement extends Element>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`popup_dom_missing_element:${selector}`);
  }
  return element;
}

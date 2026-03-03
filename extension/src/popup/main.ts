import { MessageType, PopupStatusResponseSchema, parseMessage } from "../shared/contracts";

const enabledInput = queryRequired<HTMLInputElement>("#enabled");
const statusElement = queryRequired<HTMLElement>("#status");
const metricsElement = queryRequired<HTMLElement>("#metrics");

let activeTabId: number | null = null;

void bootstrap();

async function bootstrap(): Promise<void> {
  activeTabId = await getActiveTabId();
  if (activeTabId === null) {
    statusElement.textContent = "No active tab available.";
    enabledInput.disabled = true;
    return;
  }

  enabledInput.disabled = false;
  enabledInput.addEventListener("change", () => {
    if (activeTabId === null) {
      return;
    }
    void setEnabled(activeTabId, enabledInput.checked);
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
    renderMetrics(parsed.metrics);
    statusElement.textContent = parsed.lastError ? `Last error: ${parsed.lastError}` : "Monitoring active.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
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
    renderMetrics(parsed.metrics);
    statusElement.textContent = parsed.enabled ? "Detokenization enabled." : "Detokenization paused for this tab.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "runtime_error";
    statusElement.textContent = `Toggle failed: ${message}`;
  }
}

function renderMetrics(metrics: {
  detectedCount: number;
  detokenizedCount: number;
  errorCount: number;
  avgLatencyMs: number;
}): void {
  metricsElement.replaceChildren(
    createMetricRow("Tokens Detected", String(metrics.detectedCount)),
    createMetricRow("Tokens Detokenized", String(metrics.detokenizedCount)),
    createMetricRow("Errors", String(metrics.errorCount)),
    createMetricRow("Avg API Latency", `${metrics.avgLatencyMs} ms`)
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

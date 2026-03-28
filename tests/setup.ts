import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();

  if (typeof document !== "undefined") {
    document.head.replaceChildren();
    document.body.replaceChildren();
  }
});

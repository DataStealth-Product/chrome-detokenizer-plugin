import { IncrementalObserver } from "../../extension/src/content/observer";

describe("incremental observer", () => {
  it("queues mutation roots using debounce", async () => {
    vi.useFakeTimers();

    const observedRoots: Node[][] = [];
    const observer = new IncrementalObserver((roots) => observedRoots.push(roots), 75);

    observer.observeDocument(document);

    const target = document.createElement("div");
    document.body.append(target);
    target.textContent = "[<TOKEN-Name-J>]";

    await vi.advanceTimersByTimeAsync(100);

    expect(observedRoots.length).toBeGreaterThan(0);

    observer.disconnect();
    vi.useRealTimers();
  });
});

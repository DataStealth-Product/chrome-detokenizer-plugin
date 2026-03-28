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

  it("captures input events and suppresses self-inflicted mutations", async () => {
    vi.useFakeTimers();

    const observedRoots: Node[][] = [];
    const observer = new IncrementalObserver((roots) => observedRoots.push(roots), 75);

    const input = document.createElement("input");
    document.body.append(input);
    observer.observeDocument(document);

    input.value = "[<TOKEN-Name-J>]";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);

    expect(observedRoots.flat()).toContain(input);

    const countAfterInput = observedRoots.length;
    observer.runWithoutObservation(() => {
      input.value = "James";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(observedRoots).toHaveLength(countAfterInput);

    observer.disconnect();
    vi.useRealTimers();
  });

  it("clears pending queued roots when disconnected before debounce flush", async () => {
    vi.useFakeTimers();

    const observedRoots: Node[][] = [];
    const observer = new IncrementalObserver((roots) => observedRoots.push(roots), 75);
    observer.observeDocument(document);

    observer.queueRoot(document.body);
    observer.disconnect();
    await vi.advanceTimersByTimeAsync(100);

    expect(observedRoots).toEqual([]);

    vi.useRealTimers();
  });
});

import { ProcessingJobManager } from "../../extension/src/background/jobManager";

describe("processing job manager", () => {
  it("tracks active jobs by tab and purges them", () => {
    const manager = new ProcessingJobManager(1_000);
    const first = manager.create(7, "text", {
      url: "https://example.com/file.txt",
      fileName: "file.txt"
    });

    expect(manager.getActiveCount(7)).toBe(1);
    expect(manager.updateStatus(first.id, "complete")?.status).toBe("complete");
    expect(manager.purge(first.id)?.status).toBe("purged");
    expect(manager.getActiveCount(7)).toBe(0);
  });

  it("schedules TTL purges", () => {
    vi.useFakeTimers();
    const manager = new ProcessingJobManager(250);
    const job = manager.create(3, "visual-surface", {
      url: "https://example.com",
      fileName: "visual-scan"
    });

    const purged: string[] = [];
    manager.schedulePurge(job.id, (nextJob) => purged.push(nextJob.id));

    vi.advanceTimersByTime(300);
    expect(purged).toEqual([job.id]);
    expect(manager.getActiveCount(3)).toBe(0);
  });
});

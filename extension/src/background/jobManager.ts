import type { ArtifactKind, ProcessingJob, ProcessingJobStatus, SourceDescriptor } from "../shared/contracts";

interface MutableJob extends ProcessingJob {
  purgeTimer?: ReturnType<typeof globalThis.setTimeout>;
}

export class ProcessingJobManager {
  private readonly jobs = new Map<string, MutableJob>();
  private readonly jobIdsByTab = new Map<number, Set<string>>();

  constructor(private readonly ttlMs: number) {}

  create(tabId: number, artifactKind: ArtifactKind, source: SourceDescriptor): ProcessingJob {
    const now = Date.now();
    const job: MutableJob = {
      id: crypto.randomUUID(),
      tabId,
      artifactKind,
      status: "queued",
      source,
      createdAt: now,
      expiresAt: now + this.ttlMs
    };

    this.jobs.set(job.id, job);
    const tabJobs = this.jobIdsByTab.get(tabId) ?? new Set<string>();
    tabJobs.add(job.id);
    this.jobIdsByTab.set(tabId, tabJobs);
    return this.toPublicJob(job);
  }

  get(jobId: string): ProcessingJob | null {
    const job = this.jobs.get(jobId);
    return job ? this.toPublicJob(job) : null;
  }

  updateStatus(jobId: string, status: ProcessingJobStatus): ProcessingJob | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    job.status = status;
    job.expiresAt = Date.now() + this.ttlMs;
    return this.toPublicJob(job);
  }

  schedulePurge(jobId: string, callback: (job: ProcessingJob) => void): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    if (job.purgeTimer !== undefined) {
      globalThis.clearTimeout(job.purgeTimer);
    }

    job.expiresAt = Date.now() + this.ttlMs;
    job.purgeTimer = globalThis.setTimeout(() => {
      const removed = this.purge(jobId);
      if (removed) {
        callback(removed);
      }
    }, this.ttlMs);
  }

  purge(jobId: string): ProcessingJob | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    if (job.purgeTimer !== undefined) {
      globalThis.clearTimeout(job.purgeTimer);
    }

    this.jobs.delete(jobId);
    const tabJobs = this.jobIdsByTab.get(job.tabId);
    tabJobs?.delete(jobId);
    if (tabJobs && tabJobs.size === 0) {
      this.jobIdsByTab.delete(job.tabId);
    }

    return this.toPublicJob({
      ...job,
      status: "purged"
    });
  }

  purgeTab(tabId: number): ProcessingJob[] {
    const jobIds = [...(this.jobIdsByTab.get(tabId) ?? [])];
    return jobIds
      .map((jobId) => this.purge(jobId))
      .filter((job): job is ProcessingJob => job !== null);
  }

  getActiveCount(tabId: number): number {
    return this.jobIdsByTab.get(tabId)?.size ?? 0;
  }

  private toPublicJob(job: MutableJob): ProcessingJob {
    return {
      id: job.id,
      tabId: job.tabId,
      artifactKind: job.artifactKind,
      status: job.status,
      source: { ...job.source },
      createdAt: job.createdAt,
      expiresAt: job.expiresAt
    };
  }
}

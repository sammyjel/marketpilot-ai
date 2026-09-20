import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getDb } from '@/server/db';
import { claimNext, completeJob, failJob, requeueStalled } from './queue';
import { runJob } from './handlers';
// Side-effect import: registers the publishing and scheduling handlers.
import './register';

export type WorkerOptions = {
  /** Milliseconds to wait when the queue is empty. */
  idleDelayMs?: number;
  /** Stop after this many jobs. Used by tests. */
  maxJobs?: number;
  signal?: AbortSignal;
};

/**
 * Processes one due job, if there is one.
 * Returns true when work was done, so callers can poll adaptively.
 */
export async function tick(): Promise<boolean> {
  const db = await getDb();
  const job = await claimNext(db);
  if (!job) return false;

  logger.info('job.started', { jobId: job.id, kind: job.kind, attempt: job.attempts });

  try {
    const result = await runJob(job);
    await completeJob(db, job.id, result ?? undefined);
    logger.info('job.succeeded', { jobId: job.id, kind: job.kind });
  } catch (error) {
    // Only provider-level and transient failures are worth retrying; a
    // validation or permission error will fail identically every time.
    const retryable = isAppError(error) ? error.retryable : true;
    await failJob(db, job, error, retryable);
  }

  return true;
}

/** Long-running loop. Used by `npm run worker` and by the dev in-process worker. */
export async function runWorker(options: WorkerOptions = {}): Promise<void> {
  const idle = options.idleDelayMs ?? 2000;
  let processed = 0;
  let sinceSweep = 0;

  logger.info('worker.started', { pid: process.pid });

  while (!options.signal?.aborted) {
    if (options.maxJobs !== undefined && processed >= options.maxJobs) break;

    let worked = false;
    try {
      worked = await tick();
      if (worked) processed += 1;
    } catch (error) {
      // A failure here means the queue itself is unreachable; back off rather
      // than spinning.
      logger.error('worker.tick_failed', { error });
      await sleep(idle * 5, options.signal);
      continue;
    }

    sinceSweep += 1;
    if (sinceSweep > 100) {
      sinceSweep = 0;
      try {
        await requeueStalled(await getDb());
      } catch (error) {
        logger.warn('worker.sweep_failed', { error });
      }
    }

    if (!worked) await sleep(idle, options.signal);
  }

  logger.info('worker.stopped', { processed });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

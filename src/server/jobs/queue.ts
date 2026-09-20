import { and, asc, eq, lte, or, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getDb, type Database } from '@/server/db';
import { jobs } from '@/server/db/schema';

export type JobKind =
  | 'campaign.generate'
  | 'campaign.generate_media'
  | 'media.generate_image'
  | 'media.generate_video'
  | 'publishing.publish_post'
  | 'publishing.dispatch_scheduled'
  | 'analytics.sync'
  | 'maintenance.prune';

export type JobRecord = typeof jobs.$inferSelect;

export type EnqueueOptions = {
  organizationId?: string | null;
  runAt?: Date;
  priority?: number;
  maxAttempts?: number;
  /** Second enqueue with the same key is ignored — the guard against double work. */
  dedupeKey?: string;
};

export async function enqueue(
  kind: JobKind,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<JobRecord | null> {
  const db = await getDb();

  const inserted = await db
    .insert(jobs)
    .values({
      kind,
      payload,
      organizationId: options.organizationId ?? null,
      runAt: options.runAt ?? new Date(),
      priority: options.priority ?? 100,
      maxAttempts: options.maxAttempts ?? 3,
      dedupeKey: options.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning();

  const job = inserted[0] ?? null;
  logger.info('job.enqueued', { kind, jobId: job?.id ?? null, deduped: job === null });
  return job;
}

/**
 * Claims one due job.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes this safe with several workers: two
 * workers can never claim the same row, and a locked row does not block others.
 */
export async function claimNext(db: Database, kinds?: JobKind[]): Promise<JobRecord | null> {
  const kindFilter = kinds && kinds.length > 0 ? sql`and kind in ${kinds}` : sql``;

  const claimed = await db.execute<JobRecord>(sql`
    update jobs
    set status = 'running',
        started_at = now(),
        attempts = attempts + 1,
        updated_at = now()
    where id = (
      select id from jobs
      where status = 'queued'
        and run_at <= now()
        ${kindFilter}
      order by priority asc, run_at asc
      for update skip locked
      limit 1
    )
    returning *;
  `);

  const rows = (claimed as unknown as { rows?: JobRecord[] }).rows ?? (claimed as unknown as JobRecord[]);
  return rows[0] ?? null;
}

export async function completeJob(db: Database, jobId: string, result?: Record<string, unknown>): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'succeeded', finishedAt: new Date(), result: result ?? null, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

/** Exponential backoff with a ceiling, then the dead-letter state. */
export function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt * 5_000, 15 * 60_000);
}

export async function failJob(db: Database, job: JobRecord, error: unknown, retryable: boolean): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;

  if (!retryable || exhausted) {
    await db
      .update(jobs)
      .set({
        status: exhausted && retryable ? 'dead_letter' : 'failed',
        finishedAt: new Date(),
        lastError: message.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
    logger.error('job.failed', { jobId: job.id, kind: job.kind, attempts: job.attempts, retryable, error: message });
    return;
  }

  await db
    .update(jobs)
    .set({
      status: 'queued',
      runAt: new Date(Date.now() + backoffMs(job.attempts)),
      lastError: message.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));

  logger.warn('job.retrying', { jobId: job.id, kind: job.kind, attempt: job.attempts, inMs: backoffMs(job.attempts) });
}

/** Requeues jobs left `running` by a worker that died mid-flight. */
export async function requeueStalled(db: Database, olderThanMs = 10 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const requeued = await db
    .update(jobs)
    .set({ status: 'queued', updatedAt: new Date() })
    .where(and(eq(jobs.status, 'running'), lte(jobs.startedAt, cutoff)))
    .returning({ id: jobs.id });

  if (requeued.length > 0) logger.warn('job.requeued_stalled', { count: requeued.length });
  return requeued.length;
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return job ?? null;
}

/** Most recent job of a kind for an entity — used to show live progress. */
export async function findLatestJob(kind: JobKind, entityId: string): Promise<JobRecord | null> {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.kind, kind), sql`${jobs.payload} ->> 'id' = ${entityId}`))
    .orderBy(asc(jobs.createdAt))
    .limit(1);
  return job ?? null;
}

export async function cancelJobs(kind: JobKind, dedupeKey: string): Promise<void> {
  const db = await getDb();
  await db
    .update(jobs)
    .set({ status: 'cancelled', finishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(jobs.kind, kind), eq(jobs.dedupeKey, dedupeKey), or(eq(jobs.status, 'queued'), eq(jobs.status, 'running'))!));
}

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getDb } from '@/server/db';
import { requeueStalled } from '@/server/jobs/queue';
import { tick } from '@/server/jobs/worker';

/**
 * Queue drain over HTTP, for hosts with no always-on process.
 *
 * `npm run worker` remains the right way to drain the queue when you can run a
 * long-lived process — it holds a job from claim to completion and a deploy
 * never cuts one in half. Serverless platforms (Netlify, Vercel) cannot do
 * that, so a scheduler calls this endpoint instead and it drains what it can
 * inside one function invocation.
 *
 * The loop is bounded by wall-clock time rather than job count: the caller's
 * platform will kill the invocation at a fixed limit, and a job interrupted
 * that way is only recovered on the next `requeueStalled` sweep. Stopping
 * early, with budget left over, keeps that from happening in the normal case.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Leaves room for the current job to finish inside the platform's limit. */
const DEFAULT_BUDGET_MS = 20_000;
const MAX_BUDGET_MS = 60_000;

function authorised(request: Request): boolean {
  const configured = env().WORKER_SECRET;
  // No secret configured means the endpoint is closed, not open.
  if (!configured) return false;

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(configured);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorised(request)) {
    logger.warn('worker.drain_unauthorised');
    return NextResponse.json({ error: { code: 'forbidden', message: 'Not authorised.' } }, { status: 403 });
  }

  const requested = Number(new URL(request.url).searchParams.get('budgetMs'));
  const budgetMs = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_BUDGET_MS, MAX_BUDGET_MS);

  const startedAt = Date.now();
  let processed = 0;
  let drained = false;

  try {
    // One sweep per invocation returns jobs abandoned by a killed invocation.
    await requeueStalled(await getDb());

    while (Date.now() - startedAt < budgetMs) {
      const worked = await tick();
      if (!worked) {
        drained = true;
        break;
      }
      processed += 1;
    }
  } catch (error) {
    logger.error('worker.drain_failed', { error, processed });
    return NextResponse.json(
      { error: { code: 'provider_unavailable', message: 'The queue could not be drained.' } },
      { status: 503 },
    );
  }

  logger.info('worker.drained', { processed, drained, ms: Date.now() - startedAt });

  // `more` tells the caller whether another invocation has work waiting.
  return NextResponse.json({ data: { processed, more: !drained } });
}

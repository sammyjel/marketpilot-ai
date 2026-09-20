import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const globalRef = globalThis as typeof globalThis & { __marketpilotWorker?: AbortController };

/**
 * Starts the job worker inside the web process.
 *
 * This exists for the embedded-database development mode. PGlite is a single
 * process database, so a separate worker process cannot open the same data
 * directory — the worker has to share the web process there.
 *
 * In production `DATABASE_URL` points at a real PostgreSQL server, several
 * workers can run independently, and `RUN_INLINE_WORKER` should be false so the
 * queue is drained by `npm run worker` instead. A deploy then never kills a job
 * mid-flight.
 *
 * Safe to call repeatedly: only the first call starts a loop.
 */
export function startInlineWorkerOnce(): void {
  if (!env().RUN_INLINE_WORKER) return;
  if (globalRef.__marketpilotWorker) return;

  const controller = new AbortController();
  globalRef.__marketpilotWorker = controller;

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => controller.abort());
  }

  void import('./worker')
    .then(({ runWorker }) => runWorker({ signal: controller.signal, idleDelayMs: 1500 }))
    .catch((error: unknown) => {
      logger.error('worker.inline_crashed', { error });
      globalRef.__marketpilotWorker = undefined;
    });

  logger.info('worker.inline_started');
}

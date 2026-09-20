import './bootstrap';
import { logger } from '@/lib/logger';
import { closeDb } from '@/server/db';
import { runWorker } from '@/server/jobs/worker';

/**
 * Standalone job worker for production.
 *
 * Run one or more of these alongside the web process:
 *   npm run worker
 */
const controller = new AbortController();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info('worker.shutdown_requested', { signal });
    controller.abort();
  });
}

runWorker({ signal: controller.signal })
  .catch((error: unknown) => {
    logger.error('worker.crashed', { error });
    process.exitCode = 1;
  })
  .finally(() => closeDb());

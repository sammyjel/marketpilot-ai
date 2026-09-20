import { config } from 'dotenv';

// Standalone scripts (migrate, seed, worker, e2e) are not run by Next.js, so
// they have to load the same env files Next.js would load, in the same order.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

/**
 * One-shot scripts must not start the in-process job worker.
 *
 * `RUN_INLINE_WORKER` exists for the development web server, where PGlite's
 * single-process database forces the worker to share that process. A script
 * that inherited it would finish its work and then hang forever on the worker's
 * polling loop.
 *
 * `scripts/worker.ts` starts the worker explicitly, so it does not rely on this
 * flag either.
 */
process.env['RUN_INLINE_WORKER'] = 'false';

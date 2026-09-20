import './bootstrap';
import { closeDb, runMigrations } from '@/server/db';
import { logger } from '@/lib/logger';

/**
 * Applies all pending migrations, then exits. Safe to run repeatedly.
 *
 * Run as a deploy step before the new code goes live. `getDb()` migrates on
 * first use outside production, but production migrates only here, so that one
 * process owns the DDL instead of whichever instance cold-starts first.
 */
async function main(): Promise<void> {
  await runMigrations();
  logger.info('migrate.complete');
  await closeDb();
}

main().catch((error: unknown) => {
  logger.error('migrate.failed', { error });
  process.exitCode = 1;
});

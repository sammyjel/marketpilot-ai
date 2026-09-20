import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Tests always run against a throwaway embedded database and fully mocked
 * external services. Nothing here can reach a real API or a real platform.
 */
// NODE_ENV is typed read-only by @types/node; Vitest already sets it to 'test'.
process.env['MOCK_EXTERNAL_SERVICES'] = 'true';
process.env['AI_PROVIDER'] = 'mock';
process.env['IMAGE_PROVIDER'] = 'mock';
process.env['VIDEO_PROVIDER'] = 'mock';
process.env['VOICE_PROVIDER'] = 'mock';
process.env['BILLING_PROVIDER'] = 'mock';
process.env['STORAGE_DRIVER'] = 'local';
process.env['RUN_INLINE_WORKER'] = 'false';
process.env['APP_URL'] = 'http://localhost:3000';
process.env['LOG_SILENT'] = 'true';

process.env['AUTH_SECRET'] = randomBytes(48).toString('base64');
process.env['ENCRYPTION_KEY'] = randomBytes(32).toString('base64');

// A fresh database directory per run, so tests never inherit stale rows.
const runId = randomBytes(6).toString('hex');
const dataDir = path.join(process.cwd(), '.test-data', runId);

process.env['TEST_DATA_DIR'] = dataDir;
process.env['STORAGE_LOCAL_DIR'] = path.join(dataDir, 'storage');
delete process.env['DATABASE_URL'];

// PGlite writes into an existing directory rather than creating the tree.
const pgliteDir = path.join(dataDir, 'pglite');
mkdirSync(pgliteDir, { recursive: true });
process.env['PGLITE_DIR'] = pgliteDir;

process.on('exit', () => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Best effort: a leftover temp directory is harmless.
  }
});

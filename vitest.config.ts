import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // The integration tests share one embedded database, so they run serially.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      // See the mock files for why each of these is replaced.
      'server-only': path.resolve(process.cwd(), 'tests/mocks/server-only.ts'),
      'next/headers': path.resolve(process.cwd(), 'tests/mocks/next-headers.ts'),
    },
  },
});

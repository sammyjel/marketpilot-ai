import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

/**
 * Migrations are always authored against real PostgreSQL SQL.
 * In local dev the same SQL is applied to an embedded PGlite database,
 * so there is never a dialect gap between development and production.
 */
export default defineConfig(
  url
    ? {
        schema: './src/server/db/schema/index.ts',
        out: './drizzle',
        dialect: 'postgresql',
        dbCredentials: { url },
        strict: true,
      }
    : {
        schema: './src/server/db/schema/index.ts',
        out: './drizzle',
        dialect: 'postgresql',
        driver: 'pglite',
        dbCredentials: { url: './.pglite' },
        strict: true,
      },
);

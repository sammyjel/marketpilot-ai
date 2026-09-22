import { z } from 'zod';

/**
 * Single source of truth for configuration. Anything not declared here is not
 * read anywhere else in the application, which keeps secrets auditable.
 * Server-only: never import this module from a client component.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const optional = z.string().trim().min(1).optional();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('MarketPilot AI'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),

  DATABASE_URL: optional,

  MOCK_EXTERNAL_SERVICES: booleanish.default(true),

  AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai']).default('mock'),
  AI_PROVIDER_API_KEY: optional,
  AI_MODEL: z.string().default('claude-sonnet-5'),

  IMAGE_PROVIDER: z.enum(['mock', 'openai', 'stability']).default('mock'),
  IMAGE_PROVIDER_API_KEY: optional,

  VIDEO_PROVIDER: z.enum(['mock', 'replicate']).default('mock'),
  VIDEO_PROVIDER_API_KEY: optional,

  VOICE_PROVIDER: z.enum(['mock', 'elevenlabs']).default('mock'),
  VOICE_PROVIDER_API_KEY: optional,

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.storage'),
  STORAGE_ENDPOINT: optional,
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ACCESS_KEY: optional,
  STORAGE_SECRET_KEY: optional,
  STORAGE_BUCKET: optional,
  STORAGE_PUBLIC_URL: optional,

  FACEBOOK_CLIENT_ID: optional,
  FACEBOOK_CLIENT_SECRET: optional,
  INSTAGRAM_CLIENT_ID: optional,
  INSTAGRAM_CLIENT_SECRET: optional,
  TIKTOK_CLIENT_ID: optional,
  TIKTOK_CLIENT_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  LINKEDIN_CLIENT_ID: optional,
  LINKEDIN_CLIENT_SECRET: optional,
  PINTEREST_CLIENT_ID: optional,
  PINTEREST_CLIENT_SECRET: optional,
  X_CLIENT_ID: optional,
  X_CLIENT_SECRET: optional,

  BILLING_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  BILLING_SECRET: optional,
  BILLING_WEBHOOK_SECRET: optional,

  RUN_INLINE_WORKER: booleanish.default(true),

  /**
   * Shared secret for the internal queue-drain endpoint. Required on hosts with
   * no always-on process, where a scheduler calls the endpoint instead of
   * running `npm run worker`. Unset means the endpoint refuses every request.
   */
  WORKER_SECRET: optional,
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  // An unset variable and one set to "" mean the same thing in a .env file, so
  // blank values are dropped before validation and fall back to their defaults.
  const source: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.trim() !== '') source[key] = value;
  }

  // Netlify's database extension publishes its connection string under its own
  // name. Adopting it as DATABASE_URL means a Netlify-provisioned database is
  // used as-is, with nothing copied by hand and nothing to keep in sync. An
  // explicit DATABASE_URL still wins, so pointing at a different database
  // remains a matter of setting one variable.
  if (!source['DATABASE_URL'] && source['NETLIFY_DATABASE_URL']) {
    source['DATABASE_URL'] = source['NETLIFY_DATABASE_URL'];
  }

  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.local and fill in the required values.`,
    );
  }
  return parsed.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= load();
  return cached;
}

/** True when the embedded development database (PGlite) is in use. */
export function usingEmbeddedDatabase(): boolean {
  return !env().DATABASE_URL;
}

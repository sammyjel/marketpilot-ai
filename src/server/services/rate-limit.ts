import { AppError } from '@/lib/errors';

type Bucket = { count: number; resetAt: number };

/**
 * Fixed-window limiter held in process memory.
 *
 * This is intentionally simple and is correct for a single instance. When the
 * app is scaled horizontally, swap the store for Redis/Upstash by replacing
 * `buckets` — the call sites do not change.
 */
const buckets = new Map<string, Bucket>();

let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  aiGeneration: { limit: 30, windowMs: 60 * 60_000 },
  upload: { limit: 60, windowMs: 60 * 60_000 },
  // Minting a presigned URL writes nothing, but it does hand out bucket write
  // access, so it gets its own window rather than sharing the upload one.
  uploadUrl: { limit: 120, windowMs: 60 * 60_000 },
  publish: { limit: 60, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function checkRateLimit(name: RateLimitName, identifier: string): void {
  const rule = RATE_LIMITS[name];
  const now = Date.now();
  sweep(now);

  const key = `${name}:${identifier}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > rule.limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    const wait = seconds > 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
    throw new AppError('rate_limited', `Too many attempts. Please try again in ${wait}.`, {
      details: { retryAfterSeconds: seconds },
      retryable: true,
    });
  }
}

/** Test helper — clears all windows. */
export function resetRateLimits(): void {
  buckets.clear();
}

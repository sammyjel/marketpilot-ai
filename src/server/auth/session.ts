import 'server-only';
import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { generateToken, hashToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { getDb } from '@/server/db';
import { sessions, users } from '@/server/db/schema';

export const SESSION_COOKIE = 'mp_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_WHEN_REMAINING_MS = 20 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
  locale: string;
  isPlatformAdmin: boolean;
  emailVerifiedAt: Date | null;
  onboardingCompletedAt: Date | null;
};

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env().APP_URL.startsWith('https://'),
    path: '/',
    expires,
  };
}

/**
 * Issues a new session. The raw token goes to the browser in an httpOnly
 * cookie; only its SHA-256 hash is persisted.
 */
export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const headerList = await headers();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent')?.slice(0, 500) ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Invalidates every session for a user (password change, account deletion). */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Resolves the signed-in user, or null. Never throws for anonymous visitors. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      locale: users.locale,
      isPlatformAdmin: users.isPlatformAdmin,
      emailVerifiedAt: users.emailVerifiedAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Sliding expiry: extend only once the session is well into its lifetime, so
  // an active user is never signed out mid-session but writes stay infrequent.
  if (row.expiresAt.getTime() - Date.now() < RENEW_WHEN_REMAINING_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt, lastUsedAt: new Date() }).where(eq(sessions.id, row.sessionId));
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    timezone: row.timezone,
    locale: row.locale,
    isPlatformAdmin: row.isPlatformAdmin,
    emailVerifiedAt: row.emailVerifiedAt,
    onboardingCompletedAt: row.onboardingCompletedAt,
  };
}

/** Housekeeping for the worker: drop expired session rows. */
export async function pruneExpiredSessions(): Promise<number> {
  const db = await getDb();
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return deleted.length;
}

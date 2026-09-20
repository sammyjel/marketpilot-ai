import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { closeDb, getDb } from '@/server/db';
import { users, verificationTokens } from '@/server/db/schema';
import { hashToken } from '@/lib/crypto';
import { getCurrentUser, destroySession, SESSION_COOKIE } from '@/server/auth/session';
import {
  deleteAccount,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '@/server/services/accounts';
import { resetRateLimits } from '@/server/services/rate-limit';
import { testCookieJar } from '../mocks/next-headers';

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  testCookieJar.clear();
  resetRateLimits();
});

function uniqueEmail(): string {
  return `auth-${Math.random().toString(36).slice(2, 10)}@example.test`;
}

describe('registration', () => {
  it('creates a user, organization and session in one step', async () => {
    const email = uniqueEmail();
    const result = await registerUser({
      email,
      password: 'strongpassword1',
      name: 'Ada Lovelace',
      organizationName: 'Analytical Engines',
      ipAddress: '203.0.113.1',
    });

    expect(result.userId).toBeTruthy();
    expect(result.organizationId).toBeTruthy();

    // A session cookie was issued, and it resolves back to the user.
    expect(testCookieJar.get(SESSION_COOKIE)).toBeTruthy();
    const current = await getCurrentUser();
    expect(current?.email).toBe(email);
  });

  it('normalises the email and refuses a duplicate', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.2' });

    await expect(
      registerUser({ email: email.toUpperCase(), password: 'strongpassword1', ipAddress: '203.0.113.3' }),
    ).rejects.toThrow(/already exists/i);
  });

  it('refuses a weak password before creating anything', async () => {
    const email = uniqueEmail();
    await expect(registerUser({ email, password: 'short', ipAddress: '203.0.113.4' })).rejects.toThrow(AppError);

    const db = await getDb();
    const found = await db.select().from(users).where(eq(users.email, email));
    expect(found).toHaveLength(0);
  });

  it('never stores the password itself', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.5' });

    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user!.passwordHash).toBeTruthy();
    expect(user!.passwordHash).not.toContain('strongpassword1');
  });
});

describe('sign in', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.6' });
    testCookieJar.clear();

    await expect(loginUser({ email, password: 'wrongpassword1', ipAddress: '203.0.113.6' })).rejects.toThrow(
      /not correct/i,
    );
    await expect(getCurrentUser()).resolves.toBeNull();

    await loginUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.6' });
    await expect(getCurrentUser()).resolves.toMatchObject({ email });
  });

  it('gives the same error for an unknown address as for a wrong password', async () => {
    const unknown = loginUser({ email: uniqueEmail(), password: 'strongpassword1', ipAddress: '203.0.113.7' });
    await expect(unknown).rejects.toThrow(/not correct/i);
  });

  it('rate limits repeated attempts from one address', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.8' });
    resetRateLimits();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await loginUser({ email, password: 'strongpassword1', ipAddress: '198.51.100.9' }).catch(() => undefined);
    }

    await expect(loginUser({ email, password: 'strongpassword1', ipAddress: '198.51.100.9' })).rejects.toThrow(
      /Too many attempts/i,
    );
  });
});

describe('sessions', () => {
  it('ends when signed out', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.10' });
    await expect(getCurrentUser()).resolves.toBeTruthy();

    await destroySession();
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('stores only a hash of the session token', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.11' });

    const rawToken = testCookieJar.get(SESSION_COOKIE)!;
    const db = await getDb();
    const { sessions } = await import('@/server/db/schema');
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));

    expect(session).toBeTruthy();
    expect(session!.tokenHash).not.toBe(rawToken);
  });
});

describe('email verification and password reset', () => {
  it('verifies an email exactly once', async () => {
    const email = uniqueEmail();
    const { verificationToken } = await registerUser({
      email,
      password: 'strongpassword1',
      ipAddress: '203.0.113.12',
    });

    await expect(verifyEmail(verificationToken)).resolves.toBe(true);
    // Replaying a consumed token must not work.
    await expect(verifyEmail(verificationToken)).resolves.toBe(false);
  });

  it('resets a password and invalidates existing sessions', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.13' });
    await expect(getCurrentUser()).resolves.toBeTruthy();

    const token = await requestPasswordReset(email, '203.0.113.13');
    expect(token).toBeTruthy();

    await expect(resetPassword(token!, 'newpassword123')).resolves.toBe(true);

    // The old session is gone even though the cookie is still in the browser.
    await expect(getCurrentUser()).resolves.toBeNull();

    testCookieJar.clear();
    resetRateLimits();
    await expect(loginUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.13' })).rejects.toThrow();
    await expect(loginUser({ email, password: 'newpassword123', ipAddress: '203.0.113.13' })).resolves.toBeTruthy();
  });

  it('does not reveal whether an address is registered', async () => {
    await expect(requestPasswordReset(uniqueEmail(), '203.0.113.14')).resolves.toBeNull();
  });

  it('refuses an expired reset token', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: 'strongpassword1', ipAddress: '203.0.113.15' });
    const token = await requestPasswordReset(email, '203.0.113.15');

    const db = await getDb();
    await db
      .update(verificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(verificationTokens.userId, userId), eq(verificationTokens.purpose, 'password_reset')));

    await expect(resetPassword(token!, 'anotherpassword1')).resolves.toBe(false);
  });
});

describe('account deletion', () => {
  it('scrubs personal details and ends every session', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({
      email,
      password: 'strongpassword1',
      name: 'Delete Me',
      ipAddress: '203.0.113.16',
    });

    await deleteAccount(userId);

    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    expect(user!.deletedAt).toBeTruthy();
    expect(user!.name).toBeNull();
    expect(user!.passwordHash).toBeNull();
    expect(user!.email).not.toBe(email);
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

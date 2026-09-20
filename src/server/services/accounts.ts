import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { generateToken, hashToken } from '@/lib/crypto';
import { AppError, invalid } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { slugify, uniqueSlug } from '@/lib/slug';
import { getDb } from '@/server/db';
import {
  organizationMembers,
  organizations,
  subscriptions,
  users,
  verificationTokens,
} from '@/server/db/schema';
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/server/auth/password';
import { createSession, destroyAllSessionsForUser } from '@/server/auth/session';
import { recordAudit } from './audit';
import { checkRateLimit } from './rate-limit';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export type RegisterInput = {
  email: string;
  password: string;
  name?: string;
  organizationName?: string;
  timezone?: string;
  ipAddress: string;
};

export type RegisterResult = {
  userId: string;
  organizationId: string;
  /** Returned only so development can complete verification without email. */
  verificationToken: string;
};

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Creates the user, their first organization and a free subscription in one
 * transaction, then signs them in.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  checkRateLimit('register', input.ipAddress);

  const email = normaliseEmail(input.email);
  const strengthError = validatePasswordStrength(input.password);
  if (strengthError) throw invalid(strengthError, { field: 'password' });

  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new AppError('conflict', 'An account with that email already exists. Try signing in instead.', {
      details: { field: 'email' },
    });
  }

  const passwordHash = await hashPassword(input.password);
  const orgName = input.organizationName?.trim() || input.name?.trim() || email.split('@')[0]! ;
  const slug = await uniqueSlug(slugify(orgName, 'workspace'), async (candidate) => {
    const hit = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, candidate)).limit(1);
    return hit.length > 0;
  });

  const verificationToken = generateToken(32);

  const { userId, organizationId } = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        name: input.name?.trim() || null,
        timezone: input.timezone ?? 'UTC',
      })
      .returning({ id: users.id });

    const [org] = await tx
      .insert(organizations)
      .values({ name: orgName, slug, planTier: 'free' })
      .returning({ id: organizations.id });

    await tx.insert(organizationMembers).values({
      organizationId: org!.id,
      userId: user!.id,
      role: 'owner',
    });

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await tx.insert(subscriptions).values({
      organizationId: org!.id,
      planTier: 'free',
      status: 'active',
      provider: 'mock',
      currentPeriodEnd: periodEnd,
    });

    await tx.insert(verificationTokens).values({
      userId: user!.id,
      purpose: 'email_verification',
      tokenHash: hashToken(verificationToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });

    return { userId: user!.id, organizationId: org!.id };
  });

  await createSession(userId);
  await recordAudit({ organizationId, actorUserId: userId, action: 'user.registered', entityType: 'user', entityId: userId });
  logger.info('auth.registered', { userId, organizationId });

  return { userId, organizationId, verificationToken };
}

export async function loginUser(input: { email: string; password: string; ipAddress: string }): Promise<{ userId: string }> {
  checkRateLimit('login', input.ipAddress);
  const email = normaliseEmail(input.email);

  const db = await getDb();
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  const row = rows[0];
  // Always run a verification so response time does not reveal whether the
  // email exists.
  const ok = await verifyPassword(input.password, row?.passwordHash ?? null);

  if (!row || !ok) {
    throw new AppError('unauthenticated', 'That email and password combination is not correct.');
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  await createSession(row.id);
  await recordAudit({ actorUserId: row.id, action: 'user.logged_in', entityType: 'user', entityId: row.id });

  return { userId: row.id };
}

export async function verifyEmail(token: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: verificationTokens.id, userId: verificationTokens.userId })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.purpose, 'email_verification'),
        isNull(verificationTokens.consumedAt),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return false;

  await db.transaction(async (tx) => {
    await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(eq(verificationTokens.id, row.id));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  });

  await recordAudit({ actorUserId: row.userId, action: 'user.email_verified', entityType: 'user', entityId: row.userId });
  return true;
}

/**
 * Always resolves successfully, whether or not the address exists, so the
 * endpoint cannot be used to enumerate accounts. The token is returned only for
 * development delivery; in production it is emailed.
 */
export async function requestPasswordReset(email: string, ipAddress: string): Promise<string | null> {
  checkRateLimit('passwordReset', ipAddress);
  const db = await getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normaliseEmail(email)), isNull(users.deletedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const token = generateToken(32);
  await db.insert(verificationTokens).values({
    userId: row.id,
    purpose: 'password_reset',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  await recordAudit({ actorUserId: row.id, action: 'user.password_reset_requested' });
  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) throw invalid(strengthError, { field: 'password' });

  const db = await getDb();
  const rows = await db
    .select({ id: verificationTokens.id, userId: verificationTokens.userId })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.purpose, 'password_reset'),
        isNull(verificationTokens.consumedAt),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return false;

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(eq(verificationTokens.id, row.id));
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  });

  // A password change invalidates every existing session.
  await destroyAllSessionsForUser(row.userId);
  await recordAudit({ actorUserId: row.userId, action: 'user.password_reset_completed' });
  return true;
}

/**
 * Soft-deletes the account and scrubs personal fields. Organizations the user
 * solely owns are soft-deleted with them.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = await getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, 'owner')));

    for (const { organizationId } of owned) {
      const others = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, organizationId));
      if (others.length <= 1) {
        await tx.update(organizations).set({ deletedAt: now }).where(eq(organizations.id, organizationId));
      }
    }

    await tx
      .update(users)
      .set({
        deletedAt: now,
        email: `deleted+${userId}@marketpilot.invalid`,
        passwordHash: null,
        name: null,
        avatarUrl: null,
      })
      .where(eq(users.id, userId));
  });

  await destroyAllSessionsForUser(userId);
  await recordAudit({ actorUserId: userId, action: 'user.account_deleted', entityType: 'user', entityId: userId });
  logger.info('auth.account_deleted', { userId });
}

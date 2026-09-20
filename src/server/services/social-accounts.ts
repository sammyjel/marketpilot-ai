import 'server-only';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import { AppError, notFound } from '@/lib/errors';
import { decryptSecret, encryptSecret, generateToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { planFor } from '@/lib/plans';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { socialPublisher } from '@/providers/social';
import type { AccountCredentials } from '@/providers/social';
import { getDb } from '@/server/db';
import { oauthStates, socialAccounts } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import { recordAudit } from './audit';
import { notify } from './notifications';

export type SocialAccountRecord = typeof socialAccounts.$inferSelect;

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function callbackUrl(platform: Platform): string {
  return `${env().APP_URL.replace(/\/$/, '')}/api/social/${platform}/callback`;
}

/** Public shape — deliberately has no token fields. */
export type SocialAccountView = {
  id: string;
  platform: Platform;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  accountType: string | null;
  brandId: string;
  isActive: boolean;
  needsReconnect: boolean;
  isMock: boolean;
  tokenExpiresAt: Date | null;
  lastValidatedAt: Date | null;
  createdAt: Date;
};

function toView(record: SocialAccountRecord): SocialAccountView {
  return {
    id: record.id,
    platform: record.platform,
    displayName: record.displayName,
    username: record.username,
    avatarUrl: record.avatarUrl,
    accountType: record.accountType,
    brandId: record.brandId,
    isActive: record.isActive,
    needsReconnect: record.needsReconnect,
    isMock: record.providerMetadata['isMock'] === true,
    tokenExpiresAt: record.tokenExpiresAt,
    lastValidatedAt: record.lastValidatedAt,
    createdAt: record.createdAt,
  };
}

export async function listSocialAccounts(
  ctx: AuthContext,
  options: { brandId?: string } = {},
): Promise<SocialAccountView[]> {
  const db = await getDb();
  const filters = [eq(socialAccounts.organizationId, ctx.organization.id), isNull(socialAccounts.deletedAt)];
  if (options.brandId) filters.push(eq(socialAccounts.brandId, options.brandId));

  const rows = await db
    .select()
    .from(socialAccounts)
    .where(and(...filters))
    .orderBy(asc(socialAccounts.platform), asc(socialAccounts.displayName));

  return rows.map(toView);
}

/**
 * Loads decrypted credentials for a publishing job.
 *
 * Never call this from anything that renders to the browser — the return value
 * contains live access tokens.
 */
export async function loadCredentials(
  ctx: AuthContext,
  accountId: string,
): Promise<{ account: SocialAccountRecord; credentials: AccountCredentials }> {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.id, accountId),
        eq(socialAccounts.organizationId, ctx.organization.id),
        isNull(socialAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account) throw notFound('That connected account');
  if (!account.accessTokenEncrypted) {
    throw new AppError(
      'connection_expired',
      `Your ${PLATFORM_META[account.platform].label} connection is missing its credentials. Please reconnect the account.`,
    );
  }

  let credentials: AccountCredentials = {
    accessToken: decryptSecret(account.accessTokenEncrypted),
    refreshToken: account.refreshTokenEncrypted ? decryptSecret(account.refreshTokenEncrypted) : null,
    expiresAt: account.tokenExpiresAt,
    externalId: account.externalId,
    metadata: account.providerMetadata,
  };

  // Refresh proactively: a token that expires mid-publish is a failed post.
  const expiringSoon =
    credentials.expiresAt !== null && credentials.expiresAt.getTime() - Date.now() < 10 * 60 * 1000;

  if (expiringSoon) {
    const publisher = socialPublisher(account.platform);
    const refreshed = await publisher.refresh(credentials).catch((error: unknown) => {
      logger.warn('social.refresh_failed', { accountId, platform: account.platform, error });
      return null;
    });

    if (refreshed) {
      credentials = refreshed;
      await db
        .update(socialAccounts)
        .set({
          accessTokenEncrypted: encryptSecret(refreshed.accessToken),
          refreshTokenEncrypted: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : null,
          tokenExpiresAt: refreshed.expiresAt,
          needsReconnect: false,
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, accountId));
    } else if (credentials.expiresAt && credentials.expiresAt.getTime() < Date.now()) {
      await markNeedsReconnect(account.id, 'token_expired');
      throw new AppError(
        'connection_expired',
        `Your ${PLATFORM_META[account.platform].label} connection has expired. Please reconnect your ${PLATFORM_META[account.platform].label} account.`,
      );
    }
  }

  return { account, credentials };
}

export async function markNeedsReconnect(accountId: string, reason: string): Promise<void> {
  const db = await getDb();
  const [account] = await db
    .update(socialAccounts)
    .set({ needsReconnect: true, lastErrorCode: reason, updatedAt: new Date() })
    .where(eq(socialAccounts.id, accountId))
    .returning();

  if (account) {
    await notify(account.organizationId, account.connectedByUserId, {
      kind: 'social_connection_expired',
      title: `${PLATFORM_META[account.platform].label} needs reconnecting`,
      body: `Scheduled posts to ${account.displayName} will not go out until you reconnect the account.`,
      linkPath: '/social',
    });
  }
}

/* --------------------------------- OAuth ---------------------------------- */

export async function beginConnect(
  ctx: AuthContext,
  input: { platform: Platform; brandId: string; redirectPath?: string },
): Promise<string> {
  assertCapability(ctx, 'social:connect');

  const limit = planFor(ctx.organization.planTier).limits.connected_account;
  if (limit !== null) {
    const existing = await listSocialAccounts(ctx);
    if (existing.length >= limit) {
      throw new AppError(
        'usage_limit_reached',
        `Your ${ctx.organization.planTier} plan allows ${limit} connected accounts. Disconnect one or upgrade to add more.`,
      );
    }
  }

  const publisher = socialPublisher(input.platform);
  if (!publisher.isConfigured()) {
    throw new AppError(
      'provider_unavailable',
      `${PLATFORM_META[input.platform].label} is not set up on this installation. An administrator needs to add its developer app credentials first.`,
    );
  }

  const state = generateToken(24);
  const result = await publisher.startConnect({ redirectUri: callbackUrl(input.platform), state });

  const db = await getDb();
  await db.insert(oauthStates).values({
    state: result.state,
    platform: input.platform,
    organizationId: ctx.organization.id,
    brandId: input.brandId,
    userId: ctx.user.id,
    // The PKCE verifier is a secret and never leaves the server.
    codeVerifier: result.codeVerifier ?? null,
    redirectPath: input.redirectPath ?? '/social',
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  return result.url;
}

export type ConnectOutcome = { connected: number; redirectPath: string; platform: Platform };

/**
 * Handles the OAuth callback.
 *
 * The `state` must match a row we created, which is what prevents an attacker
 * from attaching their own social account to someone else's brand.
 */
export async function completeConnect(input: { state: string; code: string }): Promise<ConnectOutcome> {
  const db = await getDb();

  const [pending] = await db.select().from(oauthStates).where(eq(oauthStates.state, input.state)).limit(1);
  if (!pending) {
    throw new AppError('validation_failed', 'That connection link is no longer valid. Start the connection again.');
  }

  // Single use, whatever happens next.
  await db.delete(oauthStates).where(eq(oauthStates.id, pending.id));

  if (pending.expiresAt.getTime() < Date.now()) {
    throw new AppError('validation_failed', 'That connection attempt timed out. Please try connecting again.');
  }

  const publisher = socialPublisher(pending.platform);
  const accounts = await publisher.completeConnect({
    code: input.code,
    redirectUri: callbackUrl(pending.platform),
    codeVerifier: pending.codeVerifier ?? undefined,
  });

  if (accounts.length === 0) {
    throw new AppError(
      'forbidden',
      `No ${PLATFORM_META[pending.platform].label} destination was available on that account. Check the requirements on the connection screen and try again.`,
    );
  }

  for (const account of accounts) {
    await db
      .insert(socialAccounts)
      .values({
        organizationId: pending.organizationId,
        brandId: pending.brandId,
        platform: pending.platform,
        externalId: account.externalId,
        displayName: account.displayName,
        username: account.username ?? null,
        avatarUrl: account.avatarUrl ?? null,
        accountType: account.accountType ?? null,
        scopes: account.scopes,
        accessTokenEncrypted: encryptSecret(account.accessToken),
        refreshTokenEncrypted: account.refreshToken ? encryptSecret(account.refreshToken) : null,
        tokenExpiresAt: account.expiresAt ?? null,
        providerMetadata: account.metadata,
        isActive: true,
        needsReconnect: false,
        lastValidatedAt: new Date(),
        connectedByUserId: pending.userId,
      })
      .onConflictDoUpdate({
        target: [socialAccounts.brandId, socialAccounts.platform, socialAccounts.externalId],
        set: {
          displayName: account.displayName,
          username: account.username ?? null,
          avatarUrl: account.avatarUrl ?? null,
          scopes: account.scopes,
          accessTokenEncrypted: encryptSecret(account.accessToken),
          refreshTokenEncrypted: account.refreshToken ? encryptSecret(account.refreshToken) : null,
          tokenExpiresAt: account.expiresAt ?? null,
          providerMetadata: account.metadata,
          isActive: true,
          needsReconnect: false,
          deletedAt: null,
          lastErrorCode: null,
          lastValidatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  await recordAudit({
    organizationId: pending.organizationId,
    actorUserId: pending.userId,
    action: 'social.connected',
    entityType: 'social_account',
    entityId: pending.platform,
    metadata: { platform: pending.platform, accounts: accounts.length },
  });

  logger.info('social.connected', { platform: pending.platform, count: accounts.length });

  return {
    connected: accounts.length,
    redirectPath: pending.redirectPath ?? '/social',
    platform: pending.platform,
  };
}

export async function disconnectAccount(ctx: AuthContext, accountId: string): Promise<void> {
  assertCapability(ctx, 'social:connect');

  const { account, credentials } = await loadCredentials(ctx, accountId);
  await socialPublisher(account.platform)
    .disconnect(credentials)
    .catch((error: unknown) => logger.warn('social.revoke_failed', { accountId, error }));

  const db = await getDb();
  await db
    .update(socialAccounts)
    .set({
      deletedAt: new Date(),
      isActive: false,
      // Credentials are destroyed, not just hidden.
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.organizationId, ctx.organization.id)));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'social.disconnected',
    entityType: 'social_account',
    entityId: accountId,
    metadata: { platform: account.platform },
  });
}

export async function validateAccount(ctx: AuthContext, accountId: string): Promise<{ valid: boolean; reason?: string }> {
  const { account, credentials } = await loadCredentials(ctx, accountId);
  const result = await socialPublisher(account.platform).validateConnection(credentials);

  const db = await getDb();
  await db
    .update(socialAccounts)
    .set({
      lastValidatedAt: new Date(),
      needsReconnect: !result.valid,
      lastErrorCode: result.valid ? null : 'validation_failed',
      updatedAt: new Date(),
    })
    .where(eq(socialAccounts.id, accountId));

  return result;
}

/** Worker housekeeping: flag connections whose tokens have lapsed. */
export async function flagExpiredConnections(): Promise<number> {
  const db = await getDb();
  const expired = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(
      and(
        isNull(socialAccounts.deletedAt),
        eq(socialAccounts.needsReconnect, false),
        lt(socialAccounts.tokenExpiresAt, new Date()),
      ),
    );

  for (const account of expired) {
    await markNeedsReconnect(account.id, 'token_expired');
  }
  return expired.length;
}

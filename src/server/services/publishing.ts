import 'server-only';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { AppError, isAppError, notFound } from '@/lib/errors';
import { sha256Hex } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { storage } from '@/providers/storage';
import { socialPublisher } from '@/providers/social';
import type { PublishMedia } from '@/providers/social';
import { getDb } from '@/server/db';
import {
  campaigns,
  content,
  mediaAssets,
  productAssets,
  scheduledPosts,
  socialAccounts,
  socialPosts,
} from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import { enqueue } from '@/server/jobs/queue';
import { loadCredentials, markNeedsReconnect } from './social-accounts';
import { recordAudit } from './audit';
import { notify } from './notifications';
import { assertWithinLimit, recordUsage } from './usage';
import { checkRateLimit } from './rate-limit';

export type SocialPostRecord = typeof socialPosts.$inferSelect;

/**
 * Stable per-target key.
 *
 * Because the publishing job is keyed on the same value, a retried job, a
 * double-click and a duplicated schedule all resolve to the same row — the post
 * cannot go out twice.
 */
function idempotencyKeyFor(contentId: string, accountId: string, scheduledFor: Date | null): string {
  return sha256Hex(`${contentId}:${accountId}:${scheduledFor?.toISOString() ?? 'now'}`);
}

export async function getCampaignPosts(ctx: AuthContext, campaignId: string): Promise<SocialPostRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.campaignId, campaignId), eq(socialPosts.organizationId, ctx.organization.id)))
    .orderBy(asc(socialPosts.scheduledFor), asc(socialPosts.platform));
}

export type TargetInput = {
  contentId: string;
  socialAccountId: string;
  /** UTC instant. Null publishes as soon as the worker picks it up. */
  scheduledFor: Date | null;
  timezone?: string;
};

/**
 * Creates the social_post rows and queues them.
 *
 * A campaign must be approved first: this is the server-side half of the
 * "AI generated → review → approve → publish" rule. There is no code path that
 * publishes unapproved content.
 */
export async function scheduleOrPublish(
  ctx: AuthContext,
  campaignId: string,
  targets: TargetInput[],
  options: { publishNow: boolean },
): Promise<{ created: number; skipped: number }> {
  assertCapability(ctx, options.publishNow ? 'campaign:publish' : 'campaign:schedule');
  checkRateLimit('publish', ctx.user.id);

  if (targets.length === 0) {
    throw new AppError('validation_failed', 'Choose at least one account to publish to.');
  }

  const db = await getDb();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, ctx.organization.id), isNull(campaigns.deletedAt)),
    )
    .limit(1);
  if (!campaign) throw notFound('That campaign');

  if (!['approved', 'scheduled', 'publishing', 'partially_published', 'published'].includes(campaign.status)) {
    throw new AppError(
      'validation_failed',
      'Approve this campaign before scheduling or publishing it. Reviewing generated content before it goes out is deliberate.',
    );
  }

  await assertWithinLimit(ctx, 'published_post', targets.length);

  // Verify every content piece and account belongs to this org and campaign.
  const contentIds = [...new Set(targets.map((target) => target.contentId))];
  const accountIds = [...new Set(targets.map((target) => target.socialAccountId))];

  const pieces = await db
    .select()
    .from(content)
    .where(
      and(
        inArray(content.id, contentIds),
        eq(content.campaignId, campaignId),
        eq(content.organizationId, ctx.organization.id),
      ),
    );
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));

  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.id, accountIds),
        eq(socialAccounts.organizationId, ctx.organization.id),
        isNull(socialAccounts.deletedAt),
      ),
    );
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  let created = 0;
  let skipped = 0;

  for (const target of targets) {
    const piece = pieceById.get(target.contentId);
    const account = accountById.get(target.socialAccountId);

    if (!piece || !account) {
      skipped += 1;
      continue;
    }
    if (piece.platform !== account.platform) {
      skipped += 1;
      continue;
    }

    const idempotencyKey = idempotencyKeyFor(piece.id, account.id, target.scheduledFor);

    const inserted = await db
      .insert(socialPosts)
      .values({
        organizationId: ctx.organization.id,
        campaignId,
        contentId: piece.id,
        socialAccountId: account.id,
        platform: piece.platform,
        status: 'pending',
        scheduledFor: target.scheduledFor,
        scheduleTimezone: target.timezone ?? ctx.user.timezone,
        idempotencyKey,
        createdByUserId: ctx.user.id,
      })
      // The unique index on idempotency_key is the real duplicate guard.
      .onConflictDoNothing({ target: socialPosts.idempotencyKey })
      .returning();

    const post = inserted[0];
    if (!post) {
      skipped += 1;
      continue;
    }
    created += 1;

    if (target.scheduledFor) {
      await db.insert(scheduledPosts).values({
        organizationId: ctx.organization.id,
        socialPostId: post.id,
        scheduledForUtc: target.scheduledFor,
        timezone: target.timezone ?? ctx.user.timezone,
      });
    }

    if (options.publishNow || !target.scheduledFor) {
      await enqueue(
        'publishing.publish_post',
        { socialPostId: post.id, userId: ctx.user.id, organizationId: ctx.organization.id },
        {
          organizationId: ctx.organization.id,
          priority: 5,
          maxAttempts: 5,
          dedupeKey: `publish:${post.id}`,
        },
      );
    }
  }

  await db
    .update(campaigns)
    .set({
      status: options.publishNow ? 'publishing' : 'scheduled',
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: options.publishNow ? 'campaign.publish_requested' : 'campaign.scheduled',
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { created, skipped },
  });

  if (!options.publishNow && created > 0) {
    await notify(ctx.organization.id, ctx.user.id, {
      kind: 'campaign_scheduled',
      title: `${campaign.title} scheduled`,
      body: `${created} post${created === 1 ? '' : 's'} queued.`,
      linkPath: `/campaigns/${campaignId}?tab=schedule`,
    });
  }

  return { created, skipped };
}

/** Loads the creative bytes (and a public URL when storage can provide one). */
async function loadMedia(campaignProductId: string | null, mediaAssetIds: string[]): Promise<PublishMedia[]> {
  const db = await getDb();

  let assets = mediaAssetIds.length
    ? await db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaAssetIds))
    : [];

  // Fall back to the product's own images when no creative was generated.
  if (assets.length === 0 && campaignProductId) {
    const rows = await db
      .select({ media: mediaAssets })
      .from(productAssets)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productAssets.mediaAssetId))
      .where(eq(productAssets.productId, campaignProductId))
      .orderBy(sql`${productAssets.isPrimary} desc`, productAssets.position)
      .limit(3);
    assets = rows.map((row) => row.media);
  }

  const out: PublishMedia[] = [];
  for (const asset of assets) {
    if (asset.kind !== 'image' && asset.kind !== 'video') continue;
    try {
      out.push({
        kind: asset.kind,
        buffer: await storage().get(asset.storageKey),
        mimeType: asset.mimeType,
        publicUrl: await storage().publicUrlFor(asset.storageKey),
        filename: asset.originalFilename ?? `media.${asset.mimeType.split('/')[1] ?? 'bin'}`,
      });
    } catch (error) {
      logger.warn('publishing.media_load_failed', { mediaId: asset.id, error });
    }
  }
  return out;
}

/**
 * Publishes one social post. Called only from the queue worker.
 *
 * Every exit path writes a definite status — there is no branch that leaves a
 * post looking published when it is not.
 */
export async function publishSocialPost(ctx: AuthContext, socialPostId: string): Promise<void> {
  const db = await getDb();

  const [post] = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, socialPostId), eq(socialPosts.organizationId, ctx.organization.id)))
    .limit(1);

  if (!post) throw notFound('That post');

  // Already done: a retry of a completed job must not post again.
  if (post.status === 'published' || post.status === 'cancelled') {
    logger.info('publishing.skipped_terminal', { socialPostId, status: post.status });
    return;
  }

  await db
    .update(socialPosts)
    .set({ status: 'processing', attemptCount: post.attemptCount + 1, updatedAt: new Date() })
    .where(eq(socialPosts.id, socialPostId));

  const [piece] = await db.select().from(content).where(eq(content.id, post.contentId)).limit(1);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, post.campaignId)).limit(1);
  if (!piece || !campaign) throw notFound('That campaign content');

  try {
    const { account, credentials } = await loadCredentials(ctx, post.socialAccountId);
    const media = await loadMedia(campaign.productId, piece.mediaAssetIds);

    const result = await socialPublisher(account.platform).publish(credentials, {
      fields: piece.fields,
      hashtags: piece.hashtags,
      media,
      idempotencyKey: post.idempotencyKey,
    });

    if (result.status === 'manual_required') {
      await db
        .update(socialPosts)
        .set({
          status: 'manual_required',
          manualReason: result.reason,
          updatedAt: new Date(),
        })
        .where(eq(socialPosts.id, socialPostId));

      await notify(ctx.organization.id, post.createdByUserId, {
        kind: 'post_failed',
        title: `${PLATFORM_META[account.platform].label} needs a manual post`,
        body: result.reason,
        linkPath: `/campaigns/${post.campaignId}?tab=schedule`,
      });

      logger.info('publishing.manual_required', { socialPostId, platform: account.platform });
      await refreshCampaignStatus(post.campaignId);
      return;
    }

    await db
      .update(socialPosts)
      .set({
        status: result.status === 'published' ? 'published' : 'processing',
        externalPostId: result.externalPostId,
        externalPermalink: result.permalink ?? null,
        publishedAt: result.status === 'published' ? new Date() : null,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, socialPostId));

    if (result.status === 'published') {
      await db.update(content).set({ status: 'published' }).where(eq(content.id, piece.id));
      await recordUsage(ctx, 'published_post', { entityType: 'social_post', entityId: socialPostId });

      await notify(ctx.organization.id, post.createdByUserId, {
        kind: 'post_published',
        title: `Published to ${PLATFORM_META[account.platform].label}`,
        body: account.displayName,
        linkPath: `/campaigns/${post.campaignId}?tab=schedule`,
      });
    } else {
      // Still transcoding — check back rather than declaring success.
      await enqueue(
        'publishing.publish_post',
        { socialPostId, userId: ctx.user.id, organizationId: ctx.organization.id, checkOnly: true },
        {
          organizationId: ctx.organization.id,
          runAt: new Date(Date.now() + 60_000),
          dedupeKey: `publish-check:${socialPostId}:${Date.now()}`,
        },
      );
    }

    logger.info('publishing.completed', { socialPostId, platform: account.platform, status: result.status });
  } catch (error) {
    const message = isAppError(error) ? error.message : 'Publishing failed unexpectedly.';
    const code = isAppError(error) ? error.code : 'internal_error';

    await db
      .update(socialPosts)
      .set({ status: 'failed', lastErrorCode: code, lastErrorMessage: message, updatedAt: new Date() })
      .where(eq(socialPosts.id, socialPostId));

    if (code === 'connection_expired') {
      await markNeedsReconnect(post.socialAccountId, code);
    }

    await notify(ctx.organization.id, post.createdByUserId, {
      kind: 'post_failed',
      title: `${PLATFORM_META[post.platform].label} post failed`,
      body: message,
      linkPath: `/campaigns/${post.campaignId}?tab=schedule`,
    });

    await refreshCampaignStatus(post.campaignId);
    throw error;
  }

  await refreshCampaignStatus(post.campaignId);
}

/** Checks a post that a platform was still processing. */
export async function refreshPostStatus(ctx: AuthContext, socialPostId: string): Promise<void> {
  const db = await getDb();
  const [post] = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, socialPostId), eq(socialPosts.organizationId, ctx.organization.id)))
    .limit(1);

  if (!post || !post.externalPostId || post.status === 'published') return;

  const { account, credentials } = await loadCredentials(ctx, post.socialAccountId);
  const status = await socialPublisher(account.platform).getPostStatus(credentials, post.externalPostId);

  await db
    .update(socialPosts)
    .set({
      status: status.state === 'published' ? 'published' : status.state === 'failed' ? 'failed' : 'processing',
      externalPostId: status.externalPostId ?? post.externalPostId,
      externalPermalink: status.permalink ?? post.externalPermalink,
      publishedAt: status.state === 'published' ? new Date() : post.publishedAt,
      lastErrorMessage: status.error ?? post.lastErrorMessage,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, socialPostId));

  if (status.state === 'published') {
    await db.update(content).set({ status: 'published' }).where(eq(content.id, post.contentId));
    await recordUsage(ctx, 'published_post', { entityType: 'social_post', entityId: socialPostId });
  } else if (status.state === 'processing') {
    await enqueue(
      'publishing.publish_post',
      { socialPostId, userId: ctx.user.id, organizationId: ctx.organization.id, checkOnly: true },
      {
        organizationId: ctx.organization.id,
        runAt: new Date(Date.now() + 120_000),
        dedupeKey: `publish-check:${socialPostId}:${Date.now()}`,
      },
    );
  }

  await refreshCampaignStatus(post.campaignId);
}

/** Rolls the individual post outcomes up into one campaign status. */
async function refreshCampaignStatus(campaignId: string): Promise<void> {
  const db = await getDb();
  const posts = await db
    .select({ status: socialPosts.status })
    .from(socialPosts)
    .where(eq(socialPosts.campaignId, campaignId));

  if (posts.length === 0) return;

  const published = posts.filter((post) => post.status === 'published').length;
  const terminal = posts.filter((post) =>
    ['published', 'failed', 'cancelled', 'manual_required'].includes(post.status),
  ).length;

  const status =
    terminal < posts.length
      ? 'publishing'
      : published === posts.length
        ? 'published'
        : published > 0
          ? 'partially_published'
          : 'failed';

  await db.update(campaigns).set({ status, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
}

/** Finds schedule rows that are due and turns them into publishing jobs. */
export async function dispatchDueScheduledPosts(): Promise<number> {
  const db = await getDb();

  const due = await db
    .select({
      id: scheduledPosts.id,
      socialPostId: scheduledPosts.socialPostId,
      organizationId: scheduledPosts.organizationId,
      createdByUserId: socialPosts.createdByUserId,
    })
    .from(scheduledPosts)
    .innerJoin(socialPosts, eq(socialPosts.id, scheduledPosts.socialPostId))
    .where(
      and(
        isNull(scheduledPosts.dispatchedAt),
        isNull(scheduledPosts.cancelledAt),
        lte(scheduledPosts.scheduledForUtc, new Date()),
        eq(socialPosts.status, 'pending'),
      ),
    )
    .limit(100);

  for (const row of due) {
    // Marked dispatched before enqueueing, so a crash between the two cannot
    // produce a second job for the same schedule row.
    await db.update(scheduledPosts).set({ dispatchedAt: new Date() }).where(eq(scheduledPosts.id, row.id));

    await enqueue(
      'publishing.publish_post',
      {
        socialPostId: row.socialPostId,
        userId: row.createdByUserId,
        organizationId: row.organizationId,
      },
      {
        organizationId: row.organizationId,
        priority: 5,
        maxAttempts: 5,
        dedupeKey: `publish:${row.socialPostId}`,
      },
    );
  }

  if (due.length > 0) logger.info('publishing.dispatched_scheduled', { count: due.length });
  return due.length;
}

export async function cancelScheduledPost(ctx: AuthContext, socialPostId: string): Promise<void> {
  assertCapability(ctx, 'campaign:schedule');
  const db = await getDb();

  const [post] = await db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, socialPostId), eq(socialPosts.organizationId, ctx.organization.id)))
    .limit(1);

  if (!post) throw notFound('That post');
  if (post.status === 'published') {
    throw new AppError(
      'validation_failed',
      'That post is already live on the platform. Delete it there if you need it removed.',
    );
  }

  await db
    .update(socialPosts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(socialPosts.id, socialPostId));
  await db
    .update(scheduledPosts)
    .set({ cancelledAt: new Date() })
    .where(eq(scheduledPosts.socialPostId, socialPostId));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'post.cancelled',
    entityType: 'social_post',
    entityId: socialPostId,
  });
}

/** Calendar feed for the scheduling screen. */
export async function listScheduledPosts(
  ctx: AuthContext,
  range: { from: Date; to: Date },
): Promise<
  {
    id: string;
    campaignId: string;
    campaignTitle: string;
    platform: Platform;
    status: string;
    scheduledFor: Date | null;
    accountName: string;
  }[]
> {
  const db = await getDb();

  const rows = await db
    .select({
      id: socialPosts.id,
      campaignId: socialPosts.campaignId,
      campaignTitle: campaigns.title,
      platform: socialPosts.platform,
      status: socialPosts.status,
      scheduledFor: socialPosts.scheduledFor,
      accountName: socialAccounts.displayName,
    })
    .from(socialPosts)
    .innerJoin(campaigns, eq(campaigns.id, socialPosts.campaignId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, socialPosts.socialAccountId))
    .where(
      and(
        eq(socialPosts.organizationId, ctx.organization.id),
        sql`${socialPosts.scheduledFor} between ${range.from} and ${range.to}`,
      ),
    )
    .orderBy(asc(socialPosts.scheduledFor));

  return rows;
}

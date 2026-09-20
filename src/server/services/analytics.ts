import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { PLATFORMS, PLATFORM_META, type Platform } from '@/lib/platforms';
import { socialPublisher } from '@/providers/social';
import { getDb } from '@/server/db';
import { analyticsSnapshots, campaigns, content, socialAccounts, socialPosts } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { generateAnalyticsInsights } from '@/server/ai/stages';
import type { AnalyticsInsights } from '@/server/ai/schemas';
import { loadCredentials } from './social-accounts';
import { recordUsage } from './usage';

const METRIC_KEYS = [
  'impressions',
  'reach',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  impressions: 'Impressions',
  reach: 'Reach',
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  saves: 'Saves',
  clicks: 'Clicks',
};

/**
 * Pulls fresh metrics for every published post in the organization.
 *
 * Only values a platform actually returned are written; a metric a platform
 * does not expose stays null, and the UI reports it as unavailable rather than
 * showing a zero.
 */
export async function syncAnalytics(ctx: AuthContext): Promise<number> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);

  const posts = await db
    .select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      externalPostId: socialPosts.externalPostId,
      socialAccountId: socialPosts.socialAccountId,
    })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.organizationId, ctx.organization.id),
        eq(socialPosts.status, 'published'),
        sql`${socialPosts.externalPostId} is not null`,
      ),
    )
    .limit(200);

  let synced = 0;

  for (const post of posts) {
    if (!post.externalPostId) continue;
    try {
      const { account, credentials } = await loadCredentials(ctx, post.socialAccountId);
      const analytics = await socialPublisher(account.platform).getAnalytics(credentials, post.externalPostId);

      await db
        .insert(analyticsSnapshots)
        .values({
          organizationId: ctx.organization.id,
          socialPostId: post.id,
          platform: post.platform,
          capturedOn: today,
          impressions: analytics.impressions ?? null,
          reach: analytics.reach ?? null,
          views: analytics.views ?? null,
          likes: analytics.likes ?? null,
          comments: analytics.comments ?? null,
          shares: analytics.shares ?? null,
          saves: analytics.saves ?? null,
          clicks: analytics.clicks ?? null,
          videoCompletionRate: analytics.videoCompletionRate ?? null,
          raw: { ...analytics.raw, unavailable: analytics.unavailable },
        })
        .onConflictDoUpdate({
          target: [analyticsSnapshots.socialPostId, analyticsSnapshots.capturedOn],
          set: {
            impressions: analytics.impressions ?? null,
            reach: analytics.reach ?? null,
            views: analytics.views ?? null,
            likes: analytics.likes ?? null,
            comments: analytics.comments ?? null,
            shares: analytics.shares ?? null,
            saves: analytics.saves ?? null,
            clicks: analytics.clicks ?? null,
            videoCompletionRate: analytics.videoCompletionRate ?? null,
            raw: { ...analytics.raw, unavailable: analytics.unavailable },
            fetchedAt: new Date(),
          },
        });

      synced += 1;
    } catch (error) {
      // One failing account must not stop the whole sync.
      logger.warn('analytics.sync_failed', { socialPostId: post.id, error });
    }
  }

  logger.info('analytics.synced', { organizationId: ctx.organization.id, posts: synced });
  return synced;
}

export type AnalyticsRange = { from: Date; to: Date; label: string };

export function rangeFor(days: number): AnalyticsRange {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from, to, label: `Last ${days} days` };
}

export type AnalyticsTotals = Record<MetricKey, number | null> & { posts: number; engagementRate: number | null };

export type PlatformBreakdown = {
  platform: Platform;
  label: string;
  posts: number;
  totals: Record<MetricKey, number | null>;
};

export type TimeseriesPoint = { date: string } & Partial<Record<MetricKey, number>>;

export type TopContent = {
  socialPostId: string;
  campaignId: string;
  campaignTitle: string;
  platform: Platform;
  permalink: string | null;
  engagement: number;
  impressions: number | null;
};

export type AnalyticsSummary = {
  range: AnalyticsRange;
  totals: AnalyticsTotals;
  byPlatform: PlatformBreakdown[];
  timeseries: TimeseriesPoint[];
  topContent: TopContent[];
  /** Metrics no connected platform returned, so the UI can say so explicitly. */
  unavailableMetrics: MetricKey[];
  hasConnectedAccounts: boolean;
  publishedPosts: number;
};

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0);
}

export async function getAnalyticsSummary(ctx: AuthContext, days: number): Promise<AnalyticsSummary> {
  const db = await getDb();
  const range = rangeFor(days);
  const fromDate = range.from.toISOString().slice(0, 10);
  const toDate = range.to.toISOString().slice(0, 10);

  const rows = await db
    .select({
      snapshot: analyticsSnapshots,
      campaignId: socialPosts.campaignId,
      campaignTitle: campaigns.title,
      permalink: socialPosts.externalPermalink,
    })
    .from(analyticsSnapshots)
    .innerJoin(socialPosts, eq(socialPosts.id, analyticsSnapshots.socialPostId))
    .innerJoin(campaigns, eq(campaigns.id, socialPosts.campaignId))
    .where(
      and(
        eq(analyticsSnapshots.organizationId, ctx.organization.id),
        gte(analyticsSnapshots.capturedOn, fromDate),
        lte(analyticsSnapshots.capturedOn, toDate),
      ),
    )
    .orderBy(asc(analyticsSnapshots.capturedOn));

  const [accountCount] = await db
    .select({ value: sql<number>`count(*)` })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.organizationId, ctx.organization.id), isNull(socialAccounts.deletedAt)));

  const [publishedCount] = await db
    .select({ value: sql<number>`count(*)` })
    .from(socialPosts)
    .where(and(eq(socialPosts.organizationId, ctx.organization.id), eq(socialPosts.status, 'published')));

  // Keep only the newest snapshot per post so cumulative counters are not
  // double-counted across days.
  const latestByPost = new Map<string, (typeof rows)[number]>();
  for (const row of rows) latestByPost.set(row.snapshot.socialPostId, row);
  const latest = [...latestByPost.values()];

  const totals = Object.fromEntries(
    METRIC_KEYS.map((key) => [key, sumOrNull(latest.map((row) => row.snapshot[key]))]),
  ) as Record<MetricKey, number | null>;

  const engagementParts = [totals.likes, totals.comments, totals.shares, totals.saves].filter(
    (value): value is number => value !== null,
  );
  const engagementTotal = engagementParts.length > 0 ? engagementParts.reduce((a, b) => a + b, 0) : null;
  const denominator = totals.impressions ?? totals.reach ?? totals.views;

  const byPlatform: PlatformBreakdown[] = PLATFORMS.map((platform) => {
    const forPlatform = latest.filter((row) => row.snapshot.platform === platform);
    return {
      platform,
      label: PLATFORM_META[platform].label,
      posts: forPlatform.length,
      totals: Object.fromEntries(
        METRIC_KEYS.map((key) => [key, sumOrNull(forPlatform.map((row) => row.snapshot[key]))]),
      ) as Record<MetricKey, number | null>,
    };
  }).filter((entry) => entry.posts > 0);

  // Time series uses every snapshot, grouped by capture date.
  const byDate = new Map<string, TimeseriesPoint>();
  for (const row of rows) {
    const point = byDate.get(row.snapshot.capturedOn) ?? { date: row.snapshot.capturedOn };
    for (const key of METRIC_KEYS) {
      const value = row.snapshot[key];
      if (value !== null) point[key] = (point[key] ?? 0) + value;
    }
    byDate.set(row.snapshot.capturedOn, point);
  }

  const topContent: TopContent[] = latest
    .map((row) => ({
      socialPostId: row.snapshot.socialPostId,
      campaignId: row.campaignId,
      campaignTitle: row.campaignTitle,
      platform: row.snapshot.platform,
      permalink: row.permalink,
      engagement:
        (row.snapshot.likes ?? 0) +
        (row.snapshot.comments ?? 0) +
        (row.snapshot.shares ?? 0) +
        (row.snapshot.saves ?? 0),
      impressions: row.snapshot.impressions,
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 8);

  return {
    range,
    totals: {
      ...totals,
      posts: latest.length,
      engagementRate:
        engagementTotal !== null && denominator && denominator > 0
          ? Number(((engagementTotal / denominator) * 100).toFixed(2))
          : null,
    },
    byPlatform,
    timeseries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topContent,
    unavailableMetrics: METRIC_KEYS.filter((key) => totals[key] === null),
    hasConnectedAccounts: Number(accountCount?.value ?? 0) > 0,
    publishedPosts: Number(publishedCount?.value ?? 0),
  };
}

/**
 * AI commentary on the numbers above.
 *
 * The model receives only the aggregated data and the list of metrics that were
 * unavailable, and is instructed to cite the figure behind each statement.
 */
export async function getAnalyticsInsights(ctx: AuthContext, days: number): Promise<AnalyticsInsights> {
  const summary = await getAnalyticsSummary(ctx, days);

  if (summary.totals.posts === 0) {
    return {
      insights: [],
      dataGaps: ['No metrics have been collected yet. Insights appear once published posts start reporting data.'],
    };
  }

  const result = await generateAnalyticsInsights({
    rangeLabel: summary.range.label,
    data: {
      totals: summary.totals,
      byPlatform: summary.byPlatform,
      topContent: summary.topContent.map((item) => ({
        platform: item.platform,
        campaign: item.campaignTitle,
        engagement: item.engagement,
        impressions: item.impressions,
      })),
    },
    missingMetrics: summary.unavailableMetrics.map((key) => METRIC_LABELS[key]),
  });

  await recordUsage(ctx, 'ai_generation', {
    ...(result.usage.costMicros !== undefined ? { costMicros: result.usage.costMicros } : {}),
    entityType: 'analytics',
    metadata: { days },
  });

  return result.data;
}

/** Per-campaign rollup for the campaign list and detail screens. */
export async function getCampaignPerformance(
  ctx: AuthContext,
  campaignIds: string[],
): Promise<Map<string, { impressions: number | null; engagement: number; posts: number }>> {
  if (campaignIds.length === 0) return new Map();
  const db = await getDb();

  const rows = await db
    .select({
      campaignId: socialPosts.campaignId,
      impressions: analyticsSnapshots.impressions,
      likes: analyticsSnapshots.likes,
      comments: analyticsSnapshots.comments,
      shares: analyticsSnapshots.shares,
      saves: analyticsSnapshots.saves,
      socialPostId: analyticsSnapshots.socialPostId,
      capturedOn: analyticsSnapshots.capturedOn,
    })
    .from(analyticsSnapshots)
    .innerJoin(socialPosts, eq(socialPosts.id, analyticsSnapshots.socialPostId))
    .where(
      and(eq(analyticsSnapshots.organizationId, ctx.organization.id), inArray(socialPosts.campaignId, campaignIds)),
    )
    .orderBy(desc(analyticsSnapshots.capturedOn));

  const seen = new Set<string>();
  const out = new Map<string, { impressions: number | null; engagement: number; posts: number }>();

  for (const row of rows) {
    if (seen.has(row.socialPostId)) continue;
    seen.add(row.socialPostId);

    const current = out.get(row.campaignId) ?? { impressions: null, engagement: 0, posts: 0 };
    out.set(row.campaignId, {
      impressions:
        row.impressions === null ? current.impressions : (current.impressions ?? 0) + row.impressions,
      engagement:
        current.engagement + (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0) + (row.saves ?? 0),
      posts: current.posts + 1,
    });
  }

  return out;
}

/** Content-type comparison used by the analytics dashboard. */
export async function getFormatPerformance(
  ctx: AuthContext,
  days: number,
): Promise<{ format: string; posts: number; engagement: number; impressions: number | null }[]> {
  const db = await getDb();
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const rows = await db
    .select({
      format: content.format,
      impressions: analyticsSnapshots.impressions,
      likes: analyticsSnapshots.likes,
      comments: analyticsSnapshots.comments,
      shares: analyticsSnapshots.shares,
      saves: analyticsSnapshots.saves,
      socialPostId: analyticsSnapshots.socialPostId,
      capturedOn: analyticsSnapshots.capturedOn,
    })
    .from(analyticsSnapshots)
    .innerJoin(socialPosts, eq(socialPosts.id, analyticsSnapshots.socialPostId))
    .innerJoin(content, eq(content.id, socialPosts.contentId))
    .where(and(eq(analyticsSnapshots.organizationId, ctx.organization.id), gte(analyticsSnapshots.capturedOn, from)))
    .orderBy(desc(analyticsSnapshots.capturedOn));

  const seen = new Set<string>();
  const byFormat = new Map<string, { posts: number; engagement: number; impressions: number | null }>();

  for (const row of rows) {
    if (seen.has(row.socialPostId)) continue;
    seen.add(row.socialPostId);

    const current = byFormat.get(row.format) ?? { posts: 0, engagement: 0, impressions: null };
    byFormat.set(row.format, {
      posts: current.posts + 1,
      engagement:
        current.engagement + (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0) + (row.saves ?? 0),
      impressions: row.impressions === null ? current.impressions : (current.impressions ?? 0) + row.impressions,
    });
  }

  return [...byFormat.entries()].map(([format, values]) => ({ format, ...values }));
}

import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { planFor, USAGE_METRIC_LABELS, type UsageMetric } from '@/lib/plans';
import { getDb } from '@/server/db';
import { usageRecords } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';

export type UsageSummary = {
  metric: UsageMetric;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
};

/** Usage periods are calendar months in UTC, matching the billing period. */
export function currentPeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function usedThisPeriod(organizationId: string, metric: UsageMetric): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)` })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.organizationId, organizationId),
        eq(usageRecords.metric, metric),
        gte(usageRecords.periodStart, currentPeriodStart()),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Checked BEFORE any billable provider call, never after. A generation that
 * would exceed the plan is refused rather than run and charged.
 */
export async function assertWithinLimit(ctx: AuthContext, metric: UsageMetric, quantity = 1): Promise<void> {
  const limit = planFor(ctx.organization.planTier).limits[metric];
  if (limit === null) return;

  if (limit === 0) {
    throw new AppError(
      'usage_limit_reached',
      `${USAGE_METRIC_LABELS[metric]} are not included in the ${ctx.organization.planTier} plan. Upgrade to use this feature.`,
      { details: { metric, limit } },
    );
  }

  const used = await usedThisPeriod(ctx.organization.id, metric);
  if (used + quantity > limit) {
    throw new AppError(
      'usage_limit_reached',
      `You have used ${used} of ${limit} ${USAGE_METRIC_LABELS[metric].toLowerCase()} this month. Upgrade your plan or wait for the next period.`,
      { details: { metric, used, limit } },
    );
  }
}

export async function recordUsage(
  ctx: AuthContext,
  metric: UsageMetric,
  options: { quantity?: number; costMicros?: number; entityType?: string; entityId?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  const db = await getDb();
  await db.insert(usageRecords).values({
    organizationId: ctx.organization.id,
    metric,
    quantity: options.quantity ?? 1,
    costMicros: options.costMicros ?? null,
    periodStart: currentPeriodStart(),
    entityType: options.entityType ?? null,
    entityId: options.entityId ?? null,
    actorUserId: ctx.user.id,
    metadata: options.metadata ?? {},
  });

  logger.debug('usage.recorded', {
    organizationId: ctx.organization.id,
    metric,
    quantity: options.quantity ?? 1,
  });
}

export async function getUsageSummary(ctx: AuthContext): Promise<UsageSummary[]> {
  const plan = planFor(ctx.organization.planTier);
  const metrics = Object.keys(plan.limits).filter((key): key is UsageMetric =>
    key !== 'brands' && key !== 'teamMembers',
  );

  return Promise.all(
    metrics.map(async (metric) => {
      const limit = plan.limits[metric];
      const used = await usedThisPeriod(ctx.organization.id, metric);
      return {
        metric,
        label: USAGE_METRIC_LABELS[metric],
        used,
        limit,
        remaining: limit === null ? null : Math.max(limit - used, 0),
        percentUsed: limit === null || limit === 0 ? null : Math.min(Math.round((used / limit) * 100), 100),
      };
    }),
  );
}

/** Used by the UI to warn before starting something expensive. */
export async function remainingFor(ctx: AuthContext, metric: UsageMetric): Promise<number | null> {
  const limit = planFor(ctx.organization.planTier).limits[metric];
  if (limit === null) return null;
  return Math.max(limit - (await usedThisPeriod(ctx.organization.id, metric)), 0);
}

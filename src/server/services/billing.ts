import 'server-only';
import { eq } from 'drizzle-orm';
import { AppError, notFound } from '@/lib/errors';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { PlanTier } from '@/lib/plans';
import { billing } from '@/providers/billing';
import { getDb } from '@/server/db';
import { organizations, subscriptions } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import { recordAudit } from './audit';
import { notify } from './notifications';

export type SubscriptionRecord = typeof subscriptions.$inferSelect;

export async function getSubscription(ctx: AuthContext): Promise<SubscriptionRecord> {
  const db = await getDb();
  const [record] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, ctx.organization.id))
    .limit(1);

  if (record) return record;

  // Organizations created before billing existed still get a free row.
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const [created] = await db
    .insert(subscriptions)
    .values({
      organizationId: ctx.organization.id,
      planTier: 'free',
      status: 'active',
      provider: billing().name,
      currentPeriodEnd: periodEnd,
    })
    .returning();

  return created!;
}

/**
 * Starts a plan change.
 *
 * With a real processor this returns a hosted checkout URL and nothing changes
 * until the webhook confirms payment. In mock mode the change applies at once
 * and the UI says so plainly.
 */
export async function startPlanChange(
  ctx: AuthContext,
  planTier: PlanTier,
): Promise<{ redirectUrl: string | null; applied: boolean }> {
  assertCapability(ctx, 'billing:manage');

  const current = await getSubscription(ctx);
  if (current.planTier === planTier) {
    throw new AppError('validation_failed', `You are already on the ${planTier} plan.`);
  }

  const appUrl = env().APP_URL.replace(/\/$/, '');
  const session = await billing().createCheckout({
    organizationId: ctx.organization.id,
    planTier,
    customerEmail: ctx.user.email,
    successUrl: `${appUrl}/billing?changed=1`,
    cancelUrl: `${appUrl}/billing`,
    existingCustomerId: current.externalCustomerId,
  });

  if (session.appliedImmediately) {
    await applyPlan(ctx.organization.id, planTier, 'active');
    await recordAudit({
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      action: 'billing.plan_changed',
      entityType: 'subscription',
      metadata: { planTier, provider: billing().name },
    });
    return { redirectUrl: null, applied: true };
  }

  return { redirectUrl: session.url, applied: false };
}

/**
 * Writes a confirmed plan change. Called from the webhook handler and from the
 * mock provider's immediate path — never directly from a user request.
 */
export async function applyPlan(
  organizationId: string,
  planTier: PlanTier,
  status: SubscriptionRecord['status'],
  currentPeriodEnd?: Date,
): Promise<void> {
  const db = await getDb();
  const periodEnd = currentPeriodEnd ?? new Date(Date.now() + 30 * 86_400_000);

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ planTier, status, currentPeriodEnd: periodEnd, updatedAt: new Date() })
      .where(eq(subscriptions.organizationId, organizationId));

    // The organization row carries the tier so permission and limit checks do
    // not need to join the subscription on every request.
    await tx
      .update(organizations)
      .set({ planTier, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
  });

  await notify(organizationId, null, {
    kind: 'system',
    title: `Plan updated to ${planTier}`,
    body: status === 'active' ? 'Your new allowances are available immediately.' : `Subscription status: ${status}.`,
    linkPath: '/billing',
  });

  logger.info('billing.plan_applied', { organizationId, planTier, status });
}

export async function openBillingPortal(ctx: AuthContext): Promise<string> {
  assertCapability(ctx, 'billing:manage');
  const subscription = await getSubscription(ctx);

  if (!subscription.externalCustomerId) {
    throw new AppError(
      'validation_failed',
      'There is no payment account for this workspace yet. Choose a paid plan first.',
    );
  }

  const { url } = await billing().createPortalSession({
    customerId: subscription.externalCustomerId,
    returnUrl: `${env().APP_URL.replace(/\/$/, '')}/billing`,
  });

  return url;
}

export async function cancelPlan(ctx: AuthContext): Promise<void> {
  assertCapability(ctx, 'billing:manage');
  const subscription = await getSubscription(ctx);

  if (subscription.planTier === 'free') {
    throw new AppError('validation_failed', 'You are on the free plan; there is nothing to cancel.');
  }

  if (subscription.externalSubscriptionId) {
    await billing().cancelSubscription(subscription.externalSubscriptionId);
  }

  const db = await getDb();
  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: 1, updatedAt: new Date() })
    .where(eq(subscriptions.organizationId, ctx.organization.id));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'billing.cancelled',
    entityType: 'subscription',
  });
}

export async function handleBillingWebhook(payload: string, signature: string | null): Promise<void> {
  const result = await billing().verifyWebhook(payload, signature);
  if (!result.handled || !result.organizationId || !result.planTier) return;

  const db = await getDb();
  const [exists] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, result.organizationId))
    .limit(1);

  if (!exists) throw notFound('That organization');

  await applyPlan(result.organizationId, result.planTier, result.status ?? 'active', result.currentPeriodEnd);
}

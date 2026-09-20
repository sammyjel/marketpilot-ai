'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { requireCapability } from '@/server/auth/context';
import { enqueue } from '@/server/jobs/queue';
import { getAnalyticsInsights } from '@/server/services/analytics';
import { assertWithinLimit } from '@/server/services/usage';
import { checkRateLimit } from '@/server/services/rate-limit';

export type InsightsPayload = {
  insights: { title: string; detail: string; basis: string; recommendation: string | null }[];
  dataGaps: string[];
};

/** Queues a metrics refresh; platforms are polled by the worker. */
export async function syncAnalyticsAction(): Promise<void> {
  const ctx = await requireCapability('analytics:read');

  await enqueue(
    'analytics.sync',
    { userId: ctx.user.id, organizationId: ctx.organization.id },
    {
      organizationId: ctx.organization.id,
      priority: 50,
      // One sync per organization per minute is plenty.
      dedupeKey: `analytics:${ctx.organization.id}:${Math.floor(Date.now() / 60_000)}`,
    },
  );

  revalidatePath('/analytics');
}

const schema = z.object({ days: z.coerce.number().int().min(1).max(90) });

export async function generateInsightsAction(
  _prev: ActionState<InsightsPayload | null>,
  formData: FormData,
): Promise<ActionState<InsightsPayload | null>> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'That date range is not valid.');

  try {
    const ctx = await requireCapability('analytics:read');
    checkRateLimit('aiGeneration', ctx.user.id);
    await assertWithinLimit(ctx, 'ai_generation', 1);

    const result = await getAnalyticsInsights(ctx, parsed.data.days);
    return success(result as InsightsPayload);
  } catch (error) {
    return fromError(error);
  }
}

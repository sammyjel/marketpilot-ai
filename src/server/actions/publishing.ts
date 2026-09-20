'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { zonedInputToUtc } from '@/lib/dates';
import { requireAuth } from '@/server/auth/context';
import { cancelScheduledPost, scheduleOrPublish, type TargetInput } from '@/server/services/publishing';

const schema = z.object({
  campaignId: z.uuid(),
  mode: z.enum(['now', 'schedule']),
  timezone: z.string().max(64).default('UTC'),
  date: z.string().optional(),
  time: z.string().optional(),
});

/**
 * Targets arrive as `contentId:accountId` pairs. Both halves are re-verified
 * server-side against the caller's organization before anything is queued.
 */
export async function schedulePublishAction(
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionState<null>> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Could not read the publishing options.');

  const targetKeys = formData.getAll('targets').map(String);
  if (targetKeys.length === 0) {
    return failure('validation_failed', 'Choose at least one destination.');
  }

  let scheduledFor: Date | null = null;
  if (parsed.data.mode === 'schedule') {
    if (!parsed.data.date || !parsed.data.time) {
      return failure('validation_failed', 'Pick a date and time to schedule.');
    }
    try {
      scheduledFor = zonedInputToUtc(parsed.data.date, parsed.data.time, parsed.data.timezone);
    } catch {
      return failure('validation_failed', 'That date and time could not be read.');
    }
    if (scheduledFor.getTime() < Date.now() - 60_000) {
      return failure('validation_failed', 'Pick a time in the future.');
    }
  }

  const targets: TargetInput[] = [];
  for (const key of targetKeys) {
    const [contentId, socialAccountId] = key.split(':');
    if (!contentId || !socialAccountId) continue;
    targets.push({ contentId, socialAccountId, scheduledFor, timezone: parsed.data.timezone });
  }

  try {
    const ctx = await requireAuth();
    const result = await scheduleOrPublish(ctx, parsed.data.campaignId, targets, {
      publishNow: parsed.data.mode === 'now',
    });

    revalidatePath(`/campaigns/${parsed.data.campaignId}`);
    revalidatePath('/calendar');

    if (result.created === 0) {
      return failure('conflict', 'Those destinations were already queued for this campaign.');
    }

    return success(
      null,
      parsed.data.mode === 'now'
        ? `Publishing to ${result.created} destination${result.created === 1 ? '' : 's'}. Watch the status above.`
        : `Scheduled ${result.created} post${result.created === 1 ? '' : 's'}.`,
    );
  } catch (error) {
    return fromError(error);
  }
}

export async function cancelPostAction(formData: FormData): Promise<void> {
  const socialPostId = String(formData.get('socialPostId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');

  const ctx = await requireAuth();
  await cancelScheduledPost(ctx, socialPostId);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath('/calendar');
}

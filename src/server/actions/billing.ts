'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { requireCapability } from '@/server/auth/context';
import { cancelPlan, startPlanChange } from '@/server/services/billing';

const schema = z.object({ planTier: z.enum(['free', 'starter', 'professional', 'agency']) });

export async function changePlanAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'That plan is not available.');

  let redirectUrl: string | null = null;
  try {
    const ctx = await requireCapability('billing:manage');
    const result = await startPlanChange(ctx, parsed.data.planTier);
    redirectUrl = result.redirectUrl;
  } catch (error) {
    return fromError(error);
  }

  // With a real processor the browser goes to hosted checkout and nothing
  // changes until the webhook confirms payment.
  if (redirectUrl) redirect(redirectUrl);

  revalidatePath('/billing');
  return success(null, 'Plan updated.');
}

export async function cancelPlanAction(): Promise<void> {
  const ctx = await requireCapability('billing:manage');
  await cancelPlan(ctx);
  revalidatePath('/billing');
}

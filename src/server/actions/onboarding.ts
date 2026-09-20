'use server';

import { BRAND_TONES } from '@/lib/tones';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ActionState, failure, fromError } from '@/lib/action-state';
import { PLATFORMS } from '@/lib/platforms';
import { getDb } from '@/server/db';
import { organizations, users } from '@/server/db/schema';
import { requireAuth } from '@/server/auth/context';
import { createBrand } from '@/server/services/brands';

const schema = z.object({
  brandName: z.string().trim().min(1, 'Tell us what to call your brand.').max(160),
  industry: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  targetAudience: z.string().trim().max(500).optional(),
  country: z.string().trim().min(2).max(56).default('US'),
  language: z.string().trim().min(2).max(10).default('en'),
  timezone: z.string().trim().max(64).default('UTC'),
  tone: z.enum(BRAND_TONES).default('friendly'),
  platforms: z.string().optional(),
});

/**
 * Completes onboarding in one transaction-ish flow: name the workspace, create
 * the first brand from the answers, and mark the user as onboarded.
 */
export async function completeOnboardingAction(
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionState<null>> {
  const raw = Object.fromEntries(formData);
  const parsed = schema.safeParse({ ...raw, platforms: formData.getAll('platforms').join(',') });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return failure('validation_failed', 'Please complete the highlighted steps.', fieldErrors);
  }

  try {
    const ctx = await requireAuth();
    const db = await getDb();

    const selected = (parsed.data.platforms ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is (typeof PLATFORMS)[number] => (PLATFORMS as readonly string[]).includes(value));

    await createBrand(ctx, {
      name: parsed.data.brandName,
      ...(parsed.data.industry ? { industry: parsed.data.industry } : {}),
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      ...(parsed.data.targetAudience ? { targetAudience: parsed.data.targetAudience } : {}),
      country: parsed.data.country,
      language: parsed.data.language,
      timezone: parsed.data.timezone,
      tone: parsed.data.tone,
      activePlatforms: selected,
    });

    // The workspace was named from the signup form; adopt the brand name when
    // the user only had a placeholder.
    await db
      .update(organizations)
      .set({ name: parsed.data.brandName, updatedAt: new Date() })
      .where(eq(organizations.id, ctx.organization.id));

    await db
      .update(users)
      .set({ onboardingCompletedAt: new Date(), timezone: parsed.data.timezone, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id));
  } catch (error) {
    return fromError(error);
  }

  redirect('/dashboard?welcome=1');
}

/** Lets a returning user skip the wizard without creating a brand. */
export async function skipOnboardingAction(): Promise<void> {
  const ctx = await requireAuth();
  const db = await getDb();
  await db.update(users).set({ onboardingCompletedAt: new Date() }).where(eq(users.id, ctx.user.id));
  redirect('/dashboard');
}

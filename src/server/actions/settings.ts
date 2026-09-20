'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { LOCALES } from '@/i18n/config';
import { getDb } from '@/server/db';
import { organizations, users } from '@/server/db/schema';
import { requireAuth, requireCapability } from '@/server/auth/context';
import { recordAudit } from '@/server/services/audit';
import { markAllRead } from '@/server/services/notifications';

const profileSchema = z.object({
  name: z.string().trim().max(120).optional(),
  timezone: z.string().trim().min(1).max(64),
  locale: z.enum(LOCALES),
});

export async function updateProfileAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Please correct the highlighted fields.');

  try {
    const ctx = await requireAuth();
    const db = await getDb();

    await db
      .update(users)
      .set({
        name: parsed.data.name || null,
        timezone: parsed.data.timezone,
        locale: parsed.data.locale,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    await recordAudit({
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      action: 'user.profile_updated',
    });
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/settings');
  return success(null, 'Profile saved.');
}

const orgSchema = z.object({
  name: z.string().trim().min(1, 'Give the workspace a name.').max(160),
  isAgency: z.string().optional(),
});

export async function updateOrganizationAction(
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionState<null>> {
  const parsed = orgSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Give the workspace a name.', { name: 'Required.' });

  try {
    const ctx = await requireCapability('org:manage');
    const db = await getDb();

    await db
      .update(organizations)
      .set({ name: parsed.data.name, isAgency: parsed.data.isAgency === 'on', updatedAt: new Date() })
      .where(eq(organizations.id, ctx.organization.id));

    await recordAudit({
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      action: 'organization.updated',
    });
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/settings');
  return success(null, 'Workspace saved.');
}

const aiSchema = z.object({
  defaultTone: z.string().trim().max(40).optional(),
  autoPublishApproved: z.string().optional(),
  requireReviewAlways: z.string().optional(),
});

/**
 * Generation and approval defaults.
 *
 * Auto-publish is opt-in and applies only to campaigns a person has already
 * approved — there is no setting anywhere that publishes unreviewed AI output.
 */
export async function updateAiSettingsAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = aiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Those settings could not be saved.');

  try {
    const ctx = await requireCapability('org:manage');
    const db = await getDb();

    const [current] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.organization.id))
      .limit(1);

    await db
      .update(organizations)
      .set({
        settings: {
          ...(current?.settings ?? {}),
          ai: {
            defaultTone: parsed.data.defaultTone ?? 'friendly',
            autoPublishApproved: parsed.data.autoPublishApproved === 'on',
            requireReviewAlways: parsed.data.requireReviewAlways !== 'off',
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, ctx.organization.id));

    await recordAudit({
      organizationId: ctx.organization.id,
      actorUserId: ctx.user.id,
      action: 'organization.ai_settings_updated',
      metadata: { autoPublishApproved: parsed.data.autoPublishApproved === 'on' },
    });
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/settings/ai');
  return success(null, 'AI settings saved.');
}

export async function markNotificationsReadAction(): Promise<void> {
  const ctx = await requireAuth();
  await markAllRead(ctx);
  revalidatePath('/settings/notifications');
}

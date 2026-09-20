'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { PLATFORMS, type Platform } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { editContent } from '@/server/ai/stages';
import { enqueue } from '@/server/jobs/queue';
import {
  CAMPAIGN_OBJECTIVES,
  CONTENT_FORMATS,
  approveCampaign,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaign,
  getCampaignContent,
  restoreVersion,
  updateContentFields,
  type CampaignObjective,
  type ContentFormat,
} from '@/server/services/campaigns';
import { assertWithinLimit, recordUsage } from '@/server/services/usage';
import { checkRateLimit } from '@/server/services/rate-limit';

const createSchema = z.object({
  brandId: z.uuid('Choose a brand.'),
  productId: z.uuid('Choose a product.'),
  title: z.string().trim().max(200).optional(),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  tone: z.string().trim().max(40).optional(),
  language: z.string().trim().max(10).optional(),
  targetAudience: z.string().trim().max(500).optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
  templateKey: z.string().trim().max(60).optional(),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Creates the campaign and queues generation. The user is redirected straight
 * to the campaign page, which polls the job — generation never blocks a request.
 */
export async function createCampaignAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please complete the highlighted steps.', fieldErrors(parsed.error));
  }

  const platforms = formData
    .getAll('platforms')
    .map(String)
    .filter((value): value is Platform => (PLATFORMS as readonly string[]).includes(value));

  if (platforms.length === 0) {
    return failure('validation_failed', 'Choose at least one platform.', { platforms: 'Choose at least one platform.' });
  }

  const formats = formData
    .getAll('formats')
    .map(String)
    .filter((value): value is ContentFormat => (CONTENT_FORMATS as readonly string[]).includes(value));

  let campaignId: string;
  try {
    const ctx = await requireAuth();
    checkRateLimit('aiGeneration', ctx.user.id);
    // Refuse before creating anything if the plan cannot cover the run.
    await assertWithinLimit(ctx, 'ai_generation', platforms.length + 3);

    const campaign = await createCampaign(ctx, {
      brandId: parsed.data.brandId,
      productId: parsed.data.productId,
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      objective: parsed.data.objective as CampaignObjective,
      ...(parsed.data.tone ? { tone: parsed.data.tone } : {}),
      ...(parsed.data.language ? { language: parsed.data.language } : {}),
      targetAudience: parsed.data.targetAudience ?? null,
      platforms,
      formats: formats.length > 0 ? formats : ['image'],
      ...(parsed.data.templateKey ? { templateKey: parsed.data.templateKey } : {}),
      ...(parsed.data.durationDays ? { durationDays: parsed.data.durationDays } : {}),
    });
    campaignId = campaign.id;

    await enqueue(
      'campaign.generate',
      { campaignId, userId: ctx.user.id, organizationId: ctx.organization.id },
      {
        organizationId: ctx.organization.id,
        priority: 10,
        maxAttempts: 2,
        // Prevents a double-submit from generating (and billing) twice.
        dedupeKey: `campaign.generate:${campaignId}`,
      },
    );
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/campaigns');
  redirect(`/campaigns/${campaignId}`);
}

export async function regenerateCampaignAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get('campaignId') ?? '');
  const ctx = await requireAuth();
  const campaign = await getCampaign(ctx, campaignId);

  checkRateLimit('aiGeneration', ctx.user.id);
  await assertWithinLimit(ctx, 'ai_generation', campaign.platforms.length + 3);

  await enqueue(
    'campaign.generate',
    { campaignId, userId: ctx.user.id, organizationId: ctx.organization.id },
    {
      organizationId: ctx.organization.id,
      priority: 10,
      maxAttempts: 2,
      // A fresh key per attempt: this is a deliberate re-run, not a duplicate.
      dedupeKey: `campaign.generate:${campaignId}:${Date.now()}`,
    },
  );

  revalidatePath(`/campaigns/${campaignId}`);
}

const updateContentSchema = z.object({
  contentId: z.uuid(),
  fields: z.string(),
});

export async function updateContentAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = updateContentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Could not save that edit.');

  try {
    const ctx = await requireAuth();
    const fields = JSON.parse(parsed.data.fields) as Record<string, unknown>;
    const hashtags = Array.isArray(fields['hashtags']) ? (fields['hashtags'] as string[]) : undefined;

    const updated = await updateContentFields(ctx, parsed.data.contentId, fields, hashtags);
    revalidatePath(`/campaigns/${updated.campaignId}`);
  } catch (error) {
    return fromError(error);
  }

  return success(null, 'Saved.');
}

const editOperationSchema = z.object({
  contentId: z.uuid(),
  operation: z.enum(['regenerate', 'shorten', 'expand', 'change_tone', 'translate', 'improve_seo', 'change_cta']),
  argument: z.string().trim().max(120).optional(),
});

/** Runs an AI editing tool on a single piece of content. */
export async function runContentToolAction(
  _prev: ActionState<{ fields: Record<string, unknown>; note: string | null } | null>,
  formData: FormData,
): Promise<ActionState<{ fields: Record<string, unknown>; note: string | null } | null>> {
  const parsed = editOperationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'That editing tool is not available.');

  try {
    const ctx = await requireAuth();
    checkRateLimit('aiGeneration', ctx.user.id);
    await assertWithinLimit(ctx, 'ai_generation', 1);

    const pieces = await getCampaignContent(ctx, String(formData.get('campaignId') ?? ''));
    const piece = pieces.find((item) => item.id === parsed.data.contentId);
    if (!piece) return failure('not_found', 'That content could not be found.');

    const result = await editContent({
      operation: parsed.data.operation,
      platform: piece.platform as Platform,
      fields: piece.fields,
      argument: parsed.data.argument,
    });

    await recordUsage(ctx, 'ai_generation', {
      ...(result.usage.costMicros !== undefined ? { costMicros: result.usage.costMicros } : {}),
      entityType: 'content',
      entityId: piece.id,
      metadata: { operation: parsed.data.operation },
    });

    // Merge rather than replace: the tool only returns the fields it changed.
    const merged = { ...piece.fields, ...result.data.fields };
    const hashtags = Array.isArray(merged['hashtags']) ? (merged['hashtags'] as string[]) : undefined;
    await updateContentFields(ctx, piece.id, merged, hashtags);

    revalidatePath(`/campaigns/${piece.campaignId}`);
    return success({ fields: merged, note: result.data.note }, result.data.note ?? 'Updated.');
  } catch (error) {
    return fromError(error);
  }
}

export async function approveCampaignAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get('campaignId') ?? '');
  const ctx = await requireAuth();
  await approveCampaign(ctx, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function duplicateCampaignAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get('campaignId') ?? '');
  const ctx = await requireAuth();
  const copy = await duplicateCampaign(ctx, campaignId);
  revalidatePath('/campaigns');
  redirect(`/campaigns/${copy.id}`);
}

export async function deleteCampaignAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get('campaignId') ?? '');
  const ctx = await requireAuth();
  await deleteCampaign(ctx, campaignId);
  revalidatePath('/campaigns');
  redirect('/campaigns');
}

export async function restoreVersionAction(formData: FormData): Promise<void> {
  const campaignId = String(formData.get('campaignId') ?? '');
  const version = Number(formData.get('version') ?? 0);
  const ctx = await requireAuth();
  await restoreVersion(ctx, campaignId, version);
  revalidatePath(`/campaigns/${campaignId}`);
}

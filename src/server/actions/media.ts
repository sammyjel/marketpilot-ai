'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { requireAuth } from '@/server/auth/context';
import { enqueue } from '@/server/jobs/queue';
import { attachMediaToContent } from '@/server/services/media-generation';
import { deleteMedia } from '@/server/services/media';
import { assertWithinLimit } from '@/server/services/usage';
import { checkRateLimit } from '@/server/services/rate-limit';

const imageSchema = z.object({
  campaignId: z.uuid(),
  conceptIndex: z.coerce.number().int().min(0).max(10),
  preserveProduct: z.string().optional(),
});

/** Queues an image render. The campaign page polls for the result. */
export async function generateImageAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = imageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Could not read that concept.');

  try {
    const ctx = await requireAuth();
    checkRateLimit('aiGeneration', ctx.user.id);
    await assertWithinLimit(ctx, 'image_generation', 1);

    await enqueue(
      'media.generate_image',
      {
        campaignId: parsed.data.campaignId,
        conceptIndex: parsed.data.conceptIndex,
        preserveProduct: parsed.data.preserveProduct !== 'off',
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
      },
      {
        organizationId: ctx.organization.id,
        priority: 20,
        dedupeKey: `image:${parsed.data.campaignId}:${parsed.data.conceptIndex}:${Date.now()}`,
      },
    );
  } catch (error) {
    return fromError(error);
  }

  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  return success(null, 'Creating the image. It will appear here in a moment.');
}

const videoSchema = z.object({
  campaignId: z.uuid(),
  conceptIndex: z.coerce.number().int().min(0).max(5),
  withVoiceover: z.string().optional(),
  captions: z.string().optional(),
});

export async function generateVideoAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = videoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure('validation_failed', 'Could not read that video concept.');

  try {
    const ctx = await requireAuth();
    checkRateLimit('aiGeneration', ctx.user.id);
    // Checked here so an over-quota request is refused before a render starts.
    await assertWithinLimit(ctx, 'video_generation', 1);

    await enqueue(
      'media.generate_video',
      {
        campaignId: parsed.data.campaignId,
        conceptIndex: parsed.data.conceptIndex,
        withVoiceover: parsed.data.withVoiceover === 'on',
        captions: parsed.data.captions !== 'off',
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
      },
      {
        organizationId: ctx.organization.id,
        priority: 30,
        maxAttempts: 2,
        dedupeKey: `video:${parsed.data.campaignId}:${parsed.data.conceptIndex}:${Date.now()}`,
      },
    );
  } catch (error) {
    return fromError(error);
  }

  revalidatePath(`/campaigns/${parsed.data.campaignId}`);
  return success(null, 'Video render queued. This takes a few minutes — we will notify you when it is ready.');
}

export async function attachMediaAction(formData: FormData): Promise<void> {
  const contentId = String(formData.get('contentId') ?? '');
  const campaignId = String(formData.get('campaignId') ?? '');
  const mediaAssetIds = formData.getAll('mediaAssetIds').map(String);

  const ctx = await requireAuth();
  await attachMediaToContent(ctx, contentId, mediaAssetIds);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
  const mediaId = String(formData.get('mediaId') ?? '');
  const ctx = await requireAuth();
  await deleteMedia(ctx, mediaId);
  revalidatePath('/media');
}

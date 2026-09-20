import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { enqueue } from '@/server/jobs/queue';
import { listCampaignMedia } from '@/server/services/media-generation';
import { assertWithinLimit } from '@/server/services/usage';

type Params = { id: string };

const schema = z.object({
  kind: z.enum(['image', 'video']).default('image'),
  conceptIndex: z.number().int().min(0).max(10).default(0),
  preserveProduct: z.boolean().default(true),
  withVoiceover: z.boolean().default(false),
  captions: z.boolean().default(true),
});

export const GET = route<Params>(async ({ auth, params }) => {
  const assets = await listCampaignMedia(auth, params.id);
  return ok(
    assets.map((entry) => ({
      id: entry.media.id,
      role: entry.role,
      kind: entry.media.kind,
      storageKey: entry.media.storageKey,
      thumbnailKey: entry.media.thumbnailKey,
      mimeType: entry.media.mimeType,
      byteSize: entry.media.byteSize,
      width: entry.media.width,
      height: entry.media.height,
      producedBy: entry.media.metadata['producedBy'] ?? null,
      preservedProduct: entry.media.metadata['preservedProduct'] === true,
    })),
  );
});

/** Queues creative generation. Rendering never happens inside the request. */
export const POST = route<Params>(
  async ({ request, auth, params }) => {
    const body = await parseJson(request, schema);

    if (body.kind === 'video') {
      await assertWithinLimit(auth, 'video_generation', 1);
      const job = await enqueue(
        'media.generate_video',
        {
          campaignId: params.id,
          conceptIndex: body.conceptIndex,
          withVoiceover: body.withVoiceover,
          captions: body.captions,
          userId: auth.user.id,
          organizationId: auth.organization.id,
        },
        {
          organizationId: auth.organization.id,
          priority: 30,
          maxAttempts: 2,
          dedupeKey: `video:${params.id}:${body.conceptIndex}:${Date.now()}`,
        },
      );
      return ok({ jobId: job?.id ?? null, kind: 'video' }, { status: 202 });
    }

    await assertWithinLimit(auth, 'image_generation', 1);
    const job = await enqueue(
      'media.generate_image',
      {
        campaignId: params.id,
        conceptIndex: body.conceptIndex,
        preserveProduct: body.preserveProduct,
        userId: auth.user.id,
        organizationId: auth.organization.id,
      },
      {
        organizationId: auth.organization.id,
        priority: 20,
        dedupeKey: `image:${params.id}:${body.conceptIndex}:${Date.now()}`,
      },
    );

    return ok({ jobId: job?.id ?? null, kind: 'image' }, { status: 202 });
  },
  { capability: 'media:write' },
);

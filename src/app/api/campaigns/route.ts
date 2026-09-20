import { z } from 'zod';
import { PLATFORMS } from '@/lib/platforms';
import { ok, pagination, parseJson, route, searchParams } from '@/server/api/http';
import { enqueue } from '@/server/jobs/queue';
import { CAMPAIGN_OBJECTIVES, CONTENT_FORMATS, createCampaign, listCampaigns } from '@/server/services/campaigns';
import { assertWithinLimit } from '@/server/services/usage';

const createSchema = z.object({
  brandId: z.uuid(),
  productId: z.uuid(),
  title: z.string().trim().max(200).optional(),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  tone: z.string().trim().max(40).optional(),
  language: z.string().trim().max(10).optional(),
  targetAudience: z.string().trim().max(500).nullish(),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  formats: z.array(z.enum(CONTENT_FORMATS)).default(['image']),
  durationDays: z.number().int().min(1).max(365).optional(),
  templateKey: z.string().trim().max(60).optional(),
  /** Queue generation immediately. Defaults to true. */
  generate: z.boolean().default(true),
});

export const GET = route(async ({ request, auth }) => {
  const { limit, offset } = pagination(request);
  const params = searchParams(request);
  return ok(
    await listCampaigns(auth, {
      ...(params.get('brandId') ? { brandId: params.get('brandId')! } : {}),
      ...(params.get('status') ? { status: params.get('status')! } : {}),
      limit,
      offset,
    }),
  );
});

export const POST = route(
  async ({ request, auth }) => {
    const body = await parseJson(request, createSchema);
    await assertWithinLimit(auth, 'ai_generation', body.platforms.length + 3);

    const { generate, ...input } = body;
    const campaign = await createCampaign(auth, input);

    if (generate) {
      await enqueue(
        'campaign.generate',
        { campaignId: campaign.id, userId: auth.user.id, organizationId: auth.organization.id },
        {
          organizationId: auth.organization.id,
          priority: 10,
          maxAttempts: 2,
          dedupeKey: `campaign.generate:${campaign.id}`,
        },
      );
    }

    return ok(campaign, { status: 201 });
  },
  { capability: 'campaign:write' },
);

import { ok, route } from '@/server/api/http';
import { enqueue } from '@/server/jobs/queue';
import { getCampaign } from '@/server/services/campaigns';
import { assertWithinLimit } from '@/server/services/usage';

type Params = { id: string };

/** Queues (re)generation. Returns the job so a client can poll its status. */
export const POST = route<Params>(
  async ({ auth, params }) => {
    const campaign = await getCampaign(auth, params.id);
    await assertWithinLimit(auth, 'ai_generation', campaign.platforms.length + 3);

    const job = await enqueue(
      'campaign.generate',
      { campaignId: campaign.id, userId: auth.user.id, organizationId: auth.organization.id },
      {
        organizationId: auth.organization.id,
        priority: 10,
        maxAttempts: 2,
        dedupeKey: `campaign.generate:${campaign.id}:${Date.now()}`,
      },
    );

    return ok({ jobId: job?.id ?? null, status: 'queued' }, { status: 202 });
  },
  { capability: 'campaign:generate' },
);

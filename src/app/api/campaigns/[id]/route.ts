import { ok, route } from '@/server/api/http';
import { deleteCampaign, getCampaign, getCampaignContent, listVersions } from '@/server/services/campaigns';

type Params = { id: string };

export const GET = route<Params>(async ({ auth, params }) => {
  const [campaign, content, versions] = await Promise.all([
    getCampaign(auth, params.id),
    getCampaignContent(auth, params.id),
    listVersions(auth, params.id),
  ]);
  return ok({ ...campaign, content, versions });
});

export const DELETE = route<Params>(
  async ({ auth, params }) => {
    await deleteCampaign(auth, params.id);
    return ok({ deleted: true });
  },
  { capability: 'campaign:delete' },
);

import { ok, route } from '@/server/api/http';
import { approveCampaign, getCampaign } from '@/server/services/campaigns';

type Params = { id: string };

export const POST = route<Params>(
  async ({ auth, params }) => {
    await approveCampaign(auth, params.id);
    return ok(await getCampaign(auth, params.id));
  },
  { capability: 'campaign:approve' },
);

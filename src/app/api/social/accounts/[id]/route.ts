import { ok, route } from '@/server/api/http';
import { disconnectAccount, validateAccount } from '@/server/services/social-accounts';

type Params = { id: string };

export const POST = route<Params>(async ({ auth, params }) => ok(await validateAccount(auth, params.id)));

export const DELETE = route<Params>(
  async ({ auth, params }) => {
    await disconnectAccount(auth, params.id);
    return ok({ disconnected: true });
  },
  { capability: 'social:connect' },
);

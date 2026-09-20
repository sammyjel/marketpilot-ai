import { z } from 'zod';
import { PLATFORMS } from '@/lib/platforms';
import { ok, parseJson, route } from '@/server/api/http';
import { beginConnect } from '@/server/services/social-accounts';

const schema = z.object({
  platform: z.enum(PLATFORMS),
  brandId: z.uuid(),
  redirectPath: z.string().max(200).optional(),
});

/** Returns the platform authorisation URL for the client to navigate to. */
export const POST = route(
  async ({ request, auth }) => {
    const body = await parseJson(request, schema);
    return ok({ url: await beginConnect(auth, body) });
  },
  { capability: 'social:connect' },
);

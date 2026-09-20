import { ok, route, searchParams } from '@/server/api/http';
import { listSocialAccounts } from '@/server/services/social-accounts';

export const GET = route(async ({ request, auth }) => {
  const brandId = searchParams(request).get('brandId');
  return ok(await listSocialAccounts(auth, brandId ? { brandId } : {}));
});

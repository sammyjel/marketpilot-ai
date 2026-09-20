import { ok, publicRoute } from '@/server/api/http';
import { destroySession } from '@/server/auth/session';

export const POST = publicRoute(async () => {
  await destroySession();
  return ok({ signedOut: true });
});

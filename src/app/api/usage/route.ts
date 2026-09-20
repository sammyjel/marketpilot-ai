import { ok, route } from '@/server/api/http';
import { planFor } from '@/lib/plans';
import { getUsageSummary } from '@/server/services/usage';

export const GET = route(async ({ auth }) =>
  ok({
    plan: planFor(auth.organization.planTier),
    usage: await getUsageSummary(auth),
  }),
);

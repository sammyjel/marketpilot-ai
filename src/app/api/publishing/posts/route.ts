import { AppError } from '@/lib/errors';
import { ok, route, searchParams } from '@/server/api/http';
import { getCampaignPosts } from '@/server/services/publishing';

export const GET = route(async ({ request, auth }) => {
  const campaignId = searchParams(request).get('campaignId');
  if (!campaignId) throw new AppError('validation_failed', 'campaignId is required.');
  return ok(await getCampaignPosts(auth, campaignId));
});

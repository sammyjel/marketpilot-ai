import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { scheduleOrPublish } from '@/server/services/publishing';

const schema = z.object({
  campaignId: z.uuid(),
  targets: z
    .array(
      z.object({
        contentId: z.uuid(),
        socialAccountId: z.uuid(),
        /** ISO-8601 UTC instant. Omit to publish as soon as a worker picks it up. */
        scheduledFor: z.iso.datetime().optional(),
      }),
    )
    .min(1)
    .max(50),
  timezone: z.string().max(64).optional(),
  publishNow: z.boolean().default(false),
});

export const POST = route(async ({ request, auth }) => {
  const body = await parseJson(request, schema);

  const result = await scheduleOrPublish(
    auth,
    body.campaignId,
    body.targets.map((target) => ({
      contentId: target.contentId,
      socialAccountId: target.socialAccountId,
      scheduledFor: target.scheduledFor ? new Date(target.scheduledFor) : null,
      ...(body.timezone ? { timezone: body.timezone } : {}),
    })),
    { publishNow: body.publishNow },
  );

  return ok(result, { status: 202 });
});

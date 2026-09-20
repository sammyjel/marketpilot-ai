import { z } from 'zod';
import { buildBackgroundContext } from '@/server/auth/context';
import { flagExpiredConnections } from '@/server/services/social-accounts';
import { dispatchDueScheduledPosts, publishSocialPost, refreshPostStatus } from '@/server/services/publishing';
import { syncAnalytics } from '@/server/services/analytics';
import { generateCampaignImage, pollCampaignVideo, startCampaignVideo } from '@/server/services/media-generation';
import { enqueue } from './queue';
import { registerHandler } from './handlers';

/**
 * Handler registration for the heavier job kinds.
 *
 * Kept out of `handlers.ts` so that importing the queue (to enqueue a job from
 * a request) never pulls the social adapters and media pipeline into the
 * request bundle. The worker imports this module once at startup.
 */
const actorPayload = z.object({ userId: z.uuid(), organizationId: z.uuid() });

const publishPayload = actorPayload.extend({
  socialPostId: z.uuid(),
  checkOnly: z.boolean().optional(),
});

registerHandler('publishing.publish_post', async (job) => {
  const payload = publishPayload.parse(job.payload);
  const ctx = await buildBackgroundContext(payload.userId, payload.organizationId);

  if (payload.checkOnly) {
    await refreshPostStatus(ctx, payload.socialPostId);
    return { checked: payload.socialPostId };
  }

  await publishSocialPost(ctx, payload.socialPostId);
  return { published: payload.socialPostId };
});

registerHandler('publishing.dispatch_scheduled', async () => {
  const dispatched = await dispatchDueScheduledPosts();
  const flagged = await flagExpiredConnections();
  return { dispatched, connectionsFlagged: flagged };
});

const analyticsPayload = actorPayload.extend({ days: z.number().int().min(1).max(90).optional() });

registerHandler('analytics.sync', async (job) => {
  const payload = analyticsPayload.parse(job.payload);
  const ctx = await buildBackgroundContext(payload.userId, payload.organizationId);
  const synced = await syncAnalytics(ctx);
  return { synced };
});

const imagePayload = actorPayload.extend({
  campaignId: z.uuid(),
  conceptIndex: z.number().int().min(0).max(10),
  preserveProduct: z.boolean().optional(),
});

registerHandler('media.generate_image', async (job) => {
  const payload = imagePayload.parse(job.payload);
  const ctx = await buildBackgroundContext(payload.userId, payload.organizationId);
  const result = await generateCampaignImage(ctx, payload.campaignId, {
    conceptIndex: payload.conceptIndex,
    ...(payload.preserveProduct !== undefined ? { preserveProduct: payload.preserveProduct } : {}),
  });
  return result;
});

const videoPayload = actorPayload.extend({
  campaignId: z.uuid(),
  conceptIndex: z.number().int().min(0).max(5).optional(),
  withVoiceover: z.boolean().optional(),
  captions: z.boolean().optional(),
  /** Set once the render has been started, to resume polling. */
  externalId: z.string().optional(),
});

/**
 * Video rendering is long-running, so the job re-queues itself to poll rather
 * than holding a worker slot open for minutes.
 */
registerHandler('media.generate_video', async (job) => {
  const payload = videoPayload.parse(job.payload);
  const ctx = await buildBackgroundContext(payload.userId, payload.organizationId);

  if (!payload.externalId) {
    const started = await startCampaignVideo(ctx, {
      campaignId: payload.campaignId,
      conceptIndex: payload.conceptIndex ?? 0,
      withVoiceover: payload.withVoiceover ?? false,
      captions: payload.captions ?? true,
    });

    await enqueue(
      'media.generate_video',
      { ...payload, externalId: started.externalId },
      {
        organizationId: payload.organizationId,
        runAt: new Date(Date.now() + 30_000),
        dedupeKey: `video-poll:${started.externalId}:0`,
      },
    );

    return { started: started.externalId };
  }

  const result = await pollCampaignVideo(ctx, payload.campaignId, payload.externalId);
  if (!result.done) {
    await enqueue(
      'media.generate_video',
      payload,
      {
        organizationId: payload.organizationId,
        runAt: new Date(Date.now() + 30_000),
        dedupeKey: `video-poll:${payload.externalId}:${Date.now()}`,
      },
    );
    return { polling: payload.externalId };
  }

  return result as Record<string, unknown>;
});

export {};

import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { buildBackgroundContext } from '@/server/auth/context';
import { generateCampaign } from '@/server/services/campaigns';
import { pruneExpiredSessions } from '@/server/auth/session';
import type { JobKind, JobRecord } from './queue';

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown> | void>;

/**
 * Every job payload carries the user and organization it acts for, and the
 * handler rebuilds a full auth context from them. Jobs therefore run with
 * exactly the permissions of the person who queued them — never as a superuser.
 */
const actorPayload = z.object({ userId: z.uuid(), organizationId: z.uuid() });

const generateCampaignPayload = actorPayload.extend({ campaignId: z.uuid() });

const handlers: Partial<Record<JobKind, JobHandler>> = {
  'campaign.generate': async (job) => {
    const payload = generateCampaignPayload.parse(job.payload);
    const ctx = await buildBackgroundContext(payload.userId, payload.organizationId);
    const campaign = await generateCampaign(ctx, payload.campaignId);
    return { campaignId: campaign.id, status: campaign.status };
  },

  'maintenance.prune': async () => {
    const removed = await pruneExpiredSessions();
    return { expiredSessionsRemoved: removed };
  },
};

export function registerHandler(kind: JobKind, handler: JobHandler): void {
  handlers[kind] = handler;
}

export function handlerFor(kind: string): JobHandler | undefined {
  return handlers[kind as JobKind];
}

export function registeredKinds(): string[] {
  return Object.keys(handlers);
}

export async function runJob(job: JobRecord): Promise<Record<string, unknown> | void> {
  const handler = handlerFor(job.kind);
  if (!handler) {
    logger.error('job.no_handler', { kind: job.kind, jobId: job.id, registered: registeredKinds() });
    // A missing handler is a deployment problem, not a transient fault: retrying
    // would fail identically every time, so the job fails immediately.
    throw new AppError('internal_error', `No handler is registered for job kind "${job.kind}".`, {
      retryable: false,
    });
  }
  return handler(job);
}

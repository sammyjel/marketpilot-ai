import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getDb } from '@/server/db';
import { notifications } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';

export type NotificationKind =
  | 'campaign_generated'
  | 'campaign_approved'
  | 'post_published'
  | 'post_failed'
  | 'campaign_scheduled'
  | 'social_connection_expired'
  | 'usage_limit_reached'
  | 'media_ready'
  | 'system';

export type NotificationInput = {
  kind: NotificationKind;
  title: string;
  body?: string;
  linkPath?: string;
  payload?: Record<string, unknown>;
};

/**
 * In-app notifications today. The signature is deliberately transport-agnostic
 * so an email or push channel can be added behind this one call without
 * touching any of the services that emit notifications.
 */
export async function notify(
  organizationId: string,
  userId: string | null,
  input: NotificationInput,
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(notifications).values({
      organizationId,
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      linkPath: input.linkPath ?? null,
      payload: input.payload ?? {},
    });
  } catch (error) {
    // A failed notification must never fail the action that produced it.
    logger.error('notification.write_failed', { kind: input.kind, error });
  }
}

export async function listNotifications(ctx: AuthContext, limit = 30) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.organizationId, ctx.organization.id), eq(notifications.userId, ctx.user.id)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllRead(ctx: AuthContext): Promise<void> {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, ctx.organization.id),
        eq(notifications.userId, ctx.user.id),
        isNull(notifications.readAt),
      ),
    );
}

export async function markRead(ctx: AuthContext, notificationId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organizationId, ctx.organization.id),
        eq(notifications.userId, ctx.user.id),
      ),
    );
}

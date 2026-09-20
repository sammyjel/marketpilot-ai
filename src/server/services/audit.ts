import 'server-only';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { getDb } from '@/server/db';
import { auditLogs } from '@/server/db/schema';

export type AuditEntry = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Writes an audit row. Audit failures must never break the user's action, so
 * errors are logged rather than thrown.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    let ip: string | null = null;
    try {
      ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    } catch {
      // Outside a request scope (worker jobs) there are no headers.
    }

    await db.insert(auditLogs).values({
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
      ipAddress: ip,
    });
  } catch (error) {
    logger.error('audit.write_failed', { action: entry.action, error });
  }
}

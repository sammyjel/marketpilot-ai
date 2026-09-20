import type { Metadata } from 'next';
import { and, desc, eq } from 'drizzle-orm';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { DeleteAccountForm } from '@/components/settings/delete-account-form';
import { relativeTime } from '@/lib/dates';
import { requireAuth } from '@/server/auth/context';
import { getDb } from '@/server/db';
import { auditLogs, sessions } from '@/server/db/schema';

export const metadata: Metadata = { title: 'Account & data' };

export default async function AccountSettingsPage() {
  const ctx = await requireAuth();
  const db = await getDb();

  const [activeSessions, recentActivity] = await Promise.all([
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, ctx.user.id))
      .orderBy(desc(sessions.lastUsedAt))
      .limit(10),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.actorUserId, ctx.user.id), eq(auditLogs.organizationId, ctx.organization.id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(15),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Account & data" description="What is stored about you, and how to remove it." />

      <Card>
        <CardHeader title="Active sessions" description="Signing out or changing your password ends all of them." />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {activeSessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink-900">
                    {session.userAgent?.split(')')[0]?.replace(/^Mozilla\/[\d.]+ \(/, '') ?? 'Unknown device'}
                  </span>
                  <span className="block text-xs text-ink-500">{session.ipAddress ?? 'Unknown address'}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-400">Active {relativeTime(session.lastUsedAt)}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your recent activity" description="From the workspace audit trail." />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="text-sm text-ink-700">{entry.action.replace(/[._]/g, ' ')}</span>
                <span className="text-xs text-ink-400">{relativeTime(entry.createdAt)}</span>
              </li>
            ))}
            {recentActivity.length === 0 ? (
              <li className="px-5 py-4 text-sm text-ink-500">Nothing recorded yet.</li>
            ) : null}
          </ul>
        </CardBody>
      </Card>

      <Card className="border-red-200">
        <CardHeader
          title="Delete your account"
          description="Permanent. Workspaces you solely own are closed with it."
        />
        <CardBody className="space-y-4">
          <Alert tone="danger" title="What happens">
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Your personal details are erased and every session is ended.</li>
              <li>Workspaces where you are the only owner are closed, along with their brands and campaigns.</li>
              <li>Connected social accounts are disconnected and stored tokens are destroyed.</li>
              <li>Posts already published stay on their platforms — delete those there if you need to.</li>
            </ul>
          </Alert>

          <DeleteAccountForm />
        </CardBody>
      </Card>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, PageHeader } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/forms/form-status';
import { relativeTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { requireAuth } from '@/server/auth/context';
import { listNotifications } from '@/server/services/notifications';
import { markNotificationsReadAction } from '@/server/actions/settings';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const ctx = await requireAuth();
  const notifications = await listNotifications(ctx, 50);
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description="In-app for now. The architecture supports email and push without changing what emits them."
        actions={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <SubmitButton variant="outline" pendingLabel="Marking…">
                Mark all read
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <Alert tone="info">
        Email delivery is not configured on this installation, so verification links, password resets and invitations
        are shown to you in the interface or written to the server log instead of being emailed.
      </Alert>

      <Card>
        <CardHeader title="Recent" description={`${unread} unread`} />
        <CardBody className="p-0">
          {notifications.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Bell className="size-8" />}
                title="Nothing yet"
                description="You will hear about generated campaigns, publishing results and anything that needs your attention."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {notifications.map((item) => (
                <li key={item.id} className={cn('px-5 py-3.5', !item.readAt && 'bg-brand-50/40')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{item.title}</p>
                      {item.body ? <p className="mt-0.5 text-sm text-ink-600">{item.body}</p> : null}
                      {item.linkPath ? (
                        <Link
                          href={item.linkPath}
                          className="mt-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
                        >
                          Open
                        </Link>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-ink-400">{relativeTime(item.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

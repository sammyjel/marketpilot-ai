import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { CalendarGrid } from '@/components/calendar/calendar-grid';
import { requireAuth } from '@/server/auth/context';
import { listScheduledPosts } from '@/server/services/publishing';

export const metadata: Metadata = { title: 'Calendar' };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requireAuth();
  const { month } = await searchParams;

  // `month` is an ISO year-month; anything unparseable falls back to today.
  const anchor = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00Z`) : new Date();
  const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 23, 59, 59));

  const posts = await listScheduledPosts(ctx, { from, to });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content calendar"
        description={`Scheduling runs on our servers in ${ctx.user.timezone} — nothing depends on your browser staying open.`}
        actions={
          <Button asChild>
            <Link href="/campaigns/new">Create campaign</Link>
          </Button>
        }
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="Nothing scheduled this month"
          description="Approve a campaign, then use its Schedule tab to queue posts across your connected accounts."
          action={
            <Button asChild variant="outline">
              <Link href="/campaigns">Go to campaigns</Link>
            </Button>
          }
        />
      ) : null}

      <CalendarGrid
        monthIso={`${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`}
        timezone={ctx.user.timezone}
        posts={posts.map((post) => ({
          id: post.id,
          campaignId: post.campaignId,
          campaignTitle: post.campaignTitle,
          platform: post.platform,
          status: post.status,
          accountName: post.accountName,
          scheduledFor: post.scheduledFor?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

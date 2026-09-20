import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { BarChart3, CalendarClock, Package, Plus, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, EmptyState, PageHeader, StatTile } from '@/components/ui/primitives';
import { CampaignStatusBadge } from '@/components/campaigns/status-badge';
import { formatInTimezone, greetingFor } from '@/lib/dates';
import { PLATFORM_META, isPlatform } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { getDb } from '@/server/db';
import { campaigns, products, socialAccounts, socialPosts } from '@/server/db/schema';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const ctx = await requireAuth();
  if (!ctx.user.onboardingCompletedAt) redirect('/onboarding');

  const db = await getDb();
  const orgId = ctx.organization.id;
  const now = new Date();

  const [
    campaignCountRows,
    scheduledCountRows,
    publishedCountRows,
    accountCountRows,
    productCountRows,
    recentCampaigns,
    upcoming,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(campaigns)
      .where(and(eq(campaigns.organizationId, orgId), isNull(campaigns.deletedAt))),
    db
      .select({ value: count() })
      .from(socialPosts)
      .where(and(eq(socialPosts.organizationId, orgId), eq(socialPosts.status, 'pending'), sql`${socialPosts.scheduledFor} is not null`)),
    db
      .select({ value: count() })
      .from(socialPosts)
      .where(and(eq(socialPosts.organizationId, orgId), eq(socialPosts.status, 'published'))),
    db
      .select({ value: count() })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.organizationId, orgId), eq(socialAccounts.isActive, true), isNull(socialAccounts.deletedAt))),
    db
      .select({ value: count() })
      .from(products)
      .where(and(eq(products.organizationId, orgId), isNull(products.deletedAt))),
    db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        status: campaigns.status,
        platforms: campaigns.platforms,
        objective: campaigns.objective,
        updatedAt: campaigns.updatedAt,
      })
      .from(campaigns)
      .where(and(eq(campaigns.organizationId, orgId), isNull(campaigns.deletedAt)))
      .orderBy(desc(campaigns.updatedAt))
      .limit(5),
    db
      .select({
        id: socialPosts.id,
        platform: socialPosts.platform,
        scheduledFor: socialPosts.scheduledFor,
        campaignId: socialPosts.campaignId,
        campaignTitle: campaigns.title,
      })
      .from(socialPosts)
      .innerJoin(campaigns, eq(campaigns.id, socialPosts.campaignId))
      .where(
        and(
          eq(socialPosts.organizationId, orgId),
          eq(socialPosts.status, 'pending'),
          gte(socialPosts.scheduledFor, now),
        ),
      )
      .orderBy(socialPosts.scheduledFor)
      .limit(5),
  ]);

  const stats = {
    campaigns: campaignCountRows[0]?.value ?? 0,
    scheduled: scheduledCountRows[0]?.value ?? 0,
    published: publishedCountRows[0]?.value ?? 0,
    accounts: accountCountRows[0]?.value ?? 0,
    products: productCountRows[0]?.value ?? 0,
  };

  const firstName = ctx.user.name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greetingFor(now, ctx.user.timezone)}${firstName ? `, ${firstName}` : ''}`}
        description="Turn a product into a full campaign, then review everything before it goes out."
        actions={
          <Button asChild size="lg">
            <Link href="/campaigns/new">
              <Plus className="size-4" aria-hidden="true" />
              Create Marketing Campaign
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Campaigns" value={stats.campaigns} />
        <StatTile label="Scheduled" value={stats.scheduled} />
        <StatTile label="Published" value={stats.published} />
        <StatTile label="Products" value={stats.products} />
        <StatTile
          label="Connected accounts"
          value={stats.accounts}
          hint={stats.accounts === 0 ? 'Connect one to publish' : undefined}
          tone={stats.accounts === 0 ? 'danger' : 'neutral'}
        />
      </div>

      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="sr-only">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction href="/campaigns/new" icon={<Sparkles className="size-5" />} label="Create Campaign" />
          <QuickAction href="/products/new" icon={<Package className="size-5" />} label="Add Product" />
          <QuickAction href="/social" icon={<Share2 className="size-5" />} label="Connect Social Account" />
          <QuickAction href="/analytics" icon={<BarChart3 className="size-5" />} label="View Analytics" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent campaigns"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaigns">View all</Link>
              </Button>
            }
          />
          <CardBody className="p-0">
            {recentCampaigns.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No campaigns yet"
                  description="Upload a product photo and a one-line description — the first campaign takes about a minute."
                  action={
                    <Button asChild>
                      <Link href="/campaigns/new">Create your first campaign</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recentCampaigns.map((campaign) => (
                  <li key={campaign.id}>
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-ink-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900">{campaign.title}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {campaign.platforms
                            .filter(isPlatform)
                            .map((platform) => PLATFORM_META[platform].label)
                            .join(' · ') || 'No platforms selected'}
                        </p>
                      </div>
                      <CampaignStatusBadge status={campaign.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming posts" />
          <CardBody className="p-0">
            {upcoming.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">
                Nothing scheduled.{' '}
                <Link href="/calendar" className="font-medium text-brand-600 hover:text-brand-700">
                  Open the calendar
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {upcoming.map((post) => (
                  <li key={post.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: PLATFORM_META[post.platform].color }}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-ink-600">{PLATFORM_META[post.platform].label}</span>
                      <Badge tone="info" className="ml-auto">
                        <CalendarClock className="size-3" aria-hidden="true" />
                        {post.scheduledFor ? formatInTimezone(post.scheduledFor, ctx.user.timezone, 'd MMM, HH:mm') : '—'}
                      </Badge>
                    </div>
                    <Link
                      href={`/campaigns/${post.campaignId}`}
                      className="mt-1 block truncate text-sm font-medium text-ink-900 hover:text-brand-700"
                    >
                      {post.campaignTitle}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--radius-card)] border border-ink-200 bg-white px-4 py-3.5 text-sm font-medium text-ink-800 shadow-xs transition-colors hover:border-brand-300 hover:bg-brand-50/50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      {label}
    </Link>
  );
}

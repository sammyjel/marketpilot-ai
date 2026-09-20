import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, EmptyState, PageHeader, StatTile } from '@/components/ui/primitives';
import { AnalyticsCharts } from '@/components/analytics/charts';
import { InsightsPanel } from '@/components/analytics/insights-panel';
import { SubmitButton } from '@/components/forms/form-status';
import { PLATFORM_META } from '@/lib/platforms';
import { requireCapability } from '@/server/auth/context';
import { getAnalyticsSummary, getFormatPerformance, METRIC_LABELS } from '@/server/services/analytics';
import { syncAnalyticsAction } from '@/server/actions/analytics';

export const metadata: Metadata = { title: 'Analytics' };

const RANGES = [7, 30, 90] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await requireCapability('analytics:read');
  const { days: rawDays } = await searchParams;
  const days = RANGES.includes(Number(rawDays) as never) ? Number(rawDays) : 30;

  const [summary, formats] = await Promise.all([
    getAnalyticsSummary(ctx, days),
    getFormatPerformance(ctx, days),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Pulled from each platform's own API. Metrics a platform does not expose are shown as unavailable, never as zero."
        actions={
          <form action={syncAnalyticsAction}>
            <SubmitButton variant="outline" pendingLabel="Syncing…">
              <RefreshCw className="size-4" aria-hidden="true" />
              Sync now
            </SubmitButton>
          </form>
        }
      />

      <nav className="flex gap-1.5" aria-label="Date range">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/analytics?days=${range}`}
            aria-current={days === range ? 'true' : undefined}
            className={
              days === range
                ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
            }
          >
            Last {range} days
          </Link>
        ))}
      </nav>

      {!summary.hasConnectedAccounts ? (
        <Alert tone="info" title="No connected accounts yet">
          Analytics come from the platforms themselves, so there is nothing to show until you connect an account and
          publish.{' '}
          <Link href="/social" className="font-medium underline">
            Connect an account
          </Link>
        </Alert>
      ) : null}

      {summary.totals.posts === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="No metrics collected yet"
          description={
            summary.publishedPosts > 0
              ? 'Your posts are published but no metrics have come back yet. Platforms usually take a few hours to report. Use “Sync now” to check again.'
              : 'Publish a campaign and metrics will appear here once the platform reports them.'
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Impressions"
              value={summary.totals.impressions?.toLocaleString() ?? 'Unavailable'}
            />
            <StatTile label="Reach" value={summary.totals.reach?.toLocaleString() ?? 'Unavailable'} />
            <StatTile
              label="Engagement rate"
              value={summary.totals.engagementRate !== null ? `${summary.totals.engagementRate}%` : 'Unavailable'}
              hint={summary.totals.engagementRate === null ? 'Needs impressions or reach' : undefined}
            />
            <StatTile label="Posts measured" value={summary.totals.posts} />
          </div>

          {summary.unavailableMetrics.length > 0 ? (
            <Alert tone="info" title="Some metrics are not available">
              <p>
                No connected platform returned{' '}
                {summary.unavailableMetrics.map((metric) => METRIC_LABELS[metric].toLowerCase()).join(', ')} for this
                period. That usually means the platform does not expose it for your account tier — we leave it blank
                rather than estimate.
              </p>
            </Alert>
          ) : null}

          <AnalyticsCharts
            timeseries={summary.timeseries}
            byPlatform={summary.byPlatform.map((entry) => ({
              platform: entry.platform,
              label: entry.label,
              color: PLATFORM_META[entry.platform].color,
              impressions: entry.totals.impressions,
              engagement:
                (entry.totals.likes ?? 0) +
                (entry.totals.comments ?? 0) +
                (entry.totals.shares ?? 0) +
                (entry.totals.saves ?? 0),
              posts: entry.posts,
            }))}
            formats={formats}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Top performing content" description="Ranked by likes, comments, shares and saves." />
              <CardBody className="p-0">
                <ul className="divide-y divide-ink-100">
                  {summary.topContent.map((item) => (
                    <li key={item.socialPostId} className="flex items-center gap-3 px-5 py-3">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: PLATFORM_META[item.platform].color }}
                        aria-hidden="true"
                      />
                      <Link
                        href={`/campaigns/${item.campaignId}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-brand-700"
                      >
                        {item.campaignTitle}
                      </Link>
                      <Badge>{item.engagement.toLocaleString()} engagements</Badge>
                      {item.impressions !== null ? (
                        <Badge tone="neutral">{item.impressions.toLocaleString()} impr.</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <InsightsPanel days={days} />
          </div>
        </>
      )}
    </div>
  );
}

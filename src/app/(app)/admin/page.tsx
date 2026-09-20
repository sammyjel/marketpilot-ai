import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, PageHeader, StatTile } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/dates';
import { requireAuth } from '@/server/auth/context';
import { getDb } from '@/server/db';
import {
  campaigns,
  jobs,
  organizations,
  socialAccounts,
  socialPosts,
  usageRecords,
  users,
} from '@/server/db/schema';

export const metadata: Metadata = { title: 'Admin' };

/**
 * Internal operations view.
 *
 * Platform-admin only, and that is a separate flag from any organization role —
 * an owner of a customer workspace cannot reach this.
 */
export default async function AdminPage() {
  const ctx = await requireAuth();
  if (!ctx.user.isPlatformAdmin) notFound();

  const db = await getDb();
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [
    userCount,
    activeUserCount,
    orgCount,
    campaignCount,
    accountCount,
    publishFailures,
    usageByMetric,
    planBreakdown,
    jobHealth,
    recentOrgs,
  ] = await Promise.all([
    db.select({ value: sql<number>`count(*)` }).from(users),
    db.select({ value: sql<number>`count(*)` }).from(users).where(gte(users.lastLoginAt, since)),
    db.select({ value: sql<number>`count(*)` }).from(organizations),
    db.select({ value: sql<number>`count(*)` }).from(campaigns),
    db.select({ value: sql<number>`count(*)` }).from(socialAccounts),
    db
      .select({ value: sql<number>`count(*)` })
      .from(socialPosts)
      .where(and(eq(socialPosts.status, 'failed'), gte(socialPosts.updatedAt, since))),
    db
      .select({ metric: usageRecords.metric, total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)` })
      .from(usageRecords)
      .where(gte(usageRecords.createdAt, since))
      .groupBy(usageRecords.metric),
    db
      .select({ planTier: organizations.planTier, value: sql<number>`count(*)` })
      .from(organizations)
      .groupBy(organizations.planTier),
    db
      .select({ status: jobs.status, value: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.status),
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        planTier: organizations.planTier,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .limit(10),
  ]);

  const deadLetter = jobHealth.find((row) => row.status === 'dead_letter')?.value ?? 0;
  const failedJobs = jobHealth.find((row) => row.status === 'failed')?.value ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Platform health across every workspace. Last 30 days unless noted." />

      {Number(deadLetter) > 0 || Number(failedJobs) > 0 ? (
        <Alert tone="warning" title="Jobs need attention">
          {Number(failedJobs)} failed and {Number(deadLetter)} in the dead-letter queue. Check the worker logs for the
          underlying error.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Users" value={Number(userCount[0]?.value ?? 0)} hint={`${Number(activeUserCount[0]?.value ?? 0)} active in 30 days`} />
        <StatTile label="Organizations" value={Number(orgCount[0]?.value ?? 0)} />
        <StatTile label="Campaigns" value={Number(campaignCount[0]?.value ?? 0)} />
        <StatTile label="Connected accounts" value={Number(accountCount[0]?.value ?? 0)} />
        <StatTile
          label="Publishing failures"
          value={Number(publishFailures[0]?.value ?? 0)}
          tone={Number(publishFailures[0]?.value ?? 0) > 0 ? 'danger' : 'neutral'}
        />
        <StatTile label="Jobs queued" value={Number(jobHealth.find((row) => row.status === 'queued')?.value ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="AI usage" description="Units consumed in the last 30 days." />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {usageByMetric.length === 0 ? (
                <li className="px-5 py-4 text-sm text-ink-500">No usage recorded yet.</li>
              ) : (
                usageByMetric.map((row) => (
                  <li key={row.metric} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="text-sm capitalize text-ink-700">{row.metric.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-medium tabular-nums text-ink-900">
                      {Number(row.total).toLocaleString()}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Subscriptions" />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {planBreakdown.map((row) => (
                <li key={row.planTier} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <Badge tone={row.planTier === 'free' ? 'neutral' : 'brand'}>{row.planTier}</Badge>
                  <span className="text-sm font-medium tabular-nums text-ink-900">{Number(row.value)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Job queue" description="All time." />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {jobHealth.map((row) => (
                <li key={row.status} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="text-sm capitalize text-ink-700">{row.status.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-medium tabular-nums text-ink-900">{Number(row.value)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Newest workspaces" />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {recentOrgs.map((org) => (
                <li key={org.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 truncate text-sm text-ink-900">{org.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge>{org.planTier}</Badge>
                    <span className="text-xs text-ink-400">{relativeTime(org.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

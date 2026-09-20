import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { CampaignStatusBadge } from '@/components/campaigns/status-badge';
import { relativeTime } from '@/lib/dates';
import { isPlatform, PLATFORM_META } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { listCampaigns, OBJECTIVE_LABELS, type CampaignObjective } from '@/server/services/campaigns';
import { getCampaignPerformance } from '@/server/services/analytics';

export const metadata: Metadata = { title: 'Campaigns' };

const STATUS_FILTERS = [
  ['', 'All'],
  ['needs_review', 'Needs review'],
  ['approved', 'Approved'],
  ['scheduled', 'Scheduled'],
  ['published', 'Published'],
  ['failed', 'Failed'],
] as const;

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string; status?: string }>;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;

  const [brands, campaigns] = await Promise.all([
    listBrands(ctx),
    listCampaigns(ctx, {
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.status ? { status: params.status } : {}),
    }),
  ]);

  const performance = await getCampaignPerformance(
    ctx,
    campaigns.map((campaign) => campaign.id),
  );
  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));

  function filterHref(next: { brandId?: string; status?: string }): string {
    const query = new URLSearchParams();
    const brandId = next.brandId ?? params.brandId;
    const status = next.status ?? params.status;
    if (brandId) query.set('brandId', brandId);
    if (status) query.set('status', status);
    const search = query.toString();
    return search ? `/campaigns?${search}` : '/campaigns';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Every campaign, from first draft to published."
        actions={
          ctx.can('campaign:generate') ? (
            <Button asChild>
              <Link href="/campaigns/new">
                <Plus className="size-4" aria-hidden="true" />
                Create campaign
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter by status">
          {STATUS_FILTERS.map(([value, label]) => (
            <Link
              key={value || 'all'}
              href={value ? filterHref({ status: value }) : filterHref({ status: '' })}
              aria-current={(params.status ?? '') === value ? 'true' : undefined}
              className={
                (params.status ?? '') === value
                  ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
              }
            >
              {label}
            </Link>
          ))}
        </nav>

        {brands.length > 1 ? (
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter by brand">
            <Link
              href={filterHref({ brandId: '' })}
              className={
                !params.brandId
                  ? 'rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
              }
            >
              All brands
            </Link>
            {brands.map((brand) => (
              <Link
                key={brand.id}
                href={filterHref({ brandId: brand.id })}
                className={
                  params.brandId === brand.id
                    ? 'rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-white'
                    : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
                }
              >
                {brand.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-8" />}
          title={params.status || params.brandId ? 'Nothing matches those filters' : 'No campaigns yet'}
          description={
            params.status || params.brandId
              ? 'Try clearing the filters.'
              : 'Pick a product, choose where it should go, and the AI writes each platform separately.'
          }
          action={
            ctx.can('campaign:generate') ? (
              <Button asChild>
                <Link href="/campaigns/new">Create your first campaign</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-3">
          {campaigns.map((campaign) => {
            const stats = performance.get(campaign.id);
            return (
              <li key={campaign.id}>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="block rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-ink-900">{campaign.title}</h2>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {brandNames.get(campaign.brandId) ?? 'Unknown brand'} ·{' '}
                        {OBJECTIVE_LABELS[campaign.objective as CampaignObjective] ?? campaign.objective} · updated{' '}
                        {relativeTime(campaign.updatedAt)}
                      </p>
                    </div>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {campaign.platforms.filter(isPlatform).map((platform) => (
                      <span
                        key={platform}
                        className="flex items-center gap-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: PLATFORM_META[platform].color }}
                          aria-hidden="true"
                        />
                        {PLATFORM_META[platform].label}
                      </span>
                    ))}

                    {stats ? (
                      <span className="ml-auto flex gap-2">
                        {stats.impressions !== null ? (
                          <Badge>{stats.impressions.toLocaleString()} impressions</Badge>
                        ) : null}
                        <Badge>{stats.engagement.toLocaleString()} engagements</Badge>
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

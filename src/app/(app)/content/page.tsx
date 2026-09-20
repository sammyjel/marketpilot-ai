import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Search } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ContentStatusBadge } from '@/components/campaigns/status-badge';
import { relativeTime } from '@/lib/dates';
import { isPlatform, PLATFORMS, PLATFORM_META } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { contentCountsByStatus, searchContent } from '@/server/services/content-library';

export const metadata: Metadata = { title: 'Content library' };

const STATUSES = ['draft', 'generated', 'flagged', 'approved', 'scheduled', 'published', 'failed'] as const;

export default async function ContentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brandId?: string; platform?: string; status?: string }>;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;

  const [brands, rows, counts] = await Promise.all([
    listBrands(ctx),
    searchContent(ctx, {
      ...(params.q ? { search: params.q } : {}),
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.platform && isPlatform(params.platform) ? { platform: params.platform } : {}),
      ...(params.status ? { status: params.status } : {}),
      limit: 60,
    }),
    contentCountsByStatus(ctx),
  ]);

  function href(next: Record<string, string | undefined>): string {
    const query = new URLSearchParams();
    const merged = { q: params.q, brandId: params.brandId, platform: params.platform, status: params.status, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value) query.set(key, value);
    }
    const search = query.toString();
    return search ? `/content?${search}` : '/content';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content library"
        description="Every piece the AI has written for you, across all campaigns."
      />

      <Card>
        <CardBody className="space-y-3">
          <form action="/content" method="get" className="flex gap-2">
            {params.brandId ? <input type="hidden" name="brandId" value={params.brandId} /> : null}
            {params.platform ? <input type="hidden" name="platform" value={params.platform} /> : null}
            {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Search captions, scripts and campaign names"
                aria-label="Search content"
                className="w-full rounded-lg border border-ink-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-3">
            <FilterRow label="Status">
              <Chip href={href({ status: undefined })} active={!params.status}>
                All
              </Chip>
              {STATUSES.map((status) => (
                <Chip key={status} href={href({ status })} active={params.status === status}>
                  {status.replace(/_/g, ' ')}
                  {counts[status] ? <span className="ml-1 opacity-60">{counts[status]}</span> : null}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Platform">
              <Chip href={href({ platform: undefined })} active={!params.platform}>
                All
              </Chip>
              {PLATFORMS.map((platform) => (
                <Chip key={platform} href={href({ platform })} active={params.platform === platform}>
                  {PLATFORM_META[platform].label}
                </Chip>
              ))}
            </FilterRow>

            {brands.length > 1 ? (
              <FilterRow label="Brand">
                <Chip href={href({ brandId: undefined })} active={!params.brandId}>
                  All
                </Chip>
                {brands.map((brand) => (
                  <Chip key={brand.id} href={href({ brandId: brand.id })} active={params.brandId === brand.id}>
                    {brand.name}
                  </Chip>
                ))}
              </FilterRow>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title="Nothing matches"
          description="Try a different search or clear the filters."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/campaigns/${row.campaignId}?tab=${row.platform}`}
                className="block rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: PLATFORM_META[row.platform].color }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-ink-900">{PLATFORM_META[row.platform].label}</span>
                  <Badge>{row.format.replace(/_/g, ' ')}</Badge>
                  <ContentStatusBadge status={row.status as never} />
                  {row.qualityFlagCount > 0 ? (
                    <Badge tone="warning">
                      {row.qualityFlagCount} flag{row.qualityFlagCount === 1 ? '' : 's'}
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-xs text-ink-400">{relativeTime(row.updatedAt)}</span>
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-ink-700">{row.preview || 'No text content.'}</p>

                <p className="mt-2 text-xs text-ink-500">
                  {row.campaignTitle} · {row.brandName}
                  {row.productName ? ` · ${row.productName}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium capitalize text-white'
          : 'rounded-full bg-white px-2.5 py-1 text-xs font-medium capitalize text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
      }
    >
      {children}
    </Link>
  );
}

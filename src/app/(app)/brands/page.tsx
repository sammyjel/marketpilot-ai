import type { Metadata } from 'next';
import Link from 'next/link';
import { Palette, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { isPlatform, PLATFORM_META } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';

export const metadata: Metadata = { title: 'Brands' };

export default async function BrandsPage() {
  const ctx = await requireAuth();
  const brands = await listBrands(ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brands"
        description={
          ctx.organization.isAgency
            ? 'Each client is a separate brand. Products, accounts and analytics never mix between them.'
            : 'The voice, market and platforms the AI writes for.'
        }
        actions={
          ctx.can('brand:write') ? (
            <Button asChild>
              <Link href="/brands/new">
                <Plus className="size-4" aria-hidden="true" />
                New brand
              </Link>
            </Button>
          ) : null
        }
      />

      {brands.length === 0 ? (
        <EmptyState
          icon={<Palette className="size-8" />}
          title="No brands yet"
          description="A brand holds your voice, audience and market so every campaign sounds like you."
          action={
            ctx.can('brand:write') ? (
              <Button asChild>
                <Link href="/brands/new">Create your first brand</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/brands/${brand.id}`}
                className="block h-full rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink-900">{brand.name}</h2>
                    <p className="mt-0.5 truncate text-sm text-ink-500">{brand.industry || 'No industry set'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1" aria-hidden="true">
                    {(brand.colors.length > 0 ? brand.colors : ['#e2e8f0']).slice(0, 3).map((color, index) => (
                      <span
                        key={`${color}-${index}`}
                        className="size-5 rounded-full ring-1 ring-inset ring-black/5"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {brand.clientLabel ? (
                  <p className="mt-2">
                    <Badge tone="brand">{brand.clientLabel}</Badge>
                  </p>
                ) : null}

                <p className="mt-3 line-clamp-2 text-sm text-ink-600">
                  {brand.description || 'No description yet.'}
                </p>

                <div className="mt-4 flex flex-wrap gap-1">
                  <Badge>{brand.tone}</Badge>
                  <Badge>{brand.country}</Badge>
                  <Badge>{brand.language.toUpperCase()}</Badge>
                </div>

                {brand.activePlatforms.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {brand.activePlatforms.filter(isPlatform).map((platform) => (
                      <span
                        key={platform}
                        title={PLATFORM_META[platform].label}
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: PLATFORM_META[platform].color }}
                      />
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

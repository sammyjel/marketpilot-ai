import type { Metadata } from 'next';
import Link from 'next/link';
import { Package, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageHeader } from '@/components/ui/primitives';
import { ProductThumb } from '@/components/products/product-thumb';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { getProductAssets, listProducts } from '@/server/services/products';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ brandId?: string }> }) {
  const ctx = await requireAuth();
  const { brandId } = await searchParams;

  const [brands, products] = await Promise.all([
    listBrands(ctx),
    listProducts(ctx, brandId ? { brandId } : {}),
  ]);

  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));

  // One asset lookup per product keeps the list simple; the page is paginated.
  const thumbnails = await Promise.all(
    products.map(async (product) => {
      const assets = await getProductAssets(ctx, product.id);
      const primary = assets[0];
      return {
        productId: product.id,
        key: primary?.thumbnailKey ?? primary?.storageKey ?? null,
        kind: primary?.kind ?? null,
      };
    }),
  );
  const thumbByProduct = new Map(thumbnails.map((entry) => [entry.productId, entry]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Everything you can turn into a campaign."
        actions={
          ctx.can('product:write') ? (
            <Button asChild>
              <Link href="/products/new">
                <Plus className="size-4" aria-hidden="true" />
                Add product
              </Link>
            </Button>
          ) : null
        }
      />

      {brands.length > 1 ? (
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter by brand">
          <FilterChip href="/products" active={!brandId} label="All brands" />
          {brands.map((brand) => (
            <FilterChip
              key={brand.id}
              href={`/products?brandId=${brand.id}`}
              active={brandId === brand.id}
              label={brand.name}
            />
          ))}
        </nav>
      ) : null}

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="size-8" />}
          title="No products yet"
          description="Upload one photo and a one-line description. That is genuinely all the AI needs to start."
          action={
            ctx.can('product:write') ? (
              <Button asChild>
                <Link href="/products/new">Add your first product</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const thumb = thumbByProduct.get(product.id);
            return (
              <li key={product.id}>
                <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-xs transition-shadow hover:shadow-md">
                  <Link href={`/products/${product.id}`} className="block">
                    <ProductThumb storageKey={thumb?.key ?? null} kind={thumb?.kind ?? null} alt={product.name} />
                  </Link>
                  <div className="flex flex-1 flex-col p-4">
                    <Link href={`/products/${product.id}`} className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-ink-900">{product.name}</h2>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {brandNames.get(product.brandId) ?? 'Unknown brand'}
                      </p>
                    </Link>
                    <p className="mt-2 line-clamp-2 flex-1 text-xs text-ink-600">
                      {product.description || 'No description yet.'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {product.price ? (
                        <Badge>
                          {product.currency ?? 'USD'} {product.price}
                        </Badge>
                      ) : (
                        <span />
                      )}
                      {ctx.can('campaign:generate') ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/campaigns/new?productId=${product.id}`}>
                            <Sparkles className="size-3.5" aria-hidden="true" />
                            Campaign
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={
        active
          ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
          : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
      }
    >
      {label}
    </Link>
  );
}

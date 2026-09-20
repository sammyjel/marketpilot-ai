import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/primitives';
import { ProductForm } from '@/components/products/product-form';
import { DeleteProductButton } from '@/components/products/delete-product-button';
import { ProductAnalysisPanel } from '@/components/products/analysis-panel';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { getProduct, getProductAssets } from '@/server/services/products';
import { updateProductAction } from '@/server/actions/products';

export const metadata: Metadata = { title: 'Product' };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();

  const [product, assets, brands] = await Promise.all([
    getProduct(ctx, id),
    getProductAssets(ctx, id),
    listBrands(ctx),
  ]);

  const action = updateProductAction.bind(null, product.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={product.name}
        description={brands.find((brand) => brand.id === product.brandId)?.name ?? ''}
        actions={
          <>
            {ctx.can('campaign:generate') ? (
              <Button asChild>
                <Link href={`/campaigns/new?productId=${product.id}`}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  Create campaign
                </Link>
              </Button>
            ) : null}
            {ctx.can('product:delete') ? (
              <DeleteProductButton productId={product.id} productName={product.name} />
            ) : null}
          </>
        }
      />

      <ProductAnalysisPanel analysis={product.analysis} analyzedAt={product.analyzedAt} />

      <ProductForm
        action={action}
        submitLabel="Save changes"
        brands={brands.map((brand) => ({ id: brand.id, name: brand.name, currency: brand.currency }))}
        existingMedia={assets.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          url: `/api/media/file/${encodeURIComponent(asset.thumbnailKey ?? asset.storageKey)}`,
        }))}
        values={{
          brandId: product.brandId,
          name: product.name,
          description: product.description ?? '',
          productUrl: product.productUrl ?? '',
          price: product.price ?? '',
          currency: product.currency ?? 'USD',
          category: product.category ?? '',
          targetAudience: product.targetAudience ?? '',
          callToAction: product.callToAction ?? '',
          benefits: product.benefits.join('\n'),
          features: product.features.join('\n'),
          keywords: product.keywords.join(', '),
        }}
      />
    </div>
  );
}

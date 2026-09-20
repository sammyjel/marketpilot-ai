import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { ProductForm } from '@/components/products/product-form';
import { requireCapability } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { createProductAction } from '@/server/actions/products';

export const metadata: Metadata = { title: 'Add product' };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ brandId?: string }> }) {
  const ctx = await requireCapability('product:write');
  const { brandId } = await searchParams;
  const brands = await listBrands(ctx);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add product" description="One photo and one sentence is enough to generate a campaign." />

      {brands.length === 0 ? (
        <Alert tone="warning" title="Create a brand first">
          Products belong to a brand so the AI knows the voice and market to write for.{' '}
          <Button asChild size="sm" variant="outline" className="ml-1">
            <Link href="/brands/new">Create a brand</Link>
          </Button>
        </Alert>
      ) : null}

      <ProductForm
        action={createProductAction}
        submitLabel="Save product"
        brands={brands.map((brand) => ({ id: brand.id, name: brand.name, currency: brand.currency }))}
        values={{
          brandId: brandId ?? brands[0]?.id ?? '',
          name: '',
          description: '',
          productUrl: '',
          price: '',
          currency: brands[0]?.currency ?? 'USD',
          category: '',
          targetAudience: '',
          callToAction: '',
          benefits: '',
          features: '',
          keywords: '',
        }}
      />
    </div>
  );
}

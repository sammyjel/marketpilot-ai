import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { CampaignWizard } from '@/components/campaigns/campaign-wizard';
import { requireCapability } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { listProducts } from '@/server/services/products';
import { listTemplates } from '@/server/services/templates';
import { remainingFor } from '@/server/services/usage';

export const metadata: Metadata = { title: 'Create campaign' };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; brandId?: string; template?: string }>;
}) {
  const ctx = await requireCapability('campaign:generate');
  const params = await searchParams;

  const [brands, products, templates, remaining] = await Promise.all([
    listBrands(ctx),
    listProducts(ctx, { limit: 200 }),
    listTemplates(ctx),
    remainingFor(ctx, 'ai_generation'),
  ]);

  const ready = brands.length > 0 && products.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Create Campaign"
        description="Pick a product, choose where it should go, and the AI writes each platform separately."
      />

      {!ready ? (
        <Alert tone="warning" title="One thing first">
          {brands.length === 0 ? (
            <>
              You need a brand before you can generate a campaign.{' '}
              <Button asChild size="sm" variant="outline" className="ml-1">
                <Link href="/brands/new">Create a brand</Link>
              </Button>
            </>
          ) : (
            <>
              Add a product and the AI has something to write about.{' '}
              <Button asChild size="sm" variant="outline" className="ml-1">
                <Link href="/products/new">Add a product</Link>
              </Button>
            </>
          )}
        </Alert>
      ) : null}

      {remaining !== null && remaining < 8 ? (
        <Alert tone={remaining === 0 ? 'danger' : 'warning'} title="AI generation allowance">
          {remaining === 0
            ? 'You have used all of this month’s AI generations. Upgrade your plan to generate more.'
            : `${remaining} AI generations left this month. A campaign uses roughly one per platform plus three.`}
        </Alert>
      ) : null}

      {ready ? (
        <CampaignWizard
          brands={brands.map((brand) => ({
            id: brand.id,
            name: brand.name,
            tone: brand.tone,
            language: brand.language,
            targetAudience: brand.targetAudience ?? '',
            activePlatforms: brand.activePlatforms,
          }))}
          products={products.map((product) => ({
            id: product.id,
            brandId: product.brandId,
            name: product.name,
            description: product.description ?? '',
          }))}
          templates={templates.map((template) => ({
            key: template.key,
            name: template.name,
            description: template.description ?? '',
            objective: template.objective,
            defaultPlatforms: template.defaultPlatforms,
            defaultFormats: template.defaultFormats,
          }))}
          initialProductId={params.productId ?? ''}
          initialBrandId={params.brandId ?? ''}
          initialTemplate={params.template ?? ''}
        />
      ) : null}
    </div>
  );
}

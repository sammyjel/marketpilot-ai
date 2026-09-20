import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/primitives';
import { BrandForm } from '@/components/brands/brand-form';
import { DeleteBrandButton } from '@/components/brands/delete-brand-button';
import { requireAuth } from '@/server/auth/context';
import { getBrand } from '@/server/services/brands';
import { updateBrandAction } from '@/server/actions/brands';

export const metadata: Metadata = { title: 'Brand settings' };

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();
  const brand = await getBrand(ctx, id);

  // Bind the brand id server-side; the client never supplies it.
  const action = updateBrandAction.bind(null, brand.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={brand.name}
        description={`Created ${brand.createdAt.toISOString().slice(0, 10)} · ${brand.slug}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/products?brandId=${brand.id}`}>View products</Link>
            </Button>
            {ctx.can('brand:delete') ? <DeleteBrandButton brandId={brand.id} brandName={brand.name} /> : null}
          </>
        }
      />

      <BrandForm
        action={action}
        submitLabel="Save changes"
        isAgency={ctx.organization.isAgency}
        values={{
          name: brand.name,
          clientLabel: brand.clientLabel ?? '',
          websiteUrl: brand.websiteUrl ?? '',
          description: brand.description ?? '',
          industry: brand.industry ?? '',
          targetAudience: brand.targetAudience ?? '',
          country: brand.country,
          language: brand.language,
          currency: brand.currency,
          timezone: brand.timezone,
          tone: brand.tone,
          voiceNotes: brand.voiceNotes ?? '',
          preferredCta: brand.preferredCta ?? '',
          guidelines: brand.guidelines ?? '',
          colors: brand.colors,
          activePlatforms: brand.activePlatforms,
        }}
      />
    </div>
  );
}

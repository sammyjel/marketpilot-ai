import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { BrandForm } from '@/components/brands/brand-form';
import { requireCapability } from '@/server/auth/context';
import { createBrandAction } from '@/server/actions/brands';

export const metadata: Metadata = { title: 'New brand' };

export default async function NewBrandPage() {
  const ctx = await requireCapability('brand:write');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New brand" description="Only the name is required — everything else sharpens the AI output." />
      <BrandForm
        action={createBrandAction}
        submitLabel="Create brand"
        isAgency={ctx.organization.isAgency}
        values={{
          name: '',
          clientLabel: '',
          websiteUrl: '',
          description: '',
          industry: '',
          targetAudience: '',
          country: 'US',
          language: 'en',
          currency: 'USD',
          timezone: ctx.user.timezone,
          tone: 'friendly',
          voiceNotes: '',
          preferredCta: '',
          guidelines: '',
          colors: [],
          activePlatforms: ['instagram', 'facebook'],
        }}
      />
    </div>
  );
}

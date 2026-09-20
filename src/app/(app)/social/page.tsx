import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { SocialAccountsManager } from '@/components/social/accounts-manager';
import { platformAvailability } from '@/providers/social';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { listSocialAccounts } from '@/server/services/social-accounts';

export const metadata: Metadata = { title: 'Social accounts' };

export default async function SocialAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; brandId?: string }>;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;

  const [brands, accounts] = await Promise.all([listBrands(ctx), listSocialAccounts(ctx)]);
  const availability = platformAvailability();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social accounts"
        description="Connect the accounts you want to publish to. We never ask for your social passwords — every connection uses the platform's own login."
      />

      {params.connected ? (
        <Alert tone="success" title="Connected">
          {params.connected} account{params.connected === '1' ? '' : 's'} connected successfully.
        </Alert>
      ) : null}

      {params.error ? (
        <Alert tone="danger" title="That did not work">
          {decodeURIComponent(params.error)}
        </Alert>
      ) : null}

      {brands.length === 0 ? (
        <Alert tone="warning" title="Create a brand first">
          Connected accounts belong to a brand, so agencies can keep clients separate.{' '}
          <Button asChild size="sm" variant="outline" className="ml-1">
            <Link href="/brands/new">Create a brand</Link>
          </Button>
        </Alert>
      ) : (
        <SocialAccountsManager
          brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
          accounts={accounts.map((account) => ({
            id: account.id,
            platform: account.platform,
            displayName: account.displayName,
            username: account.username,
            brandId: account.brandId,
            needsReconnect: account.needsReconnect,
            isMock: account.isMock,
            tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
            lastValidatedAt: account.lastValidatedAt?.toISOString() ?? null,
          }))}
          availability={availability}
          defaultBrandId={params.brandId ?? brands[0]?.id ?? ''}
          canConnect={ctx.can('social:connect')}
        />
      )}
    </div>
  );
}

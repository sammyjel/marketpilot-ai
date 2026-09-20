import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { PageHeader } from '@/components/ui/primitives';
import { CampaignStatusBadge } from '@/components/campaigns/status-badge';
import { CampaignWorkspace } from '@/components/campaigns/campaign-workspace';
import { CampaignActions } from '@/components/campaigns/campaign-actions';
import { GenerationProgress } from '@/components/campaigns/generation-progress';
import { isPlatform } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { getDb } from '@/server/db';
import { brands, mediaAssets, productAssets, products } from '@/server/db/schema';
import { getCampaign, getCampaignContent, listVersions } from '@/server/services/campaigns';
import { listSocialAccounts } from '@/server/services/social-accounts';
import { getCampaignPosts } from '@/server/services/publishing';
import { listCampaignMedia } from '@/server/services/media-generation';
import { mediaCapabilities } from '@/providers/media';
import { isMockAi } from '@/providers/ai';

export const metadata: Metadata = { title: 'Campaign' };

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const ctx = await requireAuth();

  const campaign = await getCampaign(ctx, id).catch(() => null);
  if (!campaign) notFound();

  const db = await getDb();

  const [pieces, versions, brandRows, accounts, posts, creativeAssets] = await Promise.all([
    getCampaignContent(ctx, campaign.id),
    listVersions(ctx, campaign.id),
    db.select().from(brands).where(eq(brands.id, campaign.brandId)).limit(1),
    listSocialAccounts(ctx, { brandId: campaign.brandId }),
    getCampaignPosts(ctx, campaign.id),
    listCampaignMedia(ctx, campaign.id),
  ]);

  // The creative brief is stored alongside the quality report.
  const brief = (campaign.qualityReport as { creativeBrief?: { concepts?: unknown[]; videoConcepts?: unknown[] } } | null)
    ?.creativeBrief;

  const brand = brandRows[0];

  // The product's primary image doubles as the preview creative until
  // generated media exists.
  let mediaKey: string | null = null;
  let mediaKind: string | null = null;
  let productName = '';

  if (campaign.productId) {
    const [productRow] = await db
      .select({ name: products.name })
      .from(products)
      .where(and(eq(products.id, campaign.productId), eq(products.organizationId, ctx.organization.id)))
      .limit(1);
    productName = productRow?.name ?? '';

    const [asset] = await db
      .select({ media: mediaAssets })
      .from(productAssets)
      .innerJoin(mediaAssets, eq(mediaAssets.id, productAssets.mediaAssetId))
      .where(eq(productAssets.productId, campaign.productId))
      .orderBy(desc(productAssets.isPrimary), productAssets.position)
      .limit(1);

    mediaKey = asset?.media.thumbnailKey ?? asset?.media.storageKey ?? null;
    mediaKind = asset?.media.kind ?? null;
  }

  const isGenerating = campaign.status === 'generating' || campaign.status === 'draft';

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <CampaignStatusBadge status={campaign.status} />
            <span className="text-ink-400">·</span>
            <span>{brand?.name}</span>
            {productName ? (
              <>
                <span className="text-ink-400">·</span>
                <span>{productName}</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <CampaignActions
            campaignId={campaign.id}
            status={campaign.status}
            canApprove={ctx.can('campaign:approve')}
            canGenerate={ctx.can('campaign:generate')}
            canDelete={ctx.can('campaign:delete')}
          />
        }
      />

      {isGenerating ? (
        <GenerationProgress campaignId={campaign.id} status={campaign.status} error={campaign.generationError} />
      ) : null}

      <CampaignWorkspace
        campaign={{
          id: campaign.id,
          title: campaign.title,
          status: campaign.status,
          objective: campaign.objective,
          tone: campaign.tone,
          language: campaign.language,
          platforms: campaign.platforms.filter(isPlatform),
          formats: campaign.formats,
          strategy: campaign.strategy,
          seo: campaign.seo,
          qualityReport: campaign.qualityReport,
          generationError: campaign.generationError,
        }}
        content={pieces.map((piece) => ({
          id: piece.id,
          platform: piece.platform,
          format: piece.format,
          status: piece.status,
          fields: piece.fields,
          hashtags: piece.hashtags,
          qualityFlags: piece.qualityFlags,
        }))}
        brand={{
          name: brand?.name ?? 'Your brand',
          handle: brand?.slug ?? 'yourbrand',
          avatarKey: null,
        }}
        media={{ key: mediaKey, kind: mediaKind }}
        versions={versions.map((version) => ({
          version: version.version,
          label: version.label,
          createdAt: version.createdAt.toISOString(),
        }))}
        accounts={accounts.map((account) => ({
          id: account.id,
          platform: account.platform,
          displayName: account.displayName,
          needsReconnect: account.needsReconnect,
        }))}
        posts={posts.map((post) => ({
          id: post.id,
          platform: post.platform,
          status: post.status,
          scheduledFor: post.scheduledFor?.toISOString() ?? null,
          externalPermalink: post.externalPermalink,
          lastErrorMessage: post.lastErrorMessage,
          manualReason: post.manualReason,
        }))}
        creative={{
          concepts: (brief?.concepts ?? []) as never,
          videoConcepts: (brief?.videoConcepts ?? []) as never,
          assets: creativeAssets.map((entry) => ({
            id: entry.media.id,
            storageKey: entry.media.storageKey,
            thumbnailKey: entry.media.thumbnailKey,
            kind: entry.media.kind,
            role: entry.role,
            producedBy: String(entry.media.metadata['producedBy'] ?? 'unknown'),
            preservedProduct: entry.media.metadata['preservedProduct'] === true,
          })),
        }}
        mediaCapabilities={mediaCapabilities()}
        initialTab={tab ?? 'overview'}
        timezone={ctx.user.timezone}
        canEdit={ctx.can('campaign:write')}
        canPublish={ctx.can('campaign:publish')}
        canSchedule={ctx.can('campaign:schedule')}
        mockAi={isMockAi()}
      />
    </div>
  );
}

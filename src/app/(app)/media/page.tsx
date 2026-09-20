import type { Metadata } from 'next';
import Link from 'next/link';
import { Images, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageHeader, StatTile } from '@/components/ui/primitives';
import { ProductThumb } from '@/components/products/product-thumb';
import { MediaUploader } from '@/components/media/media-uploader';
import { DeleteMediaButton } from '@/components/media/delete-media-button';
import { relativeTime } from '@/lib/dates';
import { planFor } from '@/lib/plans';
import { requireAuth } from '@/server/auth/context';
import { listBrands } from '@/server/services/brands';
import { listMedia } from '@/server/services/media';

export const metadata: Metadata = { title: 'Media library' };

const SOURCE_LABELS: Record<string, string> = {
  upload: 'Uploaded',
  ai_image: 'Generated image',
  ai_video: 'Generated video',
  ai_voice: 'Generated voice',
  derived: 'Derived',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string; kind?: string }>;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;

  const [brands, assets] = await Promise.all([
    listBrands(ctx),
    listMedia(ctx, {
      ...(params.brandId ? { brandId: params.brandId } : {}),
      ...(params.kind === 'image' || params.kind === 'video' ? { kind: params.kind } : {}),
      limit: 120,
    }),
  ]);

  const usedBytes = assets.reduce((total, asset) => total + asset.byteSize, 0);
  const storageLimit = planFor(ctx.organization.planTier).limits.storage_bytes;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media library"
        description="Product photos you uploaded and creative the AI produced, in one place."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Files" value={assets.length} />
        <StatTile
          label="Storage used"
          value={formatBytes(usedBytes)}
          hint={storageLimit ? `of ${formatBytes(storageLimit)} on your plan` : 'Unlimited on your plan'}
        />
        <StatTile label="Generated" value={assets.filter((asset) => asset.source !== 'upload').length} />
      </div>

      {ctx.can('media:write') ? <MediaUploader brands={brands.map((b) => ({ id: b.id, name: b.name }))} /> : null}

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter media">
        <Chip href="/media" active={!params.kind && !params.brandId}>
          All
        </Chip>
        <Chip href="/media?kind=image" active={params.kind === 'image'}>
          Images
        </Chip>
        <Chip href="/media?kind=video" active={params.kind === 'video'}>
          Video
        </Chip>
        {brands.length > 1
          ? brands.map((brand) => (
              <Chip key={brand.id} href={`/media?brandId=${brand.id}`} active={params.brandId === brand.id}>
                {brand.name}
              </Chip>
            ))
          : null}
      </nav>

      {assets.length === 0 ? (
        <EmptyState
          icon={<Images className="size-8" />}
          title="No media yet"
          description="Upload a product photo, or generate creative from a campaign's Media tab."
          action={
            <Button asChild variant="outline">
              <Link href="/products/new">
                <Upload className="size-4" aria-hidden="true" />
                Add a product
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => (
            <li key={asset.id} className="overflow-hidden rounded-[var(--radius-card)] border border-ink-200 bg-white">
              <ProductThumb
                storageKey={asset.thumbnailKey ?? asset.storageKey}
                kind={asset.kind}
                alt={asset.altText ?? asset.originalFilename ?? 'Media asset'}
                className="aspect-square"
              />
              <div className="space-y-1.5 p-3">
                <p className="truncate text-xs font-medium text-ink-900">
                  {asset.originalFilename ?? `${asset.kind} asset`}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={asset.source === 'upload' ? 'neutral' : 'brand'}>
                    {SOURCE_LABELS[asset.source] ?? asset.source}
                  </Badge>
                  {asset.width && asset.height ? (
                    <Badge>
                      {asset.width}×{asset.height}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-ink-400">
                  {formatBytes(asset.byteSize)} · {relativeTime(asset.createdAt)}
                </p>
                <div className="flex items-center justify-between gap-1 pt-1">
                  <a
                    href={`/api/media/file/${encodeURIComponent(asset.storageKey)}`}
                    download
                    className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                  >
                    Download
                  </a>
                  {ctx.can('media:write') ? <DeleteMediaButton mediaId={asset.id} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
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
          ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
          : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
      }
    >
      {children}
    </Link>
  );
}

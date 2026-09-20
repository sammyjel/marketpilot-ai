import { Bookmark, Heart, MessageCircle, MoreHorizontal, Music2, Repeat2, Send, Share2, ThumbsUp } from 'lucide-react';
import { ProductThumb } from '@/components/products/product-thumb';
import type { Platform } from '@/lib/platforms';

export type PreviewBrand = {
  name: string;
  handle: string;
  /** Storage key of the brand logo or product image used as the avatar. */
  avatarKey: string | null;
};

export type PreviewProps = {
  platform: Platform;
  brand: PreviewBrand;
  fields: Record<string, unknown>;
  hashtags: string[];
  mediaKey: string | null;
  mediaKind: string | null;
};

function text(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === 'string' ? value : '';
}

function Avatar({ brand, size = 'md' }: { brand: PreviewBrand; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'size-7' : 'size-9';
  if (brand.avatarKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/media/file/${encodeURIComponent(brand.avatarKey)}`}
        alt=""
        className={`${dimension} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${dimension} grid shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white`}
      aria-hidden="true"
    >
      {brand.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Hashtags({ tags, className = 'text-sky-700' }: { tags: string[]; className?: string }) {
  if (tags.length === 0) return null;
  return <p className={`mt-1.5 text-sm ${className}`}>{tags.join(' ')}</p>;
}

/**
 * Platform previews.
 *
 * These are visual approximations so the user can judge how copy will read in
 * context — they are not pixel-perfect clones, and no platform logo or
 * trademark is reproduced.
 */
export function PlatformPreview(props: PreviewProps) {
  switch (props.platform) {
    case 'instagram':
      return <InstagramPreview {...props} />;
    case 'facebook':
      return <FacebookPreview {...props} />;
    case 'tiktok':
      return <TikTokPreview {...props} />;
    case 'linkedin':
      return <LinkedInPreview {...props} />;
    case 'youtube':
      return <YouTubePreview {...props} />;
    case 'pinterest':
      return <PinterestPreview {...props} />;
    case 'x':
      return <XPreview {...props} />;
  }
}

function Frame({ children, width = 'max-w-md' }: { children: React.ReactNode; width?: string }) {
  return (
    <div className={`${width} overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm`}>{children}</div>
  );
}

function InstagramPreview({ brand, fields, hashtags, mediaKey, mediaKind }: PreviewProps) {
  const caption = text(fields, 'caption');
  return (
    <Frame>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar brand={brand} size="sm" />
        <span className="text-sm font-semibold text-ink-900">{brand.handle}</span>
        <MoreHorizontal className="ml-auto size-4 text-ink-400" aria-hidden="true" />
      </div>
      <div className="aspect-square bg-ink-100">
        <ProductThumb storageKey={mediaKey} kind={mediaKind} alt="" className="aspect-square h-full" />
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-4 text-ink-800" aria-hidden="true">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="ml-auto size-5" />
        </div>
        <p className="mt-2.5 whitespace-pre-wrap text-sm text-ink-900">
          <span className="font-semibold">{brand.handle}</span> {caption}
        </p>
        <Hashtags tags={hashtags} />
      </div>
    </Frame>
  );
}

function FacebookPreview({ brand, fields, hashtags, mediaKey, mediaKind }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar brand={brand} />
        <div>
          <p className="text-sm font-semibold text-ink-900">{brand.name}</p>
          <p className="text-xs text-ink-500">Sponsored · Just now</p>
        </div>
        <MoreHorizontal className="ml-auto size-4 text-ink-400" aria-hidden="true" />
      </div>
      <p className="whitespace-pre-wrap px-3 pb-2.5 text-sm text-ink-900">{text(fields, 'primaryText')}</p>
      <Hashtags tags={hashtags} className="px-3 pb-2 text-sky-700" />
      <div className="aspect-[1.91/1] bg-ink-100">
        <ProductThumb storageKey={mediaKey} kind={mediaKind} alt="" className="aspect-[1.91/1] h-full" />
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-3 py-2.5">
        <p className="min-w-0 text-sm font-semibold text-ink-900">{text(fields, 'headline')}</p>
        <span className="shrink-0 rounded bg-ink-200 px-3 py-1 text-xs font-semibold text-ink-800">
          {text(fields, 'cta')}
        </span>
      </div>
      <div className="flex items-center justify-around px-3 py-2 text-xs font-medium text-ink-500" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="size-4" /> Like
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="size-4" /> Comment
        </span>
        <span className="flex items-center gap-1.5">
          <Share2 className="size-4" /> Share
        </span>
      </div>
    </Frame>
  );
}

function TikTokPreview({ brand, fields, hashtags, mediaKey, mediaKind }: PreviewProps) {
  const script = Array.isArray(fields['script']) ? (fields['script'] as { timecode: string; line: string }[]) : [];
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative w-full max-w-[250px] overflow-hidden rounded-xl bg-ink-950 shadow-sm">
        <div className="aspect-[9/16]">
          <ProductThumb storageKey={mediaKey} kind={mediaKind} alt="" className="aspect-[9/16] h-full opacity-80" />
        </div>
        <div className="absolute inset-x-0 top-0 p-3">
          <p className="rounded bg-black/50 px-2 py-1 text-center text-xs font-bold text-white">
            {text(fields, 'hook')}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-white">
          <p className="text-xs font-semibold">@{brand.handle}</p>
          <p className="mt-1 line-clamp-3 text-xs">{text(fields, 'caption')}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] opacity-80">
            <Music2 className="size-3" aria-hidden="true" /> original sound
          </p>
        </div>
      </div>

      {script.length > 0 ? (
        <div className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Script</p>
          <ol className="mt-2 space-y-2">
            {script.map((beat, index) => (
              <li key={index} className="text-sm">
                <span className="font-mono text-xs text-ink-400">{beat.timecode}</span>
                <p className="text-ink-800">{beat.line}</p>
              </li>
            ))}
          </ol>
          <Hashtags tags={hashtags} />
        </div>
      ) : null}
    </div>
  );
}

function LinkedInPreview({ brand, fields, hashtags }: PreviewProps) {
  return (
    <Frame>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar brand={brand} />
        <div>
          <p className="text-sm font-semibold text-ink-900">{brand.name}</p>
          <p className="text-xs text-ink-500">Company · Just now</p>
        </div>
      </div>
      <p className="whitespace-pre-wrap px-4 pb-3 text-sm leading-relaxed text-ink-900">{text(fields, 'post')}</p>
      <Hashtags tags={hashtags} className="px-4 pb-3 text-[#0A66C2]" />
      <div className="flex items-center justify-around border-t border-ink-100 px-4 py-2 text-xs font-medium text-ink-500" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <ThumbsUp className="size-4" /> Like
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="size-4" /> Comment
        </span>
        <span className="flex items-center gap-1.5">
          <Repeat2 className="size-4" /> Repost
        </span>
      </div>
    </Frame>
  );
}

function YouTubePreview({ brand, fields, mediaKey, mediaKind }: PreviewProps) {
  return (
    <Frame>
      <div className="aspect-video bg-ink-900">
        <ProductThumb storageKey={mediaKey} kind={mediaKind} alt="" className="aspect-video h-full" />
      </div>
      <div className="flex gap-3 px-3 py-3">
        <Avatar brand={brand} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-ink-900">{text(fields, 'title')}</p>
          <p className="mt-0.5 text-xs text-ink-500">{brand.name} · Just uploaded</p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-ink-600">{text(fields, 'description')}</p>
        </div>
      </div>
    </Frame>
  );
}

function PinterestPreview({ brand, fields, mediaKey, mediaKind }: PreviewProps) {
  return (
    <div className="max-w-[260px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="aspect-[2/3] bg-ink-100">
        <ProductThumb storageKey={mediaKey} kind={mediaKind} alt="" className="aspect-[2/3] h-full" />
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-ink-900">{text(fields, 'pinTitle')}</p>
        <p className="mt-1 line-clamp-3 text-xs text-ink-600">{text(fields, 'description')}</p>
        <div className="mt-2.5 flex items-center gap-2">
          <Avatar brand={brand} size="sm" />
          <span className="text-xs text-ink-600">{brand.name}</span>
        </div>
      </div>
    </div>
  );
}

function XPreview({ brand, fields, hashtags }: PreviewProps) {
  const thread = Array.isArray(fields['thread']) ? (fields['thread'] as string[]) : [];
  return (
    <Frame>
      <div className="flex gap-3 px-4 py-3">
        <Avatar brand={brand} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-ink-900">{brand.name}</span>{' '}
            <span className="text-ink-500">@{brand.handle} · now</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{text(fields, 'post')}</p>
          <Hashtags tags={hashtags} />
          <p className="mt-2 text-xs text-ink-400">{text(fields, 'post').length} / 280 characters</p>
        </div>
      </div>

      {thread.length > 0 ? (
        <ol className="border-t border-ink-100">
          {thread.map((post, index) => (
            <li key={index} className="flex gap-3 border-b border-ink-100 px-4 py-3 last:border-b-0">
              <Avatar brand={brand} size="sm" />
              <div className="min-w-0">
                <p className="text-xs text-ink-400">Thread {index + 2}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-900">{post}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </Frame>
  );
}

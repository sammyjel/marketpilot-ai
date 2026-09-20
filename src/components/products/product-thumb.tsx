import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Media is served through the authenticated /api/media/file route, so the Next
 * image optimizer (which fetches without the session cookie) is bypassed
 * deliberately here.
 */
export function ProductThumb({
  storageKey,
  kind,
  alt,
  className,
}: {
  storageKey: string | null;
  kind: string | null;
  alt: string;
  className?: string;
}) {
  if (!storageKey) {
    return (
      <div className={cn('grid aspect-[4/3] place-items-center bg-ink-100 text-ink-400', className)}>
        <ImageOff className="size-6" aria-hidden="true" />
        <span className="sr-only">No image</span>
      </div>
    );
  }

  const src = `/api/media/file/${encodeURIComponent(storageKey)}`;

  if (kind === 'video') {
    return <video src={src} className={cn('aspect-[4/3] w-full bg-ink-900 object-cover', className)} muted playsInline />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={cn('aspect-[4/3] w-full bg-ink-100 object-cover', className)} />
  );
}

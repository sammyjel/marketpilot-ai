import { cn } from '@/lib/cn';
import { BRANDING } from '@/lib/branding';

/**
 * Wordmark + glyph. The glyph is inline SVG (a paper-plane inside a rounded
 * square) so it needs no asset pipeline and inherits currentColor.
 */
export function BrandMark({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <path
            d="M3.6 11.4 20 4l-7.4 16.4-2.2-6.8-6.8-2.2Z"
            fill="currentColor"
            fillOpacity="0.9"
          />
          <path d="m10.4 13.6 4.3-4.3" stroke="var(--color-brand-700)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {showWordmark ? (
        <span className="text-[15px] font-semibold tracking-tight text-ink-900">{BRANDING.name}</span>
      ) : null}
      <span className="sr-only">{showWordmark ? '' : BRANDING.name}</span>
    </span>
  );
}

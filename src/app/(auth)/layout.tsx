import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { BRANDING } from '@/lib/branding';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="inline-flex w-fit" aria-label={BRANDING.name}>
          <BrandMark />
        </Link>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <p className="text-center text-xs text-ink-400">
          © {new Date().getFullYear()} {BRANDING.legalEntity}
        </p>
      </div>

      {/* Decorative panel: hidden from assistive tech and from small screens. */}
      <aside
        className="relative hidden overflow-hidden bg-ink-950 lg:block"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.35),transparent_55%),radial-gradient(circle_at_75%_75%,rgba(245,158,11,0.18),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-center px-14 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-300">{BRANDING.name}</p>
          <p className="mt-5 max-w-md text-3xl font-semibold leading-tight tracking-tight">{BRANDING.tagline}</p>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-300">{BRANDING.description}</p>
          <ol className="mt-10 space-y-3 text-sm text-ink-200">
            {['Upload one product', 'AI writes every platform', 'You review and approve', 'Schedule or publish'].map(
              (step, index) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-full bg-white/10 text-xs font-semibold">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ),
            )}
          </ol>
        </div>
      </aside>
    </div>
  );
}

import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { BRANDING } from '@/lib/branding';
import { getDictionary } from '@/i18n';
import { getAuthContext } from '@/server/auth/context';
import { MobileNav } from './mobile-nav';

const SECTIONS = [
  { href: '/features', key: 'navFeatures' },
  { href: '/how-it-works', key: 'navHowItWorks' },
  { href: '/use-cases', key: 'navUseCases' },
  { href: '/pricing', key: 'navPricing' },
  { href: '/faq', key: 'navFaq' },
] as const;

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const dict = await getDictionary();
  const ctx = await getAuthContext();
  const links = SECTIONS.map((s) => ({ href: s.href, label: dict.marketing[s.key] }));

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="shrink-0" aria-label={BRANDING.name}>
            <BrandMark />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            {ctx ? (
              <Button asChild size="sm">
                <Link href="/dashboard">{dict.nav.dashboard}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">{dict.common.signIn}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">{dict.common.signUp}</Link>
                </Button>
              </>
            )}
          </div>

          <MobileNav links={links} signedIn={Boolean(ctx)} />
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-ink-200 bg-ink-50">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <BrandMark />
            <p className="mt-3 max-w-sm text-sm text-ink-500">{BRANDING.description}</p>
          </div>
          <nav aria-label="Product">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Product</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink-600 hover:text-ink-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Company</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/contact" className="text-ink-600 hover:text-ink-900">
                  {dict.marketing.navContact}
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="text-ink-600 hover:text-ink-900">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-ink-600 hover:text-ink-900">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-ink-200 px-4 py-5 text-center text-xs text-ink-500 sm:px-6">
          © {new Date().getFullYear()} {BRANDING.legalEntity}. Content is generated with AI and reviewed by you before
          publishing.
        </div>
      </footer>
    </div>
  );
}

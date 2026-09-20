import type { Metadata, Viewport } from 'next';
import { BRANDING } from '@/lib/branding';
import { directionFor } from '@/i18n/config';
import { resolveLocale } from '@/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${BRANDING.name} — ${BRANDING.tagline}`,
    template: `%s · ${BRANDING.name}`,
  },
  description: BRANDING.description,
  applicationName: BRANDING.name,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();

  return (
    <html lang={locale} dir={directionFor(locale)}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

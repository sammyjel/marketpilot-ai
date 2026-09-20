import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, LifeBuoy, Mail } from 'lucide-react';
import { Section, SectionHeading } from '@/components/marketing/sections';
import { BRANDING } from '@/lib/branding';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with the ${BRANDING.name} team.`,
};

export default function ContactPage() {
  return (
    <Section>
      <SectionHeading eyebrow="Contact" title="Talk to us" />

      <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-3">
        <a
          href={`mailto:${BRANDING.supportEmail}`}
          className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
        >
          <Mail className="size-5 text-brand-600" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-ink-900">Email</h2>
          <p className="mt-1 break-words text-xs text-ink-600">{BRANDING.supportEmail}</p>
        </a>

        <Link
          href="/faq"
          className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
        >
          <LifeBuoy className="size-5 text-brand-600" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-ink-900">FAQ</h2>
          <p className="mt-1 text-xs text-ink-600">Most answers are already there, including the limitations.</p>
        </Link>

        <Link
          href="/how-it-works"
          className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
        >
          <BookOpen className="size-5 text-brand-600" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-ink-900">How it works</h2>
          <p className="mt-1 text-xs text-ink-600">The full pipeline, stage by stage.</p>
        </Link>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-500">
        This is a self-hostable application. If you are running your own installation, support comes from whoever
        operates it — the address above reaches the maintainers of the software itself.
      </p>
    </Section>
  );
}

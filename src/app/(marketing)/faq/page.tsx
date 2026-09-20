import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Straight answers about what MarketPilot AI does, what it will not do, and where the limits are.',
};

const GROUPS = [
  {
    heading: 'Getting started',
    items: [
      {
        q: 'What do I actually need to provide?',
        a: 'One product photo and one sentence. Price, benefits, features and a product URL make the output better, but nothing beyond the photo is required — the AI fills the gaps and marks anything it could not establish.',
      },
      {
        q: 'Do I need marketing experience?',
        a: 'No. The strategy, the copy for each network, the SEO fields and the creative direction are all generated. Your job is to read it and decide.',
      },
      {
        q: 'How long does a campaign take?',
        a: 'Generation runs in the background and usually finishes in under a minute for a handful of platforms. You can leave the page while it works.',
      },
    ],
  },
  {
    heading: 'Publishing',
    items: [
      {
        q: 'Will it post to my accounts automatically?',
        a: 'Only if you tell it to. Every campaign passes through a review and approval step, and nothing can be scheduled or published before a person approves it. Auto-publish is opt-in and applies only to already-approved campaigns.',
      },
      {
        q: 'Which networks can it publish to?',
        a: 'Facebook, Instagram, TikTok, YouTube, LinkedIn, Pinterest and X, each through its official API. Several of those require a business account and platform approval before they will accept posts from a third-party app — the connection screen tells you exactly what each one needs.',
      },
      {
        q: 'What if the API will not accept my post?',
        a: 'The post is marked as needing a manual publish, with the reason in plain language, and you get the media and copy to post yourself. It is never shown as published when it is not.',
      },
      {
        q: 'Can it post the same thing twice by accident?',
        a: 'No. Every post target has a stable key with a uniqueness constraint behind it, so a retried job, a double-click or a duplicated schedule all resolve to the same single post.',
      },
    ],
  },
  {
    heading: 'The AI',
    items: [
      {
        q: 'Can it invent claims about my product?',
        a: 'It is instructed to use only what you supplied and what is visible in your images, and a separate quality-control pass reviews the output for unsupported claims. Medical, financial, legal and guaranteed-results claims are treated as blockers: the campaign cannot be approved until they are removed or substantiated.',
      },
      {
        q: 'Does it change my product in generated images?',
        a: 'No. Images are composed from your actual photograph — the background, framing, lighting and any text overlay are generated, and the product is left exactly as you uploaded it. If a text-to-image model is configured and used instead, that image is labelled as reinterpreted.',
      },
      {
        q: 'Is the same caption used everywhere?',
        a: 'No. Each platform is generated separately from the shared strategy, and the generator is explicitly told not to reuse sentences between networks.',
      },
      {
        q: 'What if I do not like what it wrote?',
        a: 'Edit any field directly, or use the tools on a single piece: shorten, expand, change tone, translate, improve SEO, change the CTA, or regenerate just that one. The rest of the campaign is untouched.',
      },
    ],
  },
  {
    heading: 'Data and cost',
    items: [
      {
        q: 'What does it cost to run the AI?',
        a: 'Each plan includes a monthly allowance of generations, images and videos. Your remaining allowance is checked before an expensive generation starts, and the action is refused rather than silently billed once you hit the limit.',
      },
      {
        q: 'Where are my social tokens stored?',
        a: 'Encrypted at rest with AES-256-GCM, and never sent to the browser. Publishing happens server-side; the interface only ever sees which account is connected, not its credentials.',
      },
      {
        q: 'Can I delete everything?',
        a: 'Yes. Account deletion erases your personal details, ends every session, destroys stored social tokens and closes workspaces you solely own. Posts already published stay on their platforms — those are the platforms’ copies to delete.',
      },
      {
        q: 'Can I manage several clients?',
        a: 'Yes. Each client is a separate brand with its own products, connected accounts, campaigns and analytics, and the data is isolated at the query level rather than filtered in the interface.',
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="FAQ"
          title="Questions worth answering honestly"
          description="Including the ones where the answer is a limitation."
        />

        <div className="mx-auto mt-12 max-w-3xl space-y-10">
          {GROUPS.map((group) => (
            <div key={group.heading}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-brand-600">{group.heading}</h2>
              <div className="mt-4 divide-y divide-ink-200 rounded-[var(--radius-card)] border border-ink-200 bg-white">
                {group.items.map((item) => (
                  <details key={item.q} className="group px-5 py-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900 marker:hidden">
                      <span className="flex items-center justify-between gap-4">
                        {item.q}
                        <span className="text-ink-400 transition-transform group-open:rotate-45" aria-hidden="true">
                          +
                        </span>
                      </span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Still have a question?</h2>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">Contact us</Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/signup">Create your first campaign</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

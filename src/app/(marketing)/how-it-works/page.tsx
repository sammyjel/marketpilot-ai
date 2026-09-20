import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading, StepCard } from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'From one product photo to a reviewed, scheduled campaign across every network you use.',
};

const PIPELINE = [
  {
    stage: 'Product analyzer',
    detail:
      'A vision model reads your photo and reports what it can actually see: category, packaging, colours, likely use case. Anything it cannot determine is recorded as unknown rather than guessed.',
  },
  {
    stage: 'Brand context',
    detail:
      'Your voice, audience, market, language and guidelines are loaded so every downstream stage writes as you, not as a generic assistant.',
  },
  {
    stage: 'Campaign strategy',
    detail:
      'One angle is chosen and committed to, with the key message, benefits and proof points. Anything the inputs cannot support is listed as a caution instead of being asserted.',
  },
  {
    stage: 'Platform content',
    detail:
      'Each network is generated separately from the same strategy — a TikTok hook, a LinkedIn opener and a Pinterest description are genuinely different pieces of writing.',
  },
  {
    stage: 'SEO generator',
    detail:
      'Title, meta description, keyword set, search intent and FAQ suggestions for the product page the campaign points at.',
  },
  {
    stage: 'Creative brief',
    detail:
      'An art direction pass that describes the background, lighting and composition around your product — never a change to the product itself.',
  },
  {
    stage: 'Media generation',
    detail:
      'Images are composed from your real photograph. Video, where a renderer is configured, follows the hook → problem → product → benefits → CTA structure.',
  },
  {
    stage: 'Quality checker',
    detail:
      'A sceptical review pass looking for unsupported claims, invented proof, hashtag problems and format violations. Blockers must be resolved before approval.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="How it works"
          title="Four steps for you. Eight stages under the hood."
          description="You upload one product. Everything below happens on our servers, and you see the result before anything goes out."
        />

        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StepCard step={1} title="Upload your product">
            A photo and a sentence. Price, benefits and a product URL help, but nothing beyond the photo is required.
          </StepCard>
          <StepCard step={2} title="Choose the goal">
            Launch, sales, awareness, traffic, education — the objective changes the angle, not just the wording.
          </StepCard>
          <StepCard step={3} title="Review and edit">
            Platform-accurate previews. Edit any field, shorten, expand, change tone, translate, or regenerate one piece
            without touching the rest.
          </StepCard>
          <StepCard step={4} title="Approve and publish">
            Publish to connected accounts, or schedule in your own timezone. Server-side, so your browser can be closed.
          </StepCard>
        </ol>
      </Section>

      <Section tone="muted">
        <SectionHeading
          align="left"
          eyebrow="The pipeline"
          title="Each stage is separate, and each one is checked"
          description="Every stage returns structured data validated against a schema before it is stored. If a stage returns something malformed, it is repaired or retried — never saved half-formed."
        />

        <ol className="mt-10 space-y-3">
          {PIPELINE.map((item, index) => (
            <li key={item.stage} className="flex gap-4 rounded-[var(--radius-card)] border border-ink-200 bg-white p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink-900">{item.stage}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">See it on your own product</h2>
          <p className="mt-3 text-sm text-ink-600">
            The free plan includes enough generations to run a real campaign end to end.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/signup">
              Create your first campaign
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Section>
    </>
  );
}

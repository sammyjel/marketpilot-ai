import Link from 'next/link';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Film,
  Layers,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { FeatureCard, Section, SectionHeading, StepCard } from '@/components/marketing/sections';
import { PLATFORMS, PLATFORM_META } from '@/lib/platforms';
import { PLANS } from '@/lib/plans';
import { getDictionary } from '@/i18n';

const FAQS = [
  {
    q: 'Do I need marketing experience?',
    a: 'No. You upload a product photo and describe it in a sentence. The AI writes the strategy, the copy for each network, the SEO fields and the creative brief. You review and edit anything before it goes out.',
  },
  {
    q: 'Will it post to my accounts automatically?',
    a: 'Only if you ask it to. Every campaign goes through a review step by default. Auto-publishing is an opt-in setting per campaign type and is off until you turn it on.',
  },
  {
    q: 'Which networks can it publish to?',
    a: 'Facebook, Instagram, TikTok, YouTube, LinkedIn, Pinterest and X, using each platform official API. Some of those APIs require a business account and platform approval before they will accept posts — we show exactly what is needed on the connection screen.',
  },
  {
    q: 'What if a platform does not allow API publishing for my account?',
    a: 'We never show a post as published when it is not. If an API cannot accept the post, the campaign is marked as needing a manual publish and you can download the media and copy the caption in one click.',
  },
  {
    q: 'Can the AI invent claims about my product?',
    a: 'The generator is instructed to work only from what you provide and what is visible in your images. A quality-control pass flags unsupported medical, financial or performance claims for your review instead of publishing them.',
  },
  {
    q: 'Can I manage several clients?',
    a: 'Yes. Each client gets its own brand, products, connected accounts, campaigns and analytics inside your organization, and data is never mixed between them.',
  },
  {
    q: 'What does it cost to run the AI?',
    a: 'Every plan includes a monthly allowance of AI generations, images and videos. You always see your remaining allowance before an expensive generation starts, and a generation is refused rather than silently billed once you hit the limit.',
  },
];

export default async function HomePage() {
  const dict = await getDictionary();

  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden border-b border-ink-200 bg-gradient-to-b from-brand-50 via-white to-white px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto w-full max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge tone="brand">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {dict.marketing.heroEyebrow}
              </Badge>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
                {dict.marketing.heroTitle}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">{dict.marketing.heroSubtitle}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/signup">{dict.marketing.heroPrimaryCta}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/how-it-works">{dict.marketing.heroSecondaryCta}</Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-600">
                {['Free plan, no card required', 'You approve before anything publishes', 'Your product stays your product'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <HeroPreview />
          </div>
        </div>
      </section>

      {/* 2. How it works */}
      <Section id="how-it-works">
        <SectionHeading
          eyebrow="How it works"
          title="Four steps from product photo to live campaign"
          description="The whole point is that you do not have to think about each network separately."
        />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StepCard step={1} title="Upload your product">
            One photo and a sentence is enough. Add price, benefits or a product URL if you have them.
          </StepCard>
          <StepCard step={2} title="AI reads and plans">
            Vision analysis identifies what the product is, then a strategy is built around your brand, audience and
            objective.
          </StepCard>
          <StepCard step={3} title="Review and edit">
            Platform-accurate previews of every post. Edit, shorten, change the tone or regenerate any single piece.
          </StepCard>
          <StepCard step={4} title="Schedule or publish">
            Publish to your connected accounts, or drop the campaign onto the calendar in your own timezone.
          </StepCard>
        </ol>
      </Section>

      {/* 3. Product-to-content workflow */}
      <Section tone="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading
              align="left"
              eyebrow="One product in, a full campaign out"
              title="Every network gets copy written for that network"
              description="A TikTok hook is not a LinkedIn opener. MarketPilot generates each platform separately from the same product and brand context, instead of pasting one caption everywhere."
            />
            <ul className="mt-8 space-y-4">
              {[
                ['Product analysis', 'Category, packaging, colours, likely use case and audience signals from your image.'],
                ['Campaign strategy', 'Angle, key message, proof points and a content plan shaped by your objective.'],
                ['Platform content', 'Captions, hooks, scripts, on-screen text, CTAs and hashtags per network.'],
                ['SEO + metadata', 'Titles, meta descriptions, keywords and search intent for your product page.'],
                ['Quality control', 'Claims, grammar, duplication, hashtag hygiene and brand-voice checks before you see it.'],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{title}</p>
                    <p className="text-sm text-ink-600">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <PipelineDiagram />
        </div>
      </Section>

      {/* 4. Supported platforms */}
      <Section id="platforms">
        <SectionHeading
          eyebrow="Supported platforms"
          title="Connected through each platform official API"
          description="We only offer what a platform API genuinely allows. Where a network requires a business account or app review, we tell you up front rather than failing at publish time."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORMS.map((platform) => {
            const meta = PLATFORM_META[platform];
            return (
              <div key={platform} className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-ink-900">{meta.label}</h3>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1">
                  {meta.capabilities.map((capability) => (
                    <li
                      key={capability}
                      className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600"
                    >
                      {capability}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-ink-500">{meta.limitations[0]}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 5-8. AI features, video, SEO, scheduling */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="What the AI does"
          title="A marketing team worth of work, in one pass"
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard icon={<Wand2 className="size-5" />} title="Product understanding">
            Vision analysis pulls category, packaging and use-case clues from your photo, and marks anything it cannot
            determine as unknown instead of guessing.
          </FeatureCard>
          <FeatureCard icon={<PenLine className="size-5" />} title="Copy for every network">
            Headlines, primary text, hooks, carousel copy, reel and short scripts, professional posts and pin
            descriptions — each written to the format it will appear in.
          </FeatureCard>
          <FeatureCard icon={<Film className="size-5" />} title="Short-form video">
            Hook, problem, product, benefits and CTA structured into 15, 30 and 60 second cuts with optional voice-over
            and captions.
          </FeatureCard>
          <FeatureCard icon={<Search className="size-5" />} title="SEO automation">
            SEO title, meta description, keyword set, search intent and FAQ suggestions for the product page behind the
            campaign.
          </FeatureCard>
          <FeatureCard icon={<CalendarClock className="size-5" />} title="Server-side scheduling">
            Queue a week of posts across networks in your own timezone. Scheduling runs on our servers, so nothing
            depends on your browser staying open.
          </FeatureCard>
          <FeatureCard icon={<ShieldCheck className="size-5" />} title="Claim safety">
            Unsupported medical, financial and performance claims are flagged for your review instead of being published
            as fact.
          </FeatureCard>
        </div>
      </Section>

      {/* 9-11. Analytics, brands, agency */}
      <Section>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-7 shadow-xs lg:col-span-2">
            <BarChart3 className="size-6 text-brand-600" aria-hidden="true" />
            <h3 className="mt-4 text-xl font-semibold text-ink-900">Analytics that only shows real numbers</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
              Impressions, reach, engagement, clicks and video completion are pulled from each platform API on a
              schedule. If a network does not expose a metric for your account tier, we show it as unavailable — we do
              not fill the gap with an estimate. AI insights are drawn from that same data and labelled as suggestions.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ['Performance over time', 'Daily snapshots per post'],
                ['Platform comparison', 'Where your product lands best'],
                ['Top content', 'What to make more of'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg bg-ink-50 p-4">
                  <dt className="text-sm font-semibold text-ink-900">{title}</dt>
                  <dd className="mt-1 text-xs text-ink-600">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-[var(--radius-card)] border border-ink-200 bg-ink-950 p-7 text-white shadow-sm">
            <Users className="size-6 text-brand-300" aria-hidden="true" />
            <h3 className="mt-4 text-xl font-semibold">Built for agencies too</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              Run each client as its own brand with separate products, connected accounts, campaigns and analytics.
              Invite your team with owner, admin, editor or viewer roles — enforced on the server, not just hidden in
              the interface.
            </p>
            <div className="mt-6 space-y-2">
              {['Client A', 'Client B', 'Client C'].map((client) => (
                <div key={client} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <Layers className="size-4 text-brand-300" aria-hidden="true" />
                  {client}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 12. Pricing */}
      <Section id="pricing" tone="muted">
        <SectionHeading
          eyebrow="Pricing"
          title="Start free, upgrade when the campaigns are working"
          description="Every plan includes the full generation pipeline. Higher plans raise your monthly allowances and the number of brands and connected accounts."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={
                plan.highlighted
                  ? 'relative rounded-[var(--radius-card)] border-2 border-brand-600 bg-white p-6 shadow-md'
                  : 'rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 shadow-xs'
              }
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </span>
              ) : null}
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{plan.name}</h3>
              <p className="mt-3 text-3xl font-semibold text-ink-900">
                {plan.monthlyPriceUsd === 0 ? 'Free' : `$${plan.monthlyPriceUsd}`}
                {plan.monthlyPriceUsd > 0 ? <span className="text-sm font-normal text-ink-500">/mo</span> : null}
              </p>
              <p className="mt-2 text-sm text-ink-600">{plan.description}</p>
              <ul className="mt-5 space-y-2 text-sm text-ink-700">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                    {highlight}
                  </li>
                ))}
              </ul>
              <Button asChild variant={plan.highlighted ? 'primary' : 'outline'} className="mt-6 w-full">
                <Link href="/signup">{plan.monthlyPriceUsd === 0 ? 'Start free' : `Choose ${plan.name}`}</Link>
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* 13. FAQ */}
      <Section id="faq">
        <SectionHeading eyebrow="FAQ" title="Questions worth answering honestly" />
        <div className="mx-auto mt-10 max-w-3xl divide-y divide-ink-200 rounded-[var(--radius-card)] border border-ink-200 bg-white">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900 marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {faq.q}
                  <span className="text-ink-400 transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{faq.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* 14. Final CTA */}
      <Section tone="dark">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{dict.marketing.finalCtaTitle}</h2>
          <p className="mt-4 text-base text-ink-300">{dict.marketing.finalCtaBody}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">{dict.marketing.heroPrimaryCta}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
              <Link href="/how-it-works">{dict.marketing.heroSecondaryCta}</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

/** Static illustration of the review screen — no fake metrics, just structure. */
function HeroPreview() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-ink-200 pb-3">
          <span className="size-2.5 rounded-full bg-red-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 text-xs text-ink-400">Campaign review</span>
        </div>
        <div className="mt-4 flex gap-4">
          <div className="grid h-28 w-24 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 text-xs font-medium text-brand-700">
            Product
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-ink-200" />
            <div className="h-3 w-full rounded bg-ink-100" />
            <div className="h-3 w-5/6 rounded bg-ink-100" />
            <div className="flex gap-1.5 pt-1">
              {['#skincare', '#glow', '#routine'].map((tag) => (
                <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {PLATFORMS.slice(0, 5).map((platform) => (
            <div key={platform} className="rounded-lg border border-ink-200 p-2 text-center">
              <span className="mx-auto block size-2 rounded-full" style={{ backgroundColor: PLATFORM_META[platform].color }} />
              <span className="mt-1 block text-[9px] font-medium text-ink-500">{PLATFORM_META[platform].label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-4 -left-4 hidden rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-lg sm:block">
        <p className="text-xs font-medium text-ink-500">Generated in one pass</p>
        <p className="text-sm font-semibold text-ink-900">7 platforms · 1 product</p>
      </div>
    </div>
  );
}

function PipelineDiagram() {
  const stages = [
    'Product input',
    'Product analyzer',
    'Brand context',
    'Campaign strategy',
    'Platform content',
    'SEO generator',
    'Creative brief',
    'Media generation',
    'Quality checker',
    'Campaign package',
  ];
  return (
    <ol className="space-y-1.5" aria-label="Generation pipeline">
      {stages.map((stage, index) => (
        <li key={stage} className="flex items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-xs font-semibold text-brand-700">
            {index + 1}
          </span>
          <span className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 shadow-xs">
            {stage}
          </span>
        </li>
      ))}
    </ol>
  );
}

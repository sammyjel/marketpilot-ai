import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/sections';
import { PLANS, USAGE_METRIC_LABELS, type UsageMetric } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Start free. Upgrade when the campaigns are working.',
};

const COMPARED: (UsageMetric | 'brands' | 'teamMembers')[] = [
  'ai_generation',
  'image_generation',
  'video_generation',
  'published_post',
  'connected_account',
  'brands',
  'teamMembers',
  'storage_bytes',
];

const EXTRA_LABELS: Record<string, string> = {
  brands: 'Brands',
  teamMembers: 'Team members',
};

function formatLimit(key: string, value: number | null): string {
  if (value === null) return 'Unlimited';
  if (key === 'storage_bytes') return `${Math.round(value / (1024 * 1024 * 1024))} GB`;
  if (value === 0) return '—';
  return value.toLocaleString();
}

export default function PricingPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Pricing"
          title="Every plan includes the whole pipeline"
          description="Higher plans raise the monthly allowances and the number of brands and connected accounts. Nothing is held back as a feature gate except video generation, which genuinely costs more to run."
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

              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{plan.name}</h2>
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

      <Section tone="muted">
        <SectionHeading eyebrow="Compare" title="Monthly allowances" align="left" />

        <div className="mt-8 overflow-x-auto scroll-panel">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-300">
                <th scope="col" className="py-3 pr-4 font-semibold text-ink-900">
                  Included each month
                </th>
                {PLANS.map((plan) => (
                  <th key={plan.tier} scope="col" className="py-3 pr-4 text-right font-semibold text-ink-900">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARED.map((key) => (
                <tr key={key} className="border-b border-ink-200">
                  <th scope="row" className="py-2.5 pr-4 font-normal text-ink-700">
                    {EXTRA_LABELS[key] ?? USAGE_METRIC_LABELS[key as UsageMetric]}
                  </th>
                  {PLANS.map((plan) => (
                    <td key={plan.tier} className="py-2.5 pr-4 text-right tabular-nums text-ink-800">
                      {formatLimit(key, plan.limits[key as keyof typeof plan.limits])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 max-w-2xl text-sm text-ink-600">
          Usage is checked before an expensive generation starts, not after. When an allowance runs out the action is
          refused with a clear message — you are never billed for something you did not expect.
        </p>
      </Section>
    </>
  );
}

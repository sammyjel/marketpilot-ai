import type { Metadata } from 'next';
import Link from 'next/link';
import { Briefcase, Camera, ShoppingBag, Store, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, SectionHeading } from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'Use cases',
  description: 'How ecommerce sellers, small businesses, freelancers, agencies and creators use MarketPilot AI.',
};

const CASES = [
  {
    icon: ShoppingBag,
    title: 'Ecommerce seller',
    problem: 'You add products faster than you can write about them, and the good ones sit there unpromoted.',
    fit: [
      'One upload per product gives you every network at once.',
      'SEO fields drop straight into your product page.',
      'Duplicate a campaign for the next product and change the photo.',
    ],
  },
  {
    icon: Store,
    title: 'Small business',
    problem: 'There is no marketing person, and posting falls to whoever has a spare ten minutes.',
    fit: [
      'A sentence about the product is enough to start.',
      'Schedule a fortnight in one sitting.',
      'Claim checking catches the things that get a business into trouble.',
    ],
  },
  {
    icon: Briefcase,
    title: 'Freelancer',
    problem: 'You manage several clients and rewrite the same campaign five ways every week.',
    fit: [
      'Each client is a separate brand with its own voice and accounts.',
      'Templates for launches, sales and seasonal moments.',
      'Version history means a client changing their mind costs you nothing.',
    ],
  },
  {
    icon: Users,
    title: 'Marketing agency',
    problem: 'Client data cannot mix, and juniors need guardrails that actually hold.',
    fit: [
      'Brands, products, accounts and analytics are isolated per client.',
      'Editors can draft; only admins approve and publish.',
      'An audit trail records who changed and approved what.',
    ],
  },
  {
    icon: Camera,
    title: 'Content creator',
    problem: 'You promote products you like but do not want to sound like an ad every time.',
    fit: [
      'Tone controls that go beyond "professional" and "casual".',
      'TikTok hooks and reel scripts written as scripts, not captions.',
      'Regenerate a single piece without losing the rest.',
    ],
  },
];

export default function UseCasesPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Use cases"
          title="Same product, different problems"
          description="The workflow is identical. What changes is which part of it saves you the most time."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {CASES.map((useCase) => {
            const Icon = useCase.icon;
            return (
              <div
                key={useCase.title}
                className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h2 className="text-base font-semibold text-ink-900">{useCase.title}</h2>
                </div>

                <p className="mt-4 text-sm italic text-ink-600">{useCase.problem}</p>

                <ul className="mt-4 space-y-2">
                  {useCase.fit.map((point) => (
                    <li key={point} className="flex gap-2 text-sm text-ink-700">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>

      <Section tone="muted">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Try it on a product you already sell</h2>
          <p className="mt-3 text-sm text-ink-600">Free to start, and you approve everything before it goes out.</p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/signup">Create your first campaign</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}

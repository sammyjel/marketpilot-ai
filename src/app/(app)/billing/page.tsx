import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Badge, PageHeader } from '@/components/ui/primitives';
import { PlanPicker } from '@/components/billing/plan-picker';
import { UsageMeters } from '@/components/billing/usage-meters';
import { PLANS, planFor } from '@/lib/plans';
import { isMockBilling } from '@/providers/billing';
import { requireCapability } from '@/server/auth/context';
import { getSubscription } from '@/server/services/billing';
import { getUsageSummary } from '@/server/services/usage';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ changed?: string }> }) {
  const ctx = await requireCapability('billing:manage');
  const params = await searchParams;

  const [subscription, usage] = await Promise.all([getSubscription(ctx), getUsageSummary(ctx)]);
  const plan = planFor(subscription.planTier);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & usage"
        description="Your plan sets the monthly allowances. Expensive generations are refused before they run, never billed by surprise."
      />

      {params.changed ? <Alert tone="success">Your plan has been updated.</Alert> : null}

      {isMockBilling() ? (
        <Alert tone="warning" title="No payment provider configured">
          Plan changes apply immediately here and no money moves. Set <code>BILLING_PROVIDER=stripe</code> and{' '}
          <code>BILLING_SECRET</code> to take real payments.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Current plan"
          action={<Badge tone="brand">{plan.name}</Badge>}
          description={`Renews ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}${
            subscription.cancelAtPeriodEnd ? ' — cancels at the end of this period' : ''
          }`}
        />
        <CardBody>
          <ul className="grid gap-2 sm:grid-cols-2">
            {plan.highlights.map((highlight) => (
              <li key={highlight} className="flex items-center gap-2 text-sm text-ink-700">
                <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
                {highlight}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="This month" description="Resets on the first of each month, UTC." />
        <CardBody>
          <UsageMeters usage={usage} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Change plan" />
        <CardBody>
          <PlanPicker
            plans={PLANS.map((entry) => ({
              tier: entry.tier,
              name: entry.name,
              description: entry.description,
              monthlyPriceUsd: entry.monthlyPriceUsd,
              highlights: entry.highlights,
              highlighted: entry.highlighted ?? false,
            }))}
            currentTier={subscription.planTier}
            mock={isMockBilling()}
            canCancel={subscription.planTier !== 'free' && !subscription.cancelAtPeriodEnd}
          />
        </CardBody>
      </Card>
    </div>
  );
}

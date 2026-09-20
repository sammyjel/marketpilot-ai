'use client';

import { useActionState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { cancelPlanAction, changePlanAction } from '@/server/actions/billing';

type PlanOption = {
  tier: string;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  highlights: string[];
  highlighted: boolean;
};

export function PlanPicker({
  plans,
  currentTier,
  mock,
  canCancel,
}: {
  plans: PlanOption[];
  currentTier: string;
  mock: boolean;
  canCancel: boolean;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(changePlanAction, IDLE as ActionState<null>);

  return (
    <div className="space-y-4">
      <FormMessage state={state} />

      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          return (
            <div
              key={plan.tier}
              className={cn(
                'flex flex-col rounded-[var(--radius-card)] border p-4',
                isCurrent ? 'border-brand-600 bg-brand-50/40' : 'border-ink-200',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-900">{plan.name}</h3>
                {isCurrent ? <span className="text-xs font-medium text-brand-700">Current</span> : null}
              </div>

              <p className="mt-2 text-2xl font-semibold text-ink-900">
                {plan.monthlyPriceUsd === 0 ? 'Free' : `$${plan.monthlyPriceUsd}`}
                {plan.monthlyPriceUsd > 0 ? <span className="text-sm font-normal text-ink-500">/mo</span> : null}
              </p>
              <p className="mt-1 text-xs text-ink-600">{plan.description}</p>

              <ul className="mt-3 flex-1 space-y-1.5">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-1.5 text-xs text-ink-700">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                    {highlight}
                  </li>
                ))}
              </ul>

              {!isCurrent ? (
                <form action={action} className="mt-4">
                  <input type="hidden" name="planTier" value={plan.tier} />
                  <SubmitButton
                    className="w-full"
                    variant={plan.highlighted ? 'primary' : 'outline'}
                    size="sm"
                    pendingLabel={mock ? 'Switching…' : 'Opening checkout…'}
                  >
                    {mock ? 'Switch' : plan.monthlyPriceUsd === 0 ? 'Downgrade' : 'Choose'}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>

      {canCancel ? (
        <form action={cancelPlanAction} className="border-t border-ink-100 pt-4">
          <SubmitButton variant="ghost" size="sm" pendingLabel="Cancelling…">
            Cancel at the end of this period
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

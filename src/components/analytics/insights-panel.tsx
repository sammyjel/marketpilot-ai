'use client';

import { useActionState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { generateInsightsAction, type InsightsPayload } from '@/server/actions/analytics';

/**
 * AI insights are generated on demand rather than on page load, because every
 * run costs a generation credit and the numbers only change once a day.
 */
export function InsightsPanel({ days }: { days: number }) {
  const [state, action] = useActionState<ActionState<InsightsPayload | null>, FormData>(
    generateInsightsAction,
    IDLE as ActionState<InsightsPayload | null>,
  );

  const insights = state.ok === true ? state.data : null;

  return (
    <Card>
      <CardHeader
        title="AI insights"
        description="Generated from the data above, with the figure behind each statement."
        action={<Lightbulb className="size-5 text-amber-500" aria-hidden="true" />}
      />
      <CardBody className="space-y-4">
        <FormMessage state={state} />

        {insights && insights.insights.length > 0 ? (
          <ul className="space-y-3">
            {insights.insights.map((insight, index) => (
              <li key={index} className="rounded-lg border border-ink-200 p-3.5">
                <p className="text-sm font-semibold text-ink-900">{insight.title}</p>
                <p className="mt-1 text-sm text-ink-600">{insight.detail}</p>
                <p className="mt-2 rounded bg-ink-50 px-2 py-1 text-xs text-ink-500">Based on: {insight.basis}</p>
                {insight.recommendation ? (
                  <p className="mt-2 text-xs font-medium text-brand-700">Try: {insight.recommendation}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {insights && insights.dataGaps.length > 0 ? (
          <Alert tone="info" title="What could not be assessed">
            <ul className="list-inside list-disc">
              {insights.dataGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {!insights ? (
          <p className="text-sm text-ink-500">
            Insights are drawn only from the metrics your platforms actually returned. Nothing is estimated, and any
            metric that was unavailable is listed rather than filled in.
          </p>
        ) : null}

        <form action={action}>
          <input type="hidden" name="days" value={days} />
          <SubmitButton variant="outline" className="w-full" pendingLabel="Reading the numbers…">
            <Sparkles className="size-4" aria-hidden="true" />
            {insights ? 'Regenerate insights' : 'Generate insights'}
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}

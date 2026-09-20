'use client';

import { useActionState } from 'react';
import { Select } from '@/components/ui/field';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { BRAND_TONES, TONE_LABELS } from '@/lib/tones';
import { updateAiSettingsAction } from '@/server/actions/settings';



export function AiSettingsForm({
  defaultTone,
  autoPublishApproved,
  requireReviewAlways,
}: {
  defaultTone: string;
  autoPublishApproved: boolean;
  requireReviewAlways: boolean;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(
    updateAiSettingsAction,
    IDLE as ActionState<null>,
  );

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />

      <Select label="Default tone for new brands" name="defaultTone" defaultValue={defaultTone}>
        {BRAND_TONES.map((tone) => (
          <option key={tone} value={tone}>
            {TONE_LABELS[tone]}
          </option>
        ))}
      </Select>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="requireReviewAlways"
          defaultChecked={requireReviewAlways}
          className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="block text-sm font-medium text-ink-800">Always require review before approval</span>
          <span className="block text-xs text-ink-500">
            Recommended. Even clean campaigns wait for a person to read them.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="autoPublishApproved"
          defaultChecked={autoPublishApproved}
          className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="block text-sm font-medium text-ink-800">Publish approved campaigns automatically</span>
          <span className="block text-xs text-ink-500">
            Off by default. This only affects campaigns a person has already approved — unreviewed AI output is never
            published, whatever this is set to.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save AI settings</SubmitButton>
      </div>
    </form>
  );
}

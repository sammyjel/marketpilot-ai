'use client';

import { useActionState } from 'react';
import { TextInput } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { updateOrganizationAction } from '@/server/actions/settings';

export function OrganizationSettingsForm({
  name,
  isAgency,
  planTier,
}: {
  name: string;
  isAgency: boolean;
  planTier: string;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(
    updateOrganizationAction,
    IDLE as ActionState<null>,
  );

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />

      <TextInput label="Workspace name" name="name" required defaultValue={name} />

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="isAgency"
          defaultChecked={isAgency}
          className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="block text-sm font-medium text-ink-800">Agency mode</span>
          <span className="block text-xs text-ink-500">
            Labels each brand as a client and surfaces client names throughout. Data is already isolated per brand
            either way.
          </span>
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
        <Badge tone="brand">{planTier} plan</Badge>
        <SubmitButton pendingLabel="Saving…">Save workspace</SubmitButton>
      </div>
    </form>
  );
}

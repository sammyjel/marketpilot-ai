'use client';

import { useActionState, useState } from 'react';
import { FormMessage, SubmitButton, fieldError } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { deleteAccountAction } from '@/server/actions/auth';

export function DeleteAccountForm() {
  const [state, action] = useActionState<ActionState<null>, FormData>(deleteAccountAction, IDLE as ActionState<null>);
  const [confirmation, setConfirmation] = useState('');

  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />

      <div className="space-y-1.5">
        <label htmlFor="delete-confirm" className="block text-sm font-medium text-ink-800">
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirm"
          name="confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          aria-invalid={Boolean(fieldError(state, 'confirm'))}
          className="w-full max-w-xs rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
        />
        {fieldError(state, 'confirm') ? (
          <p className="text-xs font-medium text-red-600">{fieldError(state, 'confirm')}</p>
        ) : null}
      </div>

      <SubmitButton variant="danger" disabled={confirmation !== 'DELETE'} pendingLabel="Deleting…">
        Delete my account
      </SubmitButton>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { TextInput } from '@/components/ui/field';
import { fieldError, FormMessage, FormShell, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { resetPasswordAction } from '@/server/actions/auth';

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState<null>, FormData>(resetPasswordAction, IDLE as ActionState<null>);

  return (
    <FormShell title="Choose a new password" subtitle="Signing in on other devices will be required again.">
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="token" value={token} />
        <FormMessage state={state} />
        <TextInput
          label="New password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          autoFocus
          hint="At least 10 characters, with a letter and a number."
          error={fieldError(state, 'password')}
        />
        <TextInput
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          error={fieldError(state, 'confirmPassword')}
        />
        <SubmitButton className="w-full" size="lg" pendingLabel="Updating…">
          Update password
        </SubmitButton>
      </form>
    </FormShell>
  );
}

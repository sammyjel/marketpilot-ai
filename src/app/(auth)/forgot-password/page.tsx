'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { TextInput } from '@/components/ui/field';
import { fieldError, FormMessage, FormShell, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { requestPasswordResetAction } from '@/server/actions/auth';

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<ActionState<null>, FormData>(
    requestPasswordResetAction,
    IDLE as ActionState<null>,
  );

  return (
    <div>
      <FormShell title="Reset your password" subtitle="We will send you a link to choose a new password.">
        <form action={action} className="space-y-4" noValidate>
          <FormMessage state={state} />
          <TextInput
            label="Email address"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            error={fieldError(state, 'email')}
          />
          <SubmitButton className="w-full" size="lg" pendingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      </FormShell>

      <p className="mt-6 text-center text-sm text-ink-500">
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

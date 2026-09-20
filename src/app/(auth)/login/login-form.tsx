'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { TextInput } from '@/components/ui/field';
import { fieldError, FormMessage, FormShell, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { signInAction } from '@/server/actions/auth';
import type { Dictionary } from '@/i18n';

export function LoginForm({ dict, next }: { dict: Dictionary['auth']; next: string }) {
  const [state, action] = useActionState<ActionState<null>, FormData>(signInAction, IDLE as ActionState<null>);

  return (
    <FormShell title={dict.loginTitle} subtitle={dict.loginSubtitle}>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />

        <TextInput
          label={dict.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          error={fieldError(state, 'email')}
        />
        <TextInput
          label={dict.password}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          error={fieldError(state, 'password')}
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            {dict.forgotPassword}
          </Link>
        </div>

        <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </FormShell>
  );
}

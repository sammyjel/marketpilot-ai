'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { TextInput } from '@/components/ui/field';
import { fieldError, FormMessage, FormShell, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { signUpAction } from '@/server/actions/auth';
import type { Dictionary } from '@/i18n';

export function SignUpForm({ dict }: { dict: Dictionary['auth'] }) {
  const [state, action] = useActionState<ActionState<null>, FormData>(signUpAction, IDLE as ActionState<null>);
  const [timezone, setTimezone] = useState('UTC');

  // Captured on the client so scheduling defaults to the user's real zone.
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, []);

  return (
    <FormShell title={dict.signupTitle} subtitle={dict.signupSubtitle}>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="timezone" value={timezone} />
        <FormMessage state={state} />

        <TextInput
          label={dict.name}
          name="name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          error={fieldError(state, 'name')}
        />
        <TextInput
          label={dict.organizationName}
          name="organizationName"
          autoComplete="organization"
          placeholder="DavMicBet"
          error={fieldError(state, 'organizationName')}
        />
        <TextInput
          label={dict.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          error={fieldError(state, 'email')}
        />
        <TextInput
          label={dict.password}
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint={dict.passwordHint}
          error={fieldError(state, 'password')}
        />
        <TextInput
          label={dict.confirmPassword}
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          error={fieldError(state, 'confirmPassword')}
        />

        <label className="flex items-start gap-2.5 text-sm text-ink-600">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            I agree to the{' '}
            <Link href="/legal/terms" className="font-medium text-brand-600 hover:text-brand-700">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/legal/privacy" className="font-medium text-brand-600 hover:text-brand-700">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {fieldError(state, 'acceptTerms') ? (
          <p className="text-xs font-medium text-red-600">{fieldError(state, 'acceptTerms')}</p>
        ) : null}

        <SubmitButton className="w-full" size="lg" pendingLabel="Creating your workspace…">
          Create account
        </SubmitButton>
      </form>
    </FormShell>
  );
}

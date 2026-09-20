'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import type { ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';

/** Submit button that disables and relabels itself while the action runs. */
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Renders the action-level (non-field) message with the right tone. */
export function FormMessage({ state, className }: { state: ActionState<unknown>; className?: string }) {
  if (state.ok === null) return null;

  const isError = state.ok === false;
  const message = isError ? state.message : state.message;
  if (!message) return null;

  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={cn(
        'rounded-lg px-3 py-2 text-sm ring-1 ring-inset',
        isError ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        className,
      )}
    >
      {message}
    </p>
  );
}

export function fieldError(state: ActionState<unknown>, field: string): string | undefined {
  return state.ok === false ? state.fieldErrors?.[field] : undefined;
}

export function FormShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-ink-500">{subtitle}</p> : null}
      <div className="mt-7">{children}</div>
    </div>
  );
}

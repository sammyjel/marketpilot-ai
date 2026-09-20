'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { acceptInviteAction } from '@/server/actions/team';

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionState<null>, FormData>(acceptInviteAction, IDLE as ActionState<null>);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Joining…">
        Accept invitation
      </SubmitButton>
    </form>
  );
}

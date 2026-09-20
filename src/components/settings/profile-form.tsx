'use client';

import { useActionState } from 'react';
import { Select, TextInput } from '@/components/ui/field';
import { Badge } from '@/components/ui/primitives';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { timezoneOptions } from '@/lib/dates';
import { LOCALES, LOCALE_LABELS } from '@/i18n/config';
import { updateProfileAction } from '@/server/actions/settings';

export function ProfileSettingsForm({
  name,
  email,
  timezone,
  locale,
  emailVerified,
}: {
  name: string;
  email: string;
  timezone: string;
  locale: string;
  emailVerified: boolean;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(updateProfileAction, IDLE as ActionState<null>);

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />

      <TextInput label="Name" name="name" defaultValue={name} autoComplete="name" />

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink-800">Email</span>
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">{email}</span>
          <Badge tone={emailVerified ? 'success' : 'warning'}>{emailVerified ? 'Verified' : 'Unverified'}</Badge>
        </div>
      </div>

      <Select label="Timezone" name="timezone" defaultValue={timezone} hint="Used for scheduling and every time shown.">
        {timezoneOptions(timezone).map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </Select>

      <Select label="Interface language" name="locale" defaultValue={locale}>
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </Select>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}

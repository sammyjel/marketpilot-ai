'use client';

import { BRAND_TONES, TONE_LABELS } from '@/lib/tones';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select, TextArea, TextInput } from '@/components/ui/field';
import { FormMessage, SubmitButton, fieldError } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { timezoneOptions } from '@/lib/dates';
import { PLATFORMS, PLATFORM_META } from '@/lib/platforms';

export type BrandFormValues = {
  name: string;
  clientLabel: string;
  websiteUrl: string;
  description: string;
  industry: string;
  targetAudience: string;
  country: string;
  language: string;
  currency: string;
  timezone: string;
  tone: string;
  voiceNotes: string;
  preferredCta: string;
  guidelines: string;
  colors: string[];
  activePlatforms: string[];
};

export function BrandForm({
  action,
  values,
  submitLabel,
  isAgency,
}: {
  action: (prev: ActionState<null>, formData: FormData) => Promise<ActionState<null>>;
  values: BrandFormValues;
  submitLabel: string;
  isAgency: boolean;
}) {
  const [state, formAction] = useActionState<ActionState<null>, FormData>(action, IDLE as ActionState<null>);
  const [platforms, setPlatforms] = useState<string[]>(values.activePlatforms);
  const [colors, setColors] = useState<string[]>(values.colors.length > 0 ? values.colors : ['#4f46e5']);

  return (
    <form action={formAction} className="space-y-5">
      {platforms.map((platform) => (
        <input key={platform} type="hidden" name="platforms" value={platform} />
      ))}
      <input type="hidden" name="colors" value={colors.join(',')} />

      <FormMessage state={state} />

      <Card>
        <CardHeader title="Identity" description="How the AI refers to this brand." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Brand name"
            name="name"
            required
            defaultValue={values.name}
            placeholder="DavMicBet"
            error={fieldError(state, 'name')}
            className="sm:col-span-2"
          />
          {isAgency ? (
            <TextInput
              label="Client label"
              name="clientLabel"
              defaultValue={values.clientLabel}
              hint="Shown in lists to tell clients apart."
              placeholder="Client A"
              error={fieldError(state, 'clientLabel')}
            />
          ) : null}
          <TextInput
            label="Industry"
            name="industry"
            defaultValue={values.industry}
            placeholder="Beauty & Cosmetics"
            error={fieldError(state, 'industry')}
          />
          <TextInput
            label="Website"
            name="websiteUrl"
            type="url"
            defaultValue={values.websiteUrl}
            placeholder="https://example.com"
            error={fieldError(state, 'websiteUrl')}
            className="sm:col-span-2"
          />
          <TextArea
            label="What this brand sells"
            name="description"
            rows={3}
            defaultValue={values.description}
            error={fieldError(state, 'description')}
            className="sm:col-span-2"
          />
          <TextArea
            label="Target audience"
            name="targetAudience"
            rows={2}
            defaultValue={values.targetAudience}
            placeholder="Women aged 25–55 with dry or damaged hair"
            error={fieldError(state, 'targetAudience')}
            className="sm:col-span-2"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Voice" description="Applied to every generated campaign." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Select label="Tone" name="tone" defaultValue={values.tone}>
            {BRAND_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {TONE_LABELS[tone]}
              </option>
            ))}
          </Select>
          <TextInput
            label="Preferred call to action"
            name="preferredCta"
            defaultValue={values.preferredCta}
            placeholder="Shop now"
            error={fieldError(state, 'preferredCta')}
          />
          <TextArea
            label="Voice notes"
            name="voiceNotes"
            rows={3}
            defaultValue={values.voiceNotes}
            hint="Words to use or avoid, phrases you like, anything the AI should know."
            className="sm:col-span-2"
          />
          <TextArea
            label="Brand guidelines"
            name="guidelines"
            rows={4}
            defaultValue={values.guidelines}
            hint="Claims you can and cannot make, legal wording, compliance notes."
            className="sm:col-span-2"
          />

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-ink-800">Brand colors</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {colors.map((color, index) => (
                <span key={`${color}-${index}`} className="flex items-center gap-1.5 rounded-lg border border-ink-200 p-1.5">
                  <input
                    type="color"
                    value={color}
                    aria-label={`Brand color ${index + 1}`}
                    onChange={(event) =>
                      setColors((current) => current.map((c, i) => (i === index ? event.target.value : c)))
                    }
                    className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="font-mono text-xs text-ink-500">{color}</span>
                  <button
                    type="button"
                    onClick={() => setColors((current) => current.filter((_, i) => i !== index))}
                    className="rounded px-1 text-xs text-ink-400 hover:text-red-600"
                    aria-label={`Remove color ${color}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {colors.length < 8 ? (
                <Button variant="outline" size="sm" onClick={() => setColors((current) => [...current, '#0f172a'])}>
                  Add color
                </Button>
              ) : null}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Market" description="Drives language, currency and scheduling." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Country" name="country" defaultValue={values.country} placeholder="US" />
          <Select label="Language" name="language" defaultValue={values.language}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="ar">العربية</option>
            <option value="pt">Português</option>
            <option value="de">Deutsch</option>
          </Select>
          <TextInput label="Currency" name="currency" defaultValue={values.currency} placeholder="USD" maxLength={3} />
          <Select label="Timezone" name="timezone" defaultValue={values.timezone} className="sm:col-span-3">
            {timezoneOptions(values.timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Platforms" description="Where this brand publishes." />
        <CardBody>
          <div className="grid gap-2 sm:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const checked = platforms.includes(platform);
              return (
                <label
                  key={platform}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                    checked ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    checked={checked}
                    onChange={() =>
                      setPlatforms((current) =>
                        current.includes(platform)
                          ? current.filter((value) => value !== platform)
                          : [...current, platform],
                      )
                    }
                  />
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: PLATFORM_META[platform].color }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-ink-900">{PLATFORM_META[platform].label}</span>
                </label>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="ghost">
          <Link href="/brands">Cancel</Link>
        </Button>
        <SubmitButton size="lg" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

'use client';

import { useActionState, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Select, TextArea, TextInput } from '@/components/ui/field';
import { FormMessage, SubmitButton, fieldError } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { timezoneOptions } from '@/lib/dates';
import { PLATFORMS, PLATFORM_META } from '@/lib/platforms';
import { BRAND_TONES, TONE_DESCRIPTIONS, TONE_LABELS } from '@/lib/tones';
import { completeOnboardingAction, skipOnboardingAction } from '@/server/actions/onboarding';

const TONES = BRAND_TONES.map((tone) => [tone, TONE_LABELS[tone], TONE_DESCRIPTIONS[tone]] as const);

const STEPS = ['Brand', 'What you sell', 'Audience', 'Market', 'Tone', 'Platforms'] as const;

export function OnboardingWizard({
  defaultTimezone,
  organizationName,
}: {
  defaultTimezone: string;
  organizationName: string;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(
    completeOnboardingAction,
    IDLE as ActionState<null>,
  );
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [platforms, setPlatforms] = useState<string[]>(['instagram', 'facebook']);
  const [tone, setTone] = useState<string>('friendly');
  const [brandName, setBrandName] = useState(organizationName);

  useEffect(() => {
    if (defaultTimezone === 'UTC') {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }
  }, [defaultTimezone]);

  const last = step === STEPS.length - 1;
  const canAdvance = step !== 0 || brandName.trim().length > 0;

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">Step {step + 1} of {STEPS.length}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">Let us set up your first brand</h1>
        <p className="mt-2 text-sm text-ink-500">
          The AI writes in your brand voice, so a minute here makes every campaign better. You can change all of this
          later.
        </p>
      </div>

      <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                index === step
                  ? 'bg-brand-600 text-white'
                  : index < step
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-ink-100 text-ink-500 hover:bg-ink-200',
              )}
              aria-current={index === step ? 'step' : undefined}
            >
              {index < step ? <Check className="mr-1 inline size-3" aria-hidden="true" /> : null}
              {label}
            </button>
          </li>
        ))}
      </ol>

      <Card>
        <CardBody className="space-y-5">
          <form action={action} className="space-y-5">
            {/* Inputs stay mounted across steps so nothing is lost when going back. */}
            <input type="hidden" name="timezone" value={timezone} />
            <input type="hidden" name="tone" value={tone} />
            {platforms.map((platform) => (
              <input key={platform} type="hidden" name="platforms" value={platform} />
            ))}

            <FormMessage state={state} />

            <div className={step === 0 ? 'space-y-4' : 'hidden'}>
              <TextInput
                label="What is your business or brand name?"
                name="brandName"
                required
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder="DavMicBet"
                error={fieldError(state, 'brandName')}
              />
              <TextInput
                label="Industry"
                name="industry"
                placeholder="Beauty & Cosmetics"
                hint="Helps the AI pick the right vocabulary and references."
                error={fieldError(state, 'industry')}
              />
            </div>

            <div className={step === 1 ? 'space-y-4' : 'hidden'}>
              <TextArea
                label="What do you sell?"
                name="description"
                rows={4}
                placeholder="Natural hair and skin care made for dry, damaged hair — oils, masks and daily serums."
                hint="One or two sentences is plenty."
                error={fieldError(state, 'description')}
              />
            </div>

            <div className={step === 2 ? 'space-y-4' : 'hidden'}>
              <TextArea
                label="Who is your target audience?"
                name="targetAudience"
                rows={3}
                placeholder="Women aged 25–55 who want visible results without salon prices."
                error={fieldError(state, 'targetAudience')}
              />
            </div>

            <div className={step === 3 ? 'space-y-4' : 'hidden'}>
              <TextInput
                label="Which country or market do you target?"
                name="country"
                defaultValue="US"
                placeholder="US"
                hint="Use a country name or two-letter code."
                error={fieldError(state, 'country')}
              />
              <Select label="Content language" name="language" defaultValue="en">
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="ar">العربية</option>
                <option value="pt">Português</option>
                <option value="de">Deutsch</option>
              </Select>
              <Select
                label="Timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                hint="Scheduling uses this timezone."
              >
                {timezoneOptions(timezone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </div>

            <fieldset className={step === 4 ? 'space-y-3' : 'hidden'}>
              <legend className="text-sm font-medium text-ink-800">What tone should the AI write in?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TONES.map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
                      tone === value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name="tone-choice"
                      checked={tone === value}
                      onChange={() => setTone(value)}
                    />
                    <span className="block text-sm font-medium text-ink-900">{label}</span>
                    <span className="block text-xs text-ink-500">{hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={step === 5 ? 'space-y-3' : 'hidden'}>
              <legend className="text-sm font-medium text-ink-800">Which platforms do you use?</legend>
              <p className="text-xs text-ink-500">
                Pick the ones you already post to. You can connect the accounts later — nothing publishes without your
                approval.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
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
            </fieldset>

            <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                aria-label="Previous step"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>

              {last ? (
                <SubmitButton size="lg" pendingLabel="Setting things up…">
                  Finish setup
                </SubmitButton>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} size="lg">
                  Next
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <form action={skipOnboardingAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline">
          Skip for now
        </button>
      </form>
    </div>
  );
}

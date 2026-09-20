'use client';

import { useActionState, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Select, TextArea, TextInput } from '@/components/ui/field';
import { FormMessage, SubmitButton, fieldError } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { cn } from '@/lib/cn';
import { PLATFORMS, PLATFORM_META } from '@/lib/platforms';
import { BRAND_TONES, TONE_LABELS } from '@/lib/tones';
import { createCampaignAction } from '@/server/actions/campaigns';

type BrandOption = {
  id: string;
  name: string;
  tone: string;
  language: string;
  targetAudience: string;
  activePlatforms: string[];
};

type ProductOption = { id: string; brandId: string; name: string; description: string };

type TemplateOption = {
  key: string;
  name: string;
  description: string;
  objective: string;
  defaultPlatforms: string[];
  defaultFormats: string[];
};

const OBJECTIVES: [string, string, string][] = [
  ['product_launch', 'Product launch', 'Something new, introduced properly.'],
  ['sales', 'Sales', 'Drive purchases of an existing product.'],
  ['brand_awareness', 'Brand awareness', 'Get known by the right people.'],
  ['website_traffic', 'Website traffic', 'Send people to your product page.'],
  ['lead_generation', 'Lead generation', 'Collect interest before the sale.'],
  ['engagement', 'Engagement', 'Start conversations and earn shares.'],
  ['seasonal_promotion', 'Seasonal promotion', 'Tie into a season or occasion.'],
  ['event_promotion', 'Event promotion', 'Fill an event or launch date.'],
  ['new_product_announcement', 'New arrival', 'Add to an existing range.'],
  ['educational', 'Educational', 'Teach first, sell second.'],
  ['retargeting', 'Retargeting', 'Reach people who already saw it.'],
];

const FORMATS: [string, string][] = [
  ['image', 'Image'],
  ['carousel', 'Carousel'],
  ['short_video', 'Short video'],
  ['reel', 'Reel'],
  ['short', 'YouTube Short'],
  ['story', 'Story'],
  ['text', 'Text only'],
  ['long_video', 'Long video'],
];

const STEPS = ['Product', 'Goal', 'Platforms'] as const;

export function CampaignWizard({
  brands,
  products,
  templates,
  initialProductId,
  initialBrandId,
  initialTemplate,
}: {
  brands: BrandOption[];
  products: ProductOption[];
  templates: TemplateOption[];
  initialProductId: string;
  initialBrandId: string;
  initialTemplate: string;
}) {
  const [state, action] = useActionState<ActionState<null>, FormData>(createCampaignAction, IDLE as ActionState<null>);

  const initialProduct = products.find((p) => p.id === initialProductId);
  const [brandId, setBrandId] = useState(initialProduct?.brandId || initialBrandId || brands[0]?.id || '');
  const [productId, setProductId] = useState(initialProductId || '');
  const [templateKey, setTemplateKey] = useState(initialTemplate);
  const [objective, setObjective] = useState('product_launch');
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);

  const brand = brands.find((b) => b.id === brandId);
  const brandProducts = useMemo(() => products.filter((p) => p.brandId === brandId), [products, brandId]);

  const [platforms, setPlatforms] = useState<string[]>(
    brand?.activePlatforms.length ? brand.activePlatforms : ['instagram', 'facebook'],
  );
  const [formats, setFormats] = useState<string[]>(['image']);

  function applyTemplate(key: string) {
    setTemplateKey(key);
    const template = templates.find((t) => t.key === key);
    if (!template) return;
    setObjective(template.objective);
    if (template.defaultPlatforms.length > 0) setPlatforms(template.defaultPlatforms);
    if (template.defaultFormats.length > 0) setFormats(template.defaultFormats);
  }

  function toggle(setter: typeof setPlatforms, value: string) {
    setter((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));
  }

  const canAdvance = step === 0 ? Boolean(productId) : step === 1 ? Boolean(objective) : platforms.length > 0;
  const last = step === STEPS.length - 1;

  return (
    <form action={action} className="space-y-5">
      {platforms.map((platform) => (
        <input key={platform} type="hidden" name="platforms" value={platform} />
      ))}
      {formats.map((format) => (
        <input key={format} type="hidden" name="formats" value={format} />
      ))}
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="objective" value={objective} />
      {templateKey ? <input type="hidden" name="templateKey" value={templateKey} /> : null}

      <FormMessage state={state} />

      <ol className="flex gap-1.5" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1">
            <button
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                'w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                index === step ? 'bg-brand-600 text-white' : index < step ? 'bg-brand-50 text-brand-700' : 'bg-white text-ink-500 ring-1 ring-inset ring-ink-200',
              )}
              aria-current={index === step ? 'step' : undefined}
            >
              <span className="block opacity-70">Step {index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {/* Step 1 — what are we promoting */}
      <Card className={step === 0 ? '' : 'hidden'}>
        <CardBody className="space-y-4">
          <p className="text-base font-semibold text-ink-900">What would you like to promote?</p>

          {brands.length > 1 ? (
            <Select
              label="Brand"
              value={brandId}
              onChange={(event) => {
                setBrandId(event.target.value);
                setProductId('');
                const next = brands.find((b) => b.id === event.target.value);
                if (next?.activePlatforms.length) setPlatforms(next.activePlatforms);
              }}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          ) : null}

          <fieldset>
            <legend className="text-sm font-medium text-ink-800">Product</legend>
            {brandProducts.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">This brand has no products yet.</p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {brandProducts.map((product) => (
                  <li key={product.id}>
                    <label
                      className={cn(
                        'block cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
                        productId === product.id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name="product-choice"
                        checked={productId === product.id}
                        onChange={() => setProductId(product.id)}
                      />
                      <span className="block truncate text-sm font-medium text-ink-900">{product.name}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500">
                        {product.description || 'No description'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {fieldError(state, 'productId') ? (
              <p className="mt-2 text-xs font-medium text-red-600">{fieldError(state, 'productId')}</p>
            ) : null}
          </fieldset>
        </CardBody>
      </Card>

      {/* Step 2 — objective and template */}
      <Card className={step === 1 ? '' : 'hidden'}>
        <CardBody className="space-y-5">
          <div>
            <p className="text-base font-semibold text-ink-900">What is this campaign for?</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {OBJECTIVES.map(([value, label, hint]) => (
                <label
                  key={value}
                  className={cn(
                    'cursor-pointer rounded-lg border px-3 py-2.5 transition-colors',
                    objective === value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name="objective-choice"
                    checked={objective === value}
                    onChange={() => setObjective(value)}
                  />
                  <span className="block text-sm font-medium text-ink-900">{label}</span>
                  <span className="block text-xs text-ink-500">{hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-ink-800">Start from a template (optional)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTemplateKey('')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                  templateKey === '' ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                )}
              >
                None
              </button>
              {templates.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => applyTemplate(template.key)}
                  title={template.description}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                    templateKey === template.key
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Step 3 — platforms and formats */}
      <Card className={step === 2 ? '' : 'hidden'}>
        <CardBody className="space-y-5">
          <div>
            <p className="text-base font-semibold text-ink-900">Where should it go?</p>
            <p className="mt-1 text-sm text-ink-500">
              Each platform gets its own copy, written for that platform. You review everything before it publishes.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {PLATFORMS.map((platform) => {
                const checked = platforms.includes(platform);
                const meta = PLATFORM_META[platform];
                return (
                  <label
                    key={platform}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                      checked ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      checked={checked}
                      onChange={() => toggle(setPlatforms, platform)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
                        <span className="text-sm font-medium text-ink-900">{meta.label}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">{meta.capabilities.join(', ')}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {fieldError(state, 'platforms') ? (
              <p className="mt-2 text-xs font-medium text-red-600">{fieldError(state, 'platforms')}</p>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-medium text-ink-800">Content formats</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FORMATS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggle(setFormats, value)}
                  aria-pressed={formats.includes(value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                    formats.includes(value)
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              aria-expanded={advanced}
              className="flex w-full items-center justify-between rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
            >
              Advanced options
              <ChevronDown className={cn('size-4 transition-transform', advanced && 'rotate-180')} aria-hidden="true" />
            </button>

            {advanced ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <TextInput
                  label="Campaign name"
                  name="title"
                  placeholder="Leave blank and the AI names it"
                  className="sm:col-span-2"
                />
                <Select label="Tone" name="tone" defaultValue={brand?.tone ?? 'friendly'}>
                  {BRAND_TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {TONE_LABELS[tone]}
                    </option>
                  ))}
                </Select>
                <Select label="Language" name="language" defaultValue={brand?.language ?? 'en'}>
                  <option value="en">English</option>
                  <option value="tr">Türkçe</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                  <option value="ar">العربية</option>
                  <option value="pt">Português</option>
                  <option value="de">Deutsch</option>
                </Select>
                <TextInput
                  label="Campaign duration (days)"
                  name="durationDays"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="14"
                />
                <TextArea
                  label="Override target audience"
                  name="targetAudience"
                  rows={2}
                  placeholder={brand?.targetAudience || 'Leave blank to use the brand audience'}
                  className="sm:col-span-2"
                />
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>

        {last ? (
          <SubmitButton size="lg" pendingLabel="Starting generation…" disabled={!canAdvance}>
            <Sparkles className="size-4" aria-hidden="true" />
            Generate campaign
          </SubmitButton>
        ) : (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
            Next
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </form>
  );
}

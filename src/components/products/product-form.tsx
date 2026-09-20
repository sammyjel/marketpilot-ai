'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select, TextArea, TextInput } from '@/components/ui/field';
import { FormMessage, SubmitButton, fieldError } from '@/components/forms/form-status';
import { MediaDropzone } from './media-dropzone';
import { IDLE, failure, type ActionState } from '@/lib/action-state';
import { hoistFilesToStorage } from '@/lib/direct-upload';

export type ProductFormValues = {
  brandId: string;
  name: string;
  description: string;
  productUrl: string;
  price: string;
  currency: string;
  category: string;
  targetAudience: string;
  callToAction: string;
  benefits: string;
  features: string;
  keywords: string;
};

export type BrandOption = { id: string; name: string; currency: string };

export function ProductForm({
  action,
  values,
  brands,
  submitLabel,
  existingMedia = [],
}: {
  action: (prev: ActionState<null>, formData: FormData) => Promise<ActionState<null>>;
  values: ProductFormValues;
  brands: BrandOption[];
  submitLabel: string;
  existingMedia?: { id: string; url: string; kind: string }[];
}) {
  // Media goes straight to object storage before the action runs, so only IDs
  // cross the Server Action boundary — request bodies are capped well below the
  // media limits on serverless hosts. Where storage cannot presign this is a
  // no-op and `action` receives the files exactly as it always did.
  const [state, formAction] = useActionState<ActionState<null>, FormData>(async (previous, formData) => {
    const brandId = formData.get('brandId');

    try {
      await hoistFilesToStorage(formData, { brandId: typeof brandId === 'string' ? brandId : null });
    } catch (error) {
      return failure('invalid_media', error instanceof Error ? error.message : 'That upload could not be completed.');
    }

    return action(previous, formData);
  }, IDLE as ActionState<null>);
  const [advanced, setAdvanced] = useState(false);
  const [keptMedia, setKeptMedia] = useState(existingMedia.map((m) => m.id));

  return (
    <form action={formAction} className="space-y-5">
      {keptMedia.map((id) => (
        <input key={id} type="hidden" name="existingMedia" value={id} />
      ))}

      <FormMessage state={state} />

      <Card>
        <CardHeader
          title="The essentials"
          description="A photo and one line is enough — the AI fills in the rest and marks anything it cannot determine."
        />
        <CardBody className="space-y-4">
          <Select label="Brand" name="brandId" required defaultValue={values.brandId} error={fieldError(state, 'brandId')}>
            {brands.length === 0 ? <option value="">Create a brand first</option> : null}
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>

          <TextInput
            label="Product name"
            name="name"
            required
            defaultValue={values.name}
            placeholder="Hair Growth Oil"
            error={fieldError(state, 'name')}
          />

          <TextArea
            label="Describe it in a sentence"
            name="description"
            rows={3}
            defaultValue={values.description}
            placeholder="Hair growth oil for women with dry and damaged hair."
            hint="Plain language is fine. This is what the AI reads first."
            error={fieldError(state, 'description')}
          />

          {existingMedia.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-medium text-ink-800">Current media</legend>
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {existingMedia.map((media) => {
                  const kept = keptMedia.includes(media.id);
                  return (
                    <li key={media.id}>
                      <label className="block cursor-pointer">
                        <span className="sr-only">Keep this file</span>
                        <span
                          className={
                            kept
                              ? 'block aspect-square overflow-hidden rounded-lg border-2 border-brand-500'
                              : 'block aspect-square overflow-hidden rounded-lg border-2 border-ink-200 opacity-40'
                          }
                        >
                          {media.kind === 'video' ? (
                            <video src={media.url} className="size-full object-cover" muted playsInline />
                          ) : (
                            // Served from our authenticated media route.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={media.url} alt="" className="size-full object-cover" />
                          )}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={kept}
                          onChange={() =>
                            setKeptMedia((current) =>
                              current.includes(media.id)
                                ? current.filter((id) => id !== media.id)
                                : [...current, media.id],
                            )
                          }
                        />
                        <span className="mt-1 block text-center text-[11px] text-ink-500">
                          {kept ? 'Keeping' : 'Removing'}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-ink-800">
              {existingMedia.length > 0 ? 'Add more media' : 'Product photos'}
            </p>
            <MediaDropzone />
          </div>
        </CardBody>
      </Card>

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          className="flex w-full items-center justify-between rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          Advanced options
          <ChevronDown className={advanced ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'} aria-hidden="true" />
        </button>

        {advanced ? (
          <Card className="mt-3">
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Product URL"
                name="productUrl"
                type="url"
                defaultValue={values.productUrl}
                placeholder="https://shop.example.com/hair-oil"
                error={fieldError(state, 'productUrl')}
                className="sm:col-span-2"
              />
              <TextInput
                label="Price"
                name="price"
                inputMode="decimal"
                defaultValue={values.price}
                placeholder="24.99"
                error={fieldError(state, 'price')}
              />
              <TextInput label="Currency" name="currency" maxLength={3} defaultValue={values.currency} placeholder="USD" />
              <TextInput
                label="Category"
                name="category"
                defaultValue={values.category}
                placeholder="Hair care"
                className="sm:col-span-2"
              />
              <TextArea
                label="Key benefits"
                name="benefits"
                rows={3}
                defaultValue={values.benefits}
                hint="One per line."
                className="sm:col-span-2"
              />
              <TextArea
                label="Features"
                name="features"
                rows={3}
                defaultValue={values.features}
                hint="One per line."
                className="sm:col-span-2"
              />
              <TextArea
                label="Target audience"
                name="targetAudience"
                rows={2}
                defaultValue={values.targetAudience}
                hint="Leave blank to inherit the brand audience."
                className="sm:col-span-2"
              />
              <TextInput
                label="Call to action"
                name="callToAction"
                defaultValue={values.callToAction}
                placeholder="Shop now"
              />
              <TextInput
                label="Keywords"
                name="keywords"
                defaultValue={values.keywords}
                hint="Comma separated, used for SEO."
              />
            </CardBody>
          </Card>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="ghost">
          <Link href="/products">Cancel</Link>
        </Button>
        <SubmitButton size="lg" pendingLabel="Uploading…" disabled={brands.length === 0}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

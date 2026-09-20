'use client';

import { useActionState } from 'react';
import { Card, CardBody } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { FormMessage, SubmitButton } from '@/components/forms/form-status';
import { MediaDropzone } from '@/components/products/media-dropzone';
import { IDLE, failure, type ActionState } from '@/lib/action-state';
import { hoistFilesToStorage } from '@/lib/direct-upload';
import { uploadMediaAction } from '@/server/actions/media-upload';

export function MediaUploader({ brands }: { brands: { id: string; name: string }[] }) {
  // Bytes go straight to object storage; only the resulting IDs reach the
  // Server Action. See hoistFilesToStorage for why, and for the fallback when
  // the storage driver cannot hand out upload URLs.
  const [state, action] = useActionState<ActionState<null>, FormData>(async (previous, formData) => {
    const brandId = formData.get('brandId');

    try {
      await hoistFilesToStorage(formData, { brandId: typeof brandId === 'string' ? brandId : null });
    } catch (error) {
      return failure('invalid_media', error instanceof Error ? error.message : 'That upload could not be completed.');
    }

    return uploadMediaAction(previous, formData);
  }, IDLE as ActionState<null>);

  return (
    <Card>
      <CardBody>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />

          {brands.length > 1 ? (
            <Select label="Assign to brand" name="brandId" defaultValue={brands[0]?.id}>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          ) : (
            <input type="hidden" name="brandId" value={brands[0]?.id ?? ''} />
          )}

          <MediaDropzone />

          <div className="flex justify-end">
            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

'use server';

import { revalidatePath } from 'next/cache';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { requireAuth } from '@/server/auth/context';
import { uploadMedia } from '@/server/services/media';

/**
 * Direct upload into the media library.
 *
 * Bytes are validated in `uploadMedia` — magic-byte type detection, size and
 * dimension ceilings, and the plan's storage quota — before anything is stored.
 *
 * `mediaAssetIds` names assets the browser uploaded straight to storage and
 * `/api/media/finalize` already accepted, under the same validation. They are
 * counted here only so the form reports the whole batch.
 */
export async function uploadMediaAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const alreadyStored = formData
    .getAll('mediaAssetIds')
    .filter((entry): entry is string => typeof entry === 'string' && entry !== '');

  if (files.length === 0 && alreadyStored.length === 0) {
    return failure('validation_failed', 'Choose at least one file to upload.');
  }

  const brandIdRaw = formData.get('brandId');
  const brandId = typeof brandIdRaw === 'string' && brandIdRaw ? brandIdRaw : null;

  try {
    const ctx = await requireAuth();
    for (const file of files.slice(0, 10)) {
      await uploadMedia(ctx, {
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        brandId,
      });
    }
  } catch (error) {
    return fromError(error);
  }

  revalidatePath('/media');
  const total = files.length + alreadyStored.length;
  return success(null, `Uploaded ${total} file${total === 1 ? '' : 's'}.`);
}

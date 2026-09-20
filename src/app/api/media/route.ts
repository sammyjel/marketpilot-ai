import { AppError } from '@/lib/errors';
import { ok, pagination, route, searchParams } from '@/server/api/http';
import { MAX_VIDEO_BYTES, listMedia, uploadMedia } from '@/server/services/media';

export const GET = route(async ({ request, auth }) => {
  const params = searchParams(request);
  const { limit, offset } = pagination(request, 50);
  const kind = params.get('kind');

  return ok(
    await listMedia(auth, {
      ...(params.get('brandId') ? { brandId: params.get('brandId')! } : {}),
      ...(kind === 'image' || kind === 'video' || kind === 'audio' ? { kind } : {}),
      limit,
      offset,
    }),
  );
});

/**
 * Multipart upload. The declared content type is ignored — `uploadMedia`
 * re-detects the real type from the file's magic bytes before storing it.
 */
export const POST = route(
  async ({ request, auth }) => {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      throw new AppError('validation_failed', 'Attach a file in the "file" field.');
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new AppError('invalid_media', 'That file is larger than the 200 MB limit.');
    }

    const brandId = form.get('brandId');
    const altText = form.get('altText');

    const record = await uploadMedia(auth, {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      brandId: typeof brandId === 'string' && brandId ? brandId : null,
      altText: typeof altText === 'string' && altText ? altText : null,
    });

    return ok(record, { status: 201 });
  },
  { capability: 'media:write' },
);

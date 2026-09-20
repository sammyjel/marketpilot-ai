import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { finalizeStagedUpload } from '@/server/services/media';

const schema = z.object({
  stagingKey: z.string().min(1).max(512),
  filename: z.string().max(255).nullish(),
  brandId: z.string().min(1).nullish(),
  altText: z.string().max(1000).nullish(),
});

/**
 * Step two of a direct-to-bucket upload: accept bytes the browser already
 * wrote. The staging key is verified against the caller's organisation and the
 * bytes are re-inspected before anything is recorded.
 */
export const POST = route(
  async ({ request, auth }) => {
    const body = await parseJson(request, schema);

    const record = await finalizeStagedUpload(auth, {
      stagingKey: body.stagingKey,
      filename: body.filename ?? null,
      brandId: body.brandId ?? null,
      altText: body.altText ?? null,
    });

    return ok(record, { status: 201 });
  },
  { capability: 'media:write' },
);

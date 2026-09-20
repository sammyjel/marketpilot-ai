import { z } from 'zod';
import { ok, parseJson, route } from '@/server/api/http';
import { MAX_VIDEO_BYTES, createStagedUpload } from '@/server/services/media';

const schema = z.object({
  byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
});

/**
 * Step one of a direct-to-bucket upload: mint a short-lived PUT URL.
 *
 * `{ supported: false }` means the configured storage driver cannot presign —
 * the local disk driver in development. The client then posts bytes through the
 * server instead, which is the original path and still works.
 */
export const POST = route(
  async ({ request, auth }) => {
    const body = await parseJson(request, schema);
    const staged = await createStagedUpload(auth, { byteSize: body.byteSize });

    if (!staged) return ok({ supported: false as const });

    return ok({ supported: true as const, ...staged });
  },
  { capability: 'media:write' },
);

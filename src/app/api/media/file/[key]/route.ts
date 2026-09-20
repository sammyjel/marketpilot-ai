import { and, eq, isNull, or } from 'drizzle-orm';
import { notFound } from '@/lib/errors';
import { storage } from '@/providers/storage';
import { fail, route } from '@/server/api/http';
import { getDb } from '@/server/db';
import { mediaAssets } from '@/server/db/schema';

type Params = { key: string };

/**
 * Authenticated media delivery.
 *
 * Bytes are never served from a public directory: the storage key must resolve
 * to a media row owned by the caller's organization, so one tenant can never
 * read another's uploads by guessing a key.
 */
export const GET = route<Params>(async ({ auth, params }) => {
  const key = decodeURIComponent(params.key);
  const db = await getDb();

  const rows = await db
    .select({ mimeType: mediaAssets.mimeType, storageKey: mediaAssets.storageKey, thumbnailKey: mediaAssets.thumbnailKey })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.organizationId, auth.organization.id),
        isNull(mediaAssets.deletedAt),
        or(eq(mediaAssets.storageKey, key), eq(mediaAssets.thumbnailKey, key)),
      ),
    )
    .limit(1);

  const record = rows[0];
  if (!record) return fail(notFound('That file'));

  const isThumbnail = record.thumbnailKey === key;

  try {
    const body = await storage().get(key);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': isThumbnail ? 'image/jpeg' : record.mimeType,
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        // Never render user-supplied bytes as an inline document.
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    }) as never;
  } catch (error) {
    return fail(error);
  }
});

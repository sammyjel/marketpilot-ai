import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import { AppError, notFound } from '@/lib/errors';
import { sha256Hex } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { planFor } from '@/lib/plans';
import { storage, storageKey } from '@/providers/storage';
import { getDb } from '@/server/db';
import { mediaAssets, usageRecords } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import { checkRateLimit } from './rate-limit';

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_IMAGE_PIXELS = 50_000_000; // guards against decompression bombs

/**
 * Allow-list keyed by the *detected* MIME type, not the declared one. A file is
 * only accepted when its magic bytes match an entry here.
 */
const ALLOWED: Record<string, { kind: 'image' | 'video'; extension: string; maxBytes: number }> = {
  'image/jpeg': { kind: 'image', extension: 'jpg', maxBytes: MAX_IMAGE_BYTES },
  'image/png': { kind: 'image', extension: 'png', maxBytes: MAX_IMAGE_BYTES },
  'image/webp': { kind: 'image', extension: 'webp', maxBytes: MAX_IMAGE_BYTES },
  'video/mp4': { kind: 'video', extension: 'mp4', maxBytes: MAX_VIDEO_BYTES },
  'video/quicktime': { kind: 'video', extension: 'mov', maxBytes: MAX_VIDEO_BYTES },
};

export const ACCEPTED_UPLOAD_MIME = Object.keys(ALLOWED).join(',');

export type MediaRecord = typeof mediaAssets.$inferSelect;

export type UploadInput = {
  buffer: Buffer;
  /** Declared filename — used only for display, never as a storage path. */
  filename?: string | null;
  brandId?: string | null;
  altText?: string | null;
};

type Validated = {
  kind: 'image' | 'video';
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
};

/**
 * Validates a byte buffer before anything touches storage:
 *   1. size ceiling
 *   2. real MIME type from magic bytes (a .jpg full of PHP is rejected here)
 *   3. image dimensions, including a pixel ceiling
 */
export async function validateUpload(buffer: Buffer): Promise<Validated> {
  if (buffer.byteLength === 0) {
    throw new AppError('invalid_media', 'That file is empty.');
  }
  if (buffer.byteLength > MAX_VIDEO_BYTES) {
    throw new AppError('invalid_media', 'That file is larger than the 200 MB limit.');
  }

  const detected = await fileTypeFromBuffer(buffer);
  const rule = detected ? ALLOWED[detected.mime] : undefined;

  if (!detected || !rule) {
    throw new AppError(
      'invalid_media',
      'That file type is not supported. Upload a JPG, PNG, WEBP, MP4 or MOV file.',
      { details: { detected: detected?.mime ?? 'unknown' } },
    );
  }

  if (buffer.byteLength > rule.maxBytes) {
    const limitMb = Math.round(rule.maxBytes / (1024 * 1024));
    throw new AppError('invalid_media', `${rule.kind === 'image' ? 'Images' : 'Videos'} must be under ${limitMb} MB.`);
  }

  let width: number | null = null;
  let height: number | null = null;

  if (rule.kind === 'image') {
    const sharp = (await import('sharp')).default;
    try {
      const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      throw new AppError('invalid_media', 'That image could not be read. It may be corrupted.');
    }
    if (!width || !height) {
      throw new AppError('invalid_media', 'That image has no readable dimensions.');
    }
    if (width * height > MAX_IMAGE_PIXELS) {
      throw new AppError('invalid_media', 'That image resolution is too large to process.');
    }
  }

  return { kind: rule.kind, mimeType: detected.mime, extension: rule.extension, width, height };
}

/** Downscaled JPEG preview. Failure is non-fatal — the original still works. */
async function generateThumbnail(buffer: Buffer, organizationId: string): Promise<string | null> {
  try {
    const sharp = (await import('sharp')).default;
    const thumb = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();

    const key = storageKey(organizationId, 'thumbnails', 'jpg');
    await storage().put(key, thumb, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable' });
    return key;
  } catch (error) {
    logger.warn('media.thumbnail_failed', { error });
    return null;
  }
}

async function assertStorageQuota(ctx: AuthContext, incomingBytes: number): Promise<void> {
  const limit = planFor(ctx.organization.planTier).limits.storage_bytes;
  if (limit === null) return;

  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${mediaAssets.byteSize}), 0)` })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.organizationId, ctx.organization.id), isNull(mediaAssets.deletedAt)));

  if (Number(row?.total ?? 0) + incomingBytes > limit) {
    throw new AppError(
      'usage_limit_reached',
      `Your ${ctx.organization.planTier} plan storage is full. Delete unused media or upgrade to add more.`,
    );
  }
}

export async function uploadMedia(
  ctx: AuthContext,
  input: UploadInput,
  source: 'upload' | 'ai_image' | 'ai_video' | 'ai_voice' | 'derived' = 'upload',
): Promise<MediaRecord> {
  assertCapability(ctx, 'media:write');
  checkRateLimit('upload', ctx.user.id);

  const validated = await validateUpload(input.buffer);
  await assertStorageQuota(ctx, input.buffer.byteLength);

  const key = storageKey(ctx.organization.id, validated.kind === 'image' ? 'images' : 'videos', validated.extension);
  await storage().put(key, input.buffer, {
    contentType: validated.mimeType,
    cacheControl: 'private, max-age=31536000, immutable',
  });

  const thumbnailKey = validated.kind === 'image' ? await generateThumbnail(input.buffer, ctx.organization.id) : null;

  const db = await getDb();
  const [record] = await db
    .insert(mediaAssets)
    .values({
      organizationId: ctx.organization.id,
      brandId: input.brandId ?? null,
      kind: validated.kind,
      source,
      storageKey: key,
      mimeType: validated.mimeType,
      byteSize: input.buffer.byteLength,
      width: validated.width,
      height: validated.height,
      // Stored for display only; it is never used to build a path.
      originalFilename: input.filename ? input.filename.slice(0, 255) : null,
      checksum: sha256Hex(input.buffer),
      thumbnailKey,
      altText: input.altText ?? null,
      createdByUserId: ctx.user.id,
    })
    .returning();

  await db.insert(usageRecords).values({
    organizationId: ctx.organization.id,
    metric: 'storage_bytes',
    quantity: input.buffer.byteLength,
    periodStart: startOfBillingPeriod(),
    entityType: 'media_asset',
    entityId: record!.id,
    actorUserId: ctx.user.id,
  });

  logger.info('media.uploaded', {
    organizationId: ctx.organization.id,
    mediaId: record!.id,
    kind: validated.kind,
    bytes: input.buffer.byteLength,
  });

  return record!;
}

/** Key prefix for bytes uploaded by the browser but not yet accepted. */
const STAGING_KIND = 'staging';

export type StagedUpload = { uploadUrl: string; stagingKey: string };

/**
 * Mints a short-lived URL the browser PUTs one file to, bypassing the server.
 *
 * Serverless hosts cap request bodies far below this app's media limits
 * (Netlify at roughly 6 MB against a 200 MB video ceiling), so routing bytes
 * through a Server Action stops working there. The browser writes to the bucket
 * instead and then calls `finalizeStagedUpload`, which inspects the real bytes.
 *
 * Nothing the client says here is trusted: the declared size only avoids
 * minting a URL for a file that could never be accepted.
 *
 * Returns null when the configured driver cannot presign, so callers fall back
 * to posting bytes through the server.
 */
export async function createStagedUpload(
  ctx: AuthContext,
  input: { byteSize: number },
): Promise<StagedUpload | null> {
  assertCapability(ctx, 'media:write');
  checkRateLimit('uploadUrl', ctx.user.id);

  if (input.byteSize <= 0) {
    throw new AppError('invalid_media', 'That file is empty.');
  }
  if (input.byteSize > MAX_VIDEO_BYTES) {
    throw new AppError('invalid_media', 'That file is larger than the 200 MB limit.');
  }
  await assertStorageQuota(ctx, input.byteSize);

  const stagingKey = storageKey(ctx.organization.id, STAGING_KIND, 'bin');
  const uploadUrl = await storage().presignPut(stagingKey, { expiresInSeconds: 900 });
  if (!uploadUrl) return null;

  return { uploadUrl, stagingKey };
}

/**
 * Accepts bytes the browser has already written to the bucket.
 *
 * The bytes are read back and put through `uploadMedia` unchanged, so a staged
 * upload passes exactly the same checks as one posted through the server —
 * magic-byte type detection, the size and pixel ceilings, and the plan quota.
 * Reading them back costs a round trip and is the price of not trusting the
 * client about what it just uploaded.
 */
export async function finalizeStagedUpload(
  ctx: AuthContext,
  input: { stagingKey: string; filename?: string | null; brandId?: string | null; altText?: string | null },
): Promise<MediaRecord> {
  assertCapability(ctx, 'media:write');

  // The key round-trips through the browser, so it is treated as hostile: it
  // has to be one this organisation staged, never a path into another tenant.
  const prefix = `${ctx.organization.id}/${STAGING_KIND}/`;
  if (!input.stagingKey.startsWith(prefix) || input.stagingKey.includes('..')) {
    throw new AppError('forbidden', 'That upload does not belong to this workspace.');
  }

  const buffer = await storage().get(input.stagingKey);

  try {
    return await uploadMedia(ctx, {
      buffer,
      filename: input.filename ?? null,
      brandId: input.brandId ?? null,
      altText: input.altText ?? null,
    });
  } finally {
    // The staged copy is dead either way. Bucket lifecycle rules on the
    // staging/ prefix are the backstop for the cases this never reaches.
    try {
      await storage().delete(input.stagingKey);
    } catch (error) {
      logger.warn('media.staging_cleanup_failed', { error });
    }
  }
}

export async function getMedia(ctx: AuthContext, mediaId: string): Promise<MediaRecord> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.id, mediaId), eq(mediaAssets.organizationId, ctx.organization.id), isNull(mediaAssets.deletedAt)),
    )
    .limit(1);

  const record = rows[0];
  if (!record) throw notFound('That file');
  return record;
}

export async function listMedia(
  ctx: AuthContext,
  options: { brandId?: string; kind?: 'image' | 'video' | 'audio'; limit?: number; offset?: number } = {},
): Promise<MediaRecord[]> {
  const db = await getDb();
  const filters = [eq(mediaAssets.organizationId, ctx.organization.id), isNull(mediaAssets.deletedAt)];
  if (options.brandId) filters.push(eq(mediaAssets.brandId, options.brandId));
  if (options.kind) filters.push(eq(mediaAssets.kind, options.kind));

  return db
    .select()
    .from(mediaAssets)
    .where(and(...filters))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

export async function deleteMedia(ctx: AuthContext, mediaId: string): Promise<void> {
  assertCapability(ctx, 'media:write');
  const record = await getMedia(ctx, mediaId);

  const db = await getDb();
  await db.update(mediaAssets).set({ deletedAt: new Date() }).where(eq(mediaAssets.id, mediaId));

  // Bytes are removed after the row so a failed delete never orphans the record.
  try {
    await storage().delete(record.storageKey);
    if (record.thumbnailKey) await storage().delete(record.thumbnailKey);
  } catch (error) {
    logger.warn('media.blob_delete_failed', { mediaId, error });
  }
}

export function startOfBillingPeriod(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

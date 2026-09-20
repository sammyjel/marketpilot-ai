import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { AppError } from '@/lib/errors';
import { storage, storageKey } from '@/providers/storage';
import { S3StorageProvider } from '@/providers/storage/s3';
import { createStagedUpload, finalizeStagedUpload } from '@/server/services/media';
import { createTestContext, testImageBuffer } from '../helpers/fixtures';

afterAll(async () => {
  await closeDb();
});

/** Puts bytes where the browser would have put them, without a presigned URL. */
async function stage(organizationId: string, bytes: Buffer): Promise<string> {
  const key = storageKey(organizationId, 'staging', 'bin');
  await storage().put(key, bytes, { contentType: 'application/octet-stream' });
  return key;
}

describe('staged uploads', () => {
  it('accepts staged bytes and applies the same validation as a server upload', async () => {
    const ctx = await createTestContext();
    const key = await stage(ctx.organization.id, await testImageBuffer(400, 300));

    const record = await finalizeStagedUpload(ctx, { stagingKey: key, filename: 'photo.jpg' });

    // The declared extension was .bin; the real type comes from the bytes.
    expect(record.kind).toBe('image');
    expect(record.mimeType).toBe('image/png');
    expect(record.width).toBe(400);
    expect(record.height).toBe(300);
    expect(record.originalFilename).toBe('photo.jpg');

    // The staged copy is not left behind once it has been accepted.
    await expect(storage().exists(key)).resolves.toBe(false);
  });

  it('rejects bytes that are not a supported media type, and still cleans up', async () => {
    const ctx = await createTestContext();
    const key = await stage(ctx.organization.id, Buffer.from('<?php echo 1; ?>', 'utf8'));

    await expect(finalizeStagedUpload(ctx, { stagingKey: key })).rejects.toThrow(AppError);
    await expect(storage().exists(key)).resolves.toBe(false);
  });

  it('refuses a staging key belonging to another organization', async () => {
    const alice = await createTestContext();
    const bob = await createTestContext();
    const key = await stage(alice.organization.id, await testImageBuffer());

    await expect(finalizeStagedUpload(bob, { stagingKey: key })).rejects.toThrow(AppError);
    // Alice's bytes are untouched by Bob's attempt.
    await expect(storage().exists(key)).resolves.toBe(true);
  });

  it('refuses a key that is not under the staging prefix', async () => {
    const ctx = await createTestContext();
    const key = storageKey(ctx.organization.id, 'images', 'png');
    await storage().put(key, await testImageBuffer(), { contentType: 'image/png' });

    await expect(finalizeStagedUpload(ctx, { stagingKey: key })).rejects.toThrow(AppError);
  });

  it('reports no staged upload when the driver cannot presign', async () => {
    const ctx = await createTestContext();
    // Tests run on the local disk driver, which has no URL to hand out.
    await expect(createStagedUpload(ctx, { byteSize: 1024 })).resolves.toBeNull();
  });
});

describe('S3 presigned PUT', () => {
  const provider = new S3StorageProvider({
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'media',
    accessKey: 'AKIAEXAMPLE',
    secretKey: 'secret-example',
  });

  it('signs a URL that carries every parameter S3 requires', async () => {
    const url = new URL(await provider.presignPut('org/staging/abc.bin', { expiresInSeconds: 900 }));

    expect(url.pathname).toBe('/media/org/staging/abc.bin');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIAEXAMPLE/');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // The secret must never travel in the URL.
    expect(url.toString()).not.toContain('secret-example');
  });

  it('clamps the lifetime to the range S3 accepts', async () => {
    const tooShort = new URL(await provider.presignPut('k', { expiresInSeconds: 1 }));
    const tooLong = new URL(await provider.presignPut('k', { expiresInSeconds: 999_999_999 }));

    expect(tooShort.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(tooLong.searchParams.get('X-Amz-Expires')).toBe('604800');
  });

  it('produces a different signature for a different key', async () => {
    const a = new URL(await provider.presignPut('org/staging/one.bin'));
    const b = new URL(await provider.presignPut('org/staging/two.bin'));

    expect(a.searchParams.get('X-Amz-Signature')).not.toBe(b.searchParams.get('X-Amz-Signature'));
  });
});

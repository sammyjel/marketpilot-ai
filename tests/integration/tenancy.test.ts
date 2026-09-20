import { afterAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { AppError } from '@/lib/errors';
import { createBrand, getBrand, listBrands } from '@/server/services/brands';
import { createProduct, getProduct, listProducts } from '@/server/services/products';
import { uploadMedia, getMedia, validateUpload } from '@/server/services/media';
import { createTestContext, setPlan, testImageBuffer } from '../helpers/fixtures';

afterAll(async () => {
  await closeDb();
});

describe('multi-tenancy', () => {
  it('never lets one organization read another’s data', async () => {
    const alice = await createTestContext();
    const bob = await createTestContext();

    const brand = await createBrand(alice, { name: 'Alice Cosmetics' });
    const product = await createProduct(alice, {
      brandId: brand.id,
      name: 'Alice Serum',
      description: 'A serum.',
    });

    // Bob sees none of it, even holding the exact ids.
    await expect(listBrands(bob)).resolves.toEqual([]);
    await expect(listProducts(bob)).resolves.toEqual([]);
    await expect(getBrand(bob, brand.id)).rejects.toThrow(AppError);
    await expect(getProduct(bob, product.id)).rejects.toThrow(AppError);

    // Alice still does.
    await expect(getBrand(alice, brand.id)).resolves.toMatchObject({ id: brand.id });
  });

  it('refuses to attach another organization’s media to a product', async () => {
    const alice = await createTestContext();
    const bob = await createTestContext();

    const aliceMedia = await uploadMedia(alice, { buffer: await testImageBuffer(), filename: 'alice.png' });
    const bobBrand = await createBrand(bob, { name: 'Bob Goods' });

    const product = await createProduct(bob, {
      brandId: bobBrand.id,
      name: 'Bob Widget',
      mediaAssetIds: [aliceMedia.id],
    });

    // The id was silently dropped rather than linked across tenants.
    const { getProductAssets } = await import('@/server/services/products');
    await expect(getProductAssets(bob, product.id)).resolves.toEqual([]);
    await expect(getMedia(bob, aliceMedia.id)).rejects.toThrow(AppError);
  });

  it('rejects a product created against another organization’s brand', async () => {
    const alice = await createTestContext();
    const bob = await createTestContext();
    const aliceBrand = await createBrand(alice, { name: 'Alice Only' });

    await expect(
      createProduct(bob, { brandId: aliceBrand.id, name: 'Sneaky product' }),
    ).rejects.toThrow(AppError);
  });
});

describe('role enforcement', () => {
  it('stops a viewer creating a brand', async () => {
    const viewer = await createTestContext({ role: 'viewer' });
    await expect(createBrand(viewer, { name: 'Nope' })).rejects.toThrow(/cannot perform/i);
  });

  it('stops an editor deleting a brand but lets them create one', async () => {
    const editor = await createTestContext({ role: 'editor' });
    const brand = await createBrand(editor, { name: 'Editor Brand' });

    const { deleteBrand } = await import('@/server/services/brands');
    await expect(deleteBrand(editor, brand.id)).rejects.toThrow(/cannot perform/i);
  });
});

describe('plan limits', () => {
  it('refuses a second brand on the free plan', async () => {
    let ctx = await createTestContext();
    ctx = await setPlan(ctx, 'free');

    await createBrand(ctx, { name: 'First brand' });
    await expect(createBrand(ctx, { name: 'Second brand' })).rejects.toThrow(/plan includes 1 brand/i);
  });
});

describe('upload validation', () => {
  it('accepts a real image and reports its dimensions', async () => {
    const validated = await validateUpload(await testImageBuffer(800, 600));
    expect(validated).toMatchObject({ kind: 'image', mimeType: 'image/png', width: 800, height: 600 });
  });

  it('rejects a file whose bytes do not match an allowed type', async () => {
    // A "PNG" that is actually a script — the declared name is irrelevant.
    await expect(validateUpload(Buffer.from('<?php system($_GET["c"]); ?>'))).rejects.toThrow(/not supported/i);
  });

  it('rejects an empty file', async () => {
    await expect(validateUpload(Buffer.alloc(0))).rejects.toThrow(/empty/i);
  });

  it('generates an internal storage key rather than trusting the filename', async () => {
    const ctx = await createTestContext();
    const record = await uploadMedia(ctx, {
      buffer: await testImageBuffer(),
      filename: '../../../etc/passwd.png',
    });

    expect(record.storageKey).not.toContain('..');
    expect(record.storageKey.startsWith(`${ctx.organization.id}/`)).toBe(true);
    // The original name is kept for display only.
    expect(record.originalFilename).toBe('../../../etc/passwd.png');
  });

  it('creates a thumbnail for images', async () => {
    const ctx = await createTestContext();
    const record = await uploadMedia(ctx, { buffer: await testImageBuffer(1200, 1200), filename: 'big.png' });
    expect(record.thumbnailKey).toBeTruthy();
  });
});

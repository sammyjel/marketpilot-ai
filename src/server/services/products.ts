import 'server-only';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { notFound } from '@/lib/errors';
import { getDb } from '@/server/db';
import { mediaAssets, productAssets, products } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import { getBrand } from './brands';
import { recordAudit } from './audit';

export type ProductRecord = typeof products.$inferSelect;
export type ProductAssetRecord = typeof mediaAssets.$inferSelect & { position: number; isPrimary: boolean };

export type ProductInput = {
  brandId: string;
  name: string;
  description?: string | null;
  productUrl?: string | null;
  price?: string | null;
  currency?: string | null;
  category?: string | null;
  benefits?: string[];
  features?: string[];
  keywords?: string[];
  targetAudience?: string | null;
  callToAction?: string | null;
  mediaAssetIds?: string[];
};

export async function listProducts(
  ctx: AuthContext,
  options: { brandId?: string; limit?: number; offset?: number } = {},
): Promise<ProductRecord[]> {
  const db = await getDb();
  const filters = [eq(products.organizationId, ctx.organization.id), isNull(products.deletedAt)];
  if (options.brandId) filters.push(eq(products.brandId, options.brandId));

  return db
    .select()
    .from(products)
    .where(and(...filters))
    .orderBy(desc(products.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

export async function getProduct(ctx: AuthContext, productId: string): Promise<ProductRecord> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.organizationId, ctx.organization.id), isNull(products.deletedAt)),
    )
    .limit(1);

  const product = rows[0];
  if (!product) throw notFound('That product');
  return product;
}

/** Images/videos attached to a product, ordered with the primary image first. */
export async function getProductAssets(ctx: AuthContext, productId: string): Promise<ProductAssetRecord[]> {
  const db = await getDb();
  const rows = await db
    .select({ media: mediaAssets, position: productAssets.position, isPrimary: productAssets.isPrimary })
    .from(productAssets)
    .innerJoin(mediaAssets, eq(mediaAssets.id, productAssets.mediaAssetId))
    .where(
      and(
        eq(productAssets.productId, productId),
        eq(mediaAssets.organizationId, ctx.organization.id),
        isNull(mediaAssets.deletedAt),
      ),
    )
    .orderBy(desc(productAssets.isPrimary), productAssets.position);

  return rows.map((row) => ({ ...row.media, position: row.position, isPrimary: row.isPrimary === 1 }));
}

/** Verifies every id belongs to this organization before it is linked. */
async function assertOwnedMedia(ctx: AuthContext, mediaIds: string[]): Promise<string[]> {
  if (mediaIds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.id, mediaIds),
        eq(mediaAssets.organizationId, ctx.organization.id),
        isNull(mediaAssets.deletedAt),
      ),
    );
  return rows.map((row) => row.id);
}

export async function createProduct(ctx: AuthContext, input: ProductInput): Promise<ProductRecord> {
  assertCapability(ctx, 'product:write');
  const brand = await getBrand(ctx, input.brandId);
  const ownedMedia = await assertOwnedMedia(ctx, input.mediaAssetIds ?? []);

  const db = await getDb();
  const product = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        organizationId: ctx.organization.id,
        brandId: brand.id,
        name: input.name.trim(),
        description: input.description ?? null,
        productUrl: input.productUrl ?? null,
        price: input.price ?? null,
        currency: input.currency ?? brand.currency,
        category: input.category ?? null,
        benefits: input.benefits ?? [],
        features: input.features ?? [],
        keywords: input.keywords ?? [],
        targetAudience: input.targetAudience ?? null,
        callToAction: input.callToAction ?? null,
        createdByUserId: ctx.user.id,
      })
      .returning();

    if (ownedMedia.length > 0) {
      await tx.insert(productAssets).values(
        ownedMedia.map((mediaAssetId, index) => ({
          productId: created!.id,
          mediaAssetId,
          position: index,
          isPrimary: index === 0 ? 1 : 0,
        })),
      );
      // Attach loose uploads to the product's brand so the media library groups them.
      await tx
        .update(mediaAssets)
        .set({ brandId: brand.id })
        .where(and(inArray(mediaAssets.id, ownedMedia), isNull(mediaAssets.brandId)));
    }

    return created!;
  });

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'product.created',
    entityType: 'product',
    entityId: product.id,
    metadata: { name: product.name, brandId: brand.id },
  });

  return product;
}

export async function updateProduct(
  ctx: AuthContext,
  productId: string,
  input: Partial<ProductInput>,
): Promise<ProductRecord> {
  assertCapability(ctx, 'product:write');
  await getProduct(ctx, productId);

  const db = await getDb();
  const [product] = await db
    .update(products)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.productUrl !== undefined ? { productUrl: input.productUrl } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.benefits !== undefined ? { benefits: input.benefits } : {}),
      ...(input.features !== undefined ? { features: input.features } : {}),
      ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
      ...(input.targetAudience !== undefined ? { targetAudience: input.targetAudience } : {}),
      ...(input.callToAction !== undefined ? { callToAction: input.callToAction } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.organizationId, ctx.organization.id)))
    .returning();

  if (input.mediaAssetIds) {
    const ownedMedia = await assertOwnedMedia(ctx, input.mediaAssetIds);
    await db.transaction(async (tx) => {
      await tx.delete(productAssets).where(eq(productAssets.productId, productId));
      if (ownedMedia.length > 0) {
        await tx.insert(productAssets).values(
          ownedMedia.map((mediaAssetId, index) => ({
            productId,
            mediaAssetId,
            position: index,
            isPrimary: index === 0 ? 1 : 0,
          })),
        );
      }
    });
  }

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'product.updated',
    entityType: 'product',
    entityId: productId,
  });

  return product!;
}

export async function deleteProduct(ctx: AuthContext, productId: string): Promise<void> {
  assertCapability(ctx, 'product:delete');
  await getProduct(ctx, productId);

  const db = await getDb();
  await db
    .update(products)
    .set({ deletedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.organizationId, ctx.organization.id)));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'product.deleted',
    entityType: 'product',
    entityId: productId,
  });
}

/** Stores the vision-analysis result produced by the AI pipeline. */
export async function saveProductAnalysis(
  ctx: AuthContext,
  productId: string,
  analysis: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  await db
    .update(products)
    .set({ analysis, analyzedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.organizationId, ctx.organization.id)));
}

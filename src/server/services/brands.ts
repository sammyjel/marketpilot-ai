import 'server-only';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { AppError, notFound } from '@/lib/errors';
import { planFor } from '@/lib/plans';
import type { BrandTone } from '@/lib/tones';
import { PLATFORMS, type Platform } from '@/lib/platforms';
import { slugify, uniqueSlug } from '@/lib/slug';
import { getDb } from '@/server/db';
import { brands } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import { recordAudit } from './audit';



export type BrandInput = {
  name: string;
  clientLabel?: string | null;
  websiteUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  targetAudience?: string | null;
  country?: string;
  language?: string;
  currency?: string;
  timezone?: string;
  tone?: BrandTone;
  voiceNotes?: string | null;
  preferredCta?: string | null;
  guidelines?: string | null;
  colors?: string[];
  socialHandles?: Record<string, string>;
  activePlatforms?: Platform[];
};

export type BrandRecord = typeof brands.$inferSelect;

/** Every read is scoped to the caller's organization — no exceptions. */
export async function listBrands(ctx: AuthContext): Promise<BrandRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(brands)
    .where(and(eq(brands.organizationId, ctx.organization.id), isNull(brands.deletedAt)))
    .orderBy(asc(brands.name));
}

export async function getBrand(ctx: AuthContext, brandId: string): Promise<BrandRecord> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, ctx.organization.id), isNull(brands.deletedAt)))
    .limit(1);

  const brand = rows[0];
  if (!brand) throw notFound('That brand');
  return brand;
}

async function assertBrandQuota(ctx: AuthContext): Promise<void> {
  const limit = planFor(ctx.organization.planTier).limits.brands;
  if (limit === null) return;

  const db = await getDb();
  const [row] = await db
    .select({ value: count() })
    .from(brands)
    .where(and(eq(brands.organizationId, ctx.organization.id), isNull(brands.deletedAt)));

  if ((row?.value ?? 0) >= limit) {
    throw new AppError(
      'usage_limit_reached',
      `Your ${ctx.organization.planTier} plan includes ${limit} brand${limit === 1 ? '' : 's'}. Upgrade to add more.`,
      { details: { limit } },
    );
  }
}

export async function createBrand(ctx: AuthContext, input: BrandInput): Promise<BrandRecord> {
  assertCapability(ctx, 'brand:write');
  await assertBrandQuota(ctx);

  const db = await getDb();
  const slug = await uniqueSlug(slugify(input.name, 'brand'), async (candidate) => {
    const hit = await db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.organizationId, ctx.organization.id), eq(brands.slug, candidate)))
      .limit(1);
    return hit.length > 0;
  });

  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: ctx.organization.id,
      name: input.name.trim(),
      slug,
      clientLabel: input.clientLabel ?? null,
      websiteUrl: input.websiteUrl ?? null,
      description: input.description ?? null,
      industry: input.industry ?? null,
      targetAudience: input.targetAudience ?? null,
      country: input.country ?? 'US',
      language: input.language ?? 'en',
      currency: input.currency ?? 'USD',
      timezone: input.timezone ?? ctx.user.timezone,
      tone: input.tone ?? 'friendly',
      voiceNotes: input.voiceNotes ?? null,
      preferredCta: input.preferredCta ?? null,
      guidelines: input.guidelines ?? null,
      colors: input.colors ?? [],
      socialHandles: input.socialHandles ?? {},
      activePlatforms: input.activePlatforms ?? [],
    })
    .returning();

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'brand.created',
    entityType: 'brand',
    entityId: brand!.id,
    metadata: { name: brand!.name },
  });

  return brand!;
}

export async function updateBrand(ctx: AuthContext, brandId: string, input: Partial<BrandInput>): Promise<BrandRecord> {
  assertCapability(ctx, 'brand:write');
  await getBrand(ctx, brandId); // tenancy check

  const db = await getDb();
  const [brand] = await db
    .update(brands)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.clientLabel !== undefined ? { clientLabel: input.clientLabel } : {}),
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
      ...(input.targetAudience !== undefined ? { targetAudience: input.targetAudience } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.tone !== undefined ? { tone: input.tone } : {}),
      ...(input.voiceNotes !== undefined ? { voiceNotes: input.voiceNotes } : {}),
      ...(input.preferredCta !== undefined ? { preferredCta: input.preferredCta } : {}),
      ...(input.guidelines !== undefined ? { guidelines: input.guidelines } : {}),
      ...(input.colors !== undefined ? { colors: input.colors } : {}),
      ...(input.socialHandles !== undefined ? { socialHandles: input.socialHandles } : {}),
      ...(input.activePlatforms !== undefined ? { activePlatforms: input.activePlatforms } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, ctx.organization.id)))
    .returning();

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'brand.updated',
    entityType: 'brand',
    entityId: brandId,
  });

  return brand!;
}

/** Soft delete: campaigns and analytics keep referring to the brand. */
export async function deleteBrand(ctx: AuthContext, brandId: string): Promise<void> {
  assertCapability(ctx, 'brand:delete');
  await getBrand(ctx, brandId);

  const db = await getDb();
  await db
    .update(brands)
    .set({ deletedAt: new Date() })
    .where(and(eq(brands.id, brandId), eq(brands.organizationId, ctx.organization.id)));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'brand.deleted',
    entityType: 'brand',
    entityId: brandId,
  });
}

export function normalisePlatforms(values: string[]): Platform[] {
  return values.filter((value): value is Platform => (PLATFORMS as readonly string[]).includes(value));
}

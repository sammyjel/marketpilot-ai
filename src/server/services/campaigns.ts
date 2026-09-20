import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AppError, notFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isPlatform, PLATFORM_META, type Platform } from '@/lib/platforms';
import type { GenerationContext } from '@/prompts/marketing/shared';
import { storage } from '@/providers/storage';
import { getDb } from '@/server/db';
import {
  brands,
  campaignItems,
  campaignVersions,
  campaigns,
  content,
  mediaAssets,
  productAssets,
  products,
  templates,
} from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import {
  analyzeProduct,
  generateCreativeBrief,
  generatePlatformContent,
  generateSeo,
  generateStrategy,
  mergeUsage,
  runQualityControl,
} from '@/server/ai/stages';
import type { CampaignStrategy, QualityIssue } from '@/server/ai/schemas';
import { recordAudit } from './audit';
import { notify } from './notifications';
import { assertWithinLimit, recordUsage } from './usage';

export type CampaignRecord = typeof campaigns.$inferSelect;
export type ContentRecord = typeof content.$inferSelect;

export const CAMPAIGN_OBJECTIVES = [
  'product_launch',
  'sales',
  'brand_awareness',
  'website_traffic',
  'lead_generation',
  'engagement',
  'seasonal_promotion',
  'event_promotion',
  'new_product_announcement',
  'educational',
  'retargeting',
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CONTENT_FORMATS = [
  'image',
  'carousel',
  'short_video',
  'long_video',
  'text',
  'story',
  'reel',
  'short',
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  product_launch: 'Product launch',
  sales: 'Sales',
  brand_awareness: 'Brand awareness',
  website_traffic: 'Website traffic',
  lead_generation: 'Lead generation',
  engagement: 'Engagement',
  seasonal_promotion: 'Seasonal promotion',
  event_promotion: 'Event promotion',
  new_product_announcement: 'New product announcement',
  educational: 'Educational content',
  retargeting: 'Retargeting',
};

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  image: 'Image',
  carousel: 'Carousel',
  short_video: 'Short video',
  long_video: 'Long video',
  text: 'Text',
  story: 'Story',
  reel: 'Reel',
  short: 'Short',
};

const VIDEO_FORMATS: ContentFormat[] = ['short_video', 'long_video', 'reel', 'short'];

/** The format a platform's primary post should use, given what was requested. */
function primaryFormatFor(platform: Platform, requested: ContentFormat[]): ContentFormat {
  const meta = PLATFORM_META[platform];
  const wantsVideo = requested.some((format) => VIDEO_FORMATS.includes(format));

  if (!meta.capabilities.includes('image') && !meta.capabilities.includes('text')) return 'short_video';
  if (wantsVideo && meta.capabilities.includes('video')) {
    return platform === 'youtube' ? 'short' : platform === 'instagram' ? 'reel' : 'short_video';
  }
  if (requested.includes('carousel') && meta.capabilities.includes('carousel')) return 'carousel';
  if (meta.capabilities.includes('image')) return 'image';
  return 'text';
}

export type CreateCampaignInput = {
  brandId: string;
  productId: string;
  title?: string;
  objective: CampaignObjective;
  tone?: string;
  language?: string;
  targetAudience?: string | null;
  platforms: Platform[];
  formats: ContentFormat[];
  templateKey?: string | null;
  durationDays?: number | null;
};

/* ------------------------------- Reads ----------------------------------- */

export async function listCampaigns(
  ctx: AuthContext,
  options: { brandId?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<CampaignRecord[]> {
  const db = await getDb();
  const filters = [eq(campaigns.organizationId, ctx.organization.id), isNull(campaigns.deletedAt)];
  if (options.brandId) filters.push(eq(campaigns.brandId, options.brandId));

  const rows = await db
    .select()
    .from(campaigns)
    .where(and(...filters))
    .orderBy(desc(campaigns.updatedAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);

  return options.status ? rows.filter((row) => row.status === options.status) : rows;
}

export async function getCampaign(ctx: AuthContext, campaignId: string): Promise<CampaignRecord> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, ctx.organization.id), isNull(campaigns.deletedAt)),
    )
    .limit(1);

  const campaign = rows[0];
  if (!campaign) throw notFound('That campaign');
  return campaign;
}

export async function getCampaignContent(ctx: AuthContext, campaignId: string): Promise<ContentRecord[]> {
  const db = await getDb();
  return db
    .select()
    .from(content)
    .where(
      and(
        eq(content.campaignId, campaignId),
        eq(content.organizationId, ctx.organization.id),
        isNull(content.deletedAt),
      ),
    )
    .orderBy(content.platform);
}

/* ---------------------------- Context assembly ---------------------------- */

/**
 * Loads everything the AI needs about a brand and product and shapes it into
 * the single context object every prompt receives.
 */
async function buildContext(
  ctx: AuthContext,
  input: { brandId: string; productId: string; campaign: CreateCampaignInput },
): Promise<{ context: GenerationContext; images: { mimeType: string; data: string }[] }> {
  const db = await getDb();

  const [brandRow] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, ctx.organization.id)))
    .limit(1);
  if (!brandRow) throw notFound('That brand');

  const [productRow] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.organizationId, ctx.organization.id)))
    .limit(1);
  if (!productRow) throw notFound('That product');

  const assets = await db
    .select({ media: mediaAssets })
    .from(productAssets)
    .innerJoin(mediaAssets, eq(mediaAssets.id, productAssets.mediaAssetId))
    .where(and(eq(productAssets.productId, input.productId), eq(mediaAssets.kind, 'image')))
    .orderBy(desc(productAssets.isPrimary), productAssets.position)
    .limit(3);

  // Images are read from storage and inlined as base64; a provider never gets a
  // URL into our storage.
  const images: { mimeType: string; data: string }[] = [];
  for (const asset of assets) {
    try {
      const buffer = await storage().get(asset.media.storageKey);
      images.push({ mimeType: asset.media.mimeType, data: buffer.toString('base64') });
    } catch (error) {
      logger.warn('campaign.image_load_failed', { mediaId: asset.media.id, error });
    }
  }

  return {
    images,
    context: {
      brand: {
        name: brandRow.name,
        industry: brandRow.industry,
        description: brandRow.description,
        targetAudience: brandRow.targetAudience,
        country: brandRow.country,
        language: brandRow.language,
        currency: brandRow.currency,
        tone: brandRow.tone,
        voiceNotes: brandRow.voiceNotes,
        preferredCta: brandRow.preferredCta,
        guidelines: brandRow.guidelines,
        colors: brandRow.colors,
      },
      product: {
        name: productRow.name,
        description: productRow.description,
        productUrl: productRow.productUrl,
        price: productRow.price,
        currency: productRow.currency,
        category: productRow.category,
        benefits: productRow.benefits,
        features: productRow.features,
        keywords: productRow.keywords,
        targetAudience: productRow.targetAudience,
        callToAction: productRow.callToAction,
        analysis: productRow.analysis,
      },
      campaign: {
        objective: input.campaign.objective,
        tone: input.campaign.tone ?? brandRow.tone,
        language: input.campaign.language ?? brandRow.language,
        platforms: input.campaign.platforms,
        formats: input.campaign.formats,
        targetAudience: input.campaign.targetAudience ?? productRow.targetAudience ?? brandRow.targetAudience,
        durationDays: input.campaign.durationDays ?? null,
        templateHints: null,
      },
    },
  };
}

/* ------------------------------ Creation ---------------------------------- */

/** Creates the campaign row in `draft`. Generation is a separate, resumable step. */
export async function createCampaign(ctx: AuthContext, input: CreateCampaignInput): Promise<CampaignRecord> {
  assertCapability(ctx, 'campaign:write');

  if (input.platforms.length === 0) {
    throw new AppError('validation_failed', 'Choose at least one platform.');
  }

  const db = await getDb();

  const [brandRow] = await db
    .select({ id: brands.id, tone: brands.tone, language: brands.language })
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, ctx.organization.id), isNull(brands.deletedAt)))
    .limit(1);
  if (!brandRow) throw notFound('That brand');

  const [productRow] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(
        eq(products.id, input.productId),
        eq(products.organizationId, ctx.organization.id),
        eq(products.brandId, input.brandId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);
  if (!productRow) throw notFound('That product');

  let templateId: string | null = null;
  if (input.templateKey) {
    const [template] = await db.select({ id: templates.id }).from(templates).where(eq(templates.key, input.templateKey)).limit(1);
    templateId = template?.id ?? null;
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      organizationId: ctx.organization.id,
      brandId: input.brandId,
      productId: input.productId,
      templateId,
      title: input.title?.trim() || `${productRow.name} — ${OBJECTIVE_LABELS[input.objective]}`,
      objective: input.objective,
      tone: (input.tone ?? brandRow.tone) as CampaignRecord['tone'],
      language: input.language ?? brandRow.language,
      targetAudience: input.targetAudience ?? null,
      platforms: input.platforms,
      formats: input.formats,
      status: 'draft',
      ...(input.durationDays
        ? { endsAt: new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000) }
        : {}),
      startsAt: new Date(),
      createdByUserId: ctx.user.id,
    })
    .returning();

  await db.insert(campaignItems).values(
    input.platforms.map((platform, index) => ({
      campaignId: campaign!.id,
      platform,
      format: primaryFormatFor(platform, input.formats),
      position: index,
    })),
  );

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'campaign.created',
    entityType: 'campaign',
    entityId: campaign!.id,
    metadata: { objective: input.objective, platforms: input.platforms },
  });

  return campaign!;
}

/* ------------------------------ Generation -------------------------------- */

export type GenerationProgress = {
  stage: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
};

export const GENERATION_STAGES: { key: string; label: string }[] = [
  { key: 'analyze', label: 'Analyzing product' },
  { key: 'strategy', label: 'Creating campaign strategy' },
  { key: 'platforms', label: 'Writing content' },
  { key: 'seo', label: 'Optimizing SEO' },
  { key: 'creative', label: 'Creating creative concepts' },
  { key: 'quality', label: 'Checking quality' },
];

/**
 * Runs the full pipeline for a campaign.
 *
 * Designed to be called from a background job: it owns its own status
 * transitions, records usage as it goes, and leaves the campaign in a coherent
 * state whether it succeeds or fails.
 */
export async function generateCampaign(ctx: AuthContext, campaignId: string): Promise<CampaignRecord> {
  assertCapability(ctx, 'campaign:generate');
  const campaign = await getCampaign(ctx, campaignId);

  if (!campaign.productId) {
    throw new AppError('validation_failed', 'This campaign has no product to generate from.');
  }

  const platforms = campaign.platforms.filter(isPlatform);
  // One AI generation credit per platform, plus the shared stages.
  await assertWithinLimit(ctx, 'ai_generation', platforms.length + 3);

  const db = await getDb();
  await db.update(campaigns).set({ status: 'generating', generationError: null, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));

  try {
    const { context, images } = await buildContext(ctx, {
      brandId: campaign.brandId,
      productId: campaign.productId,
      campaign: {
        brandId: campaign.brandId,
        productId: campaign.productId,
        objective: campaign.objective,
        tone: campaign.tone,
        language: campaign.language,
        targetAudience: campaign.targetAudience,
        platforms,
        formats: campaign.formats as ContentFormat[],
      },
    });

    // A template contributes extra guidance to every downstream prompt.
    if (campaign.templateId) {
      const [template] = await db
        .select({ promptHints: templates.promptHints })
        .from(templates)
        .where(eq(templates.id, campaign.templateId))
        .limit(1);
      context.campaign.templateHints = template?.promptHints ?? null;
    }

    // Stage 1 — vision. Cached on the product so repeat campaigns skip it.
    let analysis = context.product.analysis;
    const usages = [];

    if (!analysis && images.length > 0) {
      const result = await analyzeProduct({
        productName: context.product.name,
        userDescription: context.product.description,
        category: context.product.category,
        images,
      });
      analysis = result.data as unknown as Record<string, unknown>;
      usages.push(result.usage);
      context.product.analysis = analysis;

      await db
        .update(products)
        .set({ analysis, analyzedAt: new Date() })
        .where(eq(products.id, campaign.productId));
    }

    // Stage 2 — strategy.
    const strategy = await generateStrategy(context);
    usages.push(strategy.usage);

    // Stage 3 — one generation per platform, in parallel.
    const platformResults = await Promise.all(
      platforms.map(async (platform) => {
        const result = await generatePlatformContent({
          context,
          strategy: strategy.data,
          platform,
          formats: campaign.formats,
        });
        return { platform, ...result };
      }),
    );
    usages.push(...platformResults.map((result) => result.usage));

    // Stage 4 — SEO.
    const seo = await generateSeo({ context, strategy: strategy.data });
    usages.push(seo.usage);

    // Stage 5 — creative brief.
    const wantsVideo = campaign.formats.some((format) => VIDEO_FORMATS.includes(format as ContentFormat));
    const brief = await generateCreativeBrief({ context, strategy: strategy.data, wantsVideo });
    usages.push(brief.usage);

    // Stage 6 — quality control over everything that was written.
    const quality = await runQualityControl({
      context,
      payload: {
        strategy: strategy.data,
        seo: seo.data,
        platforms: Object.fromEntries(platformResults.map((result) => [result.platform, result.data])),
      },
    });
    usages.push(quality.usage);

    // Persist. Existing content for this campaign is replaced wholesale so a
    // re-generation never leaves a half-old, half-new campaign.
    const issuesByPlatform = new Map<string, QualityIssue[]>();
    for (const issue of quality.data.issues) {
      if (!issue.platform) continue;
      const bucket = issuesByPlatform.get(issue.platform) ?? [];
      bucket.push(issue);
      issuesByPlatform.set(issue.platform, bucket);
    }

    const items = await db.select().from(campaignItems).where(eq(campaignItems.campaignId, campaignId));
    const itemByPlatform = new Map(items.map((item) => [item.platform, item]));

    await db.transaction(async (tx) => {
      await tx.delete(content).where(eq(content.campaignId, campaignId));

      for (const result of platformResults) {
        const flags = issuesByPlatform.get(result.platform) ?? [];
        const item = itemByPlatform.get(result.platform);
        const hashtags = Array.isArray((result.data as { hashtags?: unknown }).hashtags)
          ? ((result.data as { hashtags: string[] }).hashtags)
          : [];

        await tx.insert(content).values({
          organizationId: ctx.organization.id,
          campaignId,
          campaignItemId: item?.id ?? null,
          platform: result.platform,
          format: item?.format ?? 'text',
          status: flags.some((flag) => flag.severity === 'blocker') ? 'flagged' : 'generated',
          fields: result.data,
          hashtags,
          qualityFlags: flags as unknown as Record<string, unknown>[],
        });
      }

      await tx
        .update(campaigns)
        .set({
          status: quality.data.requiresHumanReview ? 'needs_review' : 'generated',
          strategy: strategy.data as unknown as Record<string, unknown>,
          seo: seo.data as unknown as Record<string, unknown>,
          qualityReport: {
            ...quality.data,
            creativeBrief: brief.data,
          } as unknown as Record<string, unknown>,
          title: campaign.title || strategy.data.campaignTitle,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
    });

    const totalUsage = mergeUsage(...usages);
    await recordUsage(ctx, 'ai_generation', {
      quantity: platforms.length + 3,
      ...(totalUsage.costMicros !== undefined ? { costMicros: totalUsage.costMicros } : {}),
      entityType: 'campaign',
      entityId: campaignId,
      metadata: { inputTokens: totalUsage.inputTokens, outputTokens: totalUsage.outputTokens },
    });

    await saveVersion(ctx, campaignId, 'Generated');

    await notify(ctx.organization.id, ctx.user.id, {
      kind: 'campaign_generated',
      title: `${campaign.title} is ready to review`,
      body: quality.data.requiresHumanReview
        ? 'Quality control flagged items that need your eyes before publishing.'
        : 'All platform content generated successfully.',
      linkPath: `/campaigns/${campaignId}`,
    });

    logger.info('campaign.generated', {
      campaignId,
      platforms: platforms.length,
      issues: quality.data.issues.length,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
    });

    return getCampaign(ctx, campaignId);
  } catch (error) {
    const message = error instanceof AppError ? error.message : 'Generation failed unexpectedly.';
    await db
      .update(campaigns)
      .set({ status: 'failed', generationError: message, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));

    logger.error('campaign.generation_failed', { campaignId, error });
    throw error;
  }
}

/* ------------------------------ Versioning -------------------------------- */

export async function saveVersion(ctx: AuthContext, campaignId: string, label: string): Promise<number> {
  const db = await getDb();
  const campaign = await getCampaign(ctx, campaignId);
  const pieces = await getCampaignContent(ctx, campaignId);

  const version = campaign.currentVersion;
  await db
    .insert(campaignVersions)
    .values({
      campaignId,
      version,
      label,
      snapshot: {
        campaign: {
          title: campaign.title,
          objective: campaign.objective,
          tone: campaign.tone,
          strategy: campaign.strategy,
          seo: campaign.seo,
          qualityReport: campaign.qualityReport,
        },
        content: pieces.map((piece) => ({
          platform: piece.platform,
          format: piece.format,
          fields: piece.fields,
          hashtags: piece.hashtags,
          qualityFlags: piece.qualityFlags,
        })),
      },
      createdByUserId: ctx.user.id,
    })
    .onConflictDoNothing();

  await db
    .update(campaigns)
    .set({ currentVersion: version + 1, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  return version;
}

export async function listVersions(ctx: AuthContext, campaignId: string) {
  await getCampaign(ctx, campaignId);
  const db = await getDb();
  return db
    .select({
      id: campaignVersions.id,
      version: campaignVersions.version,
      label: campaignVersions.label,
      createdAt: campaignVersions.createdAt,
    })
    .from(campaignVersions)
    .where(eq(campaignVersions.campaignId, campaignId))
    .orderBy(desc(campaignVersions.version));
}

export async function restoreVersion(ctx: AuthContext, campaignId: string, version: number): Promise<void> {
  assertCapability(ctx, 'campaign:write');
  await getCampaign(ctx, campaignId);

  const db = await getDb();
  const [snapshotRow] = await db
    .select()
    .from(campaignVersions)
    .where(and(eq(campaignVersions.campaignId, campaignId), eq(campaignVersions.version, version)))
    .limit(1);

  if (!snapshotRow) throw notFound('That campaign version');

  // Snapshot the current state first, so restoring is itself undoable.
  await saveVersion(ctx, campaignId, `Before restoring v${version}`);

  const snapshot = snapshotRow.snapshot as {
    campaign: Record<string, unknown>;
    content: { platform: Platform; format: string; fields: Record<string, unknown>; hashtags: string[]; qualityFlags: unknown[] }[];
  };

  const items = await db.select().from(campaignItems).where(eq(campaignItems.campaignId, campaignId));
  const itemByPlatform = new Map(items.map((item) => [item.platform, item]));

  await db.transaction(async (tx) => {
    await tx.delete(content).where(eq(content.campaignId, campaignId));

    for (const piece of snapshot.content) {
      await tx.insert(content).values({
        organizationId: ctx.organization.id,
        campaignId,
        campaignItemId: itemByPlatform.get(piece.platform)?.id ?? null,
        platform: piece.platform,
        format: piece.format as ContentRecord['format'],
        status: 'generated',
        fields: piece.fields,
        hashtags: piece.hashtags,
        qualityFlags: piece.qualityFlags as Record<string, unknown>[],
      });
    }

    await tx
      .update(campaigns)
      .set({
        title: String(snapshot.campaign['title'] ?? ''),
        strategy: (snapshot.campaign['strategy'] ?? null) as CampaignStrategy | null,
        seo: (snapshot.campaign['seo'] ?? null) as Record<string, unknown> | null,
        qualityReport: (snapshot.campaign['qualityReport'] ?? null) as Record<string, unknown> | null,
        status: 'generated',
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId));
  });

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'campaign.version_restored',
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { version },
  });
}

/* ------------------------------- Mutations -------------------------------- */

export async function updateContentFields(
  ctx: AuthContext,
  contentId: string,
  fields: Record<string, unknown>,
  hashtags?: string[],
): Promise<ContentRecord> {
  assertCapability(ctx, 'campaign:write');
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(content)
    .where(and(eq(content.id, contentId), eq(content.organizationId, ctx.organization.id)))
    .limit(1);
  if (!existing) throw notFound('That content');

  const [updated] = await db
    .update(content)
    .set({
      fields,
      ...(hashtags ? { hashtags } : {}),
      editedByUserId: ctx.user.id,
      editedAt: new Date(),
      version: existing.version + 1,
      // A human edit clears the generated flag but keeps the quality notes.
      status: existing.status === 'flagged' ? 'draft' : existing.status,
      updatedAt: new Date(),
    })
    .where(eq(content.id, contentId))
    .returning();

  return updated!;
}

export async function approveCampaign(ctx: AuthContext, campaignId: string): Promise<void> {
  assertCapability(ctx, 'campaign:approve');
  const campaign = await getCampaign(ctx, campaignId);

  const pieces = await getCampaignContent(ctx, campaignId);
  const blockers = pieces.flatMap((piece) =>
    (piece.qualityFlags as unknown as QualityIssue[]).filter((flag) => flag.severity === 'blocker'),
  );

  if (blockers.length > 0) {
    throw new AppError(
      'validation_failed',
      `${blockers.length} item${blockers.length === 1 ? '' : 's'} flagged as a blocker must be edited before this campaign can be approved.`,
      { details: { blockers: blockers.length } },
    );
  }

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({ status: 'approved', approvedAt: new Date(), approvedByUserId: ctx.user.id, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    await tx.update(content).set({ status: 'approved' }).where(eq(content.campaignId, campaignId));
  });

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'campaign.approved',
    entityType: 'campaign',
    entityId: campaignId,
  });

  await notify(ctx.organization.id, ctx.user.id, {
    kind: 'campaign_approved',
    title: `${campaign.title} approved`,
    body: 'It can now be scheduled or published.',
    linkPath: `/campaigns/${campaignId}`,
  });
}

export async function deleteCampaign(ctx: AuthContext, campaignId: string): Promise<void> {
  assertCapability(ctx, 'campaign:delete');
  await getCampaign(ctx, campaignId);

  const db = await getDb();
  await db.update(campaigns).set({ deletedAt: new Date() }).where(eq(campaigns.id, campaignId));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'campaign.deleted',
    entityType: 'campaign',
    entityId: campaignId,
  });
}

/** Copies a campaign's setup (not its generated content) for a fresh run. */
export async function duplicateCampaign(
  ctx: AuthContext,
  campaignId: string,
  overrides: Partial<CreateCampaignInput> = {},
): Promise<CampaignRecord> {
  const source = await getCampaign(ctx, campaignId);
  if (!source.productId) throw new AppError('validation_failed', 'That campaign has no product to copy.');

  return createCampaign(ctx, {
    brandId: overrides.brandId ?? source.brandId,
    productId: overrides.productId ?? source.productId,
    title: overrides.title ?? `${source.title} (copy)`,
    objective: overrides.objective ?? (source.objective as CampaignObjective),
    tone: overrides.tone ?? source.tone,
    language: overrides.language ?? source.language,
    targetAudience: overrides.targetAudience ?? source.targetAudience,
    platforms: overrides.platforms ?? source.platforms.filter(isPlatform),
    formats: overrides.formats ?? (source.formats as ContentFormat[]),
  });
}

import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, notFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { storage } from '@/providers/storage';
import { imageGenerator, productSafeImageGenerator, videoGenerator, voiceGenerator } from '@/providers/media';
import type { AspectRatio, VideoBeat } from '@/providers/media';
import { getDb } from '@/server/db';
import { brands, campaignMedia, campaigns, mediaAssets, productAssets, products } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import type { CreativeBrief } from '@/server/ai/schemas';
import { uploadMedia } from './media';
import { notify } from './notifications';
import { assertWithinLimit, recordUsage } from './usage';

export type ConceptSelection = {
  /** Index into the creative brief's `concepts` array. */
  conceptIndex: number;
  /** Force the product-preserving compositor even if a model is configured. */
  preserveProduct?: boolean;
  aspectRatio?: AspectRatio;
  overlayText?: string | null;
};

function briefOf(campaign: { qualityReport: Record<string, unknown> | null }): CreativeBrief | null {
  const report = campaign.qualityReport as { creativeBrief?: CreativeBrief } | null;
  return report?.creativeBrief ?? null;
}

async function loadProductImage(
  productId: string | null,
): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
  if (!productId) return undefined;
  const db = await getDb();

  const [asset] = await db
    .select({ media: mediaAssets })
    .from(productAssets)
    .innerJoin(mediaAssets, eq(mediaAssets.id, productAssets.mediaAssetId))
    .where(and(eq(productAssets.productId, productId), eq(mediaAssets.kind, 'image')))
    .orderBy(desc(productAssets.isPrimary), productAssets.position)
    .limit(1);

  if (!asset) return undefined;

  try {
    return { buffer: await storage().get(asset.media.storageKey), mimeType: asset.media.mimeType };
  } catch (error) {
    logger.warn('media_generation.product_image_missing', { productId, error });
    return undefined;
  }
}

/**
 * Renders one concept from a campaign's creative brief into a real image.
 *
 * The default path keeps the uploaded product photograph pixel-identical — only
 * the background, framing and overlay are generated. A text-to-image model is
 * used only when one is configured AND the caller has not asked for product
 * preservation.
 */
export async function generateCampaignImage(
  ctx: AuthContext,
  campaignId: string,
  selection: ConceptSelection,
): Promise<{ mediaAssetId: string; producedBy: string; preservedProduct: boolean }> {
  assertCapability(ctx, 'media:write');
  await assertWithinLimit(ctx, 'image_generation', 1);

  const db = await getDb();

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, ctx.organization.id)))
    .limit(1);
  if (!campaign) throw notFound('That campaign');

  const brief = briefOf(campaign);
  const concept = brief?.concepts[selection.conceptIndex];
  if (!concept) {
    throw new AppError(
      'validation_failed',
      'That creative concept is no longer available. Regenerate the campaign to get a fresh brief.',
    );
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, campaign.brandId)).limit(1);
  const productImage = await loadProductImage(campaign.productId);

  const generator =
    selection.preserveProduct !== false && productImage ? productSafeImageGenerator() : imageGenerator();

  const asset = await generator.generate({
    prompt: concept.imagePrompt,
    aspectRatio: selection.aspectRatio ?? concept.aspectRatio,
    productImage,
    brandColors: brand?.colors ?? [],
    overlayText: selection.overlayText ?? concept.overlayText,
  });

  const record = await uploadMedia(
    ctx,
    { buffer: asset.buffer, filename: `${concept.name}.jpg`, brandId: campaign.brandId, altText: concept.name },
    'ai_image',
  );

  await db.insert(campaignMedia).values({
    campaignId,
    mediaAssetId: record.id,
    role: concept.kind,
    brief: { ...concept, producedBy: asset.producedBy, preservedProduct: generator.preservesProduct },
  });

  // The provenance is recorded on the asset so the UI can always say how it
  // was made.
  await db
    .update(mediaAssets)
    .set({ metadata: { producedBy: asset.producedBy, preservedProduct: generator.preservesProduct, concept: concept.name } })
    .where(eq(mediaAssets.id, record.id));

  await recordUsage(ctx, 'image_generation', {
    ...(asset.costMicros !== undefined ? { costMicros: asset.costMicros } : {}),
    entityType: 'campaign',
    entityId: campaignId,
    metadata: { producedBy: asset.producedBy },
  });

  logger.info('media_generation.image', { campaignId, producedBy: asset.producedBy });

  return { mediaAssetId: record.id, producedBy: asset.producedBy, preservedProduct: generator.preservesProduct };
}

export type VideoRequestInput = {
  campaignId: string;
  /** Index into the brief's `videoConcepts`. */
  conceptIndex: number;
  withVoiceover: boolean;
  captions: boolean;
  aspectRatio?: AspectRatio;
};

/**
 * Starts a video render.
 *
 * Returns the provider handle so the queue worker can poll it. When no video
 * provider is configured this raises a clear `unsupported_capability` error
 * rather than producing an empty file.
 */
export async function startCampaignVideo(
  ctx: AuthContext,
  input: VideoRequestInput,
): Promise<{ externalId: string; durationSeconds: number }> {
  assertCapability(ctx, 'media:write');

  const provider = videoGenerator();
  if (!provider.isConfigured()) {
    // Surfaces the honest message from UnavailableVideoProvider.
    await provider.start({
      durationSeconds: 15,
      aspectRatio: '9:16',
      beats: [],
      captions: false,
    });
  }

  await assertWithinLimit(ctx, 'video_generation', 1);

  const db = await getDb();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.organizationId, ctx.organization.id)))
    .limit(1);
  if (!campaign) throw notFound('That campaign');

  const brief = briefOf(campaign);
  const concept = brief?.videoConcepts[input.conceptIndex];
  if (!concept) {
    throw new AppError(
      'validation_failed',
      'That video concept is not in this campaign. Regenerate the campaign with a video format selected.',
    );
  }

  const [brand] = await db.select().from(brands).where(eq(brands.id, campaign.brandId)).limit(1);
  const productImage = await loadProductImage(campaign.productId);

  let voiceover: { buffer: Buffer; mimeType: string } | undefined;
  if (input.withVoiceover) {
    const voice = voiceGenerator();
    if (voice.isConfigured()) {
      await assertWithinLimit(ctx, 'voice_generation', 1);
      const script = concept.structure.map((beat) => beat.voiceover).filter(Boolean).join(' ');
      const audio = await voice.generate({ text: script, language: campaign.language });
      voiceover = { buffer: audio.buffer, mimeType: audio.mimeType };
      await recordUsage(ctx, 'voice_generation', { entityType: 'campaign', entityId: input.campaignId });
    }
    // If no voice provider is configured the video is still rendered; the
    // script stays available on the campaign.
  }

  const beats: VideoBeat[] = concept.structure.map((beat) => ({
    beat: beat.beat,
    seconds: beat.seconds,
    visual: beat.visual,
    voiceover: beat.voiceover,
    onScreen: beat.onScreen,
  }));

  const handle = await provider.start({
    durationSeconds: concept.durationSeconds,
    aspectRatio: input.aspectRatio ?? '9:16',
    beats,
    productImage,
    voiceover,
    captions: input.captions,
    brandColors: brand?.colors ?? [],
  });

  await recordUsage(ctx, 'video_generation', {
    entityType: 'campaign',
    entityId: input.campaignId,
    metadata: { provider: provider.name, externalId: handle.externalId },
  });

  return { externalId: handle.externalId, durationSeconds: concept.durationSeconds };
}

/** Polled by the worker until the provider finishes. */
export async function pollCampaignVideo(
  ctx: AuthContext,
  campaignId: string,
  externalId: string,
): Promise<{ done: boolean; mediaAssetId?: string; error?: string }> {
  const provider = videoGenerator();
  const handle = await provider.poll(externalId);

  if (handle.status === 'processing' || handle.status === 'queued') return { done: false };

  if (handle.status === 'failed' || !handle.asset) {
    await notify(ctx.organization.id, ctx.user.id, {
      kind: 'post_failed',
      title: 'Video generation failed',
      body: handle.error ?? 'The provider could not render this video.',
      linkPath: `/campaigns/${campaignId}`,
    });
    return { done: true, ...(handle.error ? { error: handle.error } : {}) };
  }

  const record = await uploadMedia(
    ctx,
    { buffer: handle.asset.buffer, filename: 'campaign-video.mp4' },
    'ai_video',
  );

  const db = await getDb();
  await db.insert(campaignMedia).values({
    campaignId,
    mediaAssetId: record.id,
    role: 'video',
    brief: { producedBy: handle.asset.producedBy, externalId },
  });

  await notify(ctx.organization.id, ctx.user.id, {
    kind: 'media_ready',
    title: 'Your video is ready',
    body: 'Review it on the campaign before publishing.',
    linkPath: `/campaigns/${campaignId}?tab=media`,
  });

  return { done: true, mediaAssetId: record.id };
}

/** Creative generated for a campaign, newest first. */
export async function listCampaignMedia(ctx: AuthContext, campaignId: string) {
  const db = await getDb();
  return db
    .select({ media: mediaAssets, role: campaignMedia.role, brief: campaignMedia.brief })
    .from(campaignMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, campaignMedia.mediaAssetId))
    .where(and(eq(campaignMedia.campaignId, campaignId), eq(mediaAssets.organizationId, ctx.organization.id)))
    .orderBy(desc(campaignMedia.createdAt));
}

/** Attaches a generated asset to a platform's content so it publishes with it. */
export async function attachMediaToContent(
  ctx: AuthContext,
  contentId: string,
  mediaAssetIds: string[],
): Promise<void> {
  assertCapability(ctx, 'campaign:write');
  const db = await getDb();

  const owned = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.organizationId, ctx.organization.id)));
  const ownedIds = new Set(owned.map((row) => row.id));

  const filtered = mediaAssetIds.filter((id) => ownedIds.has(id));

  const { content } = await import('@/server/db/schema');
  await db
    .update(content)
    .set({ mediaAssetIds: filtered, updatedAt: new Date() })
    .where(and(eq(content.id, contentId), eq(content.organizationId, ctx.organization.id)));
}

export async function listProductsForBrand(ctx: AuthContext, brandId: string) {
  const db = await getDb();
  return db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.brandId, brandId), eq(products.organizationId, ctx.organization.id)));
}

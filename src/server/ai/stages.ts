import 'server-only';
import { logger } from '@/lib/logger';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
import { languageModel } from '@/providers/ai';
import type { ContentPart, TokenUsage } from '@/providers/ai';
import {
  CAMPAIGN_STRATEGY_SYSTEM,
  campaignStrategyUser,
} from '@/prompts/marketing/campaign-strategy';
import { CREATIVE_BRIEF_SYSTEM, creativeBriefUser } from '@/prompts/marketing/creative-brief';
import { PLATFORM_CONTENT_SYSTEM, platformContentUser } from '@/prompts/marketing/platforms';
import { PRODUCT_ANALYSIS_SYSTEM, productAnalysisUser } from '@/prompts/marketing/product-analysis';
import { QUALITY_CONTROL_SYSTEM, qualityControlUser } from '@/prompts/marketing/quality-control';
import { SEO_SYSTEM, seoUser } from '@/prompts/marketing/seo';
import { EDIT_SYSTEM, editUser, type EditOperation } from '@/prompts/marketing/editing';
import {
  ANALYTICS_INSIGHTS_SYSTEM,
  analyticsInsightsUser,
} from '@/prompts/marketing/analytics-insights';
import type { GenerationContext } from '@/prompts/marketing/shared';
import {
  analyticsInsightSchema,
  campaignStrategySchema,
  creativeBriefSchema,
  PLATFORM_CONTENT_SCHEMAS,
  productAnalysisSchema,
  qualityReportSchema,
  rewriteSchema,
  seoSchema,
  type AnalyticsInsights,
  type CampaignStrategy,
  type CreativeBrief,
  type ProductAnalysis,
  type QualityReport,
  type RewriteResult,
  type SeoPackage,
} from './schemas';

export type StageResult<T> = { data: T; usage: TokenUsage; model: string };

function merge(...usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      costMicros: (total.costMicros ?? 0) + (usage.costMicros ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, costMicros: 0 },
  );
}

export const mergeUsage = merge;

/* ------------------------------ Stage 1: vision --------------------------- */

export async function analyzeProduct(input: {
  productName: string;
  userDescription: string | null;
  category: string | null;
  /** Base64 image parts. Passed inline; product images are never sent by URL. */
  images: { mimeType: string; data: string }[];
}): Promise<StageResult<ProductAnalysis>> {
  const model = languageModel();
  const usableImages = model.supportsVision ? input.images.slice(0, 4) : [];

  const parts: ContentPart[] = [
    ...usableImages.map((image) => ({ type: 'image' as const, mimeType: image.mimeType, data: image.data })),
    {
      type: 'text' as const,
      text: productAnalysisUser({ ...input, imageCount: usableImages.length }),
    },
  ];

  const result = await model.completeJson({
    stage: 'product_analysis',
    system: PRODUCT_ANALYSIS_SYSTEM,
    messages: [{ role: 'user', content: parts }],
    schema: productAnalysisSchema,
    schemaName: 'ProductAnalysis',
    temperature: 0.2,
    maxTokens: 1500,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

/* ---------------------------- Stage 2: strategy --------------------------- */

export async function generateStrategy(context: GenerationContext): Promise<StageResult<CampaignStrategy>> {
  const result = await languageModel().completeJson({
    stage: 'campaign_strategy',
    system: CAMPAIGN_STRATEGY_SYSTEM,
    messages: [{ role: 'user', content: campaignStrategyUser(context) }],
    schema: campaignStrategySchema,
    schemaName: 'CampaignStrategy',
    temperature: 0.8,
    maxTokens: 3000,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

/* ------------------------- Stage 3: platform copy ------------------------- */

export async function generatePlatformContent<P extends Platform>(input: {
  context: GenerationContext;
  strategy: CampaignStrategy;
  platform: P;
  formats: string[];
}): Promise<StageResult<Record<string, unknown>>> {
  const schema = PLATFORM_CONTENT_SCHEMAS[input.platform];

  const result = await languageModel().completeJson({
    stage: `platform_content:${input.platform}`,
    system: PLATFORM_CONTENT_SYSTEM,
    messages: [{ role: 'user', content: platformContentUser(input) }],
    schema,
    schemaName: `${PLATFORM_META[input.platform].label}Content`,
    temperature: 0.9,
    maxTokens: 3000,
  });

  return { data: result.data as Record<string, unknown>, usage: result.usage, model: result.model };
}

/* ------------------------------ Stage 4: SEO ------------------------------ */

export async function generateSeo(input: {
  context: GenerationContext;
  strategy: CampaignStrategy;
}): Promise<StageResult<SeoPackage>> {
  const result = await languageModel().completeJson({
    stage: 'seo',
    system: SEO_SYSTEM,
    messages: [{ role: 'user', content: seoUser(input) }],
    schema: seoSchema,
    schemaName: 'SeoPackage',
    temperature: 0.5,
    maxTokens: 2500,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

/* -------------------------- Stage 5: creative brief ----------------------- */

export async function generateCreativeBrief(input: {
  context: GenerationContext;
  strategy: CampaignStrategy;
  wantsVideo: boolean;
}): Promise<StageResult<CreativeBrief>> {
  const result = await languageModel().completeJson({
    stage: 'creative_brief',
    system: CREATIVE_BRIEF_SYSTEM,
    messages: [{ role: 'user', content: creativeBriefUser(input) }],
    schema: creativeBriefSchema,
    schemaName: 'CreativeBrief',
    temperature: 0.8,
    maxTokens: 3000,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

/* ------------------------- Stage 6: quality control ----------------------- */

export async function runQualityControl(input: {
  context: GenerationContext;
  payload: Record<string, unknown>;
}): Promise<StageResult<QualityReport>> {
  const result = await languageModel().completeJson({
    stage: 'quality_control',
    system: QUALITY_CONTROL_SYSTEM,
    messages: [{ role: 'user', content: qualityControlUser(input) }],
    schema: qualityReportSchema,
    schemaName: 'QualityReport',
    temperature: 0.1,
    maxTokens: 3000,
  });

  logger.info('ai.quality_control', {
    issues: result.data.issues.length,
    blockers: result.data.issues.filter((issue) => issue.severity === 'blocker').length,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

/* ---------------------------- Editing operations -------------------------- */

export async function editContent(input: {
  operation: EditOperation;
  platform: Platform;
  fields: Record<string, unknown>;
  argument?: string | undefined;
}): Promise<StageResult<RewriteResult>> {
  const result = await languageModel().completeJson({
    stage: 'edit',
    system: EDIT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: editUser({
          operation: input.operation,
          platform: PLATFORM_META[input.platform].label,
          fields: input.fields,
          maxLength: PLATFORM_META[input.platform].maxTextLength,
          argument: input.argument,
        }),
      },
    ],
    schema: rewriteSchema,
    schemaName: 'RewriteResult',
    temperature: input.operation === 'regenerate' ? 1 : 0.6,
    maxTokens: 2500,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

/* ---------------------------- Analytics insights -------------------------- */

export async function generateAnalyticsInsights(input: {
  rangeLabel: string;
  data: Record<string, unknown>;
  missingMetrics: string[];
}): Promise<StageResult<AnalyticsInsights>> {
  const result = await languageModel().completeJson({
    stage: 'analytics_insights',
    system: ANALYTICS_INSIGHTS_SYSTEM,
    messages: [{ role: 'user', content: analyticsInsightsUser(input) }],
    schema: analyticsInsightSchema,
    schemaName: 'AnalyticsInsights',
    temperature: 0.3,
    maxTokens: 2000,
  });

  return { data: result.data, usage: result.usage, model: result.model };
}

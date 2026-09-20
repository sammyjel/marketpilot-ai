import { z } from 'zod';

/**
 * Every AI stage is validated against one of these schemas before it is stored.
 * Anything the model cannot establish must be reported as `unknown` or listed
 * in `unknowns` — the schemas make that a structural requirement rather than a
 * prompt suggestion.
 */

const shortText = z.string().trim().min(1).max(300);
const bodyText = z.string().trim().min(1).max(4000);
const hashtag = z
  .string()
  .trim()
  .max(60)
  .transform((value) => (value.startsWith('#') ? value : `#${value}`))
  .refine((value) => /^#[\p{L}\p{N}_]+$/u.test(value), 'Hashtags may only contain letters, numbers and underscores.');

export const productAnalysisSchema = z.object({
  productType: z.string().max(120).nullable(),
  category: z.string().max(120).nullable(),
  visibleBrandName: z.string().max(120).nullable(),
  packaging: z.string().max(300).nullable(),
  colors: z.array(z.string().max(40)).max(8).default([]),
  visualCharacteristics: z.array(z.string().max(120)).max(10).default([]),
  likelyUseCase: z.string().max(300).nullable(),
  audienceClues: z.array(z.string().max(160)).max(8).default([]),
  /** Explicit list of what could NOT be determined. Never invent these away. */
  unknowns: z.array(z.string().max(160)).max(12).default([]),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type ProductAnalysis = z.infer<typeof productAnalysisSchema>;

export const campaignStrategySchema = z.object({
  campaignTitle: shortText,
  bigIdea: bodyText,
  keyMessage: shortText,
  angle: shortText,
  targetAudience: bodyText,
  /** Only claims supported by supplied product information. */
  proofPoints: z.array(z.string().max(300)).max(8).default([]),
  benefits: z.array(z.string().max(200)).min(1).max(8),
  differentiators: z.array(z.string().max(200)).max(6).default([]),
  primaryCta: shortText,
  contentPlan: z
    .array(
      z.object({
        platform: z.string().max(40),
        format: z.string().max(40),
        purpose: z.string().max(300),
      }),
    )
    .max(20)
    .default([]),
  /** Claims the model was asked for but could not support from the inputs. */
  cautions: z.array(z.string().max(300)).max(8).default([]),
});
export type CampaignStrategy = z.infer<typeof campaignStrategySchema>;

export const seoSchema = z.object({
  title: z.string().trim().min(1).max(70),
  metaDescription: z.string().trim().min(1).max(320),
  keywords: z.array(z.string().max(60)).min(1).max(25),
  searchIntent: z.enum(['informational', 'commercial', 'transactional', 'navigational']),
  productDescription: bodyText,
  faqs: z
    .array(z.object({ question: z.string().max(200), answer: z.string().max(1000) }))
    .max(8)
    .default([]),
  socialKeywords: z.array(z.string().max(60)).max(20).default([]),
});
export type SeoPackage = z.infer<typeof seoSchema>;

/* ------------------------------ Platform copy ----------------------------- */

export const facebookContentSchema = z.object({
  primaryText: z.string().trim().min(1).max(3000),
  headline: z.string().trim().min(1).max(120),
  cta: shortText,
  hashtags: z.array(hashtag).max(5).default([]),
  imageText: z.string().max(60).nullable().default(null),
});

export const instagramContentSchema = z.object({
  hook: z.string().trim().min(1).max(160),
  caption: z.string().trim().min(1).max(2200),
  cta: shortText,
  hashtags: z.array(hashtag).min(3).max(20),
  reelScript: z
    .array(z.object({ timecode: z.string().max(20), voiceover: z.string().max(400), onScreen: z.string().max(120) }))
    .max(10)
    .default([]),
  carouselCopy: z
    .array(z.object({ slide: z.number().int().min(1).max(10), headline: z.string().max(80), body: z.string().max(300) }))
    .max(10)
    .default([]),
});

export const tiktokContentSchema = z.object({
  /** The first three seconds decide whether the video is watched at all. */
  hook: z.string().trim().min(1).max(120),
  script: z
    .array(z.object({ timecode: z.string().max(20), line: z.string().max(400), action: z.string().max(200) }))
    .min(1)
    .max(12),
  onScreenText: z.array(z.string().max(80)).max(10).default([]),
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.array(hashtag).min(2).max(8),
  cta: shortText,
});

export const youtubeContentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().max(60)).max(20).default([]),
  shortsScript: z
    .array(z.object({ timecode: z.string().max(20), line: z.string().max(400) }))
    .max(12)
    .default([]),
  cta: shortText,
});

export const linkedinContentSchema = z.object({
  post: z.string().trim().min(1).max(3000),
  businessAngle: z.string().trim().min(1).max(600),
  cta: shortText,
  hashtags: z.array(hashtag).max(6).default([]),
});

export const pinterestContentSchema = z.object({
  pinTitle: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  keywords: z.array(z.string().max(60)).max(15).default([]),
  cta: shortText,
});

export const xContentSchema = z.object({
  post: z.string().trim().min(1).max(280),
  thread: z.array(z.string().max(280)).max(8).default([]),
  hashtags: z.array(hashtag).max(3).default([]),
});

export const PLATFORM_CONTENT_SCHEMAS = {
  facebook: facebookContentSchema,
  instagram: instagramContentSchema,
  tiktok: tiktokContentSchema,
  youtube: youtubeContentSchema,
  linkedin: linkedinContentSchema,
  pinterest: pinterestContentSchema,
  x: xContentSchema,
} as const;

export type PlatformContentSchemas = typeof PLATFORM_CONTENT_SCHEMAS;
export type PlatformContent<P extends keyof PlatformContentSchemas> = z.infer<PlatformContentSchemas[P]>;

/* ----------------------------- Creative briefs ---------------------------- */

export const creativeBriefSchema = z.object({
  concepts: z
    .array(
      z.object({
        name: z.string().max(80),
        kind: z.enum(['hero', 'lifestyle', 'advertisement', 'banner', 'carousel', 'pin']),
        aspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9', '2:3']),
        /** Instruction for the image model. Must not alter the product itself. */
        imagePrompt: z.string().max(1200),
        background: z.string().max(300),
        overlayText: z.string().max(80).nullable().default(null),
        rationale: z.string().max(400),
      }),
    )
    .min(1)
    .max(6),
  videoConcepts: z
    .array(
      z.object({
        durationSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        structure: z.array(
          z.object({
            beat: z.enum(['hook', 'problem', 'product', 'benefits', 'cta']),
            seconds: z.number().min(1).max(40),
            visual: z.string().max(400),
            voiceover: z.string().max(400),
            onScreen: z.string().max(120),
          }),
        ),
      }),
    )
    .max(3)
    .default([]),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

/* ----------------------------- Quality control ---------------------------- */

export const qualityIssueSchema = z.object({
  severity: z.enum(['info', 'warning', 'blocker']),
  category: z.enum([
    'unsupported_claim',
    'misleading',
    'spelling',
    'grammar',
    'duplicate_content',
    'hashtag_hygiene',
    'platform_format',
    'brand_voice',
    'cta_quality',
    'seo_quality',
    'prohibited_content',
    'safety',
  ]),
  platform: z.string().max(40).nullable().default(null),
  field: z.string().max(80).nullable().default(null),
  message: z.string().max(400),
  suggestion: z.string().max(400).nullable().default(null),
});
export type QualityIssue = z.infer<typeof qualityIssueSchema>;

export const qualityReportSchema = z.object({
  issues: z.array(qualityIssueSchema).max(60).default([]),
  /** True when a human must look before this can be approved. */
  requiresHumanReview: z.boolean(),
  summary: z.string().max(600),
});
export type QualityReport = z.infer<typeof qualityReportSchema>;

/* ------------------------------- Insights -------------------------------- */

export const analyticsInsightSchema = z.object({
  insights: z
    .array(
      z.object({
        title: z.string().max(140),
        detail: z.string().max(800),
        /** What in the data supports this, so a user can check it. */
        basis: z.string().max(400),
        recommendation: z.string().max(400).nullable().default(null),
      }),
    )
    .max(6),
  dataGaps: z.array(z.string().max(200)).max(8).default([]),
});
export type AnalyticsInsights = z.infer<typeof analyticsInsightSchema>;

/* ----------------------------- Content editing ---------------------------- */

export const rewriteSchema = z.object({
  fields: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  note: z.string().max(400).nullable().default(null),
});
export type RewriteResult = z.infer<typeof rewriteSchema>;

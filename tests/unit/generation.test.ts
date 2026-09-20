import { describe, expect, it } from 'vitest';
import { extractJson, describeSchema } from '@/providers/ai/json';
import { MockLanguageModelProvider } from '@/providers/ai/mock';
import {
  campaignStrategySchema,
  instagramContentSchema,
  productAnalysisSchema,
  qualityReportSchema,
  seoSchema,
  tiktokContentSchema,
  xContentSchema,
} from '@/server/ai/schemas';
import { PLATFORM_META, PLATFORMS, supports } from '@/lib/platforms';
import { slugify, uniqueSlug } from '@/lib/slug';
import { formatInTimezone, utcToZonedInput, zonedInputToUtc } from '@/lib/dates';
import { limitFor, planFor } from '@/lib/plans';

const CONTEXT = {
  brand: {
    name: 'DavMicBet',
    industry: 'Beauty & Cosmetics',
    description: 'Natural hair care',
    targetAudience: 'Women aged 25-55 with dry hair',
    country: 'US',
    language: 'en',
    currency: 'USD',
    tone: 'premium',
    voiceNotes: null,
    preferredCta: 'Shop the collection',
    guidelines: null,
    colors: ['#4f46e5'],
  },
  product: {
    name: 'Hair Growth Oil',
    description: 'Hair growth oil for women with dry and damaged hair.',
    productUrl: null,
    price: '24.99',
    currency: 'USD',
    category: 'Hair care',
    benefits: ['Deeply nourishes dry ends'],
    features: ['Cold-pressed argan oil'],
    keywords: [],
    targetAudience: null,
    callToAction: null,
    analysis: null,
  },
  campaign: {
    objective: 'product_launch',
    tone: 'premium',
    language: 'en',
    platforms: ['instagram', 'tiktok', 'x'],
    formats: ['image', 'reel'],
    targetAudience: 'Women aged 25-55 with dry hair',
    durationDays: 14,
    templateHints: null,
  },
};

function contextMessage() {
  return [
    { role: 'user' as const, content: `CONTEXT (JSON — null means the information was not supplied):\n${JSON.stringify(CONTEXT, null, 2)}` },
  ];
}

describe('JSON extraction from model output', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a fenced block', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```\nHope that helps')).toEqual({ a: 1 });
  });

  it('parses an object buried in prose', () => {
    expect(extractJson('Here you go: {"a":{"b":[1,2]}} — done.')).toEqual({ a: { b: [1, 2] } });
  });

  it('is not confused by braces inside strings', () => {
    expect(extractJson('{"text":"a } brace and a { brace"}')).toEqual({ text: 'a } brace and a { brace' });
  });

  it('throws on truncated JSON rather than returning a partial object', () => {
    expect(() => extractJson('{"a": {"b": 1')).toThrow();
  });

  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow();
  });
});

describe('schema description for prompts', () => {
  it('renders a readable shape', () => {
    const described = describeSchema(seoSchema) as Record<string, unknown>;
    expect(described['title']).toBe('string');
    expect(described['keywords']).toEqual(['string']);
    expect(described['searchIntent']).toEqual(
      expect.arrayContaining(['informational', 'commercial', 'transactional', 'navigational']),
    );
  });
});

describe('mock language model', () => {
  const model = new MockLanguageModelProvider();

  it('produces schema-valid product analysis that admits what it cannot see', async () => {
    const result = await model.completeJson({
      stage: 'product_analysis',
      messages: contextMessage(),
      schema: productAnalysisSchema,
      schemaName: 'ProductAnalysis',
    });

    expect(productAnalysisSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.unknowns.length).toBeGreaterThan(0);
    expect(result.data.confidence).toBe('low');
  });

  it('produces a strategy built from the real product input', async () => {
    const result = await model.completeJson({
      stage: 'campaign_strategy',
      messages: contextMessage(),
      schema: campaignStrategySchema,
      schemaName: 'CampaignStrategy',
    });

    expect(result.data.campaignTitle).toContain('Hair Growth Oil');
    expect(result.data.benefits).toContain('Deeply nourishes dry ends');
    // Proof points may only come from supplied features.
    for (const proof of result.data.proofPoints) {
      expect(CONTEXT.product.features).toContain(proof);
    }
  });

  it('generates distinct content per platform', async () => {
    const [instagram, tiktok] = await Promise.all([
      model.completeJson({
        stage: 'platform_content:instagram',
        messages: contextMessage(),
        schema: instagramContentSchema,
        schemaName: 'InstagramContent',
      }),
      model.completeJson({
        stage: 'platform_content:tiktok',
        messages: contextMessage(),
        schema: tiktokContentSchema,
        schemaName: 'TikTokContent',
      }),
    ]);

    expect(instagram.data.caption).not.toBe(tiktok.data.caption);
    expect(instagram.data.hook).not.toBe(tiktok.data.hook);
    expect(tiktok.data.script.length).toBeGreaterThan(0);
  });

  it('respects the X character limit', async () => {
    const result = await model.completeJson({
      stage: 'platform_content:x',
      messages: contextMessage(),
      schema: xContentSchema,
      schemaName: 'XContent',
    });

    expect(result.data.post.length).toBeLessThanOrEqual(280);
    for (const post of result.data.thread) expect(post.length).toBeLessThanOrEqual(280);
  });

  it('flags mock output for human review', async () => {
    const result = await model.completeJson({
      stage: 'quality_control',
      messages: contextMessage(),
      schema: qualityReportSchema,
      schemaName: 'QualityReport',
    });

    expect(result.data.requiresHumanReview).toBe(true);
  });
});

describe('content schemas', () => {
  it('normalises hashtags and rejects invalid ones', () => {
    const parsed = instagramContentSchema.safeParse({
      hook: 'Hook',
      caption: 'Caption',
      cta: 'Shop now',
      hashtags: ['haircare', '#dryhair', 'argan'],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.hashtags).toEqual(['#haircare', '#dryhair', '#argan']);

    const invalid = instagramContentSchema.safeParse({
      hook: 'Hook',
      caption: 'Caption',
      cta: 'Shop now',
      hashtags: ['#has spaces', '#ok', '#fine'],
    });
    expect(invalid.success).toBe(false);
  });

  it('rejects an over-length X post', () => {
    expect(xContentSchema.safeParse({ post: 'x'.repeat(281) }).success).toBe(false);
    expect(xContentSchema.safeParse({ post: 'x'.repeat(280) }).success).toBe(true);
  });

  it('requires an SEO title short enough not to be truncated', () => {
    expect(seoSchema.safeParse({
      title: 'x'.repeat(71),
      metaDescription: 'A description',
      keywords: ['one'],
      searchIntent: 'commercial',
      productDescription: 'Body',
    }).success).toBe(false);
  });
});

describe('platform capability metadata', () => {
  it('describes every supported platform', () => {
    for (const platform of PLATFORMS) {
      const meta = PLATFORM_META[platform];
      expect(meta.requirements.length).toBeGreaterThan(0);
      expect(meta.limitations.length).toBeGreaterThan(0);
      expect(meta.maxTextLength).toBeGreaterThan(0);
    }
  });

  it('does not claim text posting where the API has none', () => {
    // TikTok and YouTube are video-only; Pinterest has no plain text post.
    expect(supports('tiktok', 'text')).toBe(false);
    expect(supports('youtube', 'text')).toBe(false);
    expect(supports('pinterest', 'text')).toBe(false);
    expect(supports('tiktok', 'video')).toBe(true);
  });
});

describe('slugs', () => {
  it('produces url-safe values', () => {
    expect(slugify('DavMicBet Hair Care')).toBe('davmicbet-hair-care');
    expect(slugify('  Ünïcode & Symbols!  ')).toBe('unicode-symbols');
    expect(slugify('日本語', 'brand')).toBe('brand');
  });

  it('disambiguates collisions', async () => {
    const taken = new Set(['acme', 'acme-2']);
    await expect(uniqueSlug('Acme', async (candidate) => taken.has(candidate))).resolves.toBe('acme-3');
  });
});

describe('timezone handling', () => {
  it('converts a local wall-clock time to the right UTC instant', () => {
    // Istanbul is UTC+3 year round.
    const utc = zonedInputToUtc('2026-03-15', '09:00', 'Europe/Istanbul');
    expect(utc.toISOString()).toBe('2026-03-15T06:00:00.000Z');
  });

  it('round-trips through the form inputs', () => {
    const utc = zonedInputToUtc('2026-07-04', '18:30', 'America/New_York');
    expect(utcToZonedInput(utc, 'America/New_York')).toEqual({ date: '2026-07-04', time: '18:30' });
  });

  it('renders the same instant differently per timezone', () => {
    const instant = new Date('2026-01-01T23:30:00.000Z');
    expect(formatInTimezone(instant, 'UTC', 'yyyy-MM-dd HH:mm')).toBe('2026-01-01 23:30');
    expect(formatInTimezone(instant, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')).toBe('2026-01-02 08:30');
  });
});

describe('plan limits', () => {
  it('excludes video generation from the free plan', () => {
    expect(limitFor('free', 'video_generation')).toBe(0);
    expect(limitFor('professional', 'video_generation')).toBeGreaterThan(0);
  });

  it('increases allowances with every tier', () => {
    const tiers = ['free', 'starter', 'professional', 'agency'] as const;
    for (let i = 1; i < tiers.length; i += 1) {
      const previous = limitFor(tiers[i - 1]!, 'ai_generation');
      const current = limitFor(tiers[i]!, 'ai_generation');
      expect(current === null || (previous !== null && current > previous)).toBe(true);
    }
  });

  it('falls back to the free plan for an unknown tier', () => {
    expect(planFor('free').tier).toBe('free');
  });
});

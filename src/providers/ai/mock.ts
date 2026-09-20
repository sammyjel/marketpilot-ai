import type { z } from 'zod';
import { AppError } from '@/lib/errors';
import { BaseLanguageModelProvider } from './base';
import { extractJson } from './json';
import type { CompletionRequest, CompletionResult, JsonRequest, JsonResult } from './types';

type Ctx = {
  brand?: Record<string, unknown>;
  product?: Record<string, unknown>;
  campaign?: Record<string, unknown>;
};

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
}

/** Deterministic pick so the same input always produces the same output. */
function pick<T>(options: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return options[hash % options.length]!;
}

function tagify(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('');
  return cleaned ? `#${cleaned.toLowerCase()}` : '#marketing';
}

/**
 * Deterministic, schema-valid stand-in for a real language model.
 *
 * It reads the same CONTEXT JSON block the real prompts carry, so the output is
 * built from the user's actual brand and product rather than lorem ipsum. That
 * makes the whole product — generation, review, previews, quality control —
 * exercisable end to end without spending a cent on API credits.
 *
 * It is not pretending to be an AI: `MOCK_EXTERNAL_SERVICES` is surfaced in the
 * UI wherever generated content appears.
 */
export class MockLanguageModelProvider extends BaseLanguageModelProvider {
  readonly name = 'mock';
  readonly model = 'mock-marketing-v1';
  readonly supportsVision = true;

  /** Only reached if something asks for free text; the JSON path is overridden. */
  async complete(request: CompletionRequest): Promise<CompletionResult> {
    return {
      text: `Mock response for ${request.stage ?? 'unknown stage'}.`,
      model: this.model,
      usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 },
    };
  }

  override async completeJson<T extends z.ZodType>(request: JsonRequest<T>): Promise<JsonResult<z.infer<T>>> {
    const context = this.readContext(request);
    const stage = request.stage ?? request.schemaName;
    const fixture = this.build(stage, context, request);

    const parsed = request.schema.safeParse(fixture);
    if (!parsed.success) {
      // A mock that silently drifts from the schema is worse than no mock.
      throw new AppError(
        'internal_error',
        `Mock fixture for "${stage}" no longer matches its schema. Update src/providers/ai/mock.ts.`,
        { details: { issues: parsed.error.issues.slice(0, 5) } },
      );
    }

    return {
      data: parsed.data,
      usage: { inputTokens: 0, outputTokens: 0, costMicros: 0 },
      model: this.model,
      repaired: false,
    };
  }

  /** Pulls the CONTEXT JSON the prompts embed, so fixtures use real input. */
  private readContext(request: JsonRequest<z.ZodType>): Ctx {
    const text = request.messages
      .map((message) =>
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n'),
      )
      .join('\n');

    const marker = text.indexOf('CONTEXT (JSON');
    if (marker === -1) return {};
    try {
      return extractJson(text.slice(marker)) as Ctx;
    } catch {
      return {};
    }
  }

  private build(stage: string, ctx: Ctx, request: JsonRequest<z.ZodType>): unknown {
    const product = ctx.product ?? {};
    const brand = ctx.brand ?? {};
    const campaign = ctx.campaign ?? {};

    const productName = str(product['name'], 'this product');
    const brandName = str(brand['name'], 'the brand');
    const audience = str(campaign['targetAudience']) || str(product['targetAudience']) || str(brand['targetAudience'], 'people who care about quality');
    const benefits = list(product['benefits']);
    const features = list(product['features']);
    const cta = str(product['callToAction']) || str(brand['preferredCta'], 'Shop now');
    const category = str(product['category']) || str(brand['industry'], 'everyday essentials');
    const description = str(product['description'], `${productName} from ${brandName}`);
    const seed = `${brandName}:${productName}:${stage}`;

    const derivedBenefits =
      benefits.length > 0
        ? benefits
        : [
            `Made for ${audience.toLowerCase()}`,
            `Fits into a routine you already have`,
            `Straightforward to use from day one`,
          ];

    const baseTags = [tagify(brandName), tagify(category), tagify(productName)];

    if (stage.startsWith('platform_content')) {
      const platform = stage.split(':')[1] ?? 'instagram';
      return this.platformFixture(platform, {
        productName,
        brandName,
        audience,
        cta,
        category,
        description,
        benefits: derivedBenefits,
        features,
        baseTags,
        seed,
      });
    }

    switch (stage) {
      case 'product_analysis':
        return {
          productType: category,
          category,
          visibleBrandName: null,
          packaging: null,
          colors: [],
          visualCharacteristics: [],
          likelyUseCase: description,
          audienceClues: audience ? [audience] : [],
          unknowns: [
            'Mock mode is enabled, so no image was actually analysed.',
            'Packaging text, materials and exact colours were not determined.',
          ],
          confidence: 'low',
        };

      case 'campaign_strategy': {
        const angle = pick(
          [
            'Show the product doing its job in an ordinary moment rather than a staged one.',
            'Lead with the specific problem it removes, then reveal the product as the answer.',
            'Frame it around the small daily upgrade rather than a dramatic transformation.',
          ],
          seed,
        );
        return {
          campaignTitle: `${productName} — ${str(campaign['objective'], 'campaign').replace(/_/g, ' ')}`,
          bigIdea: `${productName} earns its place by solving one thing well for ${audience.toLowerCase()}. The campaign shows that one thing clearly, on every platform, without overclaiming.`,
          keyMessage: `${productName}: ${derivedBenefits[0] ?? 'made to fit your routine'}.`,
          angle,
          targetAudience: audience,
          proofPoints: features.slice(0, 4),
          benefits: derivedBenefits.slice(0, 6),
          differentiators: features.slice(0, 3),
          primaryCta: cta,
          contentPlan: list(campaign['platforms']).map((platform) => ({
            platform,
            format: platform === 'tiktok' || platform === 'youtube' ? 'short_video' : 'image',
            purpose: `Introduce ${productName} to ${audience.toLowerCase()} in the way this platform's audience expects.`,
          })),
          cautions: [
            'Generated in mock mode — no live model reviewed these claims.',
            ...(features.length === 0
              ? ['No product features were supplied, so proof points are empty rather than invented.']
              : []),
          ],
        };
      }

      case 'seo':
        return {
          title: `${productName} | ${brandName}`.slice(0, 70),
          metaDescription: `${description} Built for ${audience.toLowerCase()}. ${cta}.`.slice(0, 320),
          keywords: [
            productName.toLowerCase(),
            category.toLowerCase(),
            `${category.toLowerCase()} for ${audience.split(' ')[0]?.toLowerCase() ?? 'you'}`,
            `best ${category.toLowerCase()}`,
            `${brandName.toLowerCase()} ${productName.toLowerCase()}`,
          ].filter(Boolean),
          searchIntent: 'commercial',
          productDescription: `${description}\n\n${derivedBenefits.map((b) => `• ${b}`).join('\n')}`,
          faqs: [
            {
              question: `Who is ${productName} for?`,
              answer: audience,
            },
          ],
          socialKeywords: baseTags.map((tag) => tag.replace('#', '')),
        };

      case 'creative_brief': {
        const wantsVideo = list(campaign['formats']).some((format) => format.includes('video') || format === 'reel' || format === 'short');
        return {
          concepts: [
            {
              name: 'Clean hero',
              kind: 'hero',
              aspectRatio: '1:1',
              imagePrompt: `Keep the product exactly as photographed. Place it centred on a soft matte surface with a plain background, single soft key light from the upper left, gentle shadow to the right.`,
              background: 'Plain matte surface, neutral tone',
              overlayText: null,
              rationale: 'A clean hero reads at thumbnail size and works as the default across every network.',
            },
            {
              name: 'In use',
              kind: 'lifestyle',
              aspectRatio: '4:5',
              imagePrompt: `Keep the product exactly as photographed. Show it in a real setting where ${audience.toLowerCase()} would use it, natural daylight, shallow depth of field, product in sharp focus.`,
              background: 'Natural everyday setting with daylight',
              overlayText: null,
              rationale: 'Context makes the product feel usable rather than staged.',
            },
          ],
          videoConcepts: wantsVideo
            ? [
                {
                  durationSeconds: 15,
                  structure: [
                    { beat: 'hook', seconds: 3, visual: 'Close on the product being picked up', voiceover: `If ${audience.toLowerCase()} have one thing in common, it is not having time.`, onScreen: 'Three seconds' },
                    { beat: 'problem', seconds: 3, visual: 'The everyday friction the product removes', voiceover: 'The usual way takes longer than it should.', onScreen: '' },
                    { beat: 'product', seconds: 4, visual: 'Product in use, hands only', voiceover: `${productName}, doing the one job it is for.`, onScreen: productName },
                    { beat: 'benefits', seconds: 3, visual: 'Result shot', voiceover: derivedBenefits[0] ?? 'Made to fit your routine.', onScreen: '' },
                    { beat: 'cta', seconds: 2, visual: 'Product with brand mark', voiceover: cta, onScreen: cta },
                  ],
                },
              ]
            : [],
        };
      }

      case 'quality_control':
        return {
          issues: [
            {
              severity: 'info',
              category: 'brand_voice',
              platform: null,
              field: null,
              message: 'This campaign was generated in mock mode, so no live model reviewed the claims.',
              suggestion: 'Set MOCK_EXTERNAL_SERVICES=false and configure an AI provider before publishing.',
            },
          ],
          requiresHumanReview: true,
          summary: 'Generated in mock mode. Review every claim yourself before publishing.',
        };

      case 'analytics_insights':
        return {
          insights: [],
          dataGaps: ['Mock mode is enabled, so no insights were generated from live platform data.'],
        };

      case 'edit': {
        // Echo the current fields back so the editing UI round-trips correctly.
        const current = this.readEditFields(request);
        return {
          fields: current,
          note: 'Mock mode: content returned unchanged. Configure an AI provider to use editing tools.',
        };
      }

      default:
        throw new AppError('internal_error', `No mock fixture is defined for stage "${stage}".`);
    }
  }

  private readEditFields(request: JsonRequest<z.ZodType>): Record<string, string | string[]> {
    const text = request.messages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    const marker = text.indexOf('CURRENT CONTENT:');
    if (marker === -1) return {};
    try {
      const parsed = extractJson(text.slice(marker)) as Record<string, unknown>;
      const out: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') out[key] = value;
        else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) out[key] = value as string[];
      }
      return out;
    } catch {
      return {};
    }
  }

  private platformFixture(
    platform: string,
    data: {
      productName: string;
      brandName: string;
      audience: string;
      cta: string;
      category: string;
      description: string;
      benefits: string[];
      features: string[];
      baseTags: string[];
      seed: string;
    },
  ): unknown {
    const { productName, brandName, audience, cta, description, benefits, baseTags } = data;
    const firstBenefit = benefits[0] ?? 'Made to fit your routine';

    switch (platform) {
      case 'facebook':
        return {
          primaryText: `${description}\n\n${benefits.map((b) => `• ${b}`).join('\n')}\n\n${cta}.`,
          headline: `${productName} from ${brandName}`.slice(0, 120),
          cta,
          hashtags: baseTags.slice(0, 2),
          imageText: null,
        };

      case 'instagram':
        return {
          hook: `${firstBenefit}.`,
          caption: `${firstBenefit}.\n\n${description}\n\n${benefits
            .slice(1)
            .map((b) => `• ${b}`)
            .join('\n')}\n\n${cta} — link in bio.`,
          cta,
          hashtags: [...baseTags, '#smallbusiness', '#newin'].slice(0, 8),
          reelScript: [
            { timecode: '0:00–0:03', voiceover: `${firstBenefit}.`, onScreen: firstBenefit.slice(0, 40) },
            { timecode: '0:03–0:10', voiceover: description.slice(0, 200), onScreen: productName },
            { timecode: '0:10–0:15', voiceover: `${cta}.`, onScreen: cta },
          ],
          carouselCopy: benefits.slice(0, 3).map((benefit, index) => ({
            slide: index + 1,
            headline: benefit.slice(0, 80),
            body: index === 0 ? description.slice(0, 300) : benefit,
          })),
        };

      case 'tiktok':
        return {
          hook: `Nobody tells you this about ${data.category.toLowerCase()}.`,
          script: [
            { timecode: '0:00–0:03', line: `Nobody tells you this about ${data.category.toLowerCase()}.`, action: 'Straight to camera, product just out of frame' },
            { timecode: '0:03–0:08', line: description.slice(0, 200), action: 'Reveal the product, hands only' },
            { timecode: '0:08–0:13', line: firstBenefit, action: 'Show it being used' },
            { timecode: '0:13–0:15', line: `${cta}.`, action: 'Product centred, text on screen' },
          ],
          onScreenText: [firstBenefit.slice(0, 40), productName, cta],
          caption: `${firstBenefit} ${baseTags.join(' ')}`,
          hashtags: baseTags.slice(0, 4),
          cta,
        };

      case 'youtube':
        return {
          title: `${productName}: ${firstBenefit}`.slice(0, 100),
          description: `${description}\n\nWhat it does:\n${benefits.map((b) => `- ${b}`).join('\n')}\n\n${cta}.\n\nFrom ${brandName}.`,
          tags: baseTags.map((tag) => tag.replace('#', '')),
          shortsScript: [
            { timecode: '0:00–0:03', line: `${firstBenefit}.` },
            { timecode: '0:03–0:20', line: description.slice(0, 300) },
            { timecode: '0:20–0:30', line: `${cta}.` },
          ],
          cta,
        };

      case 'linkedin':
        return {
          post: `${firstBenefit}.\n\n${description}\n\nWe built ${productName} for ${audience.toLowerCase()}, and kept the scope narrow on purpose.\n\n${cta}.`,
          businessAngle: `${productName} addresses a specific, repeated need for ${audience.toLowerCase()}, which makes it straightforward to position and to price.`,
          cta,
          hashtags: baseTags.slice(0, 3),
        };

      case 'pinterest':
        return {
          pinTitle: `${productName} for ${audience.split(' ').slice(0, 3).join(' ')}`.slice(0, 100),
          description: `${description} ${firstBenefit}. ${cta}.`.slice(0, 500),
          keywords: baseTags.map((tag) => tag.replace('#', '')),
          cta,
        };

      case 'x':
        return {
          post: `${firstBenefit}. ${productName}, from ${brandName}.`.slice(0, 280),
          thread: [description.slice(0, 280), `${cta}.`].filter(Boolean),
          hashtags: baseTags.slice(0, 1),
        };

      default:
        throw new AppError('internal_error', `No mock fixture for platform "${platform}".`);
    }
  }
}

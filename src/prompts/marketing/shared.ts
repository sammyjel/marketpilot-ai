/**
 * Rules shared by every marketing prompt.
 *
 * The safety block is not decorative: the quality-control stage checks the
 * output against the same rules, so a model that ignores them is caught.
 */
export const SAFETY_RULES = `
TRUTHFULNESS RULES — these override every other instruction:
- Use only facts supplied in the product information, brand profile or image analysis.
- Never invent medical, health, therapeutic, financial, legal or guaranteed-results claims.
- Never invent testimonials, reviews, ratings, certifications, awards, statistics, endorsements or partnerships.
- Never invent discounts, prices, stock levels, deadlines or scarcity ("only 3 left", "ends tonight") unless that exact information was supplied.
- If a benefit is plausible but unsupported, phrase it as a description of the product ("formulated for dry hair"), not as a promised outcome ("regrows hair in 30 days").
- If you cannot support something the brief asks for, leave it out and record it under "cautions".
- Do not claim the brand is "the best", "number one" or "clinically proven" unless that was supplied.
`.trim();

export const WRITING_RULES = `
WRITING RULES:
- Write for the supplied language and market. Use that market's spelling and currency conventions.
- Sound like a person, not a press release. Short sentences. No filler.
- Never use the words "unleash", "elevate", "revolutionise", "game-changer", "transform your life" or "dive into".
- Do not start posts with "Introducing" unless the objective is a product launch.
- Emoji: match the platform norm. Heavy on TikTok and Instagram, sparing on Facebook, none on LinkedIn or X unless the brand tone is funny or casual.
- Respect each platform's character limits exactly.
`.trim();

export type BrandContext = {
  name: string;
  industry: string | null;
  description: string | null;
  targetAudience: string | null;
  country: string;
  language: string;
  currency: string;
  tone: string;
  voiceNotes: string | null;
  preferredCta: string | null;
  guidelines: string | null;
  colors: string[];
};

export type ProductContext = {
  name: string;
  description: string | null;
  productUrl: string | null;
  price: string | null;
  currency: string | null;
  category: string | null;
  benefits: string[];
  features: string[];
  keywords: string[];
  targetAudience: string | null;
  callToAction: string | null;
  analysis: Record<string, unknown> | null;
};

export type CampaignContext = {
  objective: string;
  tone: string;
  language: string;
  platforms: string[];
  formats: string[];
  targetAudience: string | null;
  durationDays: number | null;
  templateHints: string | null;
};

export type GenerationContext = {
  brand: BrandContext;
  product: ProductContext;
  campaign: CampaignContext;
};

/**
 * The context is serialised as JSON rather than prose so the model sees exactly
 * what is known and what is null, with no ambiguity about missing fields.
 */
export function renderContext(context: GenerationContext): string {
  return ['CONTEXT (JSON — null means the information was not supplied):', JSON.stringify(context, null, 2)].join('\n');
}

export const OBJECTIVE_GUIDANCE: Record<string, string> = {
  product_launch: 'This is a launch. Lead with what is new and why it exists. Build anticipation, not urgency.',
  sales: 'Drive purchases. Be concrete about the offer, but never invent a discount that was not supplied.',
  brand_awareness: 'Introduce the brand and what it stands for. Recognition matters more than conversion here.',
  website_traffic: 'Every piece should end with a clear reason to click through to the product page.',
  lead_generation: 'Invite a low-friction next step such as a sign-up or a question in the comments.',
  engagement: 'Ask something worth answering. Prioritise replies, saves and shares over clicks.',
  seasonal_promotion: 'Tie the product to the season or occasion naturally. Do not fabricate seasonal offers.',
  event_promotion: 'Make the what, when and where unmistakable. Only use event details that were supplied.',
  new_product_announcement: 'Announce clearly and briefly. Explain who it is for in the first line.',
  educational: 'Teach something genuinely useful first. The product should feel like the natural conclusion.',
  retargeting: 'Assume the reader already saw the product. Address the hesitation rather than re-introducing it.',
};

export function objectiveGuidance(objective: string): string {
  return OBJECTIVE_GUIDANCE[objective] ?? 'Adapt the campaign to the stated objective.';
}

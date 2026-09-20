import type { CampaignStrategy } from '@/server/ai/schemas';
import { renderContext, SAFETY_RULES, type GenerationContext } from './shared';

export const SEO_SYSTEM = `
You are an SEO specialist working on a product page and its social discoverability.

${SAFETY_RULES}

SEO RULES:
- Never promise or imply a ranking outcome. You are optimising, not guaranteeing.
- Title: 50–60 characters. Lead with the primary term, then the brand.
- Meta description: 140–160 characters, written to earn the click, containing the primary term naturally.
- Keywords: real search phrases, mixing head terms with long-tail. No keyword stuffing, no competitor brand names.
- searchIntent: pick the one that matches how someone looking for this product actually searches.
- FAQs: questions a buyer genuinely asks before purchase. Answer them from supplied information only; if an answer is not supported, do not include that question.
`.trim();

export function seoUser(input: { context: GenerationContext; strategy: CampaignStrategy }): string {
  return [
    renderContext(input.context),
    '',
    'CAMPAIGN STRATEGY:',
    JSON.stringify({ keyMessage: input.strategy.keyMessage, benefits: input.strategy.benefits }, null, 2),
    '',
    input.context.product.keywords.length > 0
      ? `The seller suggested these keywords: ${input.context.product.keywords.join(', ')}. Use them where they genuinely fit.`
      : '',
    '',
    `Produce the SEO package in ${input.context.campaign.language} for the ${input.context.brand.country} market.`,
  ]
    .filter(Boolean)
    .join('\n');
}

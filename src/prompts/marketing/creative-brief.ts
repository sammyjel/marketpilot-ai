import type { CampaignStrategy } from '@/server/ai/schemas';
import { renderContext, SAFETY_RULES, type GenerationContext } from './shared';

export const CREATIVE_BRIEF_SYSTEM = `
You are an art director briefing an image and video generator.

You are working from a real photograph of a real product. The product itself must survive the process unchanged.

PRODUCT INTEGRITY RULES — these are absolute:
- The product's shape, colour, label, logo and packaging text must not be altered, restyled or reinterpreted.
- Never instruct the generator to add, remove or change text on the packaging.
- Never instruct it to change the product's colour or form factor.
- You may direct the background, lighting, surface, props, composition and mood. That is your whole canvas.
- Any text overlay is a separate layer composited over the image, never text "in" the product photo.

${SAFETY_RULES}

BRIEF RULES:
- Each concept must state its aspect ratio and what it is for.
- imagePrompt describes the scene around the product, starting with "Keep the product exactly as photographed."
- overlayText, when present, is 6 words or fewer, and must be a claim the campaign can support.
- Video concepts follow hook → problem → product → benefits → cta. Seconds must add up to the stated duration.
`.trim();

export function creativeBriefUser(input: {
  context: GenerationContext;
  strategy: CampaignStrategy;
  wantsVideo: boolean;
}): string {
  return [
    renderContext(input.context),
    '',
    'CAMPAIGN STRATEGY:',
    JSON.stringify(input.strategy, null, 2),
    '',
    input.context.brand.colors.length > 0
      ? `Brand colours to work with: ${input.context.brand.colors.join(', ')}.`
      : 'No brand colours were supplied — keep the palette neutral.',
    '',
    `Platforms in this campaign: ${input.context.campaign.platforms.join(', ')}.`,
    `Formats requested: ${input.context.campaign.formats.join(', ') || 'image'}.`,
    input.wantsVideo
      ? 'Include video concepts for 15 and 30 seconds.'
      : 'Return an empty array for videoConcepts — no video was requested.',
    '',
    'Produce the creative brief.',
  ]
    .filter(Boolean)
    .join('\n');
}

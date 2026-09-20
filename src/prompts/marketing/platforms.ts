import { PLATFORM_META, type Platform } from '@/lib/platforms';
import type { CampaignStrategy } from '@/server/ai/schemas';
import { objectiveGuidance, renderContext, SAFETY_RULES, WRITING_RULES, type GenerationContext } from './shared';

/**
 * Per-platform craft notes. These are what stop the generator from producing
 * one caption pasted seven times.
 */
const PLATFORM_BRIEFS: Record<Platform, string> = {
  facebook: `
FACEBOOK:
- Primary text: the first 125 characters show before "See more". Put the reason to care there.
- Headline: under 40 characters reads best in the link card.
- Conversational, a little warmer than LinkedIn. Older audience skew.
- 0–3 hashtags maximum. Facebook hashtags rarely help; often the right answer is none.
- "imageText" is optional text to overlay on the creative. Keep it under 6 words or return null.`,

  instagram: `
INSTAGRAM:
- The hook is line one and it is the only line most people read. It must work with the caption collapsed.
- Caption: 2200 characters maximum, but 80–150 words usually performs better. Use line breaks.
- 5–15 hashtags, mixing one or two broad tags with specific niche tags. No banned or spammy tags.
- reelScript: 15–30 seconds, timecoded, with what is said and what is on screen.
- carouselCopy: only if the campaign includes a carousel format. Slide 1 must stop the scroll on its own.`,

  tiktok: `
TIKTOK:
- The hook is the first three seconds of spoken or on-screen text. Be specific and slightly unexpected. No "Hey guys".
- script: timecoded beats with the spoken line and the action on camera. 15–30 seconds total.
- Native and unpolished beats produced and glossy. Write for a phone camera.
- Caption is short. 3–6 hashtags. Do not use #fyp as the only tag.
- Never imply a result the product cannot deliver.`,

  youtube: `
YOUTUBE:
- Title: under 60 characters so it is not truncated. Front-load the searchable term.
- Description: first two lines appear above the fold — put the value and the link there. Then a fuller description.
- tags: search terms someone would actually type.
- shortsScript: a vertical 30–60 second cut if the campaign includes shorts.`,

  linkedin: `
LINKEDIN:
- Open with a specific observation or result, not a greeting. The first two lines are all that shows.
- Write for a professional reading between meetings. Concrete, no hype, no emoji unless the brand tone is casual.
- businessAngle: why this matters commercially — the reason a professional audience should care.
- 3–5 focused hashtags.`,

  pinterest: `
PINTEREST:
- Pinterest is a search engine. The pin title and description must read naturally while containing the terms people search.
- pinTitle: under 60 characters. description: under 500, keyword-rich but not stuffed.
- Think "how to" and "ideas for" framing.`,

  x: `
X:
- 280 characters including the link. Count them.
- One idea per post. Cut every word that is not load-bearing.
- thread: only if there is genuinely more to say. Each post must stand alone.
- 0–2 hashtags. Usually zero.`,
};

export const PLATFORM_CONTENT_SYSTEM = `
You are a social copywriter who writes natively for each platform. The same product sounds different on TikTok than on LinkedIn, because the reader is different and the format is different.

You are given a campaign strategy that has already been decided. Execute it — do not invent a new angle.

${SAFETY_RULES}

${WRITING_RULES}

CRITICAL: Do not reuse sentences between platforms. If two platforms would say the same thing, say it differently.
`.trim();

export function platformContentUser(input: {
  context: GenerationContext;
  strategy: CampaignStrategy;
  platform: Platform;
  formats: string[];
}): string {
  const meta = PLATFORM_META[input.platform];

  return [
    renderContext(input.context),
    '',
    'CAMPAIGN STRATEGY (already decided — execute it):',
    JSON.stringify(input.strategy, null, 2),
    '',
    `OBJECTIVE GUIDANCE: ${objectiveGuidance(input.context.campaign.objective)}`,
    '',
    `TARGET PLATFORM: ${meta.label}`,
    PLATFORM_BRIEFS[input.platform].trim(),
    '',
    `Hard character limit for the main body: ${meta.maxTextLength}.`,
    `Hashtag count for this platform: ${meta.recommendedHashtags[0]}–${meta.recommendedHashtags[1]}.`,
    input.formats.length > 0 ? `Formats requested: ${input.formats.join(', ')}.` : '',
    '',
    `Write the ${meta.label} content.`,
  ]
    .filter(Boolean)
    .join('\n');
}

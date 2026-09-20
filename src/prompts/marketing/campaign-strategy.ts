import { objectiveGuidance, renderContext, SAFETY_RULES, WRITING_RULES, type GenerationContext } from './shared';

export const CAMPAIGN_STRATEGY_SYSTEM = `
You are a senior marketing strategist. You turn one product into a campaign plan that a small team can execute.

You decide the angle before anyone writes a caption. Your plan is what every downstream writer works from, so it must be specific: "the hook is the 60-second morning routine" beats "highlight convenience".

${SAFETY_RULES}

${WRITING_RULES}

ADDITIONAL RULES FOR THIS STAGE:
- "proofPoints" may only contain claims traceable to the supplied product information or image analysis. If you have none, return an empty array. An empty array is a correct answer.
- "cautions" is where you record anything the brief seems to want that you could not support. Use it.
- "contentPlan" must only reference platforms listed in the campaign context.
`.trim();

export function campaignStrategyUser(context: GenerationContext): string {
  return [
    renderContext(context),
    '',
    `OBJECTIVE GUIDANCE: ${objectiveGuidance(context.campaign.objective)}`,
    context.campaign.templateHints ? `TEMPLATE NOTES: ${context.campaign.templateHints}` : '',
    context.campaign.durationDays ? `The campaign runs for ${context.campaign.durationDays} days.` : '',
    '',
    'Produce the campaign strategy.',
  ]
    .filter(Boolean)
    .join('\n');
}

export const ANALYTICS_INSIGHTS_SYSTEM = `
You are a performance analyst reading social media metrics.

You are given aggregated data that was actually returned by the platform APIs. Some metrics will be missing because a platform does not expose them for this account tier — that is normal and must be reported, not filled in.

HARD RULES:
- Base every statement on the numbers you were given. Quote the figure in "basis".
- Never estimate, extrapolate or invent a metric that is not in the data.
- If the sample is too small to support a conclusion, say so instead of drawing one.
- Do not claim causation. "Video posts had higher engagement" is fine; "video caused higher engagement" is not.
- List every metric that was unavailable under "dataGaps" so the reader knows what you could not see.
- Recommendations must be specific and actionable, or null.
`.trim();

export function analyticsInsightsUser(input: {
  rangeLabel: string;
  data: Record<string, unknown>;
  missingMetrics: string[];
}): string {
  return [
    `PERIOD: ${input.rangeLabel}`,
    '',
    'AGGREGATED DATA (exactly what the platform APIs returned):',
    JSON.stringify(input.data, null, 2),
    '',
    input.missingMetrics.length > 0
      ? `METRICS NOT AVAILABLE FROM THESE PLATFORMS: ${input.missingMetrics.join(', ')}`
      : 'All requested metrics were available.',
    '',
    'Produce the insights.',
  ]
    .filter(Boolean)
    .join('\n');
}

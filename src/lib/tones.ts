/**
 * Brand voice options.
 *
 * Lives in `lib` rather than in the brands service because client components
 * render the picker: anything a client imports must not pull in a `server-only`
 * module.
 */
export const BRAND_TONES = [
  'professional',
  'friendly',
  'premium',
  'funny',
  'educational',
  'inspirational',
  'bold',
  'luxury',
  'casual',
] as const;

export type BrandTone = (typeof BRAND_TONES)[number];

export const TONE_LABELS: Record<BrandTone, string> = {
  professional: 'Professional',
  friendly: 'Friendly',
  premium: 'Premium',
  funny: 'Funny',
  educational: 'Educational',
  inspirational: 'Inspirational',
  bold: 'Bold',
  luxury: 'Luxury',
  casual: 'Casual',
};

export const TONE_DESCRIPTIONS: Record<BrandTone, string> = {
  professional: 'Clear, credible, business-appropriate.',
  friendly: 'Warm and conversational.',
  premium: 'Refined, considered, quality-led.',
  funny: 'Playful, quick, meme-aware.',
  educational: 'Explains the why behind the product.',
  inspirational: 'Aspirational and motivating.',
  bold: 'Direct, confident, high-energy.',
  luxury: 'Understated, exclusive, elegant.',
  casual: 'Relaxed and everyday.',
};

export function isBrandTone(value: string): value is BrandTone {
  return (BRAND_TONES as readonly string[]).includes(value);
}

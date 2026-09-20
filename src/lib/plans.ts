export type PlanTier = 'free' | 'starter' | 'professional' | 'agency';

export type UsageMetric =
  | 'ai_generation'
  | 'image_generation'
  | 'video_generation'
  | 'voice_generation'
  | 'published_post'
  | 'connected_account'
  | 'storage_bytes';

/** `null` means unlimited for that metric on that plan. */
export type PlanLimits = Record<UsageMetric, number | null> & {
  brands: number | null;
  teamMembers: number | null;
};

export type Plan = {
  tier: PlanTier;
  name: string;
  description: string;
  monthlyPriceUsd: number;
  highlighted?: boolean;
  highlights: string[];
  limits: PlanLimits;
};

const GB = 1024 * 1024 * 1024;

export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    description: 'Try the full pipeline on a couple of products.',
    monthlyPriceUsd: 0,
    highlights: ['3 campaigns per month', '1 brand', '2 connected accounts', 'All 7 platforms', 'Manual publish fallback'],
    limits: {
      ai_generation: 20,
      image_generation: 10,
      video_generation: 0,
      voice_generation: 0,
      published_post: 15,
      connected_account: 2,
      storage_bytes: 2 * GB,
      brands: 1,
      teamMembers: 1,
    },
  },
  {
    tier: 'starter',
    name: 'Starter',
    description: 'For a single business publishing every week.',
    monthlyPriceUsd: 29,
    highlights: ['100 AI generations', '50 AI images', '3 brands', '6 connected accounts', 'Scheduling calendar'],
    limits: {
      ai_generation: 100,
      image_generation: 50,
      video_generation: 3,
      voice_generation: 10,
      published_post: 150,
      connected_account: 6,
      storage_bytes: 20 * GB,
      brands: 3,
      teamMembers: 3,
    },
  },
  {
    tier: 'professional',
    name: 'Professional',
    description: 'Video generation and higher volume for growing teams.',
    monthlyPriceUsd: 79,
    highlighted: true,
    highlights: ['400 AI generations', '200 AI images', '25 AI videos', '10 brands', 'AI performance insights'],
    limits: {
      ai_generation: 400,
      image_generation: 200,
      video_generation: 25,
      voice_generation: 100,
      published_post: 600,
      connected_account: 20,
      storage_bytes: 100 * GB,
      brands: 10,
      teamMembers: 10,
    },
  },
  {
    tier: 'agency',
    name: 'Agency',
    description: 'Multiple clients, bigger allowances, full team roles.',
    monthlyPriceUsd: 199,
    highlights: ['1,500 AI generations', '800 AI images', '100 AI videos', 'Unlimited brands', 'Client separation'],
    limits: {
      ai_generation: 1500,
      image_generation: 800,
      video_generation: 100,
      voice_generation: 500,
      published_post: null,
      connected_account: null,
      storage_bytes: 500 * GB,
      brands: null,
      teamMembers: 25,
    },
  },
];

const BY_TIER = new Map(PLANS.map((plan) => [plan.tier, plan]));

export function planFor(tier: PlanTier): Plan {
  return BY_TIER.get(tier) ?? PLANS[0]!;
}

export function limitFor(tier: PlanTier, metric: UsageMetric): number | null {
  return planFor(tier).limits[metric];
}

export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
  ai_generation: 'AI generations',
  image_generation: 'Image generations',
  video_generation: 'Video generations',
  voice_generation: 'Voice-overs',
  published_post: 'Published posts',
  connected_account: 'Connected accounts',
  storage_bytes: 'Storage',
};

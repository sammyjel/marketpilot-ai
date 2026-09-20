export const PLATFORMS = [
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
  'pinterest',
  'x',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export type PlatformCapability = 'text' | 'image' | 'carousel' | 'video' | 'story' | 'schedule' | 'analytics';

export type PlatformMeta = {
  id: Platform;
  label: string;
  /** Brand colour, used sparingly for identification only. */
  color: string;
  /** What the official API can do once the app is approved. */
  capabilities: PlatformCapability[];
  /** Account/app prerequisites the user must satisfy. Shown in the UI verbatim. */
  requirements: string[];
  /** Real constraints we must respect rather than paper over. */
  limitations: string[];
  maxTextLength: number;
  recommendedHashtags: [number, number];
  docsUrl: string;
};

/**
 * Honest capability metadata for every supported network.
 *
 * These notes drive the UI: a capability that is not listed here is never
 * offered as a one-click action, and anything requiring platform review is
 * labelled in the connection screen instead of failing silently later.
 */
export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    capabilities: ['text', 'image', 'video', 'schedule', 'analytics'],
    requirements: [
      'A Facebook Page (personal profiles cannot be published to via the API).',
      'A Meta developer app with pages_manage_posts, pages_read_engagement and pages_show_list.',
      'Meta App Review before the app can post for accounts outside your own.',
    ],
    limitations: ['Page access tokens expire and must be refreshed.', 'Publishing to personal profiles is not supported by the API.'],
    maxTextLength: 63206,
    recommendedHashtags: [0, 3],
    docsUrl: 'https://developers.facebook.com/docs/pages-api',
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    color: '#E1306C',
    capabilities: ['image', 'carousel', 'video', 'story', 'schedule', 'analytics'],
    requirements: [
      'An Instagram Business or Creator account linked to a Facebook Page.',
      'instagram_content_publish permission, granted through Meta App Review.',
      'Media must be reachable at a public HTTPS URL for the container step.',
    ],
    limitations: [
      'Publishing is a two-step container + publish flow; large videos take time to process.',
      'A rolling limit of 50 API-published posts per 24 hours per account.',
      'Stories publishing requires additional permissions and is not available to all apps.',
    ],
    maxTextLength: 2200,
    recommendedHashtags: [5, 15],
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    color: '#010101',
    capabilities: ['video', 'schedule', 'analytics'],
    requirements: [
      'A TikTok for Developers app with the Content Posting API enabled.',
      'video.publish scope, which requires TikTok audit and approval.',
      'Unaudited apps can only post privately to the creator own account.',
    ],
    limitations: [
      'Video only — there is no public text or image post endpoint.',
      'Direct Post requires audit; otherwise content lands in the app inbox as a draft the creator must confirm.',
    ],
    maxTextLength: 2200,
    recommendedHashtags: [3, 6],
    docsUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    color: '#FF0000',
    capabilities: ['video', 'schedule', 'analytics'],
    requirements: [
      'A Google Cloud project with the YouTube Data API v3 enabled.',
      'youtube.upload scope and a verified channel.',
      'Google OAuth verification for the sensitive scopes before public use.',
    ],
    limitations: [
      'Uploads cost 1600 quota units each; the default daily quota allows roughly 6 uploads.',
      'Unverified apps upload videos as private until the channel is verified.',
    ],
    maxTextLength: 5000,
    recommendedHashtags: [3, 8],
    docsUrl: 'https://developers.google.com/youtube/v3/docs/videos/insert',
  },
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    capabilities: ['text', 'image', 'video', 'schedule', 'analytics'],
    requirements: [
      'A LinkedIn developer app associated with a Company Page.',
      'w_member_social or w_organization_social, granted through the Community Management API programme.',
    ],
    limitations: ['Organization posting requires programme access, which LinkedIn reviews case by case.'],
    maxTextLength: 3000,
    recommendedHashtags: [3, 5],
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/',
  },
  pinterest: {
    id: 'pinterest',
    label: 'Pinterest',
    color: '#E60023',
    capabilities: ['image', 'video', 'schedule', 'analytics'],
    requirements: [
      'A Pinterest business account and a developer app with pins:write and boards:read.',
      'Standard access review to move out of trial mode.',
    ],
    limitations: ['Every pin must target a board.', 'Trial apps are limited to a small number of calls per day.'],
    maxTextLength: 500,
    recommendedHashtags: [0, 5],
    docsUrl: 'https://developers.pinterest.com/docs/api/v5/',
  },
  x: {
    id: 'x',
    label: 'X',
    color: '#0F1419',
    capabilities: ['text', 'image', 'video', 'schedule'],
    requirements: [
      'An X developer account with a paid tier that permits write access.',
      'OAuth 2.0 app with tweet.write and users.read scopes.',
    ],
    limitations: [
      'Free tier is read-mostly; posting requires a paid plan.',
      'Post analytics are not available on lower tiers, so metrics may be unavailable.',
    ],
    maxTextLength: 280,
    recommendedHashtags: [1, 2],
    docsUrl: 'https://developer.x.com/en/docs/x-api',
  },
};

export function platformLabel(platform: Platform): string {
  return PLATFORM_META[platform].label;
}

export function supports(platform: Platform, capability: PlatformCapability): boolean {
  return PLATFORM_META[platform].capabilities.includes(capability);
}

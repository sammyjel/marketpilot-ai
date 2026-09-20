import { env } from '@/lib/env';
import { PLATFORMS, PLATFORM_META, type Platform } from '@/lib/platforms';
import { FacebookPublisher } from './facebook';
import { InstagramPublisher } from './instagram';
import { LinkedInPublisher } from './linkedin';
import { MockSocialPublisher } from './mock';
import { PinterestPublisher } from './pinterest';
import { TikTokPublisher } from './tiktok';
import { XPublisher } from './x';
import { YouTubePublisher } from './youtube';
import type { SocialPublisher } from './types';

export type * from './types';

const REAL: Record<Platform, () => SocialPublisher> = {
  facebook: () => new FacebookPublisher(),
  instagram: () => new InstagramPublisher(),
  tiktok: () => new TikTokPublisher(),
  youtube: () => new YouTubePublisher(),
  linkedin: () => new LinkedInPublisher(),
  pinterest: () => new PinterestPublisher(),
  x: () => new XPublisher(),
};

const cache = new Map<Platform, SocialPublisher>();

/**
 * Resolves the adapter for a platform.
 *
 * `MOCK_EXTERNAL_SERVICES=true` returns the development stand-in for every
 * platform, so no request ever leaves the machine while mock mode is on.
 */
export function socialPublisher(platform: Platform): SocialPublisher {
  const cached = cache.get(platform);
  if (cached) return cached;

  const publisher = env().MOCK_EXTERNAL_SERVICES ? new MockSocialPublisher(platform) : REAL[platform]();
  cache.set(platform, publisher);
  return publisher;
}

export function isMockSocial(): boolean {
  return env().MOCK_EXTERNAL_SERVICES;
}

/** Test seam. */
export function setSocialPublisher(platform: Platform, publisher: SocialPublisher | undefined): void {
  if (publisher) cache.set(platform, publisher);
  else cache.delete(platform);
}

export type PlatformAvailability = {
  platform: Platform;
  label: string;
  configured: boolean;
  isMock: boolean;
  requirements: string[];
  limitations: string[];
  docsUrl: string;
};

/**
 * What the UI shows on the Social Accounts screen: which platforms this
 * installation can actually connect, and what each one requires.
 */
export function platformAvailability(): PlatformAvailability[] {
  const mock = isMockSocial();

  return PLATFORMS.map((platform) => {
    const meta = PLATFORM_META[platform];
    return {
      platform,
      label: meta.label,
      configured: mock || REAL[platform]().isConfigured(),
      isMock: mock,
      requirements: meta.requirements,
      limitations: meta.limitations,
      docsUrl: meta.docsUrl,
    };
  });
}

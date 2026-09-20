import { createHash, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { PLATFORM_META, supports, type Platform } from '@/lib/platforms';
import type {
  AccountCredentials,
  ConnectedAccount,
  OAuthStartResult,
  PostAnalytics,
  PostStatus,
  PublishRequest,
  PublishResult,
  SocialPublisher,
} from './types';

/**
 * Development stand-in for a real platform.
 *
 * It deliberately mirrors the real adapters' content rules rather than always
 * succeeding:
 *   - Video-only platforms still refuse image-only content.
 *   - Pinterest still refuses a pin with no image.
 *   - X still refuses posts over 280 characters.
 *
 * That way the manual-publish fallback and the error paths get exercised in
 * development instead of only being discovered in production. Constraints that
 * only exist because a real platform's servers are involved — Instagram
 * fetching media from a public URL, for instance — are not simulated; those are
 * surfaced up front in the platform requirements shown on the connect screen.
 *
 * Mock connections are clearly marked in the UI and cannot be confused with a
 * real one: `isMock` is stored on the account record.
 */
export class MockSocialPublisher implements SocialPublisher {
  constructor(readonly platform: Platform) {}

  isConfigured(): boolean {
    return true;
  }

  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    // Sends the browser straight back to our own callback, so the whole OAuth
    // round-trip is exercised without leaving the machine.
    const url = new URL(redirectUri);
    url.searchParams.set('code', `mock_${randomBytes(8).toString('hex')}`);
    url.searchParams.set('state', state);
    return { url: url.toString(), state, codeVerifier: 'mock-verifier' };
  }

  async completeConnect(): Promise<ConnectedAccount[]> {
    const meta = PLATFORM_META[this.platform];
    const suffix = randomBytes(3).toString('hex');

    return [
      {
        externalId: `mock-${this.platform}-${suffix}`,
        displayName: `${meta.label} demo account`,
        username: `demo_${this.platform}`,
        avatarUrl: null,
        accountType: 'mock',
        accessToken: `mock-token-${suffix}`,
        refreshToken: `mock-refresh-${suffix}`,
        expiresAt: new Date(Date.now() + 60 * 86_400_000),
        scopes: ['mock'],
        metadata: { isMock: true, boardId: 'mock-board' },
      },
    ];
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials | null> {
    return { ...credentials, expiresAt: new Date(Date.now() + 60 * 86_400_000) };
  }

  async validateConnection(): Promise<{ valid: boolean; reason?: string }> {
    return { valid: true };
  }

  async disconnect(): Promise<void> {
    // Nothing to revoke.
  }

  async publish(_credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const hasImage = request.media.some((item) => item.kind === 'image');
    const hasVideo = request.media.some((item) => item.kind === 'video');

    // The same capability gates the real adapters enforce.
    if (!supports(this.platform, 'text') && !supports(this.platform, 'image') && !hasVideo) {
      return {
        status: 'manual_required',
        reason: `${PLATFORM_META[this.platform].label} only accepts video. Generate a video for this campaign first.`,
      };
    }
    if (this.platform === 'pinterest' && !hasImage) {
      return { status: 'manual_required', reason: 'Pinterest pins require an image.' };
    }
    if (this.platform === 'x') {
      const text = String(request.fields['post'] ?? '');
      if (text.length > 280) {
        return { status: 'manual_required', reason: `This post is ${text.length} characters and X allows 280.` };
      }
    }

    // Deterministic id derived from the idempotency key: publishing the same
    // post twice produces the same id, exactly as a real duplicate guard would.
    const id = createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 16);

    if (hasVideo) {
      return { status: 'processing', externalPostId: `mock_${id}` };
    }

    return {
      status: 'published',
      externalPostId: `mock_${id}`,
      permalink: `${env().APP_URL}/mock-post/${this.platform}/${id}`,
    };
  }

  async getPostStatus(_credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    return {
      state: 'published',
      externalPostId,
      permalink: `${env().APP_URL}/mock-post/${this.platform}/${externalPostId}`,
    };
  }

  async getAnalytics(): Promise<PostAnalytics> {
    // Returning invented engagement numbers here would make the analytics
    // dashboard lie, so mock mode reports no metrics at all.
    return {
      raw: { note: 'Mock connections produce no metrics.' },
      unavailable: ['impressions', 'reach', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks'],
    };
  }
}

import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import type { Platform } from '@/lib/platforms';
import { BaseSocialPublisher } from './base';
import type {
  AccountCredentials,
  ConnectedAccount,
  OAuthStartResult,
  PostAnalytics,
  PostStatus,
  PublishRequest,
  PublishResult,
} from './types';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_VERSION = '202411';

export class LinkedInPublisher extends BaseSocialPublisher {
  readonly platform: Platform = 'linkedin';
  private readonly scopes = ['openid', 'profile', 'w_member_social'];

  constructor() {
    const config = env();
    super(config.LINKEDIN_CLIENT_ID, config.LINKEDIN_CLIENT_SECRET);
  }

  private headers(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      'linkedin-version': LINKEDIN_VERSION,
      'x-restli-protocol-version': '2.0.0',
    };
  }

  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    const { clientId } = this.assertConfigured();
    const url = new URL(AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', this.scopes.join(' '));
    return { url: url.toString(), state };
  }

  async completeConnect({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const { clientId, clientSecret } = this.assertConfigured();

    const token = await this.request<{ access_token: string; expires_in: number; refresh_token?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    // OpenID userinfo gives the member URN needed as the post author.
    const profile = await this.request<{ sub: string; name?: string; picture?: string }>(
      'https://api.linkedin.com/v2/userinfo',
      { method: 'GET', headers: { authorization: `Bearer ${token.access_token}` } },
    );

    return [
      {
        externalId: profile.sub,
        displayName: profile.name ?? 'LinkedIn member',
        username: null,
        avatarUrl: profile.picture ?? null,
        accountType: 'member',
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: this.scopes,
        metadata: { authorUrn: `urn:li:person:${profile.sub}` },
      },
    ];
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials | null> {
    if (!credentials.refreshToken) return null;
    const { clientId, clientSecret } = this.assertConfigured();

    const token = await this.request<{ access_token: string; expires_in: number; refresh_token?: string }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    return {
      ...credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? credentials.refreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  }

  async validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }> {
    try {
      await this.request('https://api.linkedin.com/v2/userinfo', {
        method: 'GET',
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof AppError ? error.message : 'Connection check failed.' };
    }
  }

  async disconnect(): Promise<void> {
    // LinkedIn has no token revocation endpoint for this grant; removing the
    // stored credential is all we can do.
  }

  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const author = String(credentials.metadata['authorUrn'] ?? `urn:li:person:${credentials.externalId}`);
    const commentary = this.composeText(request.fields, request.hashtags, ['post', 'primaryText', 'caption']);
    const image = request.media.find((item) => item.kind === 'image' && item.buffer);

    let contentBlock: Record<string, unknown> | undefined;

    if (image?.buffer) {
      const registered = await this.request<{ value: { uploadUrl: string; image: string } }>(
        `${API_BASE}/images?action=initializeUpload`,
        {
          method: 'POST',
          headers: { ...this.headers(credentials.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        },
      );

      const upload = await fetch(registered.value.uploadUrl, {
        method: 'PUT',
        headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': image.mimeType },
        body: new Uint8Array(image.buffer),
      });
      if (!upload.ok) throw this.mapError(upload.status, await upload.text());

      contentBlock = { media: { id: registered.value.image } };
    }

    const response = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: { ...this.headers(credentials.accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        author,
        commentary,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(contentBlock ? { content: contentBlock } : {}),
      }),
    });

    if (!response.ok) throw this.mapError(response.status, await response.text());

    // The post URN comes back in a header rather than the body.
    const postId = response.headers.get('x-restli-id') ?? '';
    return {
      status: 'published',
      externalPostId: postId,
      permalink: postId ? `https://www.linkedin.com/feed/update/${postId}/` : null,
    };
  }

  async getPostStatus(_credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    // LinkedIn posts are synchronous: a successful create is a live post.
    return {
      state: 'published',
      externalPostId,
      permalink: `https://www.linkedin.com/feed/update/${externalPostId}/`,
    };
  }

  async getAnalytics(): Promise<PostAnalytics> {
    // Per-post analytics need the Community Management API, which LinkedIn
    // grants case by case. Reporting zeroes here would be a fabrication.
    return {
      raw: {},
      unavailable: ['impressions', 'reach', 'likes', 'comments', 'shares', 'clicks'],
    };
  }
}

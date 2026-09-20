import { createHash, randomBytes } from 'node:crypto';
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

const AUTH_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const API_BASE = 'https://api.x.com/2';
const UPLOAD_URL = 'https://upload.x.com/1.1/media/upload.json';

export class XPublisher extends BaseSocialPublisher {
  readonly platform: Platform = 'x';
  private readonly scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

  constructor() {
    const config = env();
    super(config.X_CLIENT_ID, config.X_CLIENT_SECRET);
  }

  private basicAuth(): string {
    const { clientId, clientSecret } = this.assertConfigured();
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }

  /** X requires PKCE on the OAuth 2.0 authorization code flow. */
  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    const { clientId } = this.assertConfigured();
    const codeVerifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');

    const url = new URL(AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return { url: url.toString(), state, codeVerifier };
  }

  async completeConnect({
    code,
    redirectUri,
    codeVerifier,
  }: {
    code: string;
    redirectUri: string;
    codeVerifier?: string | undefined;
  }): Promise<ConnectedAccount[]> {
    const { clientId } = this.assertConfigured();
    if (!codeVerifier) {
      throw new AppError('validation_failed', 'That connection attempt expired. Start the connection again.');
    }

    const token = await this.request<{ access_token: string; refresh_token?: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${this.basicAuth()}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: clientId,
      }),
    });

    const me = await this.request<{ data: { id: string; name: string; username: string; profile_image_url?: string } }>(
      `${API_BASE}/users/me?user.fields=profile_image_url`,
      { method: 'GET', headers: { authorization: `Bearer ${token.access_token}` } },
    );

    return [
      {
        externalId: me.data.id,
        displayName: me.data.name,
        username: me.data.username,
        avatarUrl: me.data.profile_image_url ?? null,
        accountType: 'user',
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: this.scopes,
        metadata: {},
      },
    ];
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials | null> {
    if (!credentials.refreshToken) return null;

    const token = await this.request<{ access_token: string; refresh_token?: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${this.basicAuth()}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }),
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
      await this.request(`${API_BASE}/users/me`, {
        method: 'GET',
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof AppError ? error.message : 'Connection check failed.' };
    }
  }

  async disconnect(credentials: AccountCredentials): Promise<void> {
    await this.request('https://api.x.com/2/oauth2/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${this.basicAuth()}`,
      },
      body: new URLSearchParams({ token: credentials.accessToken, token_type_hint: 'access_token' }),
    }).catch(() => undefined);
  }

  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const text = this.composeText(request.fields, request.hashtags, ['post', 'primaryText', 'caption']);

    if (text.length > 280) {
      return {
        status: 'manual_required',
        reason: `This post is ${text.length} characters and X allows 280. Shorten it and try again.`,
      };
    }

    const mediaIds: string[] = [];
    const image = request.media.find((item) => item.kind === 'image' && item.buffer);

    if (image?.buffer) {
      const form = new FormData();
      form.set('media', new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }), image.filename ?? 'image.jpg');

      const uploaded = await this.request<{ media_id_string: string }>(UPLOAD_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${credentials.accessToken}` },
        body: form,
      });
      mediaIds.push(uploaded.media_id_string);
    }

    const created = await this.request<{ data: { id: string } }>(`${API_BASE}/tweets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text, ...(mediaIds.length > 0 ? { media: { media_ids: mediaIds } } : {}) }),
    });

    // A thread is posted as replies chained to the first post.
    const thread = Array.isArray(request.fields['thread']) ? (request.fields['thread'] as string[]) : [];
    let replyTo = created.data.id;

    for (const post of thread.slice(0, 8)) {
      if (post.length > 280) break;
      const reply = await this.request<{ data: { id: string } }>(`${API_BASE}/tweets`, {
        method: 'POST',
        headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: post, reply: { in_reply_to_tweet_id: replyTo } }),
      });
      replyTo = reply.data.id;
    }

    return {
      status: 'published',
      externalPostId: created.data.id,
      permalink: `https://x.com/i/status/${created.data.id}`,
    };
  }

  async getPostStatus(_credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    return { state: 'published', externalPostId, permalink: `https://x.com/i/status/${externalPostId}` };
  }

  async getAnalytics(): Promise<PostAnalytics> {
    // Post metrics require an elevated (paid) API tier. Without it we report
    // nothing rather than guessing.
    return {
      raw: {},
      unavailable: ['impressions', 'likes', 'comments', 'shares', 'clicks'],
    };
  }
}

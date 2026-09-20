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

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

export class YouTubePublisher extends BaseSocialPublisher {
  readonly platform: Platform = 'youtube';
  private readonly scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  constructor() {
    const config = env();
    super(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  }

  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    const { clientId } = this.assertConfigured();
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', state);
    // Needed to receive a refresh token on the first consent.
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return { url: url.toString(), state };
  }

  async completeConnect({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const { clientId, clientSecret } = this.assertConfigured();

    const token = await this.request<{ access_token: string; refresh_token?: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const channels = await this.request<{
      items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[];
    }>(`${API_BASE}/channels?part=snippet&mine=true`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token.access_token}` },
    });

    if (!channels.items || channels.items.length === 0) {
      throw new AppError(
        'forbidden',
        'That Google account has no YouTube channel. Create a channel first, then connect again.',
      );
    }

    return channels.items.map((channel) => ({
      externalId: channel.id,
      displayName: channel.snippet.title,
      username: channel.snippet.customUrl ?? null,
      avatarUrl: channel.snippet.thumbnails?.default?.url ?? null,
      accountType: 'channel',
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: this.scopes,
      metadata: { channelId: channel.id },
    }));
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials | null> {
    if (!credentials.refreshToken) return null;
    const { clientId, clientSecret } = this.assertConfigured();

    const token = await this.request<{ access_token: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: credentials.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    return {
      ...credentials,
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  }

  async validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }> {
    try {
      await this.request(`${API_BASE}/channels?part=id&mine=true`, {
        method: 'GET',
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof AppError ? error.message : 'Connection check failed.' };
    }
  }

  async disconnect(credentials: AccountCredentials): Promise<void> {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(credentials.accessToken)}`, {
      method: 'POST',
    }).catch(() => undefined);
  }

  /** Resumable upload: create the session, then send the bytes. */
  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const video = request.media.find((item) => item.kind === 'video' && item.buffer);

    if (!video?.buffer) {
      return {
        status: 'manual_required',
        reason:
          'YouTube only accepts video uploads through its API. Generate or attach a video for this campaign, or upload it yourself using the generated title and description.',
      };
    }

    const title = String(request.fields['title'] ?? 'Untitled').slice(0, 100);
    const description = this.composeText(request.fields, request.hashtags, ['description']).slice(0, 5000);
    const tags = Array.isArray(request.fields['tags']) ? (request.fields['tags'] as string[]).slice(0, 20) : [];

    const initUrl = new URL(`${UPLOAD_BASE}/videos`);
    initUrl.searchParams.set('uploadType', 'resumable');
    initUrl.searchParams.set('part', 'snippet,status');

    const init = await fetch(initUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.accessToken}`,
        'content-type': 'application/json',
        'x-upload-content-type': video.mimeType,
        'x-upload-content-length': String(video.buffer.byteLength),
      },
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId: '22' },
        // Unverified apps can only publish privately; the user is told this in
        // the connection screen.
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      }),
    });

    if (!init.ok) throw this.mapError(init.status, await init.text());

    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) {
      throw new AppError('provider_unavailable', 'YouTube did not return an upload location. Try again.', {
        retryable: true,
      });
    }

    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': video.mimeType, 'content-length': String(video.buffer.byteLength) },
      body: new Uint8Array(video.buffer),
    });

    if (!upload.ok) throw this.mapError(upload.status, await upload.text());

    const result = (await upload.json()) as { id: string; status?: { uploadStatus?: string } };
    const processing = result.status?.uploadStatus === 'uploaded';

    return {
      status: processing ? 'processing' : 'published',
      externalPostId: result.id,
      permalink: `https://www.youtube.com/watch?v=${result.id}`,
    };
  }

  async getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    const result = await this.request<{
      items?: { id: string; status: { uploadStatus: string; failureReason?: string } }[];
    }>(`${API_BASE}/videos?part=status&id=${encodeURIComponent(externalPostId)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });

    const item = result.items?.[0];
    if (!item) return { state: 'failed', error: 'YouTube no longer has that video.' };

    const uploadStatus = item.status.uploadStatus;
    return {
      state: uploadStatus === 'processed' ? 'published' : uploadStatus === 'failed' ? 'failed' : 'processing',
      externalPostId: item.id,
      permalink: `https://www.youtube.com/watch?v=${item.id}`,
      ...(item.status.failureReason ? { error: item.status.failureReason } : {}),
    };
  }

  async getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics> {
    const result = await this.request<{ items?: { statistics?: Record<string, string> }[] }>(
      `${API_BASE}/videos?part=statistics&id=${encodeURIComponent(externalPostId)}`,
      { method: 'GET', headers: { authorization: `Bearer ${credentials.accessToken}` } },
    );

    const stats = result.items?.[0]?.statistics ?? {};
    const toNumber = (value: string | undefined) => (value === undefined ? undefined : Number(value));

    const views = toNumber(stats['viewCount']);
    const likes = toNumber(stats['likeCount']);
    const comments = toNumber(stats['commentCount']);

    return {
      ...(views !== undefined ? { views } : {}),
      ...(likes !== undefined ? { likes } : {}),
      ...(comments !== undefined ? { comments } : {}),
      raw: stats,
      // Retention needs the YouTube Analytics API with a reporting query.
      unavailable: ['impressions', 'reach', 'shares', 'saves', 'clicks', 'videoCompletionRate'],
    };
  }
}

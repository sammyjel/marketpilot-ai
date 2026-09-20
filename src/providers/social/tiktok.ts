import { randomBytes } from 'node:crypto';
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

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokPublisher extends BaseSocialPublisher {
  readonly platform: Platform = 'tiktok';
  private readonly scopes = ['user.info.basic', 'video.publish', 'video.upload'];

  constructor() {
    const config = env();
    super(config.TIKTOK_CLIENT_ID, config.TIKTOK_CLIENT_SECRET);
  }

  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    const { clientId } = this.assertConfigured();
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_key', clientId);
    url.searchParams.set('scope', this.scopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return { url: url.toString(), state, codeVerifier: randomBytes(16).toString('hex') };
  }

  async completeConnect({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const { clientId, clientSecret } = this.assertConfigured();

    const token = await this.request<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      open_id: string;
      scope: string;
    }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const profile = await this.request<{
      data?: { user?: { display_name?: string; avatar_url?: string; username?: string } };
    }>(`${API_BASE}/user/info/?fields=open_id,display_name,avatar_url,username`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token.access_token}` },
    });

    const user = profile.data?.user;
    return [
      {
        externalId: token.open_id,
        displayName: user?.display_name ?? 'TikTok account',
        username: user?.username ?? null,
        avatarUrl: user?.avatar_url ?? null,
        accountType: 'creator',
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: token.scope.split(','),
        metadata: { openId: token.open_id },
      },
    ];
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials | null> {
    if (!credentials.refreshToken) return null;
    const { clientId, clientSecret } = this.assertConfigured();

    const token = await this.request<{ access_token: string; refresh_token: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
      }),
    });

    return {
      ...credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    };
  }

  async validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }> {
    try {
      await this.request(`${API_BASE}/user/info/?fields=open_id`, {
        method: 'GET',
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof AppError ? error.message : 'Connection check failed.' };
    }
  }

  async disconnect(credentials: AccountCredentials): Promise<void> {
    const { clientId, clientSecret } = this.assertConfigured();
    await this.request(`${API_BASE}/oauth/revoke/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: clientId, client_secret: clientSecret, token: credentials.accessToken }),
    }).catch(() => undefined);
  }

  /**
   * Content Posting API.
   *
   * Direct Post requires TikTok audit approval. Without it the app can only
   * send a video to the creator's inbox as a draft they must finish by hand —
   * which is not publishing, and is reported as such.
   */
  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const video = request.media.find((item) => item.kind === 'video' && item.buffer);

    if (!video?.buffer) {
      return {
        status: 'manual_required',
        reason:
          'TikTok only accepts video. Generate a video for this campaign, or download the script and record it yourself.',
      };
    }

    const caption = this.composeText(request.fields, request.hashtags, ['caption']).slice(0, 2200);

    // Ask the API what this app is allowed to do before attempting a post.
    const creator = await this.request<{
      data?: { privacy_level_options?: string[]; max_video_post_duration_sec?: number };
      error?: { code?: string };
    }>(`${API_BASE}/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
      body: '{}',
    });

    const privacyOptions = creator.data?.privacy_level_options ?? [];
    if (privacyOptions.length === 0) {
      return {
        status: 'manual_required',
        reason:
          'This TikTok app has not completed TikTok’s audit for direct posting yet, so it cannot publish on your behalf. Download the video and post it from the TikTok app.',
      };
    }

    const init = await this.request<{ data?: { publish_id?: string; upload_url?: string } }>(
      `${API_BASE}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          post_info: {
            title: caption,
            privacy_level: privacyOptions.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : privacyOptions[0],
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: video.buffer.byteLength,
            chunk_size: video.buffer.byteLength,
            total_chunk_count: 1,
          },
        }),
      },
    );

    const uploadUrl = init.data?.upload_url;
    const publishId = init.data?.publish_id;

    if (!uploadUrl || !publishId) {
      throw new AppError('provider_unavailable', 'TikTok did not accept the upload request. Try again shortly.', {
        retryable: true,
      });
    }

    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': video.mimeType,
        'content-length': String(video.buffer.byteLength),
        'content-range': `bytes 0-${video.buffer.byteLength - 1}/${video.buffer.byteLength}`,
      },
      body: new Uint8Array(video.buffer),
    });

    if (!upload.ok) throw this.mapError(upload.status, await upload.text());

    // TikTok processes asynchronously; the post is not live yet.
    return { status: 'processing', externalPostId: publishId };
  }

  async getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    const result = await this.request<{
      data?: { status?: string; publicaly_available_post_id?: string[]; fail_reason?: string };
    }>(`${API_BASE}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ publish_id: externalPostId }),
    });

    const status = result.data?.status;
    const liveId = result.data?.publicaly_available_post_id?.[0];

    if (status === 'PUBLISH_COMPLETE') {
      return {
        state: 'published',
        externalPostId: liveId ?? externalPostId,
        permalink: liveId ? `https://www.tiktok.com/video/${liveId}` : null,
      };
    }
    if (status === 'FAILED') {
      return { state: 'failed', error: result.data?.fail_reason ?? 'TikTok rejected the video.' };
    }
    return { state: 'processing', externalPostId };
  }

  async getAnalytics(): Promise<PostAnalytics> {
    // Video metrics need the Display API with additional approved scopes.
    return {
      raw: {},
      unavailable: ['impressions', 'views', 'likes', 'comments', 'shares', 'videoCompletionRate'],
    };
  }
}

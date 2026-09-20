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

const AUTH_URL = 'https://www.pinterest.com/oauth/';
const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';
const API_BASE = 'https://api.pinterest.com/v5';

export class PinterestPublisher extends BaseSocialPublisher {
  readonly platform: Platform = 'pinterest';
  private readonly scopes = ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'];

  constructor() {
    const config = env();
    super(config.PINTEREST_CLIENT_ID, config.PINTEREST_CLIENT_SECRET);
  }

  private basicAuth(): string {
    const { clientId, clientSecret } = this.assertConfigured();
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }

  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    const { clientId } = this.assertConfigured();
    const url = new URL(AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes.join(','));
    url.searchParams.set('state', state);
    return { url: url.toString(), state };
  }

  async completeConnect({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const token = await this.request<{ access_token: string; refresh_token?: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${this.basicAuth()}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });

    const account = await this.request<{ username: string; profile_image?: string; account_type?: string }>(
      `${API_BASE}/user_account`,
      { method: 'GET', headers: { authorization: `Bearer ${token.access_token}` } },
    );

    // A pin must target a board, so the default board is resolved now rather
    // than failing at publish time.
    const boards = await this.request<{ items?: { id: string; name: string }[] }>(`${API_BASE}/boards?page_size=25`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token.access_token}` },
    });

    const board = boards.items?.[0];
    if (!board) {
      throw new AppError(
        'forbidden',
        'That Pinterest account has no boards. Create at least one board, then connect again — every pin has to go to a board.',
      );
    }

    return [
      {
        externalId: account.username,
        displayName: account.username,
        username: account.username,
        avatarUrl: account.profile_image ?? null,
        accountType: account.account_type ?? 'business',
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: this.scopes,
        metadata: { boardId: board.id, boardName: board.name, boards: boards.items ?? [] },
      },
    ];
  }

  async refresh(credentials: AccountCredentials): Promise<AccountCredentials | null> {
    if (!credentials.refreshToken) return null;

    const token = await this.request<{ access_token: string; expires_in: number }>(TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${this.basicAuth()}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }),
    });

    return { ...credentials, accessToken: token.access_token, expiresAt: new Date(Date.now() + token.expires_in * 1000) };
  }

  async validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }> {
    try {
      await this.request(`${API_BASE}/user_account`, {
        method: 'GET',
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof AppError ? error.message : 'Connection check failed.' };
    }
  }

  async disconnect(): Promise<void> {
    // Pinterest offers no revocation endpoint for this grant type.
  }

  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const boardId = String(credentials.metadata['boardId'] ?? '');
    if (!boardId) {
      return { status: 'manual_required', reason: 'No Pinterest board is selected for this account. Reconnect it to choose one.' };
    }

    const image = request.media.find((item) => item.kind === 'image');
    if (!image) {
      return { status: 'manual_required', reason: 'Pinterest pins require an image. Add one to this campaign.' };
    }

    const mediaSource = image.publicUrl
      ? { source_type: 'image_url', url: image.publicUrl }
      : image.buffer
        ? {
            source_type: 'image_base64',
            content_type: image.mimeType,
            data: image.buffer.toString('base64'),
          }
        : null;

    if (!mediaSource) {
      return { status: 'manual_required', reason: 'The pin image could not be read. Try re-uploading it.' };
    }

    const result = await this.request<{ id: string }>(`${API_BASE}/pins`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        title: String(request.fields['pinTitle'] ?? '').slice(0, 100),
        description: this.composeText(request.fields, request.hashtags, ['description']).slice(0, 800),
        media_source: mediaSource,
        ...(typeof request.fields['link'] === 'string' ? { link: request.fields['link'] } : {}),
      }),
    });

    return { status: 'published', externalPostId: result.id, permalink: `https://www.pinterest.com/pin/${result.id}/` };
  }

  async getPostStatus(_credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    return { state: 'published', externalPostId, permalink: `https://www.pinterest.com/pin/${externalPostId}/` };
  }

  async getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics> {
    const url = new URL(`${API_BASE}/pins/${externalPostId}/analytics`);
    url.searchParams.set('metric_types', 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK');
    url.searchParams.set('start_date', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
    url.searchParams.set('end_date', new Date().toISOString().slice(0, 10));

    const result = await this.request<Record<string, { summary_metrics?: Record<string, number> }>>(url.toString(), {
      method: 'GET',
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });

    const summary = Object.values(result)[0]?.summary_metrics ?? {};
    return {
      ...(summary['IMPRESSION'] !== undefined ? { impressions: summary['IMPRESSION'] } : {}),
      ...(summary['SAVE'] !== undefined ? { saves: summary['SAVE'] } : {}),
      ...(summary['PIN_CLICK'] !== undefined ? { clicks: summary['PIN_CLICK'] } : {}),
      raw: summary,
      unavailable: ['reach', 'likes', 'comments', 'shares'],
    };
  }
}

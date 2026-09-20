import { env } from '@/lib/env';
import type { Platform } from '@/lib/platforms';
import { GRAPH_BASE, MetaPublisher } from './meta';
import type {
  AccountCredentials,
  ConnectedAccount,
  PostAnalytics,
  PostStatus,
  PublishRequest,
  PublishResult,
} from './types';

export class FacebookPublisher extends MetaPublisher {
  readonly platform: Platform = 'facebook';
  protected readonly scopes = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'business_management'];

  constructor() {
    const config = env();
    super(config.FACEBOOK_CLIENT_ID, config.FACEBOOK_CLIENT_SECRET);
  }

  async completeConnect({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const pages = await this.exchangeForPages(code, redirectUri);

    return pages.map((page) => ({
      externalId: page.id,
      displayName: page.name,
      username: page.username ?? null,
      avatarUrl: page.picture?.data?.url ?? null,
      accountType: 'page',
      accessToken: page.access_token,
      refreshToken: null,
      expiresAt: null,
      scopes: this.scopes,
      metadata: { pageId: page.id },
    }));
  }

  /**
   * Publishes to a Page feed.
   *
   * Photos go to /photos with the caption attached; text-only posts go to
   * /feed. Video is uploaded to /videos. The Page access token is what
   * authorises the post.
   */
  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const message = this.composeText(request.fields, request.hashtags, ['primaryText', 'post', 'caption']);
    const image = request.media.find((item) => item.kind === 'image');
    const video = request.media.find((item) => item.kind === 'video');

    if (video) {
      if (!video.buffer) {
        return {
          status: 'manual_required',
          reason: 'The video is not available for upload. Download it and post it to your Page directly.',
        };
      }
      const form = new FormData();
      form.set('access_token', credentials.accessToken);
      form.set('description', message);
      form.set('source', new Blob([new Uint8Array(video.buffer)], { type: video.mimeType }), video.filename ?? 'video.mp4');

      const result = await this.request<{ id: string }>(`${GRAPH_BASE}/${credentials.externalId}/videos`, {
        method: 'POST',
        body: form,
      });
      // Facebook transcodes asynchronously, so this is not published yet.
      return { status: 'processing', externalPostId: result.id };
    }

    if (image) {
      const form = new FormData();
      form.set('access_token', credentials.accessToken);
      form.set('caption', message);
      form.set('published', 'true');

      if (image.buffer) {
        form.set('source', new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }), image.filename ?? 'image.jpg');
      } else if (image.publicUrl) {
        form.set('url', image.publicUrl);
      }

      const result = await this.request<{ id: string; post_id?: string }>(
        `${GRAPH_BASE}/${credentials.externalId}/photos`,
        { method: 'POST', body: form },
      );
      const postId = result.post_id ?? result.id;
      return { status: 'published', externalPostId: postId, permalink: `https://www.facebook.com/${postId}` };
    }

    const body = new URLSearchParams({ access_token: credentials.accessToken, message });
    const result = await this.request<{ id: string }>(`${GRAPH_BASE}/${credentials.externalId}/feed`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    return { status: 'published', externalPostId: result.id, permalink: `https://www.facebook.com/${result.id}` };
  }

  async getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    const url = new URL(`${GRAPH_BASE}/${externalPostId}`);
    url.searchParams.set('fields', 'id,permalink_url,status');
    url.searchParams.set('access_token', credentials.accessToken);

    const result = await this.request<{ id: string; permalink_url?: string; status?: { video_status?: string } }>(
      url.toString(),
      { method: 'GET' },
    );

    const videoStatus = result.status?.video_status;
    return {
      state: videoStatus && videoStatus !== 'ready' ? 'processing' : 'published',
      externalPostId: result.id,
      permalink: result.permalink_url ?? null,
    };
  }

  async getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics> {
    const url = new URL(`${GRAPH_BASE}/${externalPostId}/insights`);
    url.searchParams.set(
      'metric',
      'post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total',
    );
    url.searchParams.set('access_token', credentials.accessToken);

    const result = await this.request<{ data: { name: string; values: { value: unknown }[] }[] }>(url.toString(), {
      method: 'GET',
    });

    const byName = new Map(result.data.map((entry) => [entry.name, entry.values[0]?.value]));
    const reactions = byName.get('post_reactions_by_type_total');
    const likes =
      reactions && typeof reactions === 'object'
        ? Object.values(reactions as Record<string, number>).reduce((sum, value) => sum + Number(value || 0), 0)
        : undefined;

    return {
      ...(typeof byName.get('post_impressions') === 'number' ? { impressions: byName.get('post_impressions') as number } : {}),
      ...(typeof byName.get('post_impressions_unique') === 'number'
        ? { reach: byName.get('post_impressions_unique') as number }
        : {}),
      ...(typeof byName.get('post_clicks') === 'number' ? { clicks: byName.get('post_clicks') as number } : {}),
      ...(likes !== undefined ? { likes } : {}),
      raw: Object.fromEntries(byName),
      // Comment and share counts require a separate edge and permission set.
      unavailable: ['comments', 'shares', 'saves'],
    };
  }
}

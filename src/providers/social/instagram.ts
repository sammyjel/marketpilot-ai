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

export class InstagramPublisher extends MetaPublisher {
  readonly platform: Platform = 'instagram';
  protected readonly scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
  ];

  constructor() {
    const config = env();
    super(config.INSTAGRAM_CLIENT_ID, config.INSTAGRAM_CLIENT_SECRET);
  }

  /** Only Pages that have an Instagram Business account linked are usable. */
  async completeConnect({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const pages = await this.exchangeForPages(code, redirectUri);

    return pages
      .filter((page) => page.instagram_business_account?.id)
      .map((page) => {
        const ig = page.instagram_business_account!;
        return {
          externalId: ig.id,
          displayName: ig.name ?? ig.username ?? page.name,
          username: ig.username ?? null,
          avatarUrl: ig.profile_picture_url ?? null,
          accountType: 'business',
          accessToken: page.access_token,
          refreshToken: null,
          expiresAt: null,
          scopes: this.scopes,
          metadata: { pageId: page.id, instagramUserId: ig.id },
        };
      });
  }

  /**
   * Instagram publishing is a two-step flow: create a media container from a
   * publicly reachable URL, then publish the container.
   *
   * The API will not accept raw bytes, so when object storage cannot produce a
   * public URL (the local development driver, for instance) we say so plainly
   * instead of failing at publish time.
   */
  async publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult> {
    const caption = this.composeText(request.fields, request.hashtags, ['caption', 'primaryText', 'post']);
    const media = request.media.find((item) => item.publicUrl) ?? request.media[0];

    if (!media) {
      return {
        status: 'manual_required',
        reason: 'Instagram requires an image or video. Add media to this campaign, or post it manually.',
      };
    }

    if (!media.publicUrl) {
      return {
        status: 'manual_required',
        reason:
          'Instagram fetches media from a public HTTPS address, and this installation stores files privately. Configure S3-compatible storage with a public URL, or download the media and post it yourself.',
      };
    }

    const containerBody = new URLSearchParams({
      access_token: credentials.accessToken,
      caption,
      ...(media.kind === 'video'
        ? { media_type: 'REELS', video_url: media.publicUrl }
        : { image_url: media.publicUrl }),
    });

    const container = await this.request<{ id: string }>(`${GRAPH_BASE}/${credentials.externalId}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: containerBody,
    });

    // Video containers need time to transcode before they can be published.
    if (media.kind === 'video') {
      const ready = await this.waitForContainer(credentials, container.id);
      if (!ready) {
        return { status: 'processing', externalPostId: container.id };
      }
    }

    const publishBody = new URLSearchParams({
      access_token: credentials.accessToken,
      creation_id: container.id,
    });

    const published = await this.request<{ id: string }>(`${GRAPH_BASE}/${credentials.externalId}/media_publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: publishBody,
    });

    return { status: 'published', externalPostId: published.id };
  }

  private async waitForContainer(credentials: AccountCredentials, containerId: string): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const url = new URL(`${GRAPH_BASE}/${containerId}`);
      url.searchParams.set('fields', 'status_code');
      url.searchParams.set('access_token', credentials.accessToken);

      const result = await this.request<{ status_code?: string }>(url.toString(), { method: 'GET' });
      if (result.status_code === 'FINISHED') return true;
      if (result.status_code === 'ERROR') return false;

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return false;
  }

  async getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus> {
    const url = new URL(`${GRAPH_BASE}/${externalPostId}`);
    url.searchParams.set('fields', 'id,permalink');
    url.searchParams.set('access_token', credentials.accessToken);

    const result = await this.request<{ id: string; permalink?: string }>(url.toString(), { method: 'GET' });
    return { state: 'published', externalPostId: result.id, permalink: result.permalink ?? null };
  }

  async getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics> {
    const url = new URL(`${GRAPH_BASE}/${externalPostId}/insights`);
    url.searchParams.set('metric', 'impressions,reach,saved,likes,comments,shares');
    url.searchParams.set('access_token', credentials.accessToken);

    const result = await this.request<{ data: { name: string; values: { value: number }[] }[] }>(url.toString(), {
      method: 'GET',
    });
    const byName = new Map(result.data.map((entry) => [entry.name, entry.values[0]?.value]));

    const pick = (name: string) => (typeof byName.get(name) === 'number' ? (byName.get(name) as number) : undefined);
    const impressions = pick('impressions');
    const reach = pick('reach');
    const likes = pick('likes');
    const comments = pick('comments');
    const shares = pick('shares');
    const saves = pick('saved');

    return {
      ...(impressions !== undefined ? { impressions } : {}),
      ...(reach !== undefined ? { reach } : {}),
      ...(likes !== undefined ? { likes } : {}),
      ...(comments !== undefined ? { comments } : {}),
      ...(shares !== undefined ? { shares } : {}),
      ...(saves !== undefined ? { saves } : {}),
      raw: Object.fromEntries(byName),
      unavailable: ['clicks'],
    };
  }
}

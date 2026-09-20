import { AppError } from '@/lib/errors';
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

export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG_BASE = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

type TokenResponse = { access_token: string; token_type: string; expires_in?: number };

type PageEntry = {
  id: string;
  name: string;
  access_token: string;
  username?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
};

/**
 * Shared Meta OAuth. Facebook Pages and Instagram Business accounts are both
 * reached through the same login and the same Page access tokens, so the flow
 * lives here and each platform adapter picks the destinations it cares about.
 */
export abstract class MetaPublisher extends BaseSocialPublisher {
  protected abstract readonly scopes: string[];

  async startConnect({ redirectUri, state }: { redirectUri: string; state: string }): Promise<OAuthStartResult> {
    const { clientId } = this.assertConfigured();
    const url = new URL(DIALOG_BASE);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.scopes.join(','));
    return { url: url.toString(), state };
  }

  /** Short-lived user token → long-lived user token → per-page tokens. */
  protected async exchangeForPages(code: string, redirectUri: string): Promise<PageEntry[]> {
    const { clientId, clientSecret } = this.assertConfigured();

    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const shortLived = await this.request<TokenResponse>(tokenUrl.toString(), { method: 'GET' });

    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', clientId);
    longUrl.searchParams.set('client_secret', clientSecret);
    longUrl.searchParams.set('fb_exchange_token', shortLived.access_token);

    const longLived = await this.request<TokenResponse>(longUrl.toString(), { method: 'GET' });

    const pagesUrl = new URL(`${GRAPH_BASE}/me/accounts`);
    pagesUrl.searchParams.set('access_token', longLived.access_token);
    pagesUrl.searchParams.set(
      'fields',
      'id,name,username,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
    );

    const pages = await this.request<{ data: PageEntry[] }>(pagesUrl.toString(), { method: 'GET' });

    if (pages.data.length === 0) {
      throw new AppError(
        'forbidden',
        'No Facebook Page was found on that account. The API can only publish to a Page, not to a personal profile — create or select a Page and try again.',
      );
    }

    return pages.data;
  }

  /** Page tokens derived from a long-lived user token do not expire on a fixed schedule. */
  async refresh(): Promise<AccountCredentials | null> {
    return null;
  }

  async validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }> {
    try {
      const url = new URL(`${GRAPH_BASE}/${credentials.externalId}`);
      url.searchParams.set('fields', 'id');
      url.searchParams.set('access_token', credentials.accessToken);
      await this.request(url.toString(), { method: 'GET' });
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof AppError ? error.message : 'Connection check failed.' };
    }
  }

  async disconnect(credentials: AccountCredentials): Promise<void> {
    const url = new URL(`${GRAPH_BASE}/${credentials.externalId}/permissions`);
    url.searchParams.set('access_token', credentials.accessToken);
    // Revocation failures must not block removing the account on our side.
    await this.request(url.toString(), { method: 'DELETE' }).catch(() => undefined);
  }

  abstract override completeConnect(input: { code: string; redirectUri: string }): Promise<ConnectedAccount[]>;
  abstract override publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult>;
  abstract override getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus>;
  abstract override getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics>;
}

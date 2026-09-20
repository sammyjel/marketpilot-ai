import type { Platform } from '@/lib/platforms';

export type OAuthStartResult = {
  url: string;
  state: string;
  /** PKCE verifier, when the platform requires one. Stored server-side only. */
  codeVerifier?: string;
};

export type ConnectedAccount = {
  externalId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  accountType?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string[];
  /** Non-secret provider data needed later (page id, ig user id, ...). */
  metadata: Record<string, unknown>;
};

export type PublishMedia = {
  kind: 'image' | 'video';
  /** Bytes, for platforms that accept a direct upload. */
  buffer?: Buffer;
  mimeType: string;
  /** Public HTTPS URL, for platforms that fetch media themselves. */
  publicUrl?: string | null;
  filename?: string;
};

export type PublishRequest = {
  /** Platform-shaped content fields, already validated for this platform. */
  fields: Record<string, unknown>;
  hashtags: string[];
  media: PublishMedia[];
  /** Repeated calls with the same key must not create a second post. */
  idempotencyKey: string;
};

export type PublishResult =
  | { status: 'published'; externalPostId: string; permalink?: string | null }
  | { status: 'processing'; externalPostId: string; permalink?: string | null }
  /**
   * The platform API genuinely cannot do this for this account. The user is
   * offered the media and copy to post by hand. We never report this as
   * published.
   */
  | { status: 'manual_required'; reason: string };

export type PostStatus = {
  state: 'pending' | 'processing' | 'published' | 'failed';
  externalPostId?: string | null;
  permalink?: string | null;
  error?: string | null;
};

/** Only metrics the platform actually returned. Absent stays undefined. */
export type PostAnalytics = {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  videoCompletionRate?: number;
  raw: Record<string, unknown>;
  /** Metrics this platform does not expose for this account, for honest UI. */
  unavailable: string[];
};

export type AccountCredentials = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  externalId: string;
  metadata: Record<string, unknown>;
};

/**
 * Contract every social platform adapter implements.
 *
 * Two rules govern every implementation:
 *   1. Never report a post as published unless the platform confirmed it.
 *   2. If the API cannot do something, return `manual_required` with a reason
 *      a non-technical user can act on — do not silently succeed.
 */
export interface SocialPublisher {
  readonly platform: Platform;

  /** True when the app has the client credentials this platform needs. */
  isConfigured(): boolean;

  /** Builds the platform's OAuth authorisation URL. */
  startConnect(input: { redirectUri: string; state: string }): Promise<OAuthStartResult>;

  /** Exchanges the callback code for tokens and the destination account. */
  completeConnect(input: {
    code: string;
    redirectUri: string;
    codeVerifier?: string | undefined;
  }): Promise<ConnectedAccount[]>;

  /** Refreshes an expiring token. Returns null when the platform has no refresh flow. */
  refresh(credentials: AccountCredentials): Promise<AccountCredentials | null>;

  /** Confirms the stored token still works. */
  validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }>;

  /** Revokes the token where the platform supports it. */
  disconnect(credentials: AccountCredentials): Promise<void>;

  publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult>;

  getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus>;

  getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics>;
}

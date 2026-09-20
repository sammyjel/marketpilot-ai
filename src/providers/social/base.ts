import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { PLATFORM_META, type Platform } from '@/lib/platforms';
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

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Shared behaviour for real platform adapters: credential checks, HTTP with a
 * timeout, and the mapping from platform error codes to messages a user can
 * act on.
 */
export abstract class BaseSocialPublisher implements SocialPublisher {
  abstract readonly platform: Platform;

  protected constructor(
    protected readonly clientId: string | undefined,
    protected readonly clientSecret: string | undefined,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  protected assertConfigured(): { clientId: string; clientSecret: string } {
    if (!this.clientId || !this.clientSecret) {
      const meta = PLATFORM_META[this.platform];
      throw new AppError(
        'provider_unavailable',
        `${meta.label} is not set up on this installation yet. An administrator needs to add the ${this.platform.toUpperCase()}_CLIENT_ID and ${this.platform.toUpperCase()}_CLIENT_SECRET environment variables.`,
      );
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret };
  }

  protected async request<T>(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('provider_timeout', `${PLATFORM_META[this.platform].label} took too long to respond.`, {
          retryable: true,
        });
      }
      throw new AppError('provider_unavailable', `Could not reach ${PLATFORM_META[this.platform].label}.`, {
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await response.text();
    if (!response.ok) throw this.mapError(response.status, body);

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new AppError('provider_unavailable', `${PLATFORM_META[this.platform].label} returned an unexpected response.`, {
        retryable: true,
      });
    }
  }

  /**
   * Turns a raw platform failure into something a user can act on.
   *
   * This is what stops "OAuthException 190" from ever reaching the interface.
   */
  protected mapError(status: number, body: string): AppError {
    const label = PLATFORM_META[this.platform].label;
    let code = '';
    let message = '';

    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: number | string; message?: string; type?: string; error_subcode?: number };
        message?: string;
        error_description?: string;
      };
      code = String(parsed.error?.code ?? parsed.error?.type ?? '');
      message = parsed.error?.message ?? parsed.message ?? parsed.error_description ?? '';
    } catch {
      message = body.slice(0, 200);
    }

    // Logged in full for operators; never surfaced verbatim to the user.
    logger.warn('social.provider_error', { platform: this.platform, status, code, message: message.slice(0, 300) });

    if (status === 401 || code === '190' || code === '102') {
      return new AppError(
        'connection_expired',
        `Your ${label} connection has expired. Please reconnect your ${label} account.`,
        { details: { platform: this.platform } },
      );
    }
    if (status === 403 || code === '200' || code === '10') {
      return new AppError(
        'forbidden',
        `${label} refused this action. The connected account may be missing a permission this app needs — reconnect it and accept all requested permissions.`,
        { details: { platform: this.platform } },
      );
    }
    if (status === 429 || code === '4' || code === '17' || code === '32') {
      return new AppError('provider_rate_limited', `${label} is rate limiting us. We will retry shortly.`, {
        retryable: true,
      });
    }
    if (status === 413) {
      return new AppError('invalid_media', `${label} rejected the media as too large.`);
    }
    if (status >= 500) {
      return new AppError('provider_unavailable', `${label} is having problems right now. We will retry.`, {
        retryable: true,
      });
    }

    return new AppError('provider_unavailable', `${label} rejected this post${message ? `: ${message}` : '.'}`, {
      details: { platform: this.platform, status },
    });
  }

  /** Composes the body text a platform posts, with hashtags appended. */
  protected composeText(fields: Record<string, unknown>, hashtags: string[], keys: string[]): string {
    const key = keys.find((candidate) => typeof fields[candidate] === 'string' && fields[candidate]);
    const body = key ? String(fields[key]) : '';
    if (hashtags.length === 0) return body;
    return `${body}\n\n${hashtags.join(' ')}`.trim();
  }

  abstract startConnect(input: { redirectUri: string; state: string }): Promise<OAuthStartResult>;
  abstract completeConnect(input: {
    code: string;
    redirectUri: string;
    codeVerifier?: string | undefined;
  }): Promise<ConnectedAccount[]>;
  abstract refresh(credentials: AccountCredentials): Promise<AccountCredentials | null>;
  abstract validateConnection(credentials: AccountCredentials): Promise<{ valid: boolean; reason?: string }>;
  abstract disconnect(credentials: AccountCredentials): Promise<void>;
  abstract publish(credentials: AccountCredentials, request: PublishRequest): Promise<PublishResult>;
  abstract getPostStatus(credentials: AccountCredentials, externalPostId: string): Promise<PostStatus>;
  abstract getAnalytics(credentials: AccountCredentials, externalPostId: string): Promise<PostAnalytics>;
}

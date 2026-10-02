import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import { MockEmailProvider } from './mock';
import { ResendEmailProvider } from './resend';
import type { EmailProvider } from './types';

export type { EmailMessage, EmailProvider } from './types';
export { MockEmailProvider } from './mock';

let cached: EmailProvider | undefined;

/**
 * Resolves the configured transport.
 *
 * `MOCK_EXTERNAL_SERVICES=true` always wins, so a production key on a
 * development machine can never send real mail to a real address.
 */
export function email(): EmailProvider {
  if (cached) return cached;
  const config = env();

  if (config.MOCK_EXTERNAL_SERVICES || config.EMAIL_PROVIDER === 'mock') {
    cached = new MockEmailProvider();
    return cached;
  }

  if (!config.EMAIL_PROVIDER_API_KEY || !config.EMAIL_FROM) {
    throw new AppError(
      'provider_unavailable',
      'No email transport is configured. Set EMAIL_PROVIDER_API_KEY and EMAIL_FROM, or set EMAIL_PROVIDER=mock to log messages instead of sending them.',
    );
  }

  cached = new ResendEmailProvider(config.EMAIL_PROVIDER_API_KEY, config.EMAIL_FROM);
  return cached;
}

/** True when mail actually leaves the building. Used to word UI copy honestly. */
export function emailIsLive(): boolean {
  return email().name !== 'mock';
}

/** Test seam. */
export function setEmailProvider(provider: EmailProvider | undefined): void {
  cached = provider;
}

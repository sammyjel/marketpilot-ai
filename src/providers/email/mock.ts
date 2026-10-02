import { logger } from '@/lib/logger';
import type { EmailMessage, EmailProvider } from './types';

/**
 * Logs instead of sending.
 *
 * The plain-text body is logged in full and on purpose: it carries the
 * verification and reset links, and without a transport configured the log is
 * the only way to complete those flows locally.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  async send(message: EmailMessage): Promise<void> {
    logger.info('email.mock_send', {
      to: message.to,
      subject: message.subject,
      body: message.text,
    });
  }
}

import { AppError } from '@/lib/errors';
import type { EmailMessage, EmailProvider } from './types';

const API_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 15_000;

/**
 * Resend over its HTTP API.
 *
 * Chosen over the Netlify Emails extension because it is host-agnostic: this
 * project has already been part-way migrated to Vercel once, and a transport
 * tied to the host would have to be rebuilt on the next move. It is also one
 * request rather than an extension that deploys its own functions and needs a
 * separate mail provider configured behind it.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      // A timeout or DNS failure is worth retrying; a rejected message is not.
      throw new AppError('provider_unavailable', 'The email provider could not be reached.', {
        retryable: true,
        cause,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new AppError('provider_unavailable', `Resend rejected the message (${response.status}).`, {
        // 429 and 5xx are transient; a 4xx means the message or key is wrong
        // and will fail identically on every retry.
        retryable: response.status === 429 || response.status >= 500,
        details: { status: response.status, body: body.slice(0, 500) },
      });
    }
  }
}

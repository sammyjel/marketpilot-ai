import { NextResponse } from 'next/server';
import { toPublicError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleBillingWebhook } from '@/server/services/billing';

/**
 * Payment processor webhook.
 *
 * No session applies here — the processor is the caller. The raw body is read
 * unparsed because signature verification is computed over the exact bytes, and
 * nothing in the payload is trusted until that signature checks out.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  try {
    await handleBillingWebhook(payload, signature);
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('billing.webhook_failed', { error });
    const publicError = toPublicError(error);
    // A 4xx tells the processor not to retry a payload we will never accept.
    return NextResponse.json({ error: publicError }, { status: publicError.code === 'forbidden' ? 400 : 500 });
  }
}

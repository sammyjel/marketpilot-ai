import { AppError } from '@/lib/errors';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { PlanTier } from '@/lib/plans';

export type CheckoutSession = {
  /** Where to send the browser. Null when the change applied immediately. */
  url: string | null;
  externalId: string | null;
  appliedImmediately: boolean;
};

export type BillingCustomer = {
  externalCustomerId: string;
  externalSubscriptionId: string | null;
  planTier: PlanTier;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export type WebhookResult = {
  handled: boolean;
  organizationId?: string;
  planTier?: PlanTier;
  status?: BillingCustomer['status'];
  currentPeriodEnd?: Date;
};

/**
 * Billing contract. The application never imports a payment SDK directly, so
 * swapping Stripe for another processor is a single adapter.
 */
export interface BillingProvider {
  readonly name: string;
  isConfigured(): boolean;

  createCheckout(input: {
    organizationId: string;
    planTier: PlanTier;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    existingCustomerId?: string | null;
  }): Promise<CheckoutSession>;

  /** Hosted page where a customer manages payment details and cancellation. */
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  cancelSubscription(subscriptionId: string): Promise<void>;

  verifyWebhook(payload: string, signature: string | null): Promise<WebhookResult>;
}

/**
 * Development billing.
 *
 * Plan changes apply immediately and no money moves. It is clearly labelled in
 * the UI so a plan change in development is never mistaken for a real payment.
 */
export class MockBillingProvider implements BillingProvider {
  readonly name = 'mock';

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(input: { organizationId: string; planTier: PlanTier }): Promise<CheckoutSession> {
    logger.info('billing.mock_plan_change', { organizationId: input.organizationId, planTier: input.planTier });
    return { url: null, externalId: `mock_sub_${input.organizationId.slice(0, 8)}`, appliedImmediately: true };
  }

  async createPortalSession(): Promise<{ url: string }> {
    throw new AppError(
      'provider_unavailable',
      'No payment provider is configured, so there is no billing portal. Plan changes apply immediately in this environment.',
    );
  }

  async cancelSubscription(): Promise<void> {
    // Nothing external to cancel.
  }

  async verifyWebhook(): Promise<WebhookResult> {
    return { handled: false };
  }
}

const STRIPE_API = 'https://api.stripe.com/v1';

/**
 * Stripe adapter.
 *
 * Uses the REST API over fetch rather than the SDK, which keeps the serverless
 * bundle small and avoids a hard dependency on one processor's client library.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly name = 'stripe';

  constructor(
    private readonly secretKey: string | undefined,
    private readonly webhookSecret: string | undefined,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  private assertKey(): string {
    if (!this.secretKey) {
      throw new AppError('provider_unavailable', 'Billing is not configured on this installation.');
    }
    return this.secretKey;
  }

  private async call<T>(path: string, body: URLSearchParams): Promise<T> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.assertKey()}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('billing.stripe_error', { path, status: response.status, body: text.slice(0, 300) });
      throw new AppError('provider_unavailable', 'The payment provider rejected that request. Please try again.', {
        retryable: response.status >= 500,
      });
    }

    return (await response.json()) as T;
  }

  async createCheckout(input: {
    organizationId: string;
    planTier: PlanTier;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    existingCustomerId?: string | null;
  }): Promise<CheckoutSession> {
    // Price ids are configured per plan in the processor dashboard and passed
    // through the environment, so plan pricing is not hard-coded here.
    const priceId = process.env[`STRIPE_PRICE_${input.planTier.toUpperCase()}`];
    if (!priceId) {
      throw new AppError(
        'provider_unavailable',
        `No price is configured for the ${input.planTier} plan. Set STRIPE_PRICE_${input.planTier.toUpperCase()}.`,
      );
    }

    const body = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.organizationId,
      'metadata[organizationId]': input.organizationId,
      'metadata[planTier]': input.planTier,
    });

    if (input.existingCustomerId) body.set('customer', input.existingCustomerId);
    else body.set('customer_email', input.customerEmail);

    const session = await this.call<{ id: string; url: string }>('/checkout/sessions', body);
    return { url: session.url, externalId: session.id, appliedImmediately: false };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.call<{ url: string }>(
      '/billing_portal/sessions',
      new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl }),
    );
    return { url: session.url };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.call(`/subscriptions/${subscriptionId}`, new URLSearchParams({ cancel_at_period_end: 'true' }));
  }

  /**
   * Verifies the webhook signature before trusting anything in the payload —
   * without this, anyone could post a fake "subscription upgraded" event.
   */
  async verifyWebhook(payload: string, signature: string | null): Promise<WebhookResult> {
    if (!this.webhookSecret || !signature) {
      throw new AppError('forbidden', 'This webhook could not be verified.');
    }

    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const parts = Object.fromEntries(
      signature.split(',').map((pair) => pair.split('=') as [string, string]),
    ) as { t?: string; v1?: string };

    if (!parts.t || !parts.v1) throw new AppError('forbidden', 'This webhook could not be verified.');

    // Reject replays of an old, validly-signed event.
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(parts.t));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
      throw new AppError('forbidden', 'This webhook has expired.');
    }

    const expected = createHmac('sha256', this.webhookSecret).update(`${parts.t}.${payload}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppError('forbidden', 'This webhook could not be verified.');
    }

    const event = JSON.parse(payload) as {
      type: string;
      data: {
        object: {
          metadata?: Record<string, string>;
          client_reference_id?: string;
          status?: string;
          current_period_end?: number;
        };
      };
    };

    const object = event.data.object;
    const organizationId = object.metadata?.['organizationId'] ?? object.client_reference_id;
    if (!organizationId) return { handled: false };

    const statusMap: Record<string, BillingCustomer['status']> = {
      trialing: 'trialing',
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      incomplete: 'incomplete',
    };

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return {
          handled: true,
          organizationId,
          planTier: (object.metadata?.['planTier'] as PlanTier) ?? 'starter',
          status: statusMap[object.status ?? 'active'] ?? 'active',
          ...(object.current_period_end
            ? { currentPeriodEnd: new Date(object.current_period_end * 1000) }
            : {}),
        };

      case 'customer.subscription.deleted':
        return { handled: true, organizationId, planTier: 'free', status: 'canceled' };

      default:
        return { handled: false };
    }
  }
}

let cached: BillingProvider | undefined;

export function billing(): BillingProvider {
  if (cached) return cached;
  const config = env();

  cached =
    config.MOCK_EXTERNAL_SERVICES || config.BILLING_PROVIDER === 'mock' || !config.BILLING_SECRET
      ? new MockBillingProvider()
      : new StripeBillingProvider(config.BILLING_SECRET, config.BILLING_WEBHOOK_SECRET);

  return cached;
}

export function isMockBilling(): boolean {
  return billing().name === 'mock';
}

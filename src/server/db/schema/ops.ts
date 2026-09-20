import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { jobStatusEnum, planTierEnum, subscriptionStatusEnum, usageMetricEnum } from './enums';
import { organizations, users } from './identity';

/**
 * Generic durable job queue. Rows are claimed with SELECT ... FOR UPDATE SKIP
 * LOCKED so multiple workers never run the same job twice.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatusEnum('status').notNull().default('queued'),
    priority: integer('priority').notNull().default(100),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    /** Optional dedupe key: a second enqueue with the same key is a no-op. */
    dedupeKey: text('dedupe_key'),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jobs_claim_idx').on(t.status, t.runAt, t.priority),
    uniqueIndex('jobs_dedupe_key_unique').on(t.dedupeKey),
    index('jobs_org_idx').on(t.organizationId),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planTier: planTierEnum('plan_tier').notNull().default('free'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    provider: text('provider').notNull().default('mock'),
    externalCustomerId: text('external_customer_id'),
    externalSubscriptionId: text('external_subscription_id'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: integer('cancel_at_period_end').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscriptions_org_unique').on(t.organizationId)],
);

/**
 * Append-only meter. Usage for a period is the SUM over this table, which keeps
 * the audit trail intact even when limits or plans change mid-period.
 */
export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    metric: usageMetricEnum('metric').notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull().default(1),
    /** Provider cost in micro-units of the billing currency, when known. */
    costMicros: bigint('cost_micros', { mode: 'number' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('usage_records_org_metric_period_idx').on(t.organizationId, t.metric, t.periodStart),
    index('usage_records_created_idx').on(t.createdAt),
  ],
);

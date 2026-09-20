import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { jobStatusEnum, publishStatusEnum, socialPlatformEnum } from './enums';
import { brands } from './catalog';
import { campaigns, content } from './campaigns';
import { organizations, users } from './identity';

/**
 * A connected social destination (page, IG business account, channel, ...).
 * Tokens are stored AES-256-GCM encrypted and are never sent to the browser.
 */
export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    platform: socialPlatformEnum('platform').notNull(),
    externalId: text('external_id').notNull(),
    displayName: text('display_name').notNull(),
    username: text('username'),
    avatarUrl: text('avatar_url'),
    accountType: text('account_type'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    /** Extra non-secret provider data (page id, ig business id, ...). */
    providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    needsReconnect: boolean('needs_reconnect').notNull().default(false),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('social_accounts_unique').on(t.brandId, t.platform, t.externalId),
    index('social_accounts_org_idx').on(t.organizationId),
  ],
);

/** Short-lived CSRF state + PKCE verifier for an in-flight OAuth connect. */
export const oauthStates = pgTable(
  'oauth_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    state: text('state').notNull(),
    platform: socialPlatformEnum('platform').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeVerifier: text('code_verifier'),
    redirectPath: text('redirect_path'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('oauth_states_state_unique').on(t.state)],
);

/** A concrete post targeted at one connected account. */
export const socialPosts = pgTable(
  'social_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contentId: uuid('content_id')
      .notNull()
      .references(() => content.id, { onDelete: 'cascade' }),
    socialAccountId: uuid('social_account_id')
      .notNull()
      .references(() => socialAccounts.id, { onDelete: 'cascade' }),
    platform: socialPlatformEnum('platform').notNull(),
    status: publishStatusEnum('status').notNull().default('pending'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    /** IANA zone the user picked; the UTC instant above is authoritative. */
    scheduleTimezone: text('schedule_timezone'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    externalPostId: text('external_post_id'),
    externalPermalink: text('external_permalink'),
    /** Stable key that makes publishing idempotent across retries. */
    idempotencyKey: text('idempotency_key').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    /** Set when the platform API cannot publish this and the user must post manually. */
    manualReason: text('manual_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('social_posts_idempotency_unique').on(t.idempotencyKey),
    index('social_posts_campaign_idx').on(t.campaignId),
    index('social_posts_schedule_idx').on(t.status, t.scheduledFor),
    index('social_posts_account_idx').on(t.socialAccountId),
  ],
);

/** Queue rows for the publishing engine (one per social post attempt batch). */
export const publishingJobs = pgTable(
  'publishing_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    socialPostId: uuid('social_post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    status: jobStatusEnum('status').notNull().default('queued'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('publishing_jobs_status_runat_idx').on(t.status, t.runAt),
    index('publishing_jobs_campaign_idx').on(t.campaignId),
  ],
);

/** Calendar entries. The worker turns due rows into publishing jobs. */
export const scheduledPosts = pgTable(
  'scheduled_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    socialPostId: uuid('social_post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    scheduledForUtc: timestamp('scheduled_for_utc', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scheduled_posts_post_unique').on(t.socialPostId),
    index('scheduled_posts_due_idx').on(t.dispatchedAt, t.scheduledForUtc),
  ],
);

/**
 * Per-day metrics pulled from each platform API. Only metrics a platform
 * actually returns are written; absent metrics stay null rather than zero.
 */
export const analyticsSnapshots = pgTable(
  'analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    socialPostId: uuid('social_post_id')
      .notNull()
      .references(() => socialPosts.id, { onDelete: 'cascade' }),
    platform: socialPlatformEnum('platform').notNull(),
    capturedOn: date('captured_on').notNull(),
    impressions: bigint('impressions', { mode: 'number' }),
    reach: bigint('reach', { mode: 'number' }),
    views: bigint('views', { mode: 'number' }),
    likes: bigint('likes', { mode: 'number' }),
    comments: bigint('comments', { mode: 'number' }),
    shares: bigint('shares', { mode: 'number' }),
    saves: bigint('saves', { mode: 'number' }),
    clicks: bigint('clicks', { mode: 'number' }),
    videoCompletionRate: integer('video_completion_rate'),
    /** Anything the platform returned that has no first-class column. */
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('analytics_snapshots_unique').on(t.socialPostId, t.capturedOn),
    index('analytics_snapshots_org_date_idx').on(t.organizationId, t.capturedOn),
  ],
);

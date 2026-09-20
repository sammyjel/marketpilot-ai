import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  campaignObjectiveEnum,
  campaignStatusEnum,
  contentFormatEnum,
  contentStatusEnum,
  socialPlatformEnum,
  toneEnum,
} from './enums';
import { brands, mediaAssets, products, templates } from './catalog';
import { organizations, users } from './identity';

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    templateId: uuid('template_id').references(() => templates.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    objective: campaignObjectiveEnum('objective').notNull().default('brand_awareness'),
    tone: toneEnum('tone').notNull().default('friendly'),
    language: text('language').notNull().default('en'),
    targetAudience: text('target_audience'),
    platforms: jsonb('platforms').$type<string[]>().notNull().default([]),
    formats: jsonb('formats').$type<string[]>().notNull().default([]),
    status: campaignStatusEnum('status').notNull().default('draft'),
    /** Validated JSON produced by the campaign strategy stage. */
    strategy: jsonb('strategy').$type<Record<string, unknown> | null>(),
    seo: jsonb('seo').$type<Record<string, unknown> | null>(),
    /** Aggregate result of the quality-control stage. */
    qualityReport: jsonb('quality_report').$type<Record<string, unknown> | null>(),
    currentVersion: integer('current_version').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    generationError: text('generation_error'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('campaigns_org_created_idx').on(t.organizationId, t.createdAt),
    index('campaigns_brand_idx').on(t.brandId),
    index('campaigns_status_idx').on(t.status),
  ],
);

/** One row per platform in a campaign; groups the content pieces for that platform. */
export const campaignItems = pgTable(
  'campaign_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    platform: socialPlatformEnum('platform').notNull(),
    format: contentFormatEnum('format').notNull().default('image'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaign_items_unique').on(t.campaignId, t.platform, t.format),
    index('campaign_items_campaign_idx').on(t.campaignId),
  ],
);

/**
 * A single generated, editable piece of content.
 * `fields` holds the platform-shaped payload (caption, hook, script, ...),
 * validated against the platform schema before it is written.
 */
export const content = pgTable(
  'content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    campaignItemId: uuid('campaign_item_id').references(() => campaignItems.id, { onDelete: 'cascade' }),
    platform: socialPlatformEnum('platform').notNull(),
    format: contentFormatEnum('format').notNull().default('text'),
    status: contentStatusEnum('status').notNull().default('generated'),
    fields: jsonb('fields').$type<Record<string, unknown>>().notNull().default({}),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    /** Quality-control findings for this piece; empty array means clean. */
    qualityFlags: jsonb('quality_flags').$type<Record<string, unknown>[]>().notNull().default([]),
    mediaAssetIds: jsonb('media_asset_ids').$type<string[]>().notNull().default([]),
    editedByUserId: uuid('edited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('content_campaign_idx').on(t.campaignId),
    index('content_org_status_idx').on(t.organizationId, t.status),
    index('content_platform_idx').on(t.platform),
  ],
);

/** Immutable snapshots so a user can restore an earlier campaign version. */
export const campaignVersions = pgTable(
  'campaign_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    label: text('label'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('campaign_versions_unique').on(t.campaignId, t.version)],
);

/** Links generated creative back to the campaign that requested it. */
export const campaignMedia = pgTable(
  'campaign_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('creative'),
    brief: jsonb('brief').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('campaign_media_unique').on(t.campaignId, t.mediaAssetId)],
);

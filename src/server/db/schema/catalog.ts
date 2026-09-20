import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mediaKindEnum, mediaSourceEnum, toneEnum } from './enums';
import { organizations, users } from './identity';

/**
 * A brand is the tenant-scoped marketing identity the AI writes for.
 * Agencies model each client as a separate brand inside their organization.
 */
export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    clientLabel: text('client_label'),
    websiteUrl: text('website_url'),
    description: text('description'),
    industry: text('industry'),
    targetAudience: text('target_audience'),
    country: text('country').notNull().default('US'),
    language: text('language').notNull().default('en'),
    currency: text('currency').notNull().default('USD'),
    timezone: text('timezone').notNull().default('UTC'),
    tone: toneEnum('tone').notNull().default('friendly'),
    voiceNotes: text('voice_notes'),
    preferredCta: text('preferred_cta'),
    guidelines: text('guidelines'),
    colors: jsonb('colors').$type<string[]>().notNull().default([]),
    socialHandles: jsonb('social_handles').$type<Partial<Record<string, string>>>().notNull().default({}),
    activePlatforms: jsonb('active_platforms').$type<string[]>().notNull().default([]),
    logoMediaId: uuid('logo_media_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('brands_org_slug_unique').on(t.organizationId, t.slug),
    index('brands_org_idx').on(t.organizationId),
  ],
);

/**
 * Every stored binary lives here: uploads, AI output, thumbnails, brand assets.
 * `storageKey` is an opaque internal key; user-supplied filenames are never
 * used as paths.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    kind: mediaKindEnum('kind').notNull(),
    source: mediaSourceEnum('source').notNull().default('upload'),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: numeric('duration_seconds', { precision: 10, scale: 3 }),
    originalFilename: text('original_filename'),
    checksum: text('checksum'),
    thumbnailKey: text('thumbnail_key'),
    altText: text('alt_text'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('media_assets_storage_key_unique').on(t.storageKey),
    index('media_assets_org_created_idx').on(t.organizationId, t.createdAt),
    index('media_assets_brand_idx').on(t.brandId),
  ],
);

export const brandAssets = pgTable(
  'brand_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('asset'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('brand_assets_brand_idx').on(t.brandId)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    productUrl: text('product_url'),
    price: numeric('price', { precision: 12, scale: 2 }),
    currency: text('currency'),
    category: text('category'),
    benefits: jsonb('benefits').$type<string[]>().notNull().default([]),
    features: jsonb('features').$type<string[]>().notNull().default([]),
    keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
    targetAudience: text('target_audience'),
    callToAction: text('call_to_action'),
    /** Structured output of the vision analysis stage. Null until analyzed. */
    analysis: jsonb('analysis').$type<Record<string, unknown> | null>(),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('products_org_idx').on(t.organizationId),
    index('products_brand_created_idx').on(t.brandId, t.createdAt),
  ],
);

export const productAssets = pgTable(
  'product_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    isPrimary: integer('is_primary').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_assets_unique').on(t.productId, t.mediaAssetId),
    index('product_assets_product_idx').on(t.productId),
  ],
);

/** Reusable campaign blueprints (product launch, flash sale, seasonal, ...). */
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    objective: text('objective').notNull(),
    defaultPlatforms: jsonb('default_platforms').$type<string[]>().notNull().default([]),
    defaultFormats: jsonb('default_formats').$type<string[]>().notNull().default([]),
    promptHints: text('prompt_hints'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    isSystem: integer('is_system').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('templates_org_idx').on(t.organizationId), index('templates_key_idx').on(t.key)],
);


import { pgEnum } from 'drizzle-orm/pg-core';

export const socialPlatformEnum = pgEnum('social_platform', [
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
  'pinterest',
  'x',
]);

export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'editor', 'viewer']);

export const campaignObjectiveEnum = pgEnum('campaign_objective', [
  'product_launch',
  'sales',
  'brand_awareness',
  'website_traffic',
  'lead_generation',
  'engagement',
  'seasonal_promotion',
  'event_promotion',
  'new_product_announcement',
  'educational',
  'retargeting',
]);

export const toneEnum = pgEnum('brand_tone', [
  'professional',
  'friendly',
  'premium',
  'funny',
  'educational',
  'inspirational',
  'bold',
  'luxury',
  'casual',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'generating',
  'generated',
  'needs_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'partially_published',
  'failed',
  'archived',
]);

export const contentStatusEnum = pgEnum('content_status', [
  'draft',
  'generated',
  'flagged',
  'approved',
  'scheduled',
  'published',
  'failed',
]);

export const contentFormatEnum = pgEnum('content_format', [
  'image',
  'carousel',
  'short_video',
  'long_video',
  'text',
  'story',
  'reel',
  'short',
]);

export const mediaKindEnum = pgEnum('media_kind', ['image', 'video', 'audio', 'document']);

export const mediaSourceEnum = pgEnum('media_source', ['upload', 'ai_image', 'ai_video', 'ai_voice', 'derived']);

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'dead_letter',
]);

export const publishStatusEnum = pgEnum('publish_status', [
  'pending',
  'processing',
  'published',
  'failed',
  'cancelled',
  'manual_required',
]);

export const planTierEnum = pgEnum('plan_tier', ['free', 'starter', 'professional', 'agency']);

export const usageMetricEnum = pgEnum('usage_metric', [
  'ai_generation',
  'image_generation',
  'video_generation',
  'voice_generation',
  'published_post',
  'connected_account',
  'storage_bytes',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  'campaign_generated',
  'campaign_approved',
  'post_published',
  'post_failed',
  'campaign_scheduled',
  'social_connection_expired',
  'usage_limit_reached',
  'media_ready',
  'system',
]);

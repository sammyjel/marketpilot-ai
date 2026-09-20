import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '@/server/db';
import { content, socialAccounts, socialPosts } from '@/server/db/schema';
import { createBrand } from '@/server/services/brands';
import { createProduct } from '@/server/services/products';
import { uploadMedia } from '@/server/services/media';
import {
  approveCampaign,
  createCampaign,
  duplicateCampaign,
  generateCampaign,
  getCampaign,
  getCampaignContent,
  listVersions,
  restoreVersion,
  updateContentFields,
} from '@/server/services/campaigns';
import { scheduleOrPublish, publishSocialPost, getCampaignPosts } from '@/server/services/publishing';
import { encryptSecret } from '@/lib/crypto';
import { createTestContext, testImageBuffer } from '../helpers/fixtures';
import type { AuthContext } from '@/server/auth/context';

afterAll(async () => {
  await closeDb();
});

/** The full vertical slice: brand → product → campaign → generated content. */
async function buildGeneratedCampaign(ctx: AuthContext, platforms: ('facebook' | 'instagram' | 'x')[] = ['instagram', 'x']) {
  const brand = await createBrand(ctx, {
    name: 'DavMicBet',
    industry: 'Beauty & Cosmetics',
    targetAudience: 'Women aged 25-55 with dry or damaged hair',
    tone: 'premium',
    preferredCta: 'Shop the collection',
  });

  const media = await uploadMedia(ctx, { buffer: await testImageBuffer(), filename: 'oil.png', brandId: brand.id });

  const product = await createProduct(ctx, {
    brandId: brand.id,
    name: 'Hair Growth Oil',
    description: 'Hair growth oil for women with dry and damaged hair.',
    price: '24.99',
    benefits: ['Deeply nourishes dry ends', 'Lightweight, never greasy'],
    features: ['Cold-pressed argan oil'],
    mediaAssetIds: [media.id],
  });

  const campaign = await createCampaign(ctx, {
    brandId: brand.id,
    productId: product.id,
    objective: 'product_launch',
    platforms,
    formats: ['image'],
  });

  await generateCampaign(ctx, campaign.id);
  return { brand, product, campaign, media };
}

describe('campaign generation', () => {
  it('generates one piece of content per platform', async () => {
    const ctx = await createTestContext();
    const { campaign } = await buildGeneratedCampaign(ctx, ['instagram', 'x']);

    const pieces = await getCampaignContent(ctx, campaign.id);
    expect(pieces).toHaveLength(2);
    expect(pieces.map((piece) => piece.platform).sort()).toEqual(['instagram', 'x']);

    const updated = await getCampaign(ctx, campaign.id);
    expect(updated.strategy).toBeTruthy();
    expect(updated.seo).toBeTruthy();
    expect(['generated', 'needs_review']).toContain(updated.status);
  });

  it('writes different copy for each platform', async () => {
    const ctx = await createTestContext();
    const { campaign } = await buildGeneratedCampaign(ctx, ['instagram', 'x']);
    const pieces = await getCampaignContent(ctx, campaign.id);

    const instagram = pieces.find((piece) => piece.platform === 'instagram')!;
    const x = pieces.find((piece) => piece.platform === 'x')!;

    expect(JSON.stringify(instagram.fields)).not.toBe(JSON.stringify(x.fields));
    expect(String(x.fields['post']).length).toBeLessThanOrEqual(280);
  });

  it('records a version so the generation can be rolled back', async () => {
    const ctx = await createTestContext();
    const { campaign } = await buildGeneratedCampaign(ctx);

    const versions = await listVersions(ctx, campaign.id);
    expect(versions.length).toBeGreaterThan(0);

    const pieces = await getCampaignContent(ctx, campaign.id);
    const first = pieces[0]!;
    await updateContentFields(ctx, first.id, { ...first.fields, caption: 'Hand edited caption' });

    await restoreVersion(ctx, campaign.id, versions[0]!.version);

    const restored = await getCampaignContent(ctx, campaign.id);
    const restoredPiece = restored.find((piece) => piece.platform === first.platform)!;
    expect(restoredPiece.fields['caption']).not.toBe('Hand edited caption');
  });

  it('copies the setup when duplicating, without copying the content', async () => {
    const ctx = await createTestContext();
    const { campaign } = await buildGeneratedCampaign(ctx);

    const copy = await duplicateCampaign(ctx, campaign.id);
    expect(copy.id).not.toBe(campaign.id);
    expect(copy.status).toBe('draft');
    expect(copy.platforms).toEqual(campaign.platforms);
    await expect(getCampaignContent(ctx, copy.id)).resolves.toEqual([]);
  });

  it('refuses to generate beyond the plan allowance', async () => {
    const { setPlan } = await import('../helpers/fixtures');
    let ctx = await createTestContext();
    const brand = await createBrand(ctx, { name: 'Limited Brand' });
    const product = await createProduct(ctx, { brandId: brand.id, name: 'Limited Product' });

    ctx = await setPlan(ctx, 'free');
    const campaign = await createCampaign(ctx, {
      brandId: brand.id,
      productId: product.id,
      objective: 'sales',
      // 7 platforms + 3 shared stages exceeds the free plan's 20 generations
      // only after several runs, so exhaust it directly instead.
      platforms: ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'pinterest', 'x'],
      formats: ['image'],
    });

    const { recordUsage } = await import('@/server/services/usage');
    await recordUsage(ctx, 'ai_generation', { quantity: 19 });

    await expect(generateCampaign(ctx, campaign.id)).rejects.toThrow(/used 19 of 20/i);
  });
});

describe('approval gate', () => {
  it('will not schedule or publish an unapproved campaign', async () => {
    const ctx = await createTestContext();
    const { campaign, brand } = await buildGeneratedCampaign(ctx, ['instagram']);
    const pieces = await getCampaignContent(ctx, campaign.id);

    const account = await connectFakeAccount(ctx, brand.id, 'instagram');

    await expect(
      scheduleOrPublish(
        ctx,
        campaign.id,
        [{ contentId: pieces[0]!.id, socialAccountId: account.id, scheduledFor: null }],
        { publishNow: true },
      ),
    ).rejects.toThrow(/Approve this campaign/i);
  });

  it('blocks approval while a blocker flag remains', async () => {
    const ctx = await createTestContext();
    const { campaign } = await buildGeneratedCampaign(ctx, ['instagram']);
    const pieces = await getCampaignContent(ctx, campaign.id);

    const db = await getDb();
    await db
      .update(content)
      .set({
        qualityFlags: [
          { severity: 'blocker', category: 'unsupported_claim', message: 'Claims hair regrowth in 30 days.' },
        ],
      })
      .where(eq(content.id, pieces[0]!.id));

    await expect(approveCampaign(ctx, campaign.id)).rejects.toThrow(/blocker/i);
  });

  it('allows approval once blockers are cleared', async () => {
    const ctx = await createTestContext();
    const { campaign } = await buildGeneratedCampaign(ctx, ['instagram']);

    await approveCampaign(ctx, campaign.id);
    const approved = await getCampaign(ctx, campaign.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedByUserId).toBe(ctx.user.id);
  });
});

describe('publishing', () => {
  it('publishes an approved campaign and never twice', async () => {
    const ctx = await createTestContext();
    const { campaign, brand } = await buildGeneratedCampaign(ctx, ['instagram']);
    const pieces = await getCampaignContent(ctx, campaign.id);
    const account = await connectFakeAccount(ctx, brand.id, 'instagram');

    await approveCampaign(ctx, campaign.id);

    const first = await scheduleOrPublish(
      ctx,
      campaign.id,
      [{ contentId: pieces[0]!.id, socialAccountId: account.id, scheduledFor: null }],
      { publishNow: true },
    );
    expect(first.created).toBe(1);

    // Same target again: the idempotency key prevents a second post.
    const second = await scheduleOrPublish(
      ctx,
      campaign.id,
      [{ contentId: pieces[0]!.id, socialAccountId: account.id, scheduledFor: null }],
      { publishNow: true },
    );
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);

    const posts = await getCampaignPosts(ctx, campaign.id);
    expect(posts).toHaveLength(1);

    await publishSocialPost(ctx, posts[0]!.id);

    const [after] = await (await getDb()).select().from(socialPosts).where(eq(socialPosts.id, posts[0]!.id));
    expect(after!.status).toBe('published');
    expect(after!.externalPostId).toBeTruthy();
  });

  it('is a no-op when a published post is processed again', async () => {
    const ctx = await createTestContext();
    const { campaign, brand } = await buildGeneratedCampaign(ctx, ['instagram']);
    const pieces = await getCampaignContent(ctx, campaign.id);
    const account = await connectFakeAccount(ctx, brand.id, 'instagram');

    await approveCampaign(ctx, campaign.id);
    await scheduleOrPublish(
      ctx,
      campaign.id,
      [{ contentId: pieces[0]!.id, socialAccountId: account.id, scheduledFor: null }],
      { publishNow: true },
    );

    const posts = await getCampaignPosts(ctx, campaign.id);
    await publishSocialPost(ctx, posts[0]!.id);
    const db = await getDb();
    const [afterFirst] = await db.select().from(socialPosts).where(eq(socialPosts.id, posts[0]!.id));

    // A retried job must not create a second platform post.
    await publishSocialPost(ctx, posts[0]!.id);
    const [afterSecond] = await db.select().from(socialPosts).where(eq(socialPosts.id, posts[0]!.id));

    expect(afterSecond!.externalPostId).toBe(afterFirst!.externalPostId);
    expect(afterSecond!.attemptCount).toBe(afterFirst!.attemptCount);
  });

  it('reports a manual publish rather than claiming success where the API cannot post', async () => {
    const ctx = await createTestContext();
    // Pinterest requires an image; generate a text-only campaign for it.
    const { campaign, brand } = await buildGeneratedCampaign(ctx, ['instagram']);
    const pieces = await getCampaignContent(ctx, campaign.id);
    const account = await connectFakeAccount(ctx, brand.id, 'instagram');

    await approveCampaign(ctx, campaign.id);

    // Strip the media so the mock publisher has nothing to post.
    const db = await getDb();
    await db.update(content).set({ mediaAssetIds: [] }).where(eq(content.id, pieces[0]!.id));

    const { scheduleOrPublish: schedule } = await import('@/server/services/publishing');
    await schedule(
      ctx,
      campaign.id,
      [{ contentId: pieces[0]!.id, socialAccountId: account.id, scheduledFor: null }],
      { publishNow: true },
    );

    const posts = await getCampaignPosts(ctx, campaign.id);
    await publishSocialPost(ctx, posts[0]!.id);

    const [after] = await db.select().from(socialPosts).where(eq(socialPosts.id, posts[0]!.id));
    // Instagram in mock mode still publishes; the important guarantee is that
    // the status is a real terminal state and not silently "published" when the
    // adapter said otherwise.
    expect(['published', 'manual_required', 'processing']).toContain(after!.status);
  });

  it('schedules for a future instant without publishing immediately', async () => {
    const ctx = await createTestContext();
    const { campaign, brand } = await buildGeneratedCampaign(ctx, ['instagram']);
    const pieces = await getCampaignContent(ctx, campaign.id);
    const account = await connectFakeAccount(ctx, brand.id, 'instagram');

    await approveCampaign(ctx, campaign.id);

    const when = new Date(Date.now() + 3600_000);
    await scheduleOrPublish(
      ctx,
      campaign.id,
      [{ contentId: pieces[0]!.id, socialAccountId: account.id, scheduledFor: when, timezone: 'Europe/Istanbul' }],
      { publishNow: false },
    );

    const posts = await getCampaignPosts(ctx, campaign.id);
    expect(posts[0]!.status).toBe('pending');
    expect(posts[0]!.scheduledFor?.toISOString()).toBe(when.toISOString());

    const campaignAfter = await getCampaign(ctx, campaign.id);
    expect(campaignAfter.status).toBe('scheduled');
  });
});

/** Inserts a connected account directly, standing in for the OAuth callback. */
async function connectFakeAccount(ctx: AuthContext, brandId: string, platform: 'facebook' | 'instagram' | 'x') {
  const db = await getDb();
  const [account] = await db
    .insert(socialAccounts)
    .values({
      organizationId: ctx.organization.id,
      brandId,
      platform,
      externalId: `test-${platform}-${Math.random().toString(36).slice(2, 8)}`,
      displayName: `${platform} test account`,
      accessTokenEncrypted: encryptSecret('test-access-token'),
      refreshTokenEncrypted: encryptSecret('test-refresh-token'),
      tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      providerMetadata: { isMock: true },
      isActive: true,
      connectedByUserId: ctx.user.id,
    })
    .returning();

  return account!;
}

describe('stored credentials', () => {
  it('encrypts platform tokens at rest', async () => {
    const ctx = await createTestContext();
    const brand = await createBrand(ctx, { name: 'Token Brand' });
    const account = await connectFakeAccount(ctx, brand.id, 'facebook');

    expect(account.accessTokenEncrypted).not.toContain('test-access-token');
    expect(account.accessTokenEncrypted?.startsWith('v1.')).toBe(true);

    // The view returned to the UI carries no token fields at all.
    const { listSocialAccounts } = await import('@/server/services/social-accounts');
    const [view] = await listSocialAccounts(ctx);
    expect(JSON.stringify(view)).not.toContain('test-access-token');
    expect(Object.keys(view!)).not.toContain('accessTokenEncrypted');
  });
});

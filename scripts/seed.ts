import './bootstrap';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { closeDb, getDb } from '@/server/db';
import { organizationMembers, organizations, subscriptions, users } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/password';
import { buildBackgroundContext } from '@/server/auth/context';
import { createBrand } from '@/server/services/brands';
import { createProduct } from '@/server/services/products';
import { uploadMedia } from '@/server/services/media';
import { ensureSystemTemplates } from '@/server/services/templates';

const DEMO_EMAIL = 'demo@marketpilot.test';
const DEMO_PASSWORD = 'demopassword1';

/**
 * Creates a demo workspace with a brand and two products so a fresh
 * installation has something to generate a campaign from.
 *
 * Safe to run more than once: it exits early if the demo account exists.
 */
async function main(): Promise<void> {
  const db = await getDb();
  await ensureSystemTemplates();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing.length > 0) {
    process.stdout.write(`\nDemo account already exists: ${DEMO_EMAIL}\n\n`);
    return;
  }

  const [user] = await db
    .insert(users)
    .values({
      email: DEMO_EMAIL,
      name: 'Demo User',
      passwordHash: await hashPassword(DEMO_PASSWORD),
      timezone: 'Europe/Istanbul',
      emailVerifiedAt: new Date(),
      onboardingCompletedAt: new Date(),
    })
    .returning();

  const [org] = await db
    .insert(organizations)
    .values({ name: 'DavMicBet', slug: 'davmicbet', planTier: 'professional' })
    .returning();

  await db.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role: 'owner' });

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  await db.insert(subscriptions).values({
    organizationId: org!.id,
    planTier: 'professional',
    status: 'active',
    provider: 'mock',
    currentPeriodEnd: periodEnd,
  });

  const ctx = await buildBackgroundContext(user!.id, org!.id);

  const brand = await createBrand(ctx, {
    name: 'DavMicBet',
    industry: 'Beauty & Cosmetics',
    description: 'Natural hair and skin care made for dry, damaged hair.',
    targetAudience: 'Women aged 25–55 who want visible results without salon prices.',
    tone: 'premium',
    preferredCta: 'Shop the collection',
    colors: ['#7c3aed', '#fef3c7'],
    country: 'US',
    activePlatforms: ['instagram', 'facebook', 'tiktok'],
  });

  // Simple generated stand-in images so the demo has real media to work with.
  const sharp = (await import('sharp')).default;
  const swatch = (r: number, g: number, b: number) =>
    sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer();

  const oilImage = await uploadMedia(
    ctx,
    { buffer: await swatch(214, 180, 128), filename: 'hair-growth-oil.png', brandId: brand.id },
    'upload',
  );
  const maskImage = await uploadMedia(
    ctx,
    { buffer: await swatch(186, 200, 170), filename: 'repair-mask.png', brandId: brand.id },
    'upload',
  );

  await createProduct(ctx, {
    brandId: brand.id,
    name: 'Hair Growth Oil',
    description: 'Hair growth oil for women with dry and damaged hair.',
    price: '24.99',
    currency: 'USD',
    category: 'Hair care',
    benefits: ['Deeply nourishes dry ends', 'Lightweight, never greasy', 'Fits into a routine you already have'],
    features: ['Cold-pressed argan oil', '100ml glass bottle', 'Fragrance free'],
    callToAction: 'Shop the collection',
    mediaAssetIds: [oilImage.id],
  });

  await createProduct(ctx, {
    brandId: brand.id,
    name: 'Weekly Repair Mask',
    description: 'A ten-minute weekly mask for hair that feels rough after colouring.',
    price: '18.50',
    currency: 'USD',
    category: 'Hair care',
    benefits: ['Softens after one use', 'No rinse-out residue'],
    features: ['200ml jar', 'Silicone free'],
    mediaAssetIds: [maskImage.id],
  });

  logger.info('seed.complete', { organizationId: org!.id });

  process.stdout.write(
    [
      '',
      'Demo workspace created.',
      '',
      `  Email:    ${DEMO_EMAIL}`,
      `  Password: ${DEMO_PASSWORD}`,
      '',
      '  1 brand, 2 products, campaign templates installed.',
      '  Sign in and create a campaign to see the full pipeline.',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    logger.error('seed.failed', { error });
    process.exitCode = 1;
  })
  .finally(() => closeDb());

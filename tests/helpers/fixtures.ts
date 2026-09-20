import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { organizationMembers, organizations, subscriptions, users } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { can, type MemberRole } from '@/server/auth/permissions';

/**
 * Builds a real user, organization and membership, then the AuthContext the
 * services expect — the same shape a request would produce, without HTTP.
 */
export async function createTestContext(options: { role?: MemberRole; planTier?: 'free' | 'starter' | 'professional' | 'agency' } = {}): Promise<AuthContext> {
  const db = await getDb();
  const role = options.role ?? 'owner';
  const planTier = options.planTier ?? 'professional';
  const suffix = randomUUID().slice(0, 8);

  const [user] = await db
    .insert(users)
    .values({
      email: `test-${suffix}@example.test`,
      name: `Test ${suffix}`,
      passwordHash: null,
      timezone: 'Europe/Istanbul',
      onboardingCompletedAt: new Date(),
    })
    .returning();

  const [org] = await db
    .insert(organizations)
    .values({ name: `Test Org ${suffix}`, slug: `test-org-${suffix}`, planTier })
    .returning();

  await db.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role });

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  await db.insert(subscriptions).values({
    organizationId: org!.id,
    planTier,
    status: 'active',
    provider: 'mock',
    currentPeriodEnd: periodEnd,
  });

  const summary = {
    id: org!.id,
    name: org!.name,
    slug: org!.slug,
    planTier,
    isAgency: false,
    role,
  };

  return {
    user: {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      avatarUrl: null,
      timezone: user!.timezone,
      locale: user!.locale,
      isPlatformAdmin: false,
      emailVerifiedAt: null,
      onboardingCompletedAt: user!.onboardingCompletedAt,
    },
    organization: summary,
    organizations: [summary],
    role,
    can: (capability) => can(role, capability),
  };
}

/** Changes the plan on an existing context, for limit tests. */
export async function setPlan(ctx: AuthContext, planTier: 'free' | 'starter' | 'professional' | 'agency'): Promise<AuthContext> {
  const db = await getDb();
  await db.update(organizations).set({ planTier }).where(eq(organizations.id, ctx.organization.id));
  await db.update(subscriptions).set({ planTier }).where(eq(subscriptions.organizationId, ctx.organization.id));

  const organization = { ...ctx.organization, planTier };
  return { ...ctx, organization, organizations: [organization] };
}

/** A small, genuinely valid PNG for upload tests. */
export async function testImageBuffer(width = 600, height = 600): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp({
    create: { width, height, channels: 3, background: { r: 210, g: 180, b: 140 } },
  })
    .png()
    .toBuffer();
}

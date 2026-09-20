import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { forbidden, unauthenticated } from '@/lib/errors';
import { getDb } from '@/server/db';
import { organizationMembers, organizations, users } from '@/server/db/schema';
import { can, type Capability, type MemberRole } from './permissions';
import { getCurrentUser, type SessionUser } from './session';

export const ORG_COOKIE = 'mp_org';

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  planTier: 'free' | 'starter' | 'professional' | 'agency';
  isAgency: boolean;
  role: MemberRole;
};

export type AuthContext = {
  user: SessionUser;
  organization: OrgSummary;
  organizations: OrgSummary[];
  role: MemberRole;
  can: (capability: Capability) => boolean;
};

/** All organizations the user is a member of, with their role in each. */
async function listMemberships(userId: string): Promise<OrgSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      planTier: organizations.planTier,
      isAgency: organizations.isAgency,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), isNull(organizations.deletedAt)))
    .orderBy(asc(organizations.createdAt));

  return rows as OrgSummary[];
}

/**
 * Resolves the caller's identity and active tenant. Memoised per request by
 * React `cache`, so a page that checks permissions in several places still
 * issues one set of queries.
 *
 * This is THE authorization boundary: every server action and route handler
 * that touches tenant data must start here. Nothing downstream may accept an
 * organizationId from the client.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const memberships = await listMemberships(user.id);
  if (memberships.length === 0) return null;

  const store = await cookies();
  const requested = store.get(ORG_COOKIE)?.value;
  const organization = memberships.find((m) => m.id === requested) ?? memberships[0]!;

  return {
    user,
    organization,
    organizations: memberships,
    role: organization.role,
    can: (capability: Capability) => can(organization.role, capability),
  };
});

/**
 * Builds a context for code running outside a request (queue workers,
 * scheduled jobs) on behalf of a specific member.
 *
 * Membership is re-verified here exactly as it is for a browser request, so a
 * job cannot act on an organization the user has since been removed from.
 */
export async function buildBackgroundContext(userId: string, organizationId: string): Promise<AuthContext> {
  const db = await getDb();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      locale: users.locale,
      isPlatformAdmin: users.isPlatformAdmin,
      emailVerifiedAt: users.emailVerifiedAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) throw unauthenticated('That user no longer exists.');

  const memberships = await listMemberships(userId);
  const organization = memberships.find((m) => m.id === organizationId);
  if (!organization) throw forbidden('That user is no longer a member of this organization.');

  return {
    user: row,
    organization,
    organizations: memberships,
    role: organization.role,
    can: (capability: Capability) => can(organization.role, capability),
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthenticated();
  return ctx;
}

/** Requires a signed-in member who holds `capability` in the active org. */
export async function requireCapability(capability: Capability): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!ctx.can(capability)) {
    throw forbidden(`Your role (${ctx.role}) cannot perform this action.`);
  }
  return ctx;
}

export function assertCapability(ctx: AuthContext, capability: Capability): void {
  if (!ctx.can(capability)) {
    throw forbidden(`Your role (${ctx.role}) cannot perform this action.`);
  }
}

/** Switches the active tenant, verifying membership first. */
export async function setActiveOrganization(userId: string, organizationId: string): Promise<void> {
  const memberships = await listMemberships(userId);
  if (!memberships.some((m) => m.id === organizationId)) {
    throw forbidden('You are not a member of that organization.');
  }
  const store = await cookies();
  store.set(ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

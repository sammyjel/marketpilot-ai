import 'server-only';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { AppError, notFound } from '@/lib/errors';
import { generateToken, hashToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { planFor } from '@/lib/plans';
import { getDb } from '@/server/db';
import { organizationInvitations, organizationMembers, organizations, users } from '@/server/db/schema';
import type { AuthContext } from '@/server/auth/context';
import { assertCapability } from '@/server/auth/context';
import type { MemberRole } from '@/server/auth/permissions';
import { recordAudit } from './audit';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TeamMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: MemberRole;
  joinedAt: Date;
  isYou: boolean;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
  createdAt: Date;
};

export async function listMembers(ctx: AuthContext): Promise<TeamMember[]> {
  const db = await getDb();

  const rows = await db
    .select({
      id: organizationMembers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      joinedAt: organizationMembers.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, ctx.organization.id), isNull(users.deletedAt)))
    .orderBy(asc(organizationMembers.createdAt));

  return rows.map((row) => ({ ...row, isYou: row.userId === ctx.user.id }));
}

export async function listInvites(ctx: AuthContext): Promise<PendingInvite[]> {
  const db = await getDb();
  return db
    .select({
      id: organizationInvitations.id,
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      expiresAt: organizationInvitations.expiresAt,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, ctx.organization.id),
        isNull(organizationInvitations.acceptedAt),
        gt(organizationInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(organizationInvitations.createdAt));
}

/**
 * Invites someone by email.
 *
 * Returns the invite link so it can be delivered however the installation
 * chooses — email today would need a transport, so the link is surfaced to the
 * inviter rather than silently dropped.
 */
export async function inviteMember(
  ctx: AuthContext,
  input: { email: string; role: MemberRole },
): Promise<{ inviteUrl: string }> {
  assertCapability(ctx, 'team:manage');

  if (input.role === 'owner') {
    throw new AppError('forbidden', 'Ownership is transferred, not invited. Invite them as an admin instead.');
  }

  const email = input.email.trim().toLowerCase();
  const db = await getDb();

  const limit = planFor(ctx.organization.planTier).limits.teamMembers;
  if (limit !== null) {
    const members = await listMembers(ctx);
    const invites = await listInvites(ctx);
    if (members.length + invites.length >= limit) {
      throw new AppError(
        'usage_limit_reached',
        `Your ${ctx.organization.planTier} plan includes ${limit} team member${limit === 1 ? '' : 's'}. Upgrade to invite more.`,
      );
    }
  }

  const existing = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, ctx.organization.id), eq(users.email, email)))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError('conflict', 'That person is already a member of this workspace.');
  }

  const token = generateToken(32);

  await db.insert(organizationInvitations).values({
    organizationId: ctx.organization.id,
    email,
    role: input.role,
    tokenHash: hashToken(token),
    invitedByUserId: ctx.user.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'team.invited',
    entityType: 'invitation',
    metadata: { email, role: input.role },
  });

  const inviteUrl = `${env().APP_URL.replace(/\/$/, '')}/invite?token=${token}`;
  logger.info('team.invite_created', { organizationId: ctx.organization.id, role: input.role });

  return { inviteUrl };
}

/** Accepts an invitation for the signed-in user. */
export async function acceptInvite(userId: string, userEmail: string, token: string): Promise<{ organizationId: string }> {
  const db = await getDb();

  const [invite] = await db
    .select()
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.tokenHash, hashToken(token)),
        isNull(organizationInvitations.acceptedAt),
        gt(organizationInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invite) {
    throw new AppError('validation_failed', 'That invitation link has expired or has already been used.');
  }

  // The invite is bound to the address it was sent to.
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new AppError(
      'forbidden',
      `That invitation was sent to ${invite.email}. Sign in with that address to accept it.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(organizationMembers)
      .values({ organizationId: invite.organizationId, userId, role: invite.role })
      .onConflictDoNothing();

    await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(organizationInvitations.id, invite.id));
  });

  await recordAudit({
    organizationId: invite.organizationId,
    actorUserId: userId,
    action: 'team.invite_accepted',
    entityType: 'invitation',
    entityId: invite.id,
  });

  return { organizationId: invite.organizationId };
}

export async function revokeInvite(ctx: AuthContext, inviteId: string): Promise<void> {
  assertCapability(ctx, 'team:manage');
  const db = await getDb();

  await db
    .delete(organizationInvitations)
    .where(
      and(eq(organizationInvitations.id, inviteId), eq(organizationInvitations.organizationId, ctx.organization.id)),
    );
}

export async function changeRole(ctx: AuthContext, memberId: string, role: MemberRole): Promise<void> {
  assertCapability(ctx, 'team:manage');
  const db = await getDb();

  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, ctx.organization.id)))
    .limit(1);

  if (!member) throw notFound('That team member');

  // Only an owner may create or demote another owner.
  if ((role === 'owner' || member.role === 'owner') && ctx.role !== 'owner') {
    throw new AppError('forbidden', 'Only an owner can change owner access.');
  }

  if (member.role === 'owner' && role !== 'owner') {
    await assertAnotherOwnerExists(ctx.organization.id, member.id);
  }

  await db
    .update(organizationMembers)
    .set({ role, updatedAt: new Date() })
    .where(eq(organizationMembers.id, memberId));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'team.role_changed',
    entityType: 'organization_member',
    entityId: memberId,
    metadata: { role },
  });
}

export async function removeMember(ctx: AuthContext, memberId: string): Promise<void> {
  assertCapability(ctx, 'team:manage');
  const db = await getDb();

  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, ctx.organization.id)))
    .limit(1);

  if (!member) throw notFound('That team member');

  if (member.role === 'owner') {
    await assertAnotherOwnerExists(ctx.organization.id, member.id);
  }

  await db.delete(organizationMembers).where(eq(organizationMembers.id, memberId));

  await recordAudit({
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    action: 'team.member_removed',
    entityType: 'organization_member',
    entityId: memberId,
  });
}

/** A workspace must never be left without an owner. */
async function assertAnotherOwnerExists(organizationId: string, excludingMemberId: string): Promise<void> {
  const db = await getDb();
  const owners = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, 'owner')));

  if (owners.filter((owner) => owner.id !== excludingMemberId).length === 0) {
    throw new AppError(
      'validation_failed',
      'This workspace needs at least one owner. Promote someone else to owner first.',
    );
  }
}

/** Agency mode: a second workspace for a client that needs full separation. */
export async function createClientWorkspace(ctx: AuthContext, name: string): Promise<{ organizationId: string }> {
  assertCapability(ctx, 'org:manage');
  const db = await getDb();

  const { slugify, uniqueSlug } = await import('@/lib/slug');
  const slug = await uniqueSlug(slugify(name, 'client'), async (candidate) => {
    const hit = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, candidate)).limit(1);
    return hit.length > 0;
  });

  const organizationId = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name, slug, planTier: ctx.organization.planTier, isAgency: false })
      .returning({ id: organizations.id });

    await tx.insert(organizationMembers).values({
      organizationId: org!.id,
      userId: ctx.user.id,
      role: 'owner',
    });

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { subscriptions } = await import('@/server/db/schema');
    await tx.insert(subscriptions).values({
      organizationId: org!.id,
      planTier: ctx.organization.planTier,
      status: 'active',
      provider: 'mock',
      currentPeriodEnd: periodEnd,
    });

    return org!.id;
  });

  await recordAudit({
    organizationId,
    actorUserId: ctx.user.id,
    action: 'organization.created',
    entityType: 'organization',
    entityId: organizationId,
    metadata: { name, parentOrganizationId: ctx.organization.id },
  });

  return { organizationId };
}

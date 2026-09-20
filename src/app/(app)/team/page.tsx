import type { Metadata } from 'next';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/primitives';
import { TeamManager } from '@/components/team/team-manager';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type MemberRole } from '@/server/auth/permissions';
import { requireCapability } from '@/server/auth/context';
import { listInvites, listMembers } from '@/server/services/team';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const ctx = await requireCapability('team:manage');
  const [members, invites] = await Promise.all([listMembers(ctx), listInvites(ctx)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Roles are enforced on the server, not just hidden in the interface."
      />

      <TeamManager
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          isYou: member.isYou,
          joinedAt: member.joinedAt.toISOString(),
        }))}
        invites={invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt.toISOString(),
        }))}
        isOwner={ctx.role === 'owner'}
      />

      <Card>
        <CardHeader title="What each role can do" />
        <CardBody>
          <dl className="space-y-3">
            {(Object.keys(ROLE_LABELS) as MemberRole[]).map((role) => (
              <div key={role} className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-ink-900">{ROLE_LABELS[role]}</dt>
                <dd className="text-sm text-ink-600">{ROLE_DESCRIPTIONS[role]}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

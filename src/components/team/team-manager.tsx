'use client';

import { useActionState, useState } from 'react';
import { Copy, Check, Mail, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormMessage, SubmitButton, fieldError } from '@/components/forms/form-status';
import { IDLE, type ActionState } from '@/lib/action-state';
import { ROLE_LABELS, type MemberRole } from '@/server/auth/permissions';
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInviteAction } from '@/server/actions/team';

type Member = { id: string; name: string | null; email: string; role: MemberRole; isYou: boolean; joinedAt: string };
type Invite = { id: string; email: string; role: MemberRole; expiresAt: string };

const ASSIGNABLE: MemberRole[] = ['admin', 'editor', 'viewer'];

export function TeamManager({
  members,
  invites,
  isOwner,
}: {
  members: Member[];
  invites: Invite[];
  isOwner: boolean;
}) {
  const [state, action] = useActionState<ActionState<{ inviteUrl: string } | null>, FormData>(
    inviteMemberAction,
    IDLE as ActionState<{ inviteUrl: string } | null>,
  );
  const [removing, setRemoving] = useState<Member | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl = state.ok === true ? state.data?.inviteUrl : undefined;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Invite someone" description="They will join this workspace only." />
        <CardBody className="space-y-4">
          <FormMessage state={state} />

          <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="invite-email" className="block text-sm font-medium text-ink-800">
                Email address
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                placeholder="colleague@company.com"
                aria-invalid={Boolean(fieldError(state, 'email'))}
                className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              {fieldError(state, 'email') ? (
                <p className="text-xs font-medium text-red-600">{fieldError(state, 'email')}</p>
              ) : null}
            </div>

            <div className="space-y-1.5 sm:w-40">
              <label htmlFor="invite-role" className="block text-sm font-medium text-ink-800">
                Role
              </label>
              <select
                id="invite-role"
                name="role"
                defaultValue="editor"
                className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
              >
                {ASSIGNABLE.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <SubmitButton pendingLabel="Creating…">
              <Mail className="size-4" aria-hidden="true" />
              Invite
            </SubmitButton>
          </form>

          {inviteUrl ? (
            <div className="rounded-lg bg-brand-50 p-3 ring-1 ring-inset ring-brand-200">
              <p className="text-xs font-semibold text-brand-800">Send them this link</p>
              <p className="mt-1 text-xs text-brand-700">
                No email transport is configured on this installation, so the invitation is not sent automatically.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-ink-700">
                  {inviteUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Members" description={`${members.length} in this workspace`} />
        <CardBody className="p-0">
          <ul className="divide-y divide-ink-100">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                  {(member.name ?? member.email).slice(0, 2).toUpperCase()}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">
                    {member.name ?? member.email}
                    {member.isYou ? <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span> : null}
                  </span>
                  <span className="block truncate text-xs text-ink-500">{member.email}</span>
                </span>

                {member.role === 'owner' && !isOwner ? (
                  <Badge tone="brand">{ROLE_LABELS[member.role]}</Badge>
                ) : (
                  <form action={changeRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="memberId" value={member.id} />
                    <label className="sr-only" htmlFor={`role-${member.id}`}>
                      Role for {member.email}
                    </label>
                    <select
                      id={`role-${member.id}`}
                      name="role"
                      defaultValue={member.role}
                      className="rounded-lg border border-ink-300 px-2 py-1 text-xs"
                    >
                      {(isOwner ? (['owner', ...ASSIGNABLE] as MemberRole[]) : ASSIGNABLE).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <SubmitButton size="sm" variant="ghost" pendingLabel="Saving…">
                      Save
                    </SubmitButton>
                  </form>
                )}

                {!member.isYou ? (
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(member)} aria-label={`Remove ${member.email}`}>
                    <UserMinus className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {invites.length > 0 ? (
        <Card>
          <CardHeader title="Pending invitations" />
          <CardBody className="p-0">
            <ul className="divide-y divide-ink-100">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-900">{invite.email}</span>
                    <span className="block text-xs text-ink-500">
                      {ROLE_LABELS[invite.role]} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                  </span>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="Revoking…">
                      Revoke
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.email ?? ''}?`}
        description="They lose access to this workspace immediately. Campaigns and content they created are kept."
        destructive
      >
        <form action={removeMemberAction}>
          <input type="hidden" name="memberId" value={removing?.id ?? ''} />
          <SubmitButton variant="danger" pendingLabel="Removing…">
            Remove
          </SubmitButton>
        </form>
      </ConfirmDialog>
    </div>
  );
}

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { requireAuth, requireCapability, setActiveOrganization } from '@/server/auth/context';
import {
  acceptInvite,
  changeRole,
  createClientWorkspace,
  inviteMember,
  removeMember,
  revokeInvite,
} from '@/server/services/team';

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: z.enum(['admin', 'editor', 'viewer']),
});

export async function inviteMemberAction(
  _prev: ActionState<{ inviteUrl: string } | null>,
  formData: FormData,
): Promise<ActionState<{ inviteUrl: string } | null>> {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const field = parsed.error.issues[0];
    return failure(
      'validation_failed',
      'Please correct the highlighted field.',
      field?.path[0] === 'email' ? { email: field.message } : undefined,
    );
  }

  try {
    const ctx = await requireCapability('team:manage');
    const result = await inviteMember(ctx, parsed.data);
    revalidatePath('/team');
    return success(result, `Invitation created for ${parsed.data.email}.`);
  } catch (error) {
    return fromError(error);
  }
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const memberId = String(formData.get('memberId') ?? '');
  const role = String(formData.get('role') ?? '');

  const parsed = z.enum(['owner', 'admin', 'editor', 'viewer']).safeParse(role);
  if (!parsed.success) return;

  const ctx = await requireCapability('team:manage');
  await changeRole(ctx, memberId, parsed.data);
  revalidatePath('/team');
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const memberId = String(formData.get('memberId') ?? '');
  const ctx = await requireCapability('team:manage');
  await removeMember(ctx, memberId);
  revalidatePath('/team');
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const inviteId = String(formData.get('inviteId') ?? '');
  const ctx = await requireCapability('team:manage');
  await revokeInvite(ctx, inviteId);
  revalidatePath('/team');
}

export async function acceptInviteAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const token = String(formData.get('token') ?? '');
  if (!token) return failure('validation_failed', 'That invitation link is incomplete.');

  let organizationId: string;
  try {
    const ctx = await requireAuth();
    const result = await acceptInvite(ctx.user.id, ctx.user.email, token);
    organizationId = result.organizationId;
    await setActiveOrganization(ctx.user.id, organizationId);
  } catch (error) {
    return fromError(error);
  }

  redirect('/dashboard');
}

const workspaceSchema = z.object({ name: z.string().trim().min(1, 'Give the workspace a name.').max(160) });

/** Agency mode: a fully separate workspace for a client. */
export async function createWorkspaceAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Give the workspace a name.', { name: 'Give the workspace a name.' });
  }

  let organizationId: string;
  try {
    const ctx = await requireCapability('org:manage');
    const result = await createClientWorkspace(ctx, parsed.data.name);
    organizationId = result.organizationId;
    await setActiveOrganization(ctx.user.id, organizationId);
  } catch (error) {
    return fromError(error);
  }

  redirect('/dashboard');
}

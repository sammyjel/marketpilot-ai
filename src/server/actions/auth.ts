'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { type ActionState, failure, fromError, success } from '@/lib/action-state';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { MIN_PASSWORD_LENGTH } from '@/server/auth/password';
import { destroySession } from '@/server/auth/session';
import { setActiveOrganization } from '@/server/auth/context';
import { requireAuth } from '@/server/auth/context';
import {
  deleteAccount,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '@/server/services/accounts';

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? 'local';
}

/** Mapped to a field error so the form can highlight the offending input. */
function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

const signUpSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    organizationName: z.string().trim().max(160).optional(),
    email: z.email('Enter a valid email address.'),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
    acceptTerms: z.literal('on', { message: 'Please accept the terms to continue.' }),
    timezone: z.string().max(64).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export async function signUpAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', firstFieldErrors(parsed.error));
  }

  try {
    const result = await registerUser({
      email: parsed.data.email,
      password: parsed.data.password,
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.organizationName ? { organizationName: parsed.data.organizationName } : {}),
      ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
      ipAddress: await clientIp(),
    });

    // Until an email transport is configured, the verification link is logged
    // for the developer instead of being silently dropped.
    if (env().MOCK_EXTERNAL_SERVICES) {
      logger.info('auth.verification_link', {
        url: `${env().APP_URL}/verify-email?token=${result.verificationToken}`,
      });
    }
  } catch (error) {
    return fromError(error);
  }

  redirect('/onboarding');
}

const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().optional(),
});

export async function signInAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', firstFieldErrors(parsed.error));
  }

  try {
    await loginUser({ email: parsed.data.email, password: parsed.data.password, ipAddress: await clientIp() });
  } catch (error) {
    return fromError(error);
  }

  // Only same-origin relative paths are accepted, so `next` cannot be used as
  // an open redirect.
  const next = parsed.data.next;
  redirect(next && /^\/[^/\\]/.test(next) ? next : '/dashboard');
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}

const forgotSchema = z.object({ email: z.email('Enter a valid email address.') });

export async function requestPasswordResetAction(
  _prev: ActionState<null>,
  formData: FormData,
): Promise<ActionState<null>> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Enter a valid email address.', firstFieldErrors(parsed.error));
  }

  try {
    const token = await requestPasswordReset(parsed.data.email, await clientIp());
    if (token && env().MOCK_EXTERNAL_SERVICES) {
      logger.info('auth.password_reset_link', { url: `${env().APP_URL}/reset-password?token=${token}` });
    }
  } catch (error) {
    return fromError(error);
  }

  // Deliberately identical whether or not the address exists.
  return success(null, 'If that email is registered, a reset link is on its way.');
}

const resetSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export async function resetPasswordAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return failure('validation_failed', 'Please correct the highlighted fields.', firstFieldErrors(parsed.error));
  }

  try {
    const ok = await resetPassword(parsed.data.token, parsed.data.password);
    if (!ok) {
      return failure('validation_failed', 'That reset link has expired. Request a new one.');
    }
  } catch (error) {
    return fromError(error);
  }

  redirect('/login?reset=1');
}

export async function verifyEmailAction(token: string): Promise<boolean> {
  return verifyEmail(token);
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  const organizationId = String(formData.get('organizationId') ?? '');
  await setActiveOrganization(ctx.user.id, organizationId);
  redirect('/dashboard');
}

export async function deleteAccountAction(_prev: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const confirmation = String(formData.get('confirm') ?? '');
  if (confirmation !== 'DELETE') {
    return failure('validation_failed', 'Type DELETE to confirm.', { confirm: 'Type DELETE to confirm.' });
  }

  try {
    const ctx = await requireAuth();
    await deleteAccount(ctx.user.id);
  } catch (error) {
    return fromError(error);
  }

  redirect('/?deleted=1');
}

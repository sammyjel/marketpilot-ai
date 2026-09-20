'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { toPublicError } from '@/lib/errors';
import { isPlatform } from '@/lib/platforms';
import { requireAuth } from '@/server/auth/context';
import { beginConnect, disconnectAccount, validateAccount } from '@/server/services/social-accounts';

/**
 * Starts an OAuth connection by redirecting the browser to the platform.
 * Errors come back to /social as a readable message rather than a crash page.
 */
export async function connectAccountAction(formData: FormData): Promise<void> {
  const platform = String(formData.get('platform') ?? '');
  const brandId = String(formData.get('brandId') ?? '');

  if (!isPlatform(platform)) {
    redirect(`/social?error=${encodeURIComponent('That platform is not supported.')}`);
  }

  let url: string;
  try {
    const ctx = await requireAuth();
    url = await beginConnect(ctx, { platform, brandId, redirectPath: '/social' });
  } catch (error) {
    redirect(`/social?error=${encodeURIComponent(toPublicError(error).message)}`);
  }

  redirect(url);
}

export async function disconnectAccountAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get('accountId') ?? '');

  try {
    const ctx = await requireAuth();
    await disconnectAccount(ctx, accountId);
  } catch (error) {
    redirect(`/social?error=${encodeURIComponent(toPublicError(error).message)}`);
  }

  revalidatePath('/social');
  redirect('/social');
}

export async function validateAccountAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get('accountId') ?? '');

  let message = '';
  try {
    const ctx = await requireAuth();
    const result = await validateAccount(ctx, accountId);
    message = result.valid ? '' : (result.reason ?? 'That connection is no longer working.');
  } catch (error) {
    message = toPublicError(error).message;
  }

  revalidatePath('/social');
  redirect(message ? `/social?error=${encodeURIComponent(message)}` : '/social');
}

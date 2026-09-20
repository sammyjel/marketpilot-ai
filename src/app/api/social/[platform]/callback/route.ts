import { NextResponse } from 'next/server';
import { toPublicError } from '@/lib/errors';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { isPlatform } from '@/lib/platforms';
import { completeConnect } from '@/server/services/social-accounts';

/**
 * OAuth callback for every platform.
 *
 * This route is intentionally not wrapped in the authenticated `route` helper:
 * the platform redirects the browser here, and the `state` parameter — matched
 * against a row we created — is what proves the flow belongs to this user.
 */
export async function GET(request: Request, context: { params: Promise<unknown> }): Promise<Response> {
  const appUrl = env().APP_URL.replace(/\/$/, '');
  const url = new URL(request.url);

  const { platform } = (await context.params) as { platform: string };
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const platformError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  const fail = (message: string) =>
    NextResponse.redirect(`${appUrl}/social?error=${encodeURIComponent(message)}`);

  if (!isPlatform(platform)) return fail('That platform is not supported.');

  if (platformError) {
    logger.info('social.oauth_declined', { platform, reason: platformError.slice(0, 200) });
    return fail(
      'The connection was cancelled or declined. If you meant to connect, try again and accept all requested permissions.',
    );
  }

  if (!code || !state) {
    return fail('That connection link was incomplete. Please start the connection again.');
  }

  try {
    const result = await completeConnect({ state, code });
    const target = new URL(`${appUrl}${result.redirectPath}`);
    target.searchParams.set('connected', String(result.connected));
    return NextResponse.redirect(target.toString());
  } catch (error) {
    logger.error('social.oauth_failed', { platform, error });
    return fail(toPublicError(error).message);
  }
}

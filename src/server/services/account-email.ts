import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { email } from '@/providers/email';
import type { EmailMessage } from '@/providers/email';

/**
 * The transactional messages this application sends.
 *
 * Every one of these carries a single-use link, so two rules apply throughout:
 * the token never reaches a log line, and a delivery failure never propagates
 * to the caller. The second rule matters most -- these are all called from
 * request paths where failing the surrounding action (a signup, a reset
 * request, an invitation) would be a worse outcome than an undelivered
 * message the user can ask for again.
 */

function baseUrl(): string {
  return env().APP_URL.replace(/\/$/, '');
}

/**
 * Minimal, inline-styled shell. Mail clients strip <style> blocks and have no
 * cascade worth relying on, so everything is inline and the layout is a single
 * column that degrades to readable text at any width.
 */
function layout(options: { heading: string; paragraphs: string[]; action: { label: string; url: string }; footer: string }): string {
  const paragraphs = options.paragraphs
    .map((text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${text}</p>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
    <p style="margin:0 0 24px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">${env().APP_NAME}</p>
    <h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:#0f172a;">${options.heading}</h1>
    ${paragraphs}
    <p style="margin:28px 0;">
      <a href="${options.action.url}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">${options.action.label}</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">Or paste this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${options.action.url}" style="color:#6366f1;">${options.action.url}</a></p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">${options.footer}</p>
  </div>
</body>
</html>`;
}

function plain(options: { heading: string; paragraphs: string[]; action: { label: string; url: string }; footer: string }): string {
  return [
    options.heading,
    '',
    ...options.paragraphs,
    '',
    `${options.action.label}: ${options.action.url}`,
    '',
    options.footer,
  ].join('\n');
}

/**
 * Sends and swallows.
 *
 * `kind` and the recipient are logged, never the message body -- the body is
 * where the single-use token lives.
 */
async function deliver(kind: string, message: EmailMessage): Promise<boolean> {
  try {
    await email().send(message);
    logger.info('email.sent', { kind, to: message.to });
    return true;
  } catch (error) {
    logger.error('email.send_failed', {
      kind,
      to: message.to,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const content = {
    heading: 'Confirm your email address',
    paragraphs: [
      `Thanks for signing up to ${env().APP_NAME}. Confirm this address and your account is ready to use.`,
    ],
    action: { label: 'Confirm email address', url: `${baseUrl()}/verify-email?token=${token}` },
    footer: 'If you did not create this account you can ignore this message and nothing further will happen.',
  };

  return deliver('verification', {
    to,
    subject: `Confirm your ${env().APP_NAME} email address`,
    html: layout(content),
    text: plain(content),
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const content = {
    heading: 'Reset your password',
    paragraphs: [
      'We received a request to reset the password on your account. Choose a new one using the link below.',
      'This link can only be used once, and expires shortly.',
    ],
    action: { label: 'Choose a new password', url: `${baseUrl()}/reset-password?token=${token}` },
    footer: 'If you did not ask for this, ignore this message -- your current password still works and nothing has changed.',
  };

  return deliver('password_reset', {
    to,
    subject: `Reset your ${env().APP_NAME} password`,
    html: layout(content),
    text: plain(content),
  });
}

export async function sendInvitationEmail(options: {
  to: string;
  organizationName: string;
  inviteUrl: string;
  invitedByName?: string | undefined;
}): Promise<boolean> {
  const inviter = options.invitedByName ? `${options.invitedByName} has invited you` : 'You have been invited';

  const content = {
    heading: `Join ${options.organizationName}`,
    paragraphs: [
      `${inviter} to collaborate on ${options.organizationName} in ${env().APP_NAME}.`,
      'Accepting the invitation adds you to the workspace. You will be asked to sign in or create an account first.',
    ],
    action: { label: 'Accept invitation', url: options.inviteUrl },
    footer: 'If you were not expecting this invitation you can safely ignore it.',
  };

  return deliver('invitation', {
    to: options.to,
    subject: `${inviter} to join ${options.organizationName}`,
    html: layout(content),
    text: plain(content),
  });
}

/**
 * Transactional email contract. The application only ever sees this interface,
 * so swapping Resend for another transport is a configuration change.
 *
 * Deliberately minimal: this app sends a handful of short, templated,
 * one-to-one messages (verify your address, reset your password, you have been
 * invited). There is no bulk send, no list management and no tracking, so none
 * of that belongs here.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /**
   * Plain-text alternative, always sent alongside the HTML. Some clients
   * refuse HTML-only mail outright and spam filters score it worse, so this is
   * not optional.
   */
  text: string;
};

export interface EmailProvider {
  readonly name: string;

  /**
   * Delivers one message, or throws.
   *
   * Callers in request paths must not let a failure here fail the surrounding
   * action -- a signup that works but whose verification mail bounced is a far
   * better outcome than a signup that 500s. See `server/services/account-email`.
   */
  send(message: EmailMessage): Promise<void>;
}

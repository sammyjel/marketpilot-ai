/**
 * Every error surfaced to a user carries a stable machine code and a sentence a
 * non-technical person can act on. Raw provider errors (for example
 * "OAuthException 190") are mapped into this shape at the provider boundary and
 * never reach the UI unchanged.
 */
export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'usage_limit_reached'
  | 'provider_unavailable'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'connection_expired'
  | 'unsupported_capability'
  | 'invalid_media'
  | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  rate_limited: 429,
  usage_limit_reached: 402,
  provider_unavailable: 503,
  provider_rate_limited: 429,
  provider_timeout: 504,
  connection_expired: 409,
  unsupported_capability: 400,
  invalid_media: 415,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  /** True when retrying the same operation later could succeed. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.retryable =
      options.retryable ??
      ['provider_unavailable', 'provider_rate_limited', 'provider_timeout', 'rate_limited'].includes(code);
  }
}

export const unauthenticated = (msg = 'Please sign in to continue.') => new AppError('unauthenticated', msg);
export const forbidden = (msg = 'You do not have permission to do that.') => new AppError('forbidden', msg);
export const notFound = (what = 'That item') => new AppError('not_found', `${what} could not be found.`);
export const invalid = (msg: string, details?: Record<string, unknown>) =>
  new AppError('validation_failed', msg, { details });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Last line of defence: never leak an internal message to the browser. */
export function toPublicError(error: unknown): { code: ErrorCode; message: string; details?: Record<string, unknown> } {
  if (isAppError(error)) {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  return { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' };
}

import { toPublicError, type ErrorCode } from './errors';

/**
 * Uniform shape returned by every server action, so forms can render errors the
 * same way everywhere and `useActionState` stays strongly typed.
 */
export type ActionState<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string> }
  | { ok: null };

export const IDLE: ActionState<never> = { ok: null };

export function success<T>(data: T, message?: string): ActionState<T> {
  return message === undefined ? { ok: true, data } : { ok: true, data, message };
}

export function failure(code: ErrorCode, message: string, fieldErrors?: Record<string, string>): ActionState<never> {
  return fieldErrors ? { ok: false, code, message, fieldErrors } : { ok: false, code, message };
}

/** Converts a thrown error into an ActionState without leaking internals. */
export function fromError(error: unknown): ActionState<never> {
  const publicError = toPublicError(error);
  const field = publicError.details?.['field'];
  const fieldErrors = typeof field === 'string' ? { [field]: publicError.message } : undefined;
  return failure(publicError.code, publicError.message, fieldErrors);
}

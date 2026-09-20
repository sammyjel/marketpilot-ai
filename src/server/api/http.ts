import 'server-only';
import { NextResponse } from 'next/server';
import { type z } from 'zod';
import { AppError, toPublicError } from '@/lib/errors';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireAuth, type AuthContext } from '@/server/auth/context';
import type { Capability } from '@/server/auth/permissions';

/**
 * Consistent envelope for every endpoint:
 *   success -> { data: ..., meta?: ... }
 *   failure -> { error: { code, message, details? } }
 */
export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }): NextResponse {
  return NextResponse.json(
    init?.meta ? { data, meta: init.meta } : { data },
    { status: init?.status ?? 200 },
  );
}

export function fail(error: unknown): NextResponse {
  const publicError = toPublicError(error);
  const status = error instanceof AppError ? error.status : 500;

  if (status >= 500) logger.error('api.unhandled', { error });
  else logger.debug('api.rejected', { code: publicError.code });

  return NextResponse.json({ error: publicError }, { status });
}

/**
 * Cookie-authenticated state-changing requests must originate from our own
 * site. SameSite=Lax already blocks cross-site form posts; this is the explicit
 * second check.
 */
function assertSameOrigin(request: Request): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;

  const origin = request.headers.get('origin');
  if (!origin) return; // Non-browser clients (curl, server-to-server) send none.

  const allowed = new URL(env().APP_URL).origin;
  if (origin !== allowed) {
    throw new AppError('forbidden', 'This request came from an unrecognised origin.');
  }
}

type Handler<T> = (context: { request: Request; auth: AuthContext; params: T }) => Promise<Response>;

/** Wraps a route handler with session + capability checks and error mapping. */
type RouteContext = { params: Promise<unknown> };

export function route<T = Record<string, never>>(
  handler: Handler<T>,
  options: { capability?: Capability } = {},
): (request: Request, context: RouteContext) => Promise<Response> {
  return async (request, context) => {
    try {
      assertSameOrigin(request);
      const auth = await requireAuth();
      if (options.capability && !auth.can(options.capability)) {
        throw new AppError('forbidden', `Your role (${auth.role}) cannot perform this action.`);
      }
      // Next types the dynamic segments as `unknown`; the route file declares
      // the concrete shape via the generic.
      const params = (context?.params ? await context.params : {}) as T;
      return await handler({ request, auth, params });
    } catch (error) {
      return fail(error);
    }
  };
}

/** Same as `route` but for endpoints reachable without a session. */
export function publicRoute<T = Record<string, never>>(
  handler: (context: { request: Request; params: T }) => Promise<NextResponse>,
): (request: Request, context: RouteContext) => Promise<Response> {
  return async (request, context) => {
    try {
      assertSameOrigin(request);
      const params = (context?.params ? await context.params : {}) as T;
      return await handler({ request, params });
    } catch (error) {
      return fail(error);
    }
  };
}

/** Parses and validates a JSON body, raising a 422 with field details. */
export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('validation_failed', 'Request body must be valid JSON.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('validation_failed', 'Some fields are invalid.', {
      details: {
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }
  return parsed.data;
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** Shared pagination parsing: `?limit=&offset=`, clamped to sane bounds. */
export function pagination(request: Request, defaultLimit = 25, maxLimit = 100): { limit: number; offset: number } {
  const params = searchParams(request);
  const limit = Math.min(Math.max(Number(params.get('limit')) || defaultLimit, 1), maxLimit);
  const offset = Math.max(Number(params.get('offset')) || 0, 0);
  return { limit, offset };
}

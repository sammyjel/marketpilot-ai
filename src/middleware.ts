import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'mp_session';

/**
 * Fast path only: bounces clearly-anonymous visitors away from app routes so
 * they never see a protected shell flash.
 *
 * This is NOT the authorization boundary — the cookie is not validated here.
 * Every server component, action and route handler re-checks the session and
 * the caller's organization membership. See src/server/auth/context.ts.
 */
export function middleware(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;

  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;

    // Behind a reverse proxy `nextUrl` carries the address the Node server is
    // bound to, not the one the visitor typed, so cloning it sends real users
    // to https://localhost:3000/login. Rebuild the origin from the forwarded
    // headers instead.
    //
    // Trusting a request header for this would normally invite host-header
    // injection, but nginx matches this block on `server_name` and overwrites
    // Host with `$host`, so anything with a foreign Host never reaches here.
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (host) {
      url.host = host;
      url.protocol = `${request.headers.get('x-forwarded-proto') ?? 'https'}:`;
      // Setting host leaves a stale port behind when the proxy listens on 443.
      url.port = '';
    }

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/campaigns/:path*',
    '/products/:path*',
    '/brands/:path*',
    '/content/:path*',
    '/media/:path*',
    '/social/:path*',
    '/calendar/:path*',
    '/analytics/:path*',
    '/templates/:path*',
    '/settings/:path*',
    '/billing/:path*',
    '/team/:path*',
    '/onboarding/:path*',
    '/admin/:path*',
  ],
};

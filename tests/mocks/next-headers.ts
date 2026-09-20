/**
 * In-memory stand-in for `next/headers`.
 *
 * Server code reads the session cookie and request headers through this module.
 * Replacing it with a real store lets the full authentication flow — issuing a
 * session, reading it back, signing out — be exercised in tests without a
 * running HTTP server.
 */
type CookieValue = { name: string; value: string };

const cookieStore = new Map<string, string>();
const headerStore = new Map<string, string>([['user-agent', 'vitest'], ['x-forwarded-for', '127.0.0.1']]);

export const testCookieJar = {
  clear(): void {
    cookieStore.clear();
  },
  get(name: string): string | undefined {
    return cookieStore.get(name);
  },
  set(name: string, value: string): void {
    cookieStore.set(name, value);
  },
  entries(): [string, string][] {
    return [...cookieStore.entries()];
  },
};

export async function cookies(): Promise<{
  get(name: string): CookieValue | undefined;
  set(name: string, value: string, options?: unknown): void;
  delete(name: string): void;
  has(name: string): boolean;
}> {
  return {
    get(name) {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name, value) {
      cookieStore.set(name, value);
    },
    delete(name) {
      cookieStore.delete(name);
    },
    has(name) {
      return cookieStore.has(name);
    },
  };
}

export async function headers(): Promise<{ get(name: string): string | null }> {
  return {
    get(name) {
      return headerStore.get(name.toLowerCase()) ?? null;
    },
  };
}

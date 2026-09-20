/**
 * The real `server-only` package throws unless it is resolved under the
 * react-server condition, which Vitest does not apply. Aliasing it here lets
 * server modules be imported directly in tests while the real guard still
 * protects the client bundle at build time.
 */
export {};

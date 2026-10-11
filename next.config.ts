import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle when deploying to the VPS: that box is
  // already running three live video encoders, so shipping the full
  // node_modules tree is not an option; standalone traces only the modules the
  // server actually imports.
  //
  // Opt-in rather than always-on because Netlify's Next runtime expects the
  // default output and adapts the build itself. Keeping it behind a flag means
  // the two targets can be deployed to from the same commit while the move off
  // Netlify is in progress.
  ...(process.env['BUILD_STANDALONE'] ? { output: 'standalone' as const } : {}),
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'sharp'],
  // PGlite is the development database and a devDependency. A production build
  // resolves it (devDependencies are installed at build time) and would copy
  // its ~30 MB WASM payload into every serverless function, where the code path
  // that loads it is unreachable because DATABASE_URL is always set.
  outputFileTracingExcludes: {
    '*': ['./node_modules/@electric-sql/pglite/**'],
  },
  experimental: {
    // Server Actions handle multipart uploads for product media.
    serverActions: { bodySizeLimit: '25mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

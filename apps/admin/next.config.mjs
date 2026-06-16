// apps/admin/next.config.mjs — Next.js 15 App Router config for Tax Portal (admin)
// ADR-006: Tax Portal lives in apps/admin (port 3001) — accountant-facing frontend
// ADR-007: Per-app container image; production platform deferred
// ADR-010: apps/admin has NO public routes — every path requires an authenticated ACCOUNTANT.
//          Auth middleware + role-gate land in TASK-004-002/-003.

// DECISION: Stub DATABASE_URL_ADMIN and DATABASE_URL at build time — mirrors apps/portal
// next.config.mjs pattern (lazy Prisma client requires stubs to avoid build-time env errors).
// Security: stubs are not real credentials and point at a non-existent endpoint.
if (!process.env["DATABASE_URL_ADMIN"]) {
  process.env["DATABASE_URL_ADMIN"] =
    "sqlserver://localhost/TaxPortal?user=build_stub&password=build_stub_not_real&trustServerCertificate=true";
}
if (!process.env["DATABASE_URL"]) {
  process.env["DATABASE_URL"] =
    "sqlserver://localhost/TaxPortal?user=build_stub&password=build_stub_not_real&trustServerCertificate=true";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // TODO (TASK-004-002): Add Clerk auth middleware config once the auth package lands.
  // ADR-010: All routes require ACCOUNTANT auth — no public routes beyond the sign-in surface.
  // The auth middleware will be wired here via the withClerkMiddleware pattern.

  // Baseline HTTP security headers (mirrors portal config; admin needs same baseline)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Transpile workspace packages that use ESM
  transpilePackages: ["@tax-portal/ui"],

  // Standalone output for Docker (apps/admin/Dockerfile copies server.js and static assets)
  // ADR-007: Per-app container image
  output: "standalone",

  // BUG-002-002: Ensure the Alpine/OpenSSL-3 Prisma query-engine binary is included in the
  // standalone output tree.  Next.js file-tracing follows require() calls — in the builder
  // stage (Debian/glibc), the native engine is loaded; the musl engine is never require()-d
  // and therefore not auto-traced.  outputFileTracingIncludes forces Next to include it.
  //
  // DECISION: outputFileTracingIncludes chosen over an explicit COPY --from=builder in the
  // Dockerfile because (a) this is the canonical Next.js/Prisma approach, (b) it keeps the
  // engine-inclusion contract visible in the app config, and (c) the Dockerfile already
  // COPYs the full standalone tree so once the engine is in the tree it ships correctly.
  // Fallback: if in-container verify shows the engine is missing post-build, add an explicit
  // COPY --from=builder of the .node file alongside the standalone COPY lines in the Dockerfile.
  outputFileTracingIncludes: {
    "**/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-linux-musl*.node",
      "../../node_modules/.pnpm/prisma*/node_modules/prisma/libquery_engine-linux-musl*.node",
    ],
  },

  // Next.js 15: serverExternalPackages prevents bundling DB/Prisma modules (Node.js-only)
  // NOTE: @tax-portal/auth is intentionally NOT externalized — it must be bundled
  // into the middleware (Edge Runtime) where tree-shaking removes Node.js-only paths.
  serverExternalPackages: ["@prisma/client", "prisma", "mssql", "@tax-portal/db"],

  /**
   * webpack config: externalize Node.js-only packages that cannot be bundled by webpack.
   * Mirrors portal next.config.mjs pattern for parity (ADR-006 / CLAUDE.md § Platform-frontend scope).
   */
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : config.externals
            ? [config.externals]
            : []),
        "@tax-portal/db",
        "@prisma/client",
        "mssql",
        "prisma",
      ];
    }
    return config;
  },
};

export default nextConfig;

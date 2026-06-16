// apps/portal/next.config.mjs — Next.js 15 App Router config
// ADR-014: Next.js 15, App Router, TypeScript
// ADR-006: Client Portal lives in apps/portal (port 3000)

// DECISION: Provide a stub DATABASE_URL_ADMIN for Next.js build-time env resolution.
//
// TASK-006 changed packages/db/src/client.ts to lazy/Proxy construction — PrismaClient
// instances are no longer created at module load time. However, Next.js static analysis
// (the data-collection worker that runs during `next build`) can still trigger module
// evaluation when traversing server component imports. The stub prevents any unexpected
// env-read at build time from surfacing as a config error.
//
// Security: the stub is not a real credential. It points to a non-existent endpoint
// and will fail immediately if any actual query is attempted during build.
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
  // ADR-003 / REQ-DOOR-004: The public services + request pages are anonymous.
  // No auth middleware wraps them — Clerk integration is deferred to EPIC-004.

  // Baseline HTTP security headers for the public-facing portal (PII intake page).
  // CSP is intentionally permissive on script-src/style-src for Next.js + Tailwind
  // inline styles; tighten nonce-based CSP in a subsequent hardening pass.
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

  // Standalone output for Docker (apps/portal/Dockerfile copies server.js and static assets)
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
  // Portal currently reads via the raw-mssql admin pool (no Prisma request path yet); this
  // preempts the identical Alpine/OpenSSL-3 trap the moment portal takes the Prisma path —
  // ADR-006 two-frontend parity requirement (BUG-002-002).
  // Fallback: if in-container verify shows the engine is missing post-build, add an explicit
  // COPY --from=builder of the .node file alongside the standalone COPY lines in the Dockerfile.
  outputFileTracingIncludes: {
    "**/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/libquery_engine-linux-musl*.node",
      "../../node_modules/.pnpm/prisma*/node_modules/prisma/libquery_engine-linux-musl*.node",
    ],
  },

  // Next.js 15: serverComponentsExternalPackages moved out of experimental.
  // Renamed to serverExternalPackages — prevents bundling DB/Prisma modules.
  // These are Node.js-only; they must not be webpack-bundled.
  // NOTE: @tax-portal/auth is intentionally NOT externalized — it must be bundled
  // into the middleware (Edge Runtime) where tree-shaking removes Node.js-only paths.
  serverExternalPackages: ["@prisma/client", "prisma", "mssql", "@tax-portal/db"],

  /**
   * webpack config: externalize Node.js-only packages that cannot be bundled by webpack.
   *
   * DECISION: @tax-portal/db, @prisma/client, and mssql are Node.js-only packages.
   * Using webpack `externals` in addition to `serverComponentsExternalPackages` for
   * defense in depth — workspace packages resolved via pnpm symlinks may not be
   * matched by package name alone.
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

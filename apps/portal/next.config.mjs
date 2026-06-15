// apps/portal/next.config.mjs — Next.js 14 App Router config
// ADR-014: Next.js 14, App Router, TypeScript
// ADR-006: Client Portal lives in apps/portal (port 3000)

// DECISION: Provide a stub DATABASE_URL_ADMIN for Next.js build-time env resolution.
//
// packages/db/src/client.ts creates PrismaClient instances at module load time
// (not lazily). When webpack or the Node.js data-collection worker loads @tax-portal/db,
// the Prisma constructor throws "Invalid value undefined for datasource" if
// DATABASE_URL_ADMIN is unset.
//
// Setting a valid-format stub here ensures the Prisma client can be constructed
// without a real DB connection. Real connections only happen at request time, where
// the runtime environment provides the actual DATABASE_URL_ADMIN (from docker-compose
// or .env.local). This pattern is consistent with the standard Prisma + Next.js
// monorepo guidance.
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

  // Transpile workspace packages that use ESM
  transpilePackages: ["@tax-portal/ui"],

  // Standalone output for Docker (apps/portal/Dockerfile copies server.js and static assets)
  // ADR-007: Per-app container image
  output: "standalone",

  experimental: {
    // Next.js 14 server component external packages — prevents bundling DB/Prisma modules.
    // These are Node.js-only; they must not be webpack-bundled.
    serverComponentsExternalPackages: ["@prisma/client", "prisma", "mssql", "@tax-portal/db"],
  },

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

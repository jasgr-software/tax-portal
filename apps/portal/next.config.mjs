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
    // DECISION (TASK-007-006): The ADR-009 signed-URL pipeline has the browser PUT bytes
    // directly to the storage endpoint (never proxied through the portal). This requires
    // the storage endpoint's origin to be allowed in connect-src.
    //
    // The connect-src directive must allow:
    //   - 'self'                            — same-origin requests (portal server actions, APIs)
    //   - https://*.blob.core.windows.net   — Azure Blob Storage (production)
    //   - http://localhost:10000            — Azurite emulator (local dev / e2e only, env-gated)
    //
    // BLOB_PUBLIC_ENDPOINT (optional env var): when set at build time, its origin is also
    // included. This covers cases where the local dev endpoint differs from localhost:10000.
    //
    // Note: `routes-manifest.json` is compiled at `next build` time. `headers()` is called
    // during the build to produce the static manifest. Therefore BLOB_PUBLIC_ENDPOINT must
    // be available at build time to appear in the manifest.
    //
    // m2 fix: the localhost:10000 origin is now env-gated — only added when NODE_ENV is not
    // "production". In a production build NODE_ENV=production, so the Azurite origin is omitted
    // from the shipped CSP. Local dev / CI e2e always sets NODE_ENV=development.
    const isProduction = process.env["NODE_ENV"] === "production";
    const blobPublicEndpoint = process.env["BLOB_PUBLIC_ENDPOINT"];
    let extraConnectSrc = "";
    if (blobPublicEndpoint) {
      try {
        const { origin } = new URL(blobPublicEndpoint);
        // Only add if not already 'self' or already in the base set
        if (origin !== "http://localhost:10000") {
          extraConnectSrc = ` ${origin}`;
        }
      } catch {
        // Malformed BLOB_PUBLIC_ENDPOINT — ignore
      }
    }
    // Include the Azurite localhost origin only in non-production builds.
    const localhostConnectSrc = isProduction ? "" : " http://localhost:10000";
    const connectSrcOrigins = `'self'${localhostConnectSrc} https://*.blob.core.windows.net${extraConnectSrc}`;

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
              `connect-src ${connectSrcOrigins}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Transpile workspace packages that use ESM
  // @tax-portal/realtime is imported by NotificationBadgeClient ("use client") — must transpile
  // so webpack can bundle it for the browser. Without this, ESM imports fail in the browser bundle
  // (EPIC-016 / TASK-016-005: NotificationBadgeClient.tsx).
  transpilePackages: ["@tax-portal/ui", "@tax-portal/realtime"],

  // DECISION-016-005b-RT (TASK-016-005b / ADR-023):
  // Expose the real-time transport selector vars to the browser bundle via the NEXT_PUBLIC_ prefix.
  //
  // Next.js only inlines env vars with the NEXT_PUBLIC_ prefix into the browser bundle at build time.
  // The server-side vars (REALTIME_PROVIDER, ALLOW_MOCK_REALTIME) are NOT available in the browser;
  // without NEXT_PUBLIC_ variants, the browser always sees undefined for these vars and the selector
  // defaults to the SupabaseRealtimeTransport stub (which throws at subscribe() time — BUG-016-001).
  //
  // The selector (packages/realtime/src/select.ts) reads NEXT_PUBLIC_* as a fallback when the
  // server-side var is absent — i.e. in the browser context. The server path continues reading the
  // non-prefixed vars. This is the minimal exposure needed for the browser to reach the mock transport.
  //
  // SECURITY (ADR-023 §4):
  //   - These are NOT secrets — they are transport selector values.
  //   - The mock binding is only reachable when ALLOW_MOCK_REALTIME=true is also set.
  //   - A real production deployment sets REALTIME_PROVIDER=supabase-realtime and leaves
  //     ALLOW_MOCK_REALTIME unset (never sets NEXT_PUBLIC_ALLOW_MOCK_REALTIME=true in production).
  //   - The fail-closed guard in select.ts remains: REALTIME_PROVIDER=mock without ALLOW_MOCK_REALTIME
  //     throws. The browser variant inherits the same guard via the NEXT_PUBLIC_ vars.
  //
  // Both NEXT_PUBLIC_REALTIME_PROVIDER and NEXT_PUBLIC_ALLOW_MOCK_REALTIME must be set as Docker
  // build ARGs in apps/portal/Dockerfile and passed via docker-compose.yml build.args so they are
  // available to `next build` and inlined into the browser bundle.
  //
  // IMPORTANT: Do NOT use `?? ""` fallback here. An empty string would be treated as a valid
  // provider value and cause the "Unknown REALTIME_PROVIDER" throw in the browser. If the vars
  // are not set at build time, let them be undefined — the selector then defaults to
  // SupabaseRealtimeTransport (stub), which throws RealtimeBindingNotAvailableError at
  // subscribe() time and is caught gracefully in NotificationBadgeClient.tsx. // ADR-023
  //
  // ADR-023 // DECISION-016-005b-RT // CS-GEN-003
  env: {
    NEXT_PUBLIC_REALTIME_PROVIDER: process.env["NEXT_PUBLIC_REALTIME_PROVIDER"],
    NEXT_PUBLIC_ALLOW_MOCK_REALTIME: process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"],
  },

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

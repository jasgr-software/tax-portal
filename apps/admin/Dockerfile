# apps/admin/Dockerfile — Tax Portal (accountant-facing) container image
#
# ADR-007: Per-app image (deploy-agnostic; production platform deferred).
# ADR-006: Tax Portal (admin) runs on port 3001 — accountant-facing frontend.
# Multi-stage build:
#   base      — common Node.js + pnpm setup
#   deps      — install ALL workspace dependencies (needed for cross-workspace imports)
#   builder   — build the Next.js app
#   runner    — minimal runtime image
#
# Build context: repo root (docker compose build from the root)
# Usage (from repo root):
#   docker compose build admin
#   docker compose up -d admin

ARG NODE_VERSION=20-alpine
FROM node:${NODE_VERSION} AS base
WORKDIR /repo
# Install pnpm globally
RUN npm install -g pnpm@9.15.9

# ─── deps ──────────────────────────────────────────────────────────────────────
# Install all workspace dependencies (monorepo)
FROM base AS deps
# Copy manifests for all packages the admin app depends on
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/email/package.json ./packages/email/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY apps/admin/package.json ./apps/admin/package.json
# Install — frozen lockfile for reproducibility
RUN pnpm install --frozen-lockfile

# ─── builder ───────────────────────────────────────────────────────────────────
FROM deps AS builder
# DECISION-016-005b-RT (TASK-016-005b / ADR-023): NEXT_PUBLIC_* browser-bundle vars.
# These must be available at `next build` time so Next.js inlines them into the static
# browser bundle. They cannot be injected at container-start time (runtime `environment:`
# vars arrive after the bundle is compiled). Passed as docker-compose build args.
# Values default to "mock"/"true" for local/e2e builds; leave unset in production to
# preserve the fail-closed posture (browser defaults to SupabaseRealtimeTransport stub). // ADR-023
ARG NEXT_PUBLIC_REALTIME_PROVIDER
ARG NEXT_PUBLIC_ALLOW_MOCK_REALTIME
ENV NEXT_PUBLIC_REALTIME_PROVIDER=${NEXT_PUBLIC_REALTIME_PROVIDER}
ENV NEXT_PUBLIC_ALLOW_MOCK_REALTIME=${NEXT_PUBLIC_ALLOW_MOCK_REALTIME}
# Copy all source needed for the build
COPY packages/ ./packages/
COPY apps/admin/ ./apps/admin/
COPY prisma/ ./prisma/
# Generate Prisma client
RUN pnpm prisma generate
# Build packages/ui first (apps/admin depends on it)
RUN pnpm --filter @tax-portal/ui build
# Build packages/db
RUN pnpm --filter @tax-portal/db build
# Build packages/auth (provides middleware + redirect helper)
RUN pnpm --filter @tax-portal/auth build
# Build packages/email (transactional email seam — TASK-003-002/REQ-NFR-008)
RUN pnpm --filter @tax-portal/email build
# Build the admin app (NEXT_PUBLIC_* ENV vars set above are inlined into the browser bundle)
RUN pnpm --filter admin build

# ─── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# BUG-002-002: Alpine runner (node:20-alpine) ships only libssl.so.3; the default musl Prisma
# engine (linux-musl.so.node) requires libssl.so.1.1 which is absent on Alpine.
# PRISMA_QUERY_ENGINE_LIBRARY forces the runtime to load the linux-musl-openssl-3.0.x engine
# from a stable, version-independent path (/app/.prisma/client/).
# Without this, Prisma's OpenSSL auto-detection on Alpine defaults to "openssl-1.1.x" and
# tries to dlopen linux-musl.so.node → libssl.so.1.1 not found → PrismaClientInitializationError.
# DECISION (BUG-002-002): Three-layer fix:
#   1. binaryTargets (prisma/schema.prisma) — generates the linux-musl-openssl-3.0.x engine
#   2. outputFileTracingIncludes (next.config.mjs) — ensures the engine ships in the standalone tree
#   3. PRISMA_QUERY_ENGINE_LIBRARY (here) — overrides Alpine's 1.1.x default detection
# The engine is COPY-d below from the pnpm store to a stable path to avoid fragile version-hashed paths.
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Create non-root user for security (mirrors portal Dockerfile pattern)
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copy built app artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/public ./apps/admin/public

# BUG-002-002: Copy the linux-musl-openssl-3.0.x Prisma engine to a stable path.
# The standalone tree (above) already includes this engine via outputFileTracingIncludes, but
# we also place it at /app/.prisma/client/ (the path PRISMA_QUERY_ENGINE_LIBRARY points to)
# so the explicit override loads from a non-pnpm-hashed, version-stable location.
# Source: the pnpm-generated .prisma/client/ inside the builder's node_modules store.
# If the Prisma version changes, update the source path to match the new @prisma+client version.
RUN mkdir -p /app/.prisma/client && chown nextjs:nodejs /app/.prisma /app/.prisma/client
COPY --from=builder --chown=nextjs:nodejs \
  /repo/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node \
  /app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3001/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["node", "apps/admin/server.js"]

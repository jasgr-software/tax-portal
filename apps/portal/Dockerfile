# apps/portal/Dockerfile — Client Portal container image
#
# ADR-007: Per-app image (deploy-agnostic; production platform deferred).
# ADR-006: Client Portal runs on port 3000.
# Multi-stage build:
#   base      — common Node.js + pnpm setup
#   deps      — install ALL workspace dependencies (needed for cross-workspace imports)
#   builder   — build the Next.js app
#   runner    — minimal runtime image
#
# Build context: repo root (docker compose build from the root)
# Usage (from repo root):
#   docker compose build portal
#   docker compose up -d portal

ARG NODE_VERSION=20-alpine
FROM node:${NODE_VERSION} AS base
WORKDIR /repo
# Install pnpm globally
RUN npm install -g pnpm@9.15.9

# ─── deps ──────────────────────────────────────────────────────────────────────
# Install all workspace dependencies (monorepo)
FROM base AS deps
# Copy manifests for all packages the portal depends on
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/email/package.json ./packages/email/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY apps/portal/package.json ./apps/portal/package.json
# Install — frozen lockfile for reproducibility
RUN pnpm install --frozen-lockfile

# ─── builder ───────────────────────────────────────────────────────────────────
FROM deps AS builder
# Copy all source needed for the build
COPY packages/ ./packages/
COPY apps/portal/ ./apps/portal/
COPY prisma/ ./prisma/
# Generate Prisma client
RUN pnpm prisma generate
# Build packages/ui first (apps/portal depends on it)
RUN pnpm --filter @tax-portal/ui build
# Build packages/db
RUN pnpm --filter @tax-portal/db build
# Build packages/auth (provides middleware + redirect helper)
RUN pnpm --filter @tax-portal/auth build
# Build packages/email (transactional email seam — TASK-003-002/REQ-NFR-008)
RUN pnpm --filter @tax-portal/email build
# Build the portal app
RUN pnpm --filter portal build

# ─── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# BUG-002-002: Alpine runner (node:20-alpine) ships only libssl.so.3; the default musl Prisma
# engine (linux-musl.so.node) requires libssl.so.1.1 which is absent on Alpine.
# PRISMA_QUERY_ENGINE_LIBRARY forces the runtime to load the linux-musl-openssl-3.0.x engine
# from a stable, version-independent path (/app/.prisma/client/).
# Without this, Prisma's OpenSSL auto-detection on Alpine defaults to "openssl-1.1.x" and
# tries to dlopen linux-musl.so.node → libssl.so.1.1 not found → PrismaClientInitializationError.
# Portal currently reads via the raw-mssql admin pool (no Prisma request path yet); this
# preempts the identical Alpine/OpenSSL-3 trap the moment portal takes the Prisma path —
# ADR-006 two-frontend parity requirement (BUG-002-002).
# DECISION (BUG-002-002): see apps/admin/Dockerfile for full rationale (three-layer fix).
# The engine is COPY-d below from the pnpm store to a stable path.
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copy built app artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/public ./apps/portal/public

# BUG-002-002: Copy the linux-musl-openssl-3.0.x Prisma engine to a stable path.
# See apps/admin/Dockerfile for full rationale. Same pattern for ADR-006 parity.
# If the Prisma version changes, update the source path to match the new @prisma+client version.
RUN mkdir -p /app/.prisma/client && chown nextjs:nodejs /app/.prisma /app/.prisma/client
COPY --from=builder --chown=nextjs:nodejs \
  /repo/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node \
  /app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["node", "apps/portal/server.js"]

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
# Build the portal app
RUN pnpm --filter portal build

# ─── runner ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copy built app artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/portal/public ./apps/portal/public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["node", "apps/portal/server.js"]

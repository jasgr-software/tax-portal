# ADR-006: Monorepo Layout

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-004 (Prisma ORM), ADR-005 (RLS via Security Policies), ADR-007 (Container packaging), ADR-008 (Object storage abstraction)

## Context

The portal is a single web application (Next.js 14, App Router — REQ-NFR-003, REQ-NFR-004) plus supporting infrastructure. There is no second app in v1 (no mobile, no admin-only console, no public API). However, several concerns want their own package boundary for ergonomic and enforcement reasons:

- **DB layer** — Prisma client wrapper, admin-client factory, `SESSION_CONTEXT` middleware, raw SQL escape hatches. Must be import-boundaried from the rest of the app (ADR-003 §6, ADR-004) so ESLint rules can police `adminDb` usage.
- **Storage adapter layer** — port-and-adapter `FileStorage` interface (ADR-008). Clean separation so the adapter can be swapped without touching callers.
- **Email templates** — reserved surface for Phase 2+ when email flows start landing. Isolated so template changes don't rebuild the whole web app.
- **Raw SQL** — Prisma migrations, security policies, seed data. Separate from TypeScript code entirely.
- **Operational scripts** — migration runner, smoke test, gate validator. Separate from app code so they can be run outside of a Next.js context.

The monorepo tool choice is a separate question. The options are: pnpm workspaces (no build orchestrator), Turborepo (caching + task graph on top of pnpm), Nx (opinionated build/test orchestrator with plugins).

## Decision

**pnpm workspaces with the layout below, no build orchestrator in v1.** Turborepo and Nx are revisited at Phase 5 if build-cache pressure emerges (multi-app expansion, long CI build times, or cross-package incremental-build needs).

### Directory layout

```
tax-portal/
  apps/
    web/                          # Next.js 14 app — the only app in v1
      src/
        app/                      # App Router
        components/
        lib/
        middleware.ts             # Clerk session verification + withRequestContext
      e2e/                        # Playwright suites
      public/
      playwright.config.ts
      next.config.mjs
      package.json                # name: @tax-portal/web
  packages/
    db/                           # Prisma client + admin split + SESSION_CONTEXT middleware
      src/
        client.ts                 # db (request pool, $extends wrapper), adminDb, withClerkIdentity
        context.ts                # AsyncLocalStorage-backed request context helpers
        sql/                      # Raw SQL escape-hatch queries (typed wrappers around $queryRaw)
      package.json                # name: @tax-portal/db
    storage/                      # FileStorage port-and-adapter (ADR-008)
      src/
        types.ts                  # FileStorage interface
        adapters/
          azurite.ts              # Dev adapter (Azure Blob API against local Azurite)
          memory.ts               # Test adapter
      package.json                # name: @tax-portal/storage
    emails/                       # React Email templates (reserved — empty until Phase 2)
      src/
      package.json                # name: @tax-portal/emails
    eslint-config/                # Shared ESLint config (including import-boundary rules)
      index.js
      package.json                # name: @tax-portal/eslint-config
    tsconfig/                     # Shared tsconfig bases
      base.json
      nextjs.json
      package.json                # name: @tax-portal/tsconfig
  prisma/
    schema.prisma                 # Schema source of truth (ADR-002, ADR-004)
    migrations/                   # Prisma-generated migrations (Track A)
  db/
    migrations/                   # Raw SQL migrations (Track B) — 0001-*.sql, 0002-*.sql, ...
    policies/                     # Security policies + predicate functions (ADR-005)
    seed/                         # Dev-only seed scripts
  scripts/
    db-migrate.ts                 # Track A + Track B runner (ADR-002 § Migration tracks)
    smoke-test.sh                 # Container smoke harness (phase Smoke)
    validate-gates.sh             # Programmatic gate-validation backstop (agent-stack.md)
    validate-policies.ts          # RLS-policy-coverage drift detector (ADR-005 § Migration track)
  infra/                          # Reserved — empty in v1 (no IaC; deploy platform deferred, ADR-007)
  docs/
    architecture/                 # C4 + TENETS (SA-owned)
    decisions/                    # ADRs (SA-owned)
    requirements/                 # SRS + epics (RA-owned)
    tasks/                        # PROGRESS.md + TASK / BUG files
    operations/                   # inventory.md + runbook.md (DevOps-owned)
    plans/                        # release-roadmap.md (RA-owned)
  agents/                         # Agent role definitions (.md)
  .claude/                        # Agent stack + phases + status files
  docker-compose.yml              # Local dev stack (SQL Server, Azurite, Docuseal later)
  pnpm-workspace.yaml
  package.json                    # Root — workspace manager, shared scripts
  tsconfig.json                   # Root — only composite references
  .env.example
  CLAUDE.md
  README.md                       # Only if requested later
```

### Rationale per package

- **`apps/web`** — the only Next.js app. A second app (admin-only, marketing site) is not justified for v1. If the public services page ever decouples into a separate static site, a new `apps/marketing` is cheap to add; until then, it lives inside `apps/web` under a public route group.
- **`packages/db`** — owns ADR-003 / ADR-004 contracts. Exports exactly `db`, `adminDb`, `withClerkIdentity`, and the escape-hatch `sql` barrel. Nothing else. The import-boundary ESLint rule forbids `adminDb` outside of webhooks, scripts, jobs, and seeds.
- **`packages/storage`** — owns ADR-008's `FileStorage` interface and adapters. Importers get the interface type only (no adapter leakage) — adapter binding happens at app startup.
- **`packages/emails`** — reserved for Phase 2. Empty now. Exists in the repo so the directory boundary is established before the first template PR — avoids a "why is email buried in apps/web" debate later. No package.json scaffolding drift — it ships with a minimal `package.json` declaring no code.
- **`packages/eslint-config`** — shared lint config, including the import-boundary rules that enforce ADR-003 / ADR-004 / ADR-008 boundaries.
- **`packages/tsconfig`** — shared tsconfig bases for composite project references. Prevents tsconfig drift between `apps/` and `packages/`.
- **`prisma/schema.prisma`** at the root, not under `packages/db/` — Prisma's CLI expects certain paths at the root level (e.g., `.env` resolution for `DATABASE_URL`) and a root-level `prisma/` is the path-of-least-friction convention. The generated client lives under `node_modules/.prisma/client` and is re-exported through `packages/db`.
- **`db/migrations/`, `db/policies/`, `db/seed/`** — raw SQL territory. Numeric-prefix filenames (`0001-initial.sql`, `0002-add-user-indexes.sql`). `scripts/db-migrate.ts` is the only runner; it records applied files in a `__db_migrations` bookkeeping table (ADR-002).
- **`scripts/`** — operational scripts written in TypeScript (tsx) and bash. `db-migrate.ts`, `smoke-test.sh`, `validate-gates.sh` (already referenced in agent-stack.md), `validate-policies.ts`.
- **`infra/`** — reserved. No IaC in v1; the deploy platform is deferred (ADR-007). When the deployment decision lands, IaC (Bicep / Terraform / Pulumi — TBD) lives here. Keeping the directory empty but named avoids renaming pressure later.
- **`docker-compose.yml`** at the repo root, not under `infra/` — it's a dev-environment artifact, not prod infra, and developers expect it at the root per Docker convention.

### Tooling choices within the workspace

- **Package manager:** pnpm ≥ 9. Lockfile `pnpm-lock.yaml` checked in. No `npm install` or `yarn` usage — enforced by a `preinstall` check that exits if `$npm_execpath` is not pnpm.
- **Node version:** pinned in `.nvmrc` and `package.json` `engines.node`. v20 LTS for the duration of v1. Bumped deliberately when v22 LTS is mature and the Prisma / Next.js / mssql stack supports it.
- **TypeScript:** single major version across the workspace (no per-package drift). Pinned; bumped in a dedicated PR that re-runs the full gate.
- **ESLint / Prettier:** single config in `packages/eslint-config` and root-level `.prettierrc`. Prettier runs via pre-commit hook.
- **Testing:** Vitest at the package level (`packages/db`, `packages/storage`). Vitest + React Testing Library at `apps/web`. Playwright at `apps/web/e2e`. No cross-package test runner — each package runs its own, and the root `pnpm test` fans out.
- **Build:** Next.js builds `apps/web`; `tsc` builds `packages/*`. No Turbo in v1 — a root `pnpm build` script does `pnpm -r --filter ./packages/... build && pnpm --filter web build`.

### Rejected: Turborepo / Nx in v1

**Turborepo.** Real benefits kick in with 3+ apps and 5+ packages where remote cache and task-graph parallelism pay for themselves. In v1 we have 1 app and 5 packages (2 of which are config-only, 1 reserved). The overhead of teaching agents to read `turbo.json` outweighs the modest cache win. Revisit at Phase 5 if CI time exceeds ~8 minutes or if the app count grows.

**Nx.** Heavier than Turbo with a larger conceptual footprint (generators, executors, plugins). Overkill for v1. Nothing Nx solves for us that pnpm workspaces + a few bash scripts don't.

## Alternatives considered

### Single-app flat layout (no `packages/`)

All code under `apps/web/src/`, including DB access and storage adapters. Rejected:

- Loses the import-boundary ESLint enforcement that ADR-003 / ADR-004 / ADR-008 lean on.
- No clean way to share the storage adapter interface with future tooling (cron scripts, data-migration one-shots).
- Blurs ownership — the `packages/db` boundary is a forcing function for "this is where data access lives."

### Nested packages inside `apps/web` (e.g., `apps/web/src/packages/`)

Compromise — keep the conceptual separation but avoid the top-level `packages/` directory. Rejected: ESLint import-boundary rules are cleaner when packages are top-level workspace members with distinct `package.json` files. Nested pseudo-packages make the boundary less enforceable.

### Separate repos per package

Polyrepo. Not considered seriously — solo-developer team, agent-driven, cross-package PRs common. Monorepo is the right default.

### Prisma schema under `packages/db/prisma/` instead of root `prisma/`

Technically workable but fights Prisma's defaults (it expects `prisma/schema.prisma` next to the `.env` it'll read for `DATABASE_URL`). The workaround (`PRISMA_SCHEMA_PATH=...` everywhere) outweighs the aesthetic gain.

### Raw SQL directories (`db/`) inside `packages/db/`

Keeps all DB concerns under one package. Rejected because `scripts/db-migrate.ts` lives in `scripts/`, not `packages/db/`, and the migration runner operates on paths. Splitting `db/` (SQL files) from `packages/db/` (TypeScript) matches the runner's shape — SQL files are data, not code.

## Consequences

- **Package boundaries are real.** Agents asked to modify data-access code know to edit `packages/db/`. Agents asked to add a storage adapter know to edit `packages/storage/`. Nothing is hidden in `apps/web/src/lib/`.
- **Empty reserved directories cost nothing.** `packages/emails/` and `infra/` exist and are gitignored at the content level (via `.gitkeep`) so the conventions are visible without implying presence. They are renamed or populated when their phase arrives.
- **No build-orchestrator learning curve.** Developer agents only need to know `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm --filter <pkg> <cmd>`. No `turbo run ...` syntax. If CI time grows, Turbo joins with a single PR — the existing `package.json` scripts become Turbo tasks with minimal change.
- **Monorepo tooling is revisitable.** The pnpm workspace shape is deliberately Turbo-compatible (top-level `packages/`, clean `package.json` per package, no cross-package ambient deps). A future Turbo adoption is a diff, not a rewrite.
- **Dependency versioning.** Shared deps (`typescript`, `vitest`, `@types/node`) are pinned once at the root `package.json` and referenced by workspace packages. Prevents the "which TypeScript version does this package use" trap.
- **Migration scripts are discoverable.** `scripts/db-migrate.ts`, `scripts/smoke-test.sh`, `scripts/validate-gates.sh` live under one roof. CI and local-dev workflows reference them by relative path from the repo root.
- **The `packages/db` choke point is enforceable.** The ESLint rule that blocks direct `PrismaClient` instantiation outside `packages/db/src/` lives in `packages/eslint-config/`. All workspaces extend that config, so the rule fires identically in every package.
- **Scaling path known.** If/when a second app arrives (admin console, marketing site, native-shell wrapper), the `apps/` directory absorbs it. If shared UI emerges, `packages/ui/` joins the family. The conventions don't bend.

## Related

- **ADR-002** — SQL Server; defines `db/migrations/` usage and connection-string env vars.
- **ADR-003** — `SESSION_CONTEXT`; defines what lives in `packages/db/src/client.ts`.
- **ADR-004** — Prisma ORM; defines what `packages/db/` exports and what ESLint rules are enforced at the boundary.
- **ADR-005** — RLS via Security Policies; defines `db/policies/` directory.
- **ADR-007** — Container packaging; defines why `infra/` is reserved but empty.
- **ADR-008** — Object storage abstraction; defines `packages/storage/` shape.
- **CLAUDE.md** — Agent team table and domain-specific directory assignments; mirrors this layout.

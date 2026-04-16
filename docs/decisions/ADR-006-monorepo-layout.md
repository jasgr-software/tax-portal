# ADR-006: Monorepo Layout

**Status:** Accepted
**Date:** 2026-04-16 (revised 2026-04-16 — two-frontend split)
**Deciders:** SA (with user direction)
**Related:** ADR-001 (Clerk authentication), ADR-002 (SQL Server), ADR-004 (Prisma ORM), ADR-005 (RLS via Security Policies), ADR-007 (Container packaging), ADR-008 (Object storage abstraction), ADR-010 (Cross-app navigation & session boundaries)

## Context

The portal is delivered as **two Next.js 14 (App Router) front ends** that together realise the product:

- **Client Portal** — public services/request page, client account experience (onboarding, file exchange, messaging, history). User-facing brand: "Client Portal."
- **Tax Portal** — accountant-facing app (dashboard, client/engagement management, admin UI for services catalog, intake templates, engagement letter template, pipeline view). User-facing brand: "Tax Portal."

This replaces the prior single-app layout. The split is driven by:

- **Different audiences, different threat models.** The public front door and client experience vs. the admin surface have different attack surfaces, ingress patterns, and uptime tolerances. Splitting lets us size, scale, and lock them down independently.
- **Different change velocity.** Client-facing polish and accountant-workflow iteration move on different cadences. Deploying the admin UI should not require redeploying the public front door.
- **Clean role boundary.** Middleware on `apps/admin` can hard-block non-ACCOUNTANT roles at the app edge. Middleware on `apps/portal` blocks ACCOUNTANT from client-only deep links. The two apps never contain each other's role UI.
- **Operational clarity.** Each app has its own image, its own health endpoints, its own logs, its own metrics. Debugging a client-side incident never requires sifting through accountant traffic.

Shared concerns — DB access, storage adapter, email templates, shared UI primitives — live in `packages/` and are consumed by both apps. The monorepo tool choice (pnpm vs Turborepo vs Nx) is revisited below now that there are two apps.

## Decision

**pnpm workspaces with the two-app layout below, no build orchestrator in v1.** Turborepo is now a stronger candidate (two apps plus 5 packages changes the cache math); it is explicitly revisited at Phase 5 or sooner if CI build time exceeds ~10 minutes.

### Directory layout

```
tax-portal/
  apps/
    portal/                       # Client-facing Next.js app — "Client Portal"
      src/
        app/                      # App Router — public services + signed-in client routes
        components/
        lib/
        middleware.ts             # Clerk session verification + role gate (blocks non-CLIENT) + withRequestContext
      e2e/                        # Playwright suites scoped to client flows
      public/
      playwright.config.ts
      next.config.mjs
      Dockerfile                  # Per-app image (see ADR-007)
      package.json                # name: @tax-portal/portal
    admin/                        # Accountant-facing Next.js app — "Tax Portal"
      src/
        app/                      # App Router — dashboard, admin UI, engagement management
        components/
        lib/
        middleware.ts             # Clerk session verification + role gate (blocks non-ACCOUNTANT) + withRequestContext
      e2e/                        # Playwright suites scoped to accountant flows
      public/
      playwright.config.ts
      next.config.mjs
      Dockerfile                  # Per-app image (see ADR-007)
      package.json                # name: @tax-portal/admin
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
    ui/                           # Shared shadcn/ui primitives + layout shells (see § packages/ui below)
      src/
        primitives/               # Button, Input, Dialog, etc. (shadcn-generated, app-neutral)
        layouts/                  # AppShell, Nav skeletons (thin, per-app composition on top)
      package.json                # name: @tax-portal/ui
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
    smoke-test.sh                 # Container smoke harness — brings up both apps (phase Smoke)
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
  docker-compose.yml              # Local dev stack (SQL Server, Azurite, both apps, Docuseal later)
  pnpm-workspace.yaml
  package.json                    # Root — workspace manager, shared scripts
  tsconfig.json                   # Root — only composite references
  .env.example
  CLAUDE.md
```

### Port assignments (local dev)

| App                      | Port  | URL                      | Role gate           |
| ------------------------ | ----- | ------------------------ | ------------------- |
| `apps/portal` (Client Portal) | 3000 | `http://localhost:3000`  | Public + CLIENT     |
| `apps/admin` (Tax Portal)     | 3001 | `http://localhost:3001`  | ACCOUNTANT only     |

Port 3000 is the lower-number default and goes to the public-facing app (convention: unauth'd prospective clients land here first). Port 3001 is the admin app. These are baked into `.env.example`, the root `pnpm dev` composite script, and the Playwright base URLs.

### App names

`apps/portal` and `apps/admin` were chosen over alternatives (`apps/client` + `apps/accountant`, `apps/public` + `apps/admin`, `apps/web` + `apps/admin`) for these reasons:

- **`portal`** (not `client`) — reads as "the thing the client uses" rather than a technical role label. Avoids confusion with the Prisma `CLIENT` enum value and with the term "API client." Matches the product-facing name "Client Portal."
- **`admin`** (not `accountant` or `tax`) — shortest unambiguous name for the accountant app. Matches the directory's role in any future SaaS expansion ("admin" generalises cleanly if a second staff tier is ever added; "accountant" would need renaming).
- The user-facing brand names ("Client Portal," "Tax Portal") are decoupled from the directory names. Rebranding does not require repo surgery.

### Rationale per package

- **`apps/portal`** — client-facing. Owns the public services page, engagement request form, sign-in / sign-up landing, client dashboard, onboarding flow, document exchange, messaging. Covers REQ-DOOR-\*, REQ-ONBD-\*, client sides of REQ-FILE-\* and REQ-MSG-\*, REQ-IDNT-\*. Middleware blocks non-CLIENT roles with a redirect (see ADR-010).
- **`apps/admin`** — accountant-facing. Owns the accountant dashboard, client/engagement management, pipeline view, services catalog admin, intake template admin, engagement letter template admin, accountant sides of REQ-FILE-\* and REQ-MSG-\*. Middleware blocks non-ACCOUNTANT roles (ADR-010).
- **`packages/db`** — owns ADR-003 / ADR-004 contracts. Exports exactly `db`, `adminDb`, `withClerkIdentity`, and the escape-hatch `sql` barrel. Consumed by both apps identically — every request in both apps goes through `withClerkIdentity` before touching data.
- **`packages/storage`** — owns ADR-008's `FileStorage` interface and adapters. Both apps bind the same adapter at startup.
- **`packages/emails`** — reserved for Phase 2. Both apps send email through the same template set (invitation from Clerk is an exception, owned by Clerk).
- **`packages/ui`** — **in v1.** See § `packages/ui` decision below.
- **`packages/eslint-config`** — shared lint config, including import-boundary rules that enforce ADR-003 / ADR-004 / ADR-008 boundaries.
- **`packages/tsconfig`** — shared tsconfig bases for composite project references.
- **`prisma/schema.prisma`** at the root — Prisma's CLI expects root-level paths. The generated client is re-exported through `packages/db`, consumed by both apps.
- **`db/migrations/`, `db/policies/`, `db/seed/`** — raw SQL territory. Unchanged. One schema, one policy set, two apps reading it.
- **`scripts/`** — `db-migrate.ts`, `smoke-test.sh` (now brings up both apps), `validate-gates.sh`, `validate-policies.ts`. `smoke-test.sh` probes `/healthz` on both apps.
- **`infra/`** — reserved. No IaC in v1; production deployment platform deferred (ADR-007). When IaC lands, it provisions **two** container workloads, not one.
- **`docker-compose.yml`** at the root — now brings up both `portal` and `admin` services alongside SQL Server, Azurite, and (eventually) Docuseal + mail catcher.

### `packages/ui` — in v1

A shared `packages/ui` package **exists in v1** and holds shadcn/ui primitive components plus thin layout shells. Rationale:

- **Two apps, same design system.** Both apps are shadcn/ui on Tailwind (REQ-NFR-004). Duplicating component code across `apps/portal/src/components/ui/` and `apps/admin/src/components/ui/` is drift-in-waiting — a Button gets tweaked in one and diverges.
- **Low risk, small surface.** Shadcn primitives are small, framework-stable, and rarely change shape. A shared package is cheap.
- **What lives there.** Pure presentational primitives (Button, Input, Dialog, Popover, Select, Tabs, Toast, etc.) and thin layout skeletons (AppShell, TopNav frame, SideNav frame) that each app composes around its own content. **App-specific components stay in the app** — the accountant dashboard's `EngagementPipelineBoard` belongs in `apps/admin/src/components/`, not here.
- **What does not live there.** No business logic. No data fetching. No route-specific components. No server actions. The boundary is: if it imports from `@tax-portal/db`, it is not in `packages/ui`.
- **Styling contract.** `packages/ui` ships Tailwind class-based components. Tailwind config extends a shared preset from `packages/ui`; both apps extend that preset. CSS variable–based theming lives at the app level so the two apps can diverge visually (Client Portal and Tax Portal can have different palette accents without a package version bump).
- **Versioning.** Workspace-linked (`workspace:*`). No semver management — both apps consume the current working copy.

The trade-off: any UI-package change forces re-verification of both apps' e2e. Acceptable — the primitives rarely change, and when they do, both apps genuinely should be revalidated.

### Playwright strategy — two configs, shared docker-compose stack

**Each app carries its own Playwright configuration** (`apps/portal/playwright.config.ts`, `apps/admin/playwright.config.ts`) with its own `e2e/` directory. The two configurations share the same running docker-compose stack (which includes both app containers) as the system under test.

Why two configs, not one:

- **Scoped runs.** `pnpm --filter portal e2e:run` runs only client-side e2e; `pnpm --filter admin e2e:run` runs only accountant-side. Targeted e2e per PR is shorter and easier to read.
- **Different base URLs.** `apps/portal` Playwright points at `http://localhost:3000`; `apps/admin` at `http://localhost:3001`. A single config with both base URLs is possible but ugly — Playwright's project-per-base-URL pattern requires each spec to name its project, leaks routing concerns into test files, and complicates CI sharding.
- **Different auth setups.** The portal tests provision a CLIENT user via Clerk test-mode; the admin tests provision the ACCOUNTANT. Keeping setup in per-app Playwright fixtures is cleaner than a shared fixture with if-branches on app identity.
- **Different test artifacts.** Screenshots, traces, videos land in `apps/portal/e2e-results/` and `apps/admin/e2e-results/` — easy to locate, no cross-contamination.

Why the shared stack:

- **Cross-app flows exist and must be exercised.** An accountant accepting a request in `apps/admin` sends an invitation email; the prospective client clicks through and lands in `apps/portal`'s sign-up completion flow. That flow must be tested end-to-end against **one DB state**, not two separate stacks. A combined stack lets a single spec drive both apps when the flow spans them.
- **Smoke harness reuse.** `scripts/smoke-test.sh` spins up the combined stack once. The same compose file backs targeted e2e.
- **CI parity.** CI spins up the same compose stack once, then runs portal e2e and admin e2e as two sequential (or parallel-shard) jobs.

**Cross-app spec placement.** When a flow genuinely spans both apps (e.g., "accountant accepts request → client receives invite → client completes onboarding"), the spec lives in the app where the flow **terminates** — in that example, `apps/portal/e2e/` because the client-side completion is the final assertion. The spec drives the other app by navigating to its base URL explicitly. A later convention shift is cheap if cross-app specs grow into a distinct surface; for v1, one-to-the-terminating-app is the rule.

**Root command.** `pnpm e2e:run` runs both apps' suites in sequence. CI may shard them; locally they run back-to-back.

### Server Actions vs API routes — per app, no cross-app callbacks

Both apps use Next.js Server Actions as the default for their own mutations. Neither app invokes the other app's server actions. If a cross-app signal is ever needed (e.g., admin marks a deliverable ready and portal must refresh), it travels through the shared DB (the source of truth) plus the realtime channel (SSE, deferred ADR) — not through a cross-app HTTP call. This keeps the apps decoupled and avoids tangled ingress/auth concerns across app boundaries.

### Tooling choices within the workspace

- **Package manager:** pnpm ≥ 9. Lockfile `pnpm-lock.yaml` checked in.
- **Node version:** pinned v20 LTS.
- **TypeScript:** single major version across the workspace.
- **ESLint / Prettier:** single config in `packages/eslint-config`.
- **Testing:** Vitest at the package level and at each app level. Playwright at each app's `e2e/`.
- **Build:** `pnpm build` builds both apps and all packages. Root script: `pnpm -r --filter ./packages/... build && pnpm --filter portal build && pnpm --filter admin build`.

### Rejected: Turborepo / Nx in v1

**Turborepo.** Two apps change the math slightly — the task-graph parallelism and incremental rebuild story is now genuinely useful. Still rejected for v1 because CI times are not yet painful and the agent-facing complexity is real. Revisit when either app's build time + test time exceeds ~5 min in CI or when a third app/package is added.

**Nx.** Heavier than Turbo. Overkill for two apps. Not reconsidered.

## Alternatives considered

### Single `apps/web` with route-group split

Keep one Next.js app, use route groups (`(portal)/` and `(admin)/`) with middleware selecting UI shells by role. Rejected:

- **Single ingress** — can't lock down admin to a separate subdomain without URL rewriting and a more complex middleware.
- **Single deploy unit** — can't ship a portal hotfix without redeploying admin.
- **Single Clerk allowed-origins** — blast radius of a misconfig is larger.
- **Middleware complexity** — one middleware juggling two role gates, two public vs. private maps, two different login flows. Bug-prone.
- **Mental model drift** — developer agents cannot grep "show me the admin surface" cleanly. Route groups obscure ownership.

### `apps/client` + `apps/accountant` naming

Matches the Prisma enum values. Rejected because:

- `CLIENT` has overloaded meaning in software ("API client," "client-side rendering"). `portal` reads product-first.
- `accountant` implies a role the product may generalise later (tax prep staff, admin staff) — `admin` generalises better.

### `apps/public` + `apps/admin` naming

`public` understates what the portal is — signed-in clients live there too, not just anonymous visitors. Rejected for the same product-first reasoning as above.

### Three apps (public marketing + client app + admin app)

A decoupled marketing site was considered. Rejected for v1 — the public services page is simple enough to live in `apps/portal` as an unauthenticated route group. If marketing grows into its own product (blog, case studies, SEO surface), `apps/marketing` joins the family later with no upstream disruption.

### One Playwright config, both apps as projects

A single `playwright.config.ts` at the repo root with two `projects` entries (one per base URL). Rejected because the project-per-base-URL pattern leaks routing into spec files (each spec must name its project) and complicates per-app auth fixtures. The per-app config approach is simpler and still allows cross-app flows when needed.

### `packages/ui` deferred until a second app exists

This ADR now establishes the second app, so the trigger condition fires. Rejected explicitly: v1 ships with `packages/ui` because the two apps exist simultaneously from day one — waiting until duplication appears is a false economy.

## Consequences

- **Two apps, two deploy units, two ingress surfaces.** Subdomain / URL structure for production is a deploy-time concern — surfaced to user for decision; the apps themselves don't assume a specific production shape. See ADR-010 for session-scoping rules that constrain the choice.
- **Role gates are middleware-enforced.** Each app's middleware blocks the wrong role before any route handler runs. A CLIENT hitting `apps/admin` gets a 403 or redirect (ADR-010). An ACCOUNTANT hitting `apps/portal`'s client-only pages gets the same. Public routes in `apps/portal` remain reachable unauthenticated.
- **Shared DB, shared schema, shared RLS.** Both apps read/write the same SQL Server via the same `packages/db` wrapper under the same RLS policies. An RLS bug fix protects both apps at once. A schema migration runs once.
- **Shared storage, shared email, shared UI primitives.** One blob namespace, one email template library, one component library.
- **Per-app health endpoints.** `/healthz` and `/readyz` on **each** app independently (ADR-007 revised). Both must pass for the smoke gate.
- **Per-app Dockerfile, per-app image, per-app size target.** See ADR-007 revised.
- **Smoke harness updated.** `scripts/smoke-test.sh` now brings up both apps, probes both health endpoints, and runs targeted smoke specs from both suites.
- **CI fans out per app.** Lint and type-check run once across the workspace. Tests run per package and per app. E2e runs in two targeted jobs (one per app).
- **`packages/ui` is a shared dependency and its own release surface.** Changes to `packages/ui` must pass e2e in **both** apps. CI enforces this via a task-graph dependency: any PR touching `packages/ui` runs both portal and admin e2e suites.
- **No cross-app HTTP.** The apps are decoupled at the network layer. Coordination happens via the DB and the (deferred) realtime channel.
- **Rename optionality.** The apps are directory-named neutrally (`portal`, `admin`). The user-facing brand names ("Client Portal," "Tax Portal") live in copy and config, not in the directory structure — rebrand is a copy change, not a repo move.

## Related

- **ADR-001** — Clerk authentication; defines the one-Clerk-application topology that both apps share, and the role-based middleware gates.
- **ADR-002** — SQL Server; one database backs both apps.
- **ADR-003** — `SESSION_CONTEXT`; both apps' request pools go through the same identity-propagation path.
- **ADR-004** — Prisma ORM; one schema, consumed identically by both apps.
- **ADR-005** — RLS via Security Policies; one policy set enforces both apps' data access.
- **ADR-007** — Container packaging; two images, one per app.
- **ADR-008** — Object storage; one adapter bound in both apps.
- **ADR-010** — Cross-app navigation & session boundaries; defines how users, deep links, and sessions behave across the two apps.
- **CLAUDE.md** — Agent team table and domain-specific directory assignments; mirrors this layout.

# ADR-004: Prisma as Sole ORM (Single-Track Client)

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation via SESSION_CONTEXT), ADR-005 (RLS via Security Policies), ADR-006 (Monorepo layout)

## Context

With SQL Server locked in as the primary datastore (ADR-002), the ORM choice has to do three things well:

1. Generate typed clients from a schema-first definition — agent-friendly, refactor-safe.
2. Produce SQL that plays correctly with SQL Server's RLS security policies (ADR-005) so that the app does not accidentally bypass the DB's trust boundary.
3. Compose cleanly with the `SESSION_CONTEXT`-based identity propagation contract (ADR-003) — the ORM's query hook must be able to run a `sp_set_session_context` before any data query issues on the connection.

The original stack plan (Supabase + Postgres) proposed a **two-track client pattern**: a PostgREST / supabase-js client for RLS-scoped reads from the browser, and a Prisma client for server-side privileged writes. That split existed because supabase-js carried the user's JWT end-to-end and Postgres RLS read it via `auth.jwt()`, while Prisma ran under a service role that bypassed RLS.

SQL Server has no equivalent story. The database cannot verify Clerk JWTs (ADR-003), so there is no "user-token-carrying client" that the browser can speak directly to the database with. Every request goes through Next.js, which is the identity propagator. That removes the reason for two clients. The trust boundary is now **SQL Server security policies + `SESSION_CONTEXT` set by the app**, and Prisma on either side of the request/admin split is fine — it's which principal the connection is under that matters, not which client library.

This ADR codifies **Prisma as the single ORM** and formalises the escape hatches and constraints that come with it.

## Decision

**Prisma with the `sqlserver` provider is the sole ORM for the portal.** Both reads and writes flow through Prisma — there is no second query client. The "two tracks" are not two ORMs; they are **two connection pools backed by two DB principals**, both driven by Prisma (see ADR-003 §1).

### Client shape

`packages/db/` exports exactly these things:

- `db` — the request-scoped Prisma client, wrapped with the `$extends` identity middleware (ADR-003 §2). This is what ~95 % of application code imports.
- `adminDb` — the admin-pool Prisma client, wired to `DATABASE_URL_ADMIN`. Used by webhooks, migrations, cron, seeds. **Import-restricted by ESLint** to `app/api/webhooks/**`, `scripts/**`, `apps/web/src/jobs/**`, `db/seed/**`.
- `withClerkIdentity(clerkUserId, role, fn)` — test helper for integration tests that need to exercise RLS without going through Next.js middleware.
- `sql` — a tagged-template escape hatch (`Prisma.sql`) re-exported for convenience; discourages raw string SQL in call sites while keeping parameterisation.

No other Prisma clients are instantiated anywhere in the monorepo. An integration test asserts exactly one `new PrismaClient(...)` call per pool type exists in the workspace.

### Identity guarantee

The `$extends` wrapper on `db` is the load-bearing piece of ADR-003 §2. Every `query` operation routed through `db` runs `sp_set_session_context` (keys: `clerk_user_id`, `role`) on first access within a request. The wrapper throws if the `AsyncLocalStorage` context is missing — catching "forgot to set identity before touching the DB" at development time rather than leaking data.

This is why the single-track pattern works: **the ORM is the choke point** where identity propagation is enforced. With two ORMs, the second one becomes a silent bypass path.

### Raw SQL escape hatch

Prisma cannot express every query that SQL Server supports cleanly. Known cases:

- `MERGE` (upserts with complex match conditions).
- Filtered indexes (partial predicate Prisma can't encode at the schema level).
- Temporal-table `FOR SYSTEM_TIME AS OF` queries.
- Window-function-heavy reporting queries where Prisma's groupBy is insufficient.
- `OUTPUT` clauses on multi-row DML.

These live in `packages/db/sql/` as typed, parameterised functions that use `db.$queryRaw` / `db.$executeRaw` (tagged templates, never string-concat). Contract:

- One function per query, colocated with a Zod/TypeScript return-type validator.
- Always parameterised — ESLint rule bans bare-string `$queryRawUnsafe` outside of a narrow allowlist (migrations, admin-pool seed scripts).
- Escape-hatch queries still flow through the `$extends`-wrapped `db`, so `SESSION_CONTEXT` is set before they execute. RLS applies.
- Any escape-hatch query that must run under the admin principal (e.g., a bulk cleanup job) imports `adminDb` explicitly and documents the RLS bypass in a function-header comment.

### Schema-first, not introspection-first

`prisma/schema.prisma` is the source of truth for columns, types, FKs, and Prisma-expressible indexes. Schema evolves via Prisma migrations on the `prisma/migrations/` track (ADR-002 § Migration tracks — Track A).

Things Prisma's generator cannot express — security policies, predicate functions, filtered indexes, temporal-table wiring — live on Track B (`db/migrations/`, raw SQL). Prisma's `introspect` command is **not** used after baseline; drift between schema.prisma and the actual DB is caught by a CI check that runs `prisma migrate diff` and fails on non-empty output.

### Transaction discipline

Two transactional patterns are supported:

1. **`db.$transaction(async (tx) => { ... })`** — interactive transactions for multi-step writes. `tx` carries the same `SESSION_CONTEXT` as the enclosing request. Use for any mutation that touches >1 row across >1 table.
2. **`db.$transaction([op1, op2, ...])`** — batch mode for independent-but-atomic ops. Less expressive, slightly faster.

Nested transactions are flat (Prisma wraps in a savepoint-free sub-batch). Long-running transactions are banned — a PR-level lint rule flags `$transaction` callbacks containing `await fetch`, `await setTimeout`, or anything with I/O outside the DB.

### Prisma version pinning

Prisma minor releases have historically regressed the `sqlserver` provider (migration generator edge cases, client generator type regressions). The `package.json` pins the major+minor (e.g., `"prisma": "5.22.x"`), not a caret range. Bumps are deliberate, follow a changelog read, and ship behind a PR that re-runs the full test + e2e suite.

### What this does *not* replace

- It does not replace raw SQL for RLS policies (ADR-005). Those are their own track.
- It does not replace the `scripts/db-migrate.ts` runner (ADR-002 § Migration tracks). Prisma drives Prisma migrations; the runner orchestrates Prisma + raw SQL in the right order.
- It does not replace the `$extends` middleware as the identity enforcer — Prisma is the *host* for it, not a substitute.

## Alternatives considered

### Two-track client (keep the Supabase-era pattern)

Under Supabase, the second client (`supabase-js`) was justified by carrying the user JWT to the DB directly. With SQL Server, there is no DB-verifiable JWT, and therefore no second client that offers anything Prisma doesn't. A two-track pattern would be two Prisma clients distinguished only by connection pool — which is already handled inside `packages/db/` as two pools, not two ORMs. Adopting a two-ORM pattern anyway would create two identity-propagation enforcement points instead of one — **weakening** the guarantee that ADR-003 provides.

### Drop Prisma, use raw `mssql` + Zod

Raw `mssql` package + hand-written queries + Zod validation. Appealing for full control and no Prisma quirks on SQL Server. Rejected because:

- Loses schema-first typegen. Every query becomes a place where column renames silently diverge.
- Agent-friendliness collapses — developer agents lean heavily on Prisma's inferred types.
- The `$extends` middleware has no equivalent — we'd have to wrap `mssql`'s request object ourselves, re-inventing an identity middleware for every query path. The chance of a bypass increases.

### Drizzle

Drizzle is query-builder-first with decent SQL Server support. As of the last evaluation (2025-Q4), Drizzle's SQL Server migrations generator is immature, its relations API lags Prisma's, and community coverage for `SESSION_CONTEXT`-flavour patterns is thin. Revisit at Phase 5 if Prisma's SQL Server provider keeps regressing.

### Kysely

Query builder only — no migrations generator, no schema-first types (you bring your own via `kysely-codegen`). Viable for the escape-hatch SQL layer; not a full ORM replacement. We use Prisma's own `$queryRaw` tagged templates instead of pulling Kysely in, to keep the dep count small.

### TypeORM

Well-known runtime issues with SQL Server + UUID columns, weaker types than Prisma, and a heavier active-record pattern that fights the rest of the stack. Rejected.

### Stored-procedure-only data access

Strongest theoretical isolation — all data access through procs that enforce identity internally. Rejected as disproportionate to the product's scale and hostile to agent-driven development. Stored procs remain available as a performance escape hatch for hot queries identified later.

## Consequences

- **One place to change.** Schema, typegen, request/admin split, identity middleware, and escape-hatch SQL all live in `packages/db/`. There is one module any other developer (human or agent) reads to understand data access.
- **One place to break.** A bug in the `$extends` wrapper — or a dev path that bypasses it — is a data-access bug by definition. The ESLint rule + runtime throw + regression test (ADR-003 §4) are the defences. All three must stay green.
- **Prisma's SQL Server weaknesses are absorbed by Track B migrations.** Every known rough edge from ADR-002 § Known Prisma + SQL Server rough edges has a documented substitute — filtered indexes, `CHECK` constraints, security policies, temporal tables — on the raw-SQL track. Developers don't have to fight Prisma to get correct behaviour.
- **Raw SQL is a first-class citizen in `packages/db/sql/`.** Escaping to raw is not an anti-pattern; it's an acknowledged tool with a directory of its own. Code review watches for parameterisation (no string concat) and RLS awareness (request pool vs admin pool).
- **Prisma bumps are deliberate.** Pinning means the team controls when SQL Server provider regressions land. A bump PR runs the full gate (lint, type-check, unit, integration, e2e) before merge.
- **Agent productivity.** Developer agents generate Prisma models from the schema and use the inferred types in queries — the fastest happy path for schema-first work. Agents are explicitly instructed (in task specs) to reach for `packages/db/sql/` rather than `$queryRawUnsafe` when Prisma can't express a query.
- **Testing.** Unit tests use `vitest-mock-extended` with a mocked Prisma client. Integration tests use the real Prisma client against a containerised SQL Server, with `withClerkIdentity(...)` to set context. RLS behaviour is tested in integration, never in unit — mocking RLS is a false test.
- **Observability.** Prisma query logs (in dev) surface every emitted SQL statement; in prod, the `$extends` middleware adds the Clerk user ID as a log field, so traces tie queries to principals.

## Related

- **ADR-002** — SQL Server as datastore; defines why Prisma's SQL Server provider is the ORM surface and where raw SQL is needed.
- **ADR-003** — `SESSION_CONTEXT` identity propagation; the `$extends` middleware is the host for that contract.
- **ADR-005** — RLS via Security Policies; defines what Prisma queries are filtered against.
- **ADR-006** — Monorepo layout; `packages/db/` owns the ORM surface.
- **SRS** — REQ-NFR-001, REQ-NFR-004 (tech stack, to be generalised by RA).

# ADR-002: SQL Server as Primary Datastore

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-003 (Identity propagation via SESSION_CONTEXT), ADR-004 (Prisma single-track ORM), ADR-005 (RLS via Security Policies), ADR-007 (Container packaging)

## Context

The original tech stack (intake.md, SRS v1.0, the trust-boundary principle now in ADR-005/ADR-003 as originally written) specified Postgres via Supabase. The user has since directed that the portal use **SQL Server** as the primary datastore, with the deployment platform and production SQL Server edition deliberately left open. The switch affects every data-plane concern: ORM selection, RLS implementation, identity propagation into the DB, and the shape of the local dev environment.

Reasons the user chose SQL Server (summarised from the walk-through):

- Existing familiarity and possibly existing licensing on hand.
- Preference for a "bring your own database engine" posture so the production host decision stays open (Azure SQL DB, Azure SQL Managed Instance, self-hosted Standard/Enterprise, MSDN-licensed Developer-on-a-server, etc. — see ADR-007).
- Comfort with SQL Server's security-policy-based row-level security, which is the mechanism that replaces Supabase RLS (see ADR-005).

Constraints that flow from this choice:

- Prisma's `sqlserver` provider is less mature than its `postgres` provider. Some features that are routine on Postgres (partial/filtered indexes in schema, `uuid-ossp`, `pg_trgm`, `pgcrypto`, `CREATE SECURITY POLICY`) are either unavailable, differently shaped, or unexpressible in Prisma on SQL Server.
- SQL Server has no equivalent of Postgres's `JSONB` with GIN indexes. JSON payload storage is `NVARCHAR(MAX)` with optional `ISJSON` constraints and computed-column indexes, which has different performance characteristics.
- SQL Server is licensed software. Developer edition is free for non-production, Express is free but capped (10 GB per DB, 1 socket/1 GB RAM), Standard/Enterprise require paid licenses. This shapes the dev-vs-prod environment choice.

## Decision

**SQL Server is the primary relational datastore for the portal.** Version floor: **SQL Server 2022**. Rationale for 2022 specifically: `GENERATE_SERIES`, improved `JSON_ARRAY`/`JSON_OBJECT` builtins, improved temporal-table support, and maturity of `SESSION_CONTEXT`-based RLS patterns used in ADR-003 and ADR-005. Lower versions may appear to work in dev but will miss features depended on by later migrations.

### Local dev engine

**SQL Server 2022 Developer edition in a Docker container** (image `mcr.microsoft.com/mssql/server:2022-latest`). Developer edition is functionally identical to Enterprise and is free for non-production use. The container is defined in `docker-compose.yml` at the repo root (see ADR-006).

### Production engine — deferred

The production database engine is **explicitly deferred** until Phase 5 (deploy). Viable candidates that must remain supported:

- **Azure SQL Database** (PaaS, single database or elastic pool).
- **Azure SQL Managed Instance** (PaaS with fuller SQL Server surface area).
- **Self-hosted SQL Server** Standard or Enterprise on a VM or on-prem, if existing licensing is used.
- **MSDN/Visual Studio subscription** Developer edition on a dev/stage environment (not production — Developer edition is not licensed for production workloads).

The application must not assume Azure-specific features. Specifically:

- No `AZURE SQL`-only T-SQL constructs (e.g., `CREATE EXTERNAL DATA SOURCE` syntax, `OPENROWSET` to Azure Blob).
- No reliance on Managed Identity authentication to the DB — use SQL authentication with a secret, consistent across all candidates.
- No reliance on Azure SQL's built-in backup/restore semantics (for example, PITR via `RESTORE DATABASE ... POINT_IN_TIME` works on Azure SQL but not directly on Managed Instance or self-hosted without tail-log backups). Backup strategy lives with the deployment ADR, not here.

### ORM

**Prisma with the `sqlserver` provider**, as the sole ORM. Detail in ADR-004.

### Primary key convention

**`UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()`** on every application table. Reasoning:

- Sequential GUIDs avoid the catastrophic index fragmentation of random `NEWID()`.
- App-owned IDs (as opposed to identity integers) compose with idempotent upserts, offline-first clients, and cross-system references without central-ID-generator coordination.
- `UNIQUEIDENTIFIER` is the native SQL Server choice; `BIGINT IDENTITY` would force the app to discover IDs post-insert and complicate webhook idempotency.

Prisma representation: `@id @default(dbgenerated("NEWSEQUENTIALID()")) @db.UniqueIdentifier`. All FKs that reference these PKs must use the same `@db.UniqueIdentifier` annotation or Prisma silently picks a mismatched column type.

### Timestamp convention

**`DATETIMEOFFSET` for every timestamp column.** Not `DATETIME2`, not `DATETIME`. Reasoning:

- `DATETIMEOFFSET` carries the UTC offset. The portal has ACCOUNTANT and CLIENT users who may be in different timezones, and the audit trail needs to survive DB restores into a different server timezone.
- `DATETIME2` stores wall-clock time without offset — every consumer has to know the server's timezone. This is a subtle bug farm.
- `DATETIME` is legacy (millisecond precision only, 1753-limited epoch) and should not appear anywhere new.

Convention: all app-written timestamps are UTC in code, stored with a `+00:00` offset. `DEFAULT SYSDATETIMEOFFSET()` for server-stamped columns. Prisma: `@db.DateTimeOffset`.

### Migration tracks

Two tracks, clearly separated:

**Track A — Prisma migrations.** The source of truth for table schema, columns, FKs, and indexes Prisma can represent. Lives in `prisma/migrations/`. Runs via `pnpm prisma migrate deploy` in CI.

**Track B — Raw SQL migrations.** Everything Prisma cannot express on SQL Server:

- `CREATE SECURITY POLICY` and associated predicate functions (ADR-005).
- Temporal tables (`SYSTEM_VERSIONING = ON`) for audit trails, when introduced.
- Filtered indexes with predicates Prisma can't encode.
- `CHECK` constraints that reference other columns or use functions (Prisma has limited support).
- Computed columns with non-trivial expressions.
- Grants to the application role, admin role, and the read-only reporting role (when introduced).

Raw migrations live in `db/migrations/` with the naming pattern `NNNN-short-description.sql` where `NNNN` is a monotonic numeric prefix. A small runner script (`scripts/db-migrate.ts`) applies them in order and records applied filenames in a bookkeeping table `__db_migrations` (app-owned, managed by the runner, not by Prisma).

**Ordering contract.** When a Prisma migration and a raw SQL migration are interdependent (e.g., a new table must exist before its security policy is defined), the convention is:

1. Prisma migrates first in each deploy step.
2. Raw SQL migrations run second, against the Prisma-migrated schema.
3. If a raw migration must run *before* Prisma (rare — e.g., dropping a policy before Prisma can alter the underlying table), it must be flagged in the file header and the runner script sequences it manually.

This ordering is enforced in CI by `scripts/db-migrate.ts`, not by human discipline.

### JSON payload storage

JSON columns (e.g., `Notification.payload`, questionnaire answers) are stored as **`NVARCHAR(MAX)`** with a `CHECK (ISJSON(col) = 1)` constraint. Prisma representation: `@db.NVarChar(Max)` with a Zod-validated JSON shape at the app boundary.

Performance notes:

- `NVARCHAR(MAX)` is off-row beyond 8 KB and indexing sub-paths requires a computed column plus a persistent index. This is materially slower than Postgres `JSONB` with a `GIN` index.
- The product does not currently need JSON-path indexing — payloads are retrieved whole. If a later epic needs to filter on JSON contents at scale, that epic creates the computed-column indexes in a raw migration.

### Known Prisma + SQL Server rough edges

These are known limitations that future epics must work around. Documented here so developers don't rediscover them:

- **Prisma's migration generator** on SQL Server sometimes emits destructive operations where the Postgres generator emits non-destructive ones (e.g., widening a `NVARCHAR` column). Every migration **must** be reviewed before apply.
- **No `@db.Citext`** — case-insensitive string matching must use collations (`COLLATE Latin1_General_CI_AS`) or explicit `LOWER()` comparisons.
- **No `pgcrypto` / `uuid-ossp`** — use `NEWSEQUENTIALID()` at the DB layer (app gets the generated ID back via `OUTPUT INSERTED.id`) and SQL Server's built-in `HASHBYTES` for hashing.
- **No `pg_trgm` / trigram search** — for fuzzy search, use SQL Server full-text search (`CONTAINS`, `FREETEXT`) or push to an external index later.
- **No native array types** — list-valued fields (e.g., `Service.serviceIds[]` on `EngagementRequest`) must be modeled as a join table, not a column.
- **`CITEXT` equivalent for emails** — store `email` as `NVARCHAR(254)` with a unique index and a consistent application-side normalization (`.trim().toLowerCase()`). This is enforced at the Prisma client layer, not the DB.
- **Migration reset** — `prisma migrate reset` drops and recreates the database. In local dev this is fine. In shared environments it is destructive and must not be wired to a workflow.

### Connection configuration

The Prisma connection URL uses the `sqlserver://` scheme. Two pools:

1. **Request pool** (application role principal, low privilege). Used by all request-scoped queries. `SESSION_CONTEXT` is set on every connection (ADR-003).
2. **Admin pool** (elevated principal). Used by migrations, webhooks, cron, and seed. Never sets `SESSION_CONTEXT`. Has explicit RLS exemption (ADR-005).

Pool sizing, TLS requirements, and connection-string secrets are deferred to the deployment ADR.

## Alternatives considered

### Stay with Postgres / Supabase

Originally specified; overturned by the user. Postgres has better Prisma support, first-class JSONB, `pg_trgm`, `pgcrypto`, `pg_stat_statements`, logical replication, and much richer ecosystem tooling. The trade — accepting a weaker data platform to gain flexibility on the deployment side and to match the user's existing comfort — is deliberate.

### Postgres in a container, not Supabase

A plausible middle ground — use Postgres without the Supabase wrapper. Rejected for the same reason as above: the user's direction is SQL Server. We didn't revisit the relational-engine choice at all after the user's instruction landed.

### MySQL / MariaDB

Not seriously considered. No licensing advantage for this user, weaker Prisma surface than Postgres, and no SESSION_CONTEXT-equivalent for the identity-propagation pattern in ADR-003.

### SQLite

Inappropriate — no RLS, no concurrent writers, not a server engine.

### ORM: TypeORM / Kysely / Drizzle / raw `mssql` package

- **TypeORM** has well-documented runtime issues with SQL Server + UUIDs and generally poorer ergonomics than Prisma.
- **Kysely** is query-builder-only (no migrations, no client generator). Would require pairing with something else and re-solving the typegen problem.
- **Drizzle**'s SQL Server support is immature (no schema migrations generator as of 2025).
- **Raw `mssql`** is viable for the escape-hatch SQL in `packages/db/sql/` (ADR-004) but is not a substitute for schema-first type safety on the 90% case.

Prisma is the least-worst choice despite its SQL Server roughness. Detail in ADR-004.

### PK: `BIGINT IDENTITY`

Rejected for the reasons above (webhook idempotency, offline IDs, composability). `BIGINT IDENTITY` is smaller on disk (8 bytes vs 16) and has better insert performance, but the ergonomic cost is not worth it on a portal with tens of users and low write volume.

### PK: `NVARCHAR` (use `clerkId` directly)

Addressed in ADR-001 — rejected to decouple the schema from the auth provider.

### Timestamps: `DATETIME2`

Rejected — silent timezone-dependence bug farm. The few bytes saved do not justify the downstream cost.

### JSON in a dedicated column type

SQL Server 2025 is expected to introduce a first-class `JSON` type. When the production engine is chosen, if it supports SQL Server 2025, this ADR gets an amendment to switch new JSON columns to the native type. Until then, `NVARCHAR(MAX)` is the only portable choice across the candidate production engines.

## Consequences

- **Local dev is heavier.** The SQL Server container is ~1.5 GB and uses ~1 GB RAM at idle. Acceptable on modern dev machines.
- **Developer edition licensing.** Developer edition is free for non-production and feature-equivalent to Enterprise. The Dockerfile pulls from Microsoft's registry, so no license key juggling in local dev. Production licensing is a Phase 5 concern.
- **Migration discipline is stricter.** Two tracks (Prisma + raw SQL) need explicit ordering. The migration runner script (`scripts/db-migrate.ts`) is load-bearing and gets full test coverage as part of Epic 001.
- **Fewer power tools.** No `pg_stat_statements`-equivalent for ad-hoc query profiling (SQL Server Query Store is the replacement, less ergonomic but functional). No `pg_trgm` for fuzzy search — this affects Epic 007 (Accountant dashboard search) and may force a deferred decision about full-text search.
- **Identity propagation is app-mediated.** Because SQL Server cannot verify Clerk JWTs, the app takes on the load-bearing responsibility of setting `SESSION_CONTEXT` on every request (ADR-003). This is the single most security-sensitive piece of the backend.
- **Portability.** The stack is now portable across any SQL Server engine: Azure SQL DB, MI, self-hosted, Developer edition for dev. The deployment decision is genuinely open.
- **Prisma version lock.** Prisma minor releases occasionally regress the SQL Server provider. Pin the Prisma major+minor in `package.json` (not a caret range) and bump deliberately.
- **Temporal tables are available** for audit (retention-sensitive tables like `Document`, `Engagement`, `OnboardingState`). When an audit-trail epic materializes, temporal tables are the preferred mechanism. Defined in raw migrations.
- **Trust-boundary posture (ADR-005 / ADR-003).** The database is the trust boundary; the app propagates identity. RLS moves from Supabase to SQL Server security policies (ADR-005).

## Related

- **ADR-001** — Clerk as auth provider; motivates the `clerkId`-as-non-PK convention.
- **ADR-003** — `SESSION_CONTEXT` identity propagation; the runtime bridge between Clerk and SQL Server RLS.
- **ADR-004** — Prisma as sole ORM; details the single-track client pattern and raw-SQL escape hatch.
- **ADR-005** — RLS via SQL Server Security Policies; the mechanism that replaces Supabase RLS.
- **ADR-006** — Monorepo layout; defines `db/migrations/`, `db/policies/`, `db/seed/` directories.
- **ADR-007** — Container packaging and deploy-agnostic posture; why the DB engine stays open.
- **SRS** — REQ-NFR-001 (RLS enforcement), REQ-NFR-004 (tech stack, will be generalized by RA), REQ-FILE-005 (7-year retention), REQ-MSG-016 (notification retention).

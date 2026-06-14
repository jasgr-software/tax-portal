# ADR-005: Row-Level Security via SQL Server Security Policies

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation via SESSION_CONTEXT), ADR-004 (Prisma ORM), ADR-006 (Monorepo layout)

## Context

Tenet 7 (amended this session) places the trust boundary for row-level access at the database, not the application. With SQL Server as the datastore (ADR-002) and Clerk identity propagated via `SESSION_CONTEXT` (ADR-003), the remaining question is: **how are the actual access rules expressed and enforced in SQL Server?**

Postgres's RLS is declarative and per-table: `ENABLE ROW LEVEL SECURITY`, then `CREATE POLICY name ON table FOR SELECT USING (...)`. SQL Server's equivalent is **Security Policies**, which are more flexible but also more ceremonial:

- A **predicate function** is a schema-bound inline table-valued function (ITVF) that returns one row when access is allowed, zero rows otherwise. Predicate functions are written in T-SQL, so they can join, reference other tables, and use `SESSION_CONTEXT`.
- A **security policy** binds one or more predicates to a target table as either a **FILTER** (read-scoped; filters rows from `SELECT`, `UPDATE`, `DELETE` reads) or a **BLOCK** (mutation-scoped; raises an error if an `INSERT`, `UPDATE`, or `DELETE` would touch a row that the predicate says is not allowed).
- Security policies can be `SCHEMABINDING = ON, STATE = ON` and then they are enforced by the engine on every query that touches the base table. There is no way for an application query to bypass them except by connecting as a principal that is explicitly exempted in the predicate body.

This model is the right shape for the portal, but it has well-known performance and operational sharp edges that need to be encoded in the ADR so future epics don't rediscover them.

## Decision

**Every table containing client-scoped data is covered by a SQL Server `SECURITY POLICY` keyed off `SESSION_CONTEXT(N'clerk_user_id')`.** Two kinds of predicates, both are used: `FILTER PREDICATE` (always), and `BLOCK PREDICATE` (on every table where a mutation must be rejected rather than silently filtered).

The full contract has seven parts: principal model, predicate library, policy naming, admin exemption, performance rules, test obligation, and migration track.

### 1. Principal model

Two database principals exist (ADR-003 §1):

- **`app_user_role`** — low privilege. Used by the request pool. Every query this principal issues is filtered/blocked by RLS policies. There is no way to turn this off from inside the request pool.
- **`app_admin_role`** — elevated. Used by migrations, webhooks, cron, seeds. Every predicate includes an explicit branch that unconditionally passes when `IS_MEMBER('app_admin_role') = 1`.

No other principals are used by the application. Dev-only DBA logins that bypass policies for troubleshooting must be tracked in `docs/operations/runbook.md` (out of scope for this ADR).

### 2. Predicate library

Predicates live in `db/policies/` as raw SQL files, versioned alongside code. One file per predicate function, grouped by domain (`engagement-access.sql`, `message-access.sql`, `document-access.sql`, `notification-access.sql`, etc.).

Every predicate follows this skeleton:

```sql
CREATE OR ALTER FUNCTION sec.fn_<resource>_access(
  @<scoping_fk_column_1> UNIQUEIDENTIFIER,
  @<scoping_fk_column_2> UNIQUEIDENTIFIER = NULL
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
  SELECT 1 AS allowed
  WHERE
    -- 1. Admin principal always passes.
    IS_MEMBER('app_admin_role') = 1
    -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — one accountant, full visibility.
    OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
    -- 3. CLIENT role — only owning/participating rows pass.
    OR EXISTS (
      SELECT 1
      FROM dbo.<scoping_join_chain>
      WHERE <resource_row_matches_caller_via_clerkId>
    );
);
```

Rules for predicate bodies:

- **Always include the admin branch first** — short-circuits the common case (migrations, webhooks) without joining.
- **Always include the ACCOUNTANT branch second** — the one accountant sees everything; no reason to evaluate the join chain for her.
- **The CLIENT branch joins via `User.clerkId`**, not `User.id`. `SESSION_CONTEXT` carries the Clerk user ID (a stable string), not the app's UUID. The join shape is:
  ```
  JOIN dbo.[User] u ON u.id = <participant/owner>.userId
  WHERE u.clerkId = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
  ```
- **Fail-closed on null identity** — when `SESSION_CONTEXT` is null, the CLIENT branch's `WHERE` clause produces no match and the predicate returns an empty table. Combined with the policy's `FILTER PREDICATE`, this yields zero rows — not an error. For writes, the BLOCK predicate raises an error instead. This matches ADR-003 §5.
- **Keep predicates shallow.** Each predicate does at most one level of JOIN to reach the ownership/participation boundary. Deep joins belong in access-set tables (see §5).

### 3. Policy naming and structure

One `SECURITY POLICY` per target table, named `sec.pol_<tablename>`. Each policy binds:

- A **FILTER PREDICATE** referencing `sec.fn_<resource>_access` on the relevant FK columns — covers all reads.
- A **BLOCK PREDICATE** with `AFTER INSERT, AFTER UPDATE, BEFORE UPDATE, BEFORE DELETE` on the same predicate — covers mutations.

`AFTER INSERT` catches "insert a row the caller isn't allowed to own." `BEFORE UPDATE / BEFORE DELETE` catches "modify a row the caller doesn't already own." `AFTER UPDATE` catches "change a scoping FK to something the caller doesn't own."

Example (conceptual — real file in `db/policies/025-engagement-policy.sql`):

```sql
CREATE SECURITY POLICY sec.pol_Engagement
  ADD FILTER PREDICATE sec.fn_engagement_access(clientId) ON dbo.Engagement,
  ADD BLOCK  PREDICATE sec.fn_engagement_access(clientId) ON dbo.Engagement AFTER INSERT,
  ADD BLOCK  PREDICATE sec.fn_engagement_access(clientId) ON dbo.Engagement BEFORE UPDATE,
  ADD BLOCK  PREDICATE sec.fn_engagement_access(clientId) ON dbo.Engagement AFTER  UPDATE,
  ADD BLOCK  PREDICATE sec.fn_engagement_access(clientId) ON dbo.Engagement BEFORE DELETE
  WITH (STATE = ON, SCHEMABINDING = ON);
```

Every policy is `STATE = ON, SCHEMABINDING = ON`. `SCHEMABINDING = ON` means predicate functions cannot reference objects that might be dropped — column renames require policy drop/recreate. This is the correct trade: drift is caught at migration time, not at query time.

### 4. Admin principal exemption

Every predicate's first clause is `IS_MEMBER('app_admin_role') = 1`. This is the documented escape hatch for:

- Prisma migrations (schema changes).
- Raw SQL migrations (`db/migrations/`).
- Clerk webhook handlers (user upserts that must succeed before the user has any owned rows).
- Cron jobs (overdue-reminder sweeps, 7-year retention purges).
- Seed scripts (`db/seed/`).

Anything that runs under `app_admin_role` is trusted. The monorepo's import-boundary ESLint rule (ADR-003 §6, ADR-004) ensures `adminDb` can only be imported from `app/api/webhooks/**`, `scripts/**`, `apps/web/src/jobs/**`, `db/seed/**`. Anywhere else that tries to import it fails lint.

### 5. Performance rules — the predicate join problem

The main operational risk of predicate-based RLS on SQL Server is **join-inside-predicate cost**. Every query on a scoped table silently wraps the predicate's SELECT around the caller's query. For simple ownership checks (`Engagement.clientId` → `User.id` → `User.clerkId = SESSION_CONTEXT(...)`) the cost is small — two index seeks. For cross-table participation checks (`Message.threadId` → `Thread.engagementId` → `EngagementParticipant.userId` → `User.clerkId`) the cost compounds across hot endpoints.

Three mitigations, applied in order of severity:

**Mitigation A — Pre-joined access-set tables.** For resources accessed on every page load (e.g., `Message`, `Document`, `Notification`), a materialised table `sec.ClientAccessibleEngagement(clerkId, engagementId)` is maintained via triggers (`AFTER INSERT/UPDATE/DELETE` on `EngagementParticipant` and `Engagement.clientId`). The predicate becomes a single-row seek into this table:

```sql
EXISTS (
  SELECT 1 FROM sec.ClientAccessibleEngagement a
  WHERE a.engagementId = @engagementId
    AND a.clerkId = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
)
```

The access-set table is maintained by the DB engine via triggers. It is authoritative — the triggers run on the admin path (participants added by accountant workflows), so they are trusted. If the access-set table is corrupt, every scoped query is wrong — there is an integrity check job that reconciles it against `EngagementParticipant` nightly. Integrity check runs under the admin pool.

**Mitigation B — Inline table-valued predicate functions.** All predicates use `RETURNS TABLE` (ITVF) rather than `RETURNS @x TABLE ... BEGIN ... END` (multi-statement TVF). ITVFs are inlined by the query optimiser; multi-statement TVFs are opaque box-and-execute and kill cardinality estimation. This is non-negotiable.

**Mitigation C — Predicate shallowness.** Every predicate reaches the ownership boundary in **one JOIN at most**. Deeper chains go into access-set tables (Mitigation A) rather than deeper predicates.

**App-side defence-in-depth.** The app may add pre-query authorization checks (e.g., "is this caller allowed to see `engagementId = X`?") before issuing the query — redundant to, not a substitute for, the RLS predicate. The canonical example is signed-URL generation (ADR-009): the app does an explicit authorization query before minting a URL; the RLS predicate is the backstop on the authorization query itself.

### 6. Test obligation

Every security policy has a dedicated integration test, named `<policy>.rls.test.ts`, living alongside the domain's tests. Minimum coverage per policy:

- **Positive — CLIENT-A reads own row** — passes.
- **Negative — CLIENT-A reads CLIENT-B's row** — returns zero rows (not an error).
- **Negative — CLIENT-A inserts a row with CLIENT-B's scoping FK** — raises a BLOCK error.
- **Negative — CLIENT-A updates a row so its scoping FK moves to CLIENT-B** — raises a BLOCK error.
- **Negative — CLIENT-A deletes CLIENT-B's row** — raises a BLOCK error.
- **Positive — ACCOUNTANT reads all rows** — returns all.
- **Positive — admin principal (tested via a `withAdminDb` helper) reads all rows** — returns all.
- **Null-identity — no `SESSION_CONTEXT` set** — returns zero rows (not an error).

This is a hard gate: **SDET focus area on Epic 001 is verifying these tests exist for every policy scaffolded in Epic 001, and that new policies in later epics ship with their test suites green.** "RLS was enabled" is not acceptance criteria; "RLS was tested to fail closed" is.

### 7. Migration track — `db/policies/`

Security policies cannot be expressed in Prisma and live on the raw-SQL migration track (ADR-002 § Migration tracks — Track B). The directory structure:

```
db/
  migrations/       # numeric-prefixed raw SQL — schema, indexes, check constraints
  policies/         # numeric-prefixed raw SQL — predicate functions + security policies
  seed/             # dev-only seed data
```

Policies are applied after the corresponding table migration, in order. The runner script `scripts/db-migrate.ts` sequences them. Re-running a policy migration is idempotent via `CREATE OR ALTER FUNCTION` for predicates and `DROP SECURITY POLICY IF EXISTS ... ; CREATE SECURITY POLICY ...` for policies.

Policy changes are PR-reviewed as carefully as schema changes. A retro rule (added if this ever goes wrong): any policy change that drops protection without an explicit replacement fails a dedicated CI check (`scripts/validate-policies.ts`).

### Tables in scope for Epic 001

Scaffold RLS baseline on these tables in Epic 001 (even where rows are empty):

- `User` — CLIENT sees own row only; ACCOUNTANT sees all.
- `Engagement` — CLIENT sees engagements they own or participate in.
- `EngagementParticipant` — CLIENT sees rows linking to engagements they own/participate in.
- `EngagementRequest` — CLIENT sees their own pending/accepted/declined requests; public/anon submits run under admin principal.
- `OnboardingState` — scoped via `engagementId`.
- `Thread` — scoped via `clientId` and optional `engagementId`.
- `Message` — scoped via `threadId` through `Thread`.
- `Document` — scoped via `engagementId`.
- `Folder` — scoped via `engagementId`.
- `DocumentRequest` — scoped via `engagementId`.
- `Notification` — scoped via `userId`.
- `NotificationPreference` — scoped via `userId`.

Service-catalog tables (`Service`, `IntakeTemplate`) are **accountant-managed, client-readable** — policies allow all CLIENTs to `SELECT` active rows; only ACCOUNTANT / admin can mutate.

## Alternatives considered

### Enforce row-level access in the app, not the DB

Let Prisma always include `WHERE userId = @caller` — the approach proposed under early Supabase-alternative discussions. Rejected. Violates Tenet 7 (amended). One missed filter leaks data. The DB is where the trust boundary belongs.

### Views + `WITH CHECK OPTION`

A view per scoped resource that the app queries instead of the base table, `WITH CHECK OPTION` to prevent INSERTs that bypass the view. Rejected because:

- Views double the surface area — every table gets a view and the app must never touch the base table.
- `WITH CHECK OPTION` is weaker than BLOCK predicates; UPDATE scenarios leak.
- Prisma doesn't play well with views as the primary model target.

### Stored procedures as the only data access path

Every data access goes through `EXECUTE`-able stored procedures that enforce identity internally. Strongest theoretical isolation. Rejected — fights Prisma, fights agent-driven development, disproportionate to the product's complexity. Stored procs remain available for hot paths later.

### `sp_addrolemember` per Clerk user

One DB role per Clerk user, rows tagged by role membership, predicates check `IS_MEMBER(...)`. Rejected — same scaling problem as "one DB user per Clerk user" in ADR-003. Administrative and pool-breaking.

### Dynamic Data Masking

SQL Server DDM hides column values from non-privileged callers. Addresses a different problem (sensitive-column obfuscation, e.g., SSN). Not a substitute for RLS — **could be layered on top** for SSN-class fields, but that's a later ADR.

### Always Encrypted

Client-side encryption for the most sensitive columns. Again, a different concern (encryption in flight/at rest, not access scoping). Not considered here.

## Consequences

- **The DB is the gate.** App bugs that forget an authorization check still return zero rows to the wrong user — not leaked rows. This is the guarantee Tenet 7 (amended) is buying.
- **Predicate performance is the load-bearing perf concern.** Every scoped query eats a predicate evaluation. Mitigations A–C are the toolbox. If a page load hits RLS-scoped tables 10+ times, it earns a budget conversation and likely an access-set-table rollout.
- **Migration discipline.** Schema changes that touch scoped tables must ship with policy updates in the same commit. A drift-detection CI check (`scripts/validate-policies.ts`) compares `db/policies/` file presence against the list of tables with `client-scoped: true` annotations in `prisma/schema.prisma`. Missing coverage fails the PR.
- **Admin exemption is audited.** The admin branch in every predicate is a hole by design. Any code path that writes data must be reviewed for "is it OK that this runs under admin?" Webhooks, cron, and migrations have documented justifications in ADR-001, this ADR, and ADR-003.
- **Integration tests are load-bearing.** The unit-test layer cannot cover RLS — the policies only exist in the DB. The `.rls.test.ts` suite is the only place correctness is proved. **SDET treats these tests as a dedicated review focus** every time a scoped table ships or changes.
- **Trigger maintenance for access-set tables.** Whenever Mitigation A is used, the triggers on the underlying FK become load-bearing. They run under the admin implicit context (the session's ambient principal) but target sec-schema tables owned by the admin role. Test coverage for trigger correctness is part of the access-set table's introduction PR.
- **Dev ergonomics.** `pnpm db:reset` for local dev re-applies schema + policies + seed in one command. Developer agents don't hand-roll policy syntax for routine work — they copy the domain-appropriate predicate skeleton from `db/policies/_template.sql`.
- **Observability.** When a query returns fewer rows than expected, the first debugging hypothesis is "is `SESSION_CONTEXT` set correctly?" The Prisma middleware logs the Clerk user ID per query in dev; in prod, it's a structured log field so operators can reconstruct the identity that produced a scoped result.
- **Future SaaS pivot.** If the product ever goes multi-tenant (one DB, many firms), the same predicate model extends with an additional `firm_id` scoping layer. The access-set table pattern is pre-adapted for this — add `firmId` as a column and the predicates expand without rewriting the whole surface.

## Related

- **ADR-002** — SQL Server as datastore; defines the engine whose RLS mechanism is being configured here.
- **ADR-003** — `SESSION_CONTEXT` propagation; writes the identity this ADR reads.
- **ADR-004** — Prisma ORM; defines how the app layer sends queries to the engine (and why there is no second ORM bypass).
- **ADR-006** — Monorepo layout; defines `db/policies/` as the home for these files.
- **Tenet 7 (amended)** — "Row-level security is enforced at the database; the app is responsible for identity propagation."
- **SRS** — REQ-AUTH-002, REQ-AUTH-003, REQ-NFR-001.

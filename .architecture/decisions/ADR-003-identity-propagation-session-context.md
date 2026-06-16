# ADR-003: Identity Propagation via SESSION_CONTEXT

**Status:** Accepted
**Date:** 2026-04-16
**Last-amended:** 2026-06-16 (Amendment 1 — §3 `@read_only=1` removed; §4 reset-on-release retired as unachievable; see Changelog)
**Deciders:** SA (with user direction)
**Related:** ADR-001 (Clerk auth), ADR-002 (SQL Server), ADR-004 (Prisma ORM), ADR-005 (RLS via Security Policies)

> **Amendment 1 (2026-06-16) — pooling reconciliation.** §3 originally mandated `@read_only = 1` on both
> `sp_set_session_context` calls and §4 mandated "reset-on-release" connection hygiene. Both are amended below.
> `@read_only = 1` locks the key for the **connection lifetime**, not the request; under Prisma's
> non-negotiable connection pooling (ADR-004) the first cross-request reuse of a connection throws
> **SQL Server error 15664** on the second set. The reset-on-release mechanism §4 assumed is **not
> deliverable** on the Prisma 5.22 `sqlserver` stack (see §4). The amended decision sets SESSION_CONTEXT
> **writable** and relies on the already-present structural compensating controls for within-request
> immutability. The ADR's intent is unchanged: identity is **verified-only**, set **once per request**,
> and reaches RLS **intact**. Root cause: OQ-001 / BUG-002-003. Amended sections are marked
> **[Amended 2026-06-16]**; the original text is preserved struck-through-in-prose so the prior decision
> remains legible.

## Context

The portal's access model (REQ-AUTH-002, REQ-AUTH-003, REQ-NFR-001, ADR-005) requires row-level security enforced **at the database**, not the app. The authenticated caller's identity must reach the DB engine on every request so that policy predicates can filter rows by ownership.

Under the original Supabase plan, this was solved by a Supabase JWT template: the Clerk session token was minted in a shape Supabase Auth could verify, and Postgres RLS predicates read the verified claims via `auth.jwt()`. The database itself was a JWT verifier.

SQL Server has no equivalent. It cannot fetch JWKS, cannot verify RS256 signatures, and has no concept of an externally-authenticated request. The identity must be passed in by the caller. The question is: **how, without letting the caller lie?**

SQL Server offers several mechanisms:

1. **`SESSION_CONTEXT`** — a per-session key/value store, read-only flag optional, cleared by the engine on connection reset. Values survive across batches on the same connection.
2. **`CONTEXT_INFO`** — a single 128-byte binary blob per session. Strictly smaller and less ergonomic than `SESSION_CONTEXT`, which supersedes it.
3. **`EXECUTE AS USER`** — re-impersonate as a specific DB user for the current batch. Powerful but requires a DB user per app identity, which does not scale (one DB user per Clerk user means thousands of principals).
4. **One DB user per Clerk user** — literally provision a DB login/user per client. Pool-breaking, administratively toxic, rejected on sight.
5. **JWT-in-DB via CLR or external HTTP** — write a CLR function that verifies the Clerk JWT by calling JWKS. Rejected — CLR is a maintenance and security burden and is disabled by default on most managed engines (Azure SQL disables it entirely).
6. **App-side RLS only** — let the app compose `WHERE userId = @caller` into every query. Violates the database-trust-boundary principle (ADR-005): the DB is the trust boundary. Rejected.

The accepted solution is (1). The design below nails down the operational discipline required to make it safe.

## Decision

**Every request-scoped DB connection sets `SESSION_CONTEXT` to the authenticated Clerk user's identity before any data query runs. SQL Server RLS predicates read from `SESSION_CONTEXT` and fail closed when the value is null.**

The full contract has six parts: principal separation, set-on-acquire, ~~read-only flag~~ **identity-key write discipline [Amended 2026-06-16]**, ~~reset-on-release~~ **pool-reuse re-settability [Amended 2026-06-16]**, a middleware guard, and an admin bypass.

### 1. Principal separation — two pools, two DB users

Two connection pools exist, backed by two distinct SQL Server principals:

- **`app_user_role`** (low privilege). Used by all request-scoped queries. Granted `SELECT`, `INSERT`, `UPDATE`, `DELETE` on application tables — but every query is filtered by RLS policies (ADR-005). Crucially, this principal is **not exempt** from any RLS policy.
- **`app_admin_role`** (elevated privilege). Used by migrations, webhook handlers, cron jobs, and seed scripts. Explicitly exempted from every RLS policy. Never shares a connection with the request pool.

The Prisma client is instantiated twice in `packages/db/`:

```ts
// packages/db/src/client.ts
export const requestDb = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL_APP } } });
export const adminDb   = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL_ADMIN } } });
```

The admin pool is guarded with a module-scoped check that throws if it is imported from a request-handling code path (enforced by an ESLint rule and a runtime stack-trace check in dev). Admin-pool code paths: `app/api/webhooks/**`, `scripts/**`, `apps/web/src/jobs/**`, `db/seed/**`. Everywhere else imports `requestDb`.

### 2. Set-on-acquire — the `$extends` middleware

The request Prisma client is wrapped with `prisma.$extends` (Prisma 5+ Client Extensions API). The extension registers a `query` component that runs before every model operation:

```ts
// packages/db/src/client.ts (conceptual)
export const db = requestDb.$extends({
  query: {
    $allOperations: async ({ args, query, model, operation }) => {
      const ctx = currentRequestContext(); // AsyncLocalStorage
      if (!ctx?.clerkUserId) {
        throw new Error(`No identity in request context for ${model}.${operation}`);
      }
      if (!ctx.sessionContextSet) {
        // [Amended 2026-06-16] keys are set WITHOUT @read_only so a reused pooled
        // connection can re-set them on the next request. See §3.
        await requestDb.$executeRawUnsafe(
          `EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;
           EXEC sp_set_session_context @key = N'role',          @value = @p2;`,
          ctx.clerkUserId,
          ctx.role,
        );
        ctx.sessionContextSet = true;
      }
      return query(args);
    },
  },
});
```

Key properties:

- The first real query on a connection triggers the `sp_set_session_context` pair before the actual query runs, in the same transaction scope so they travel together.
- `currentRequestContext()` reads from `AsyncLocalStorage`, populated by Next.js middleware after verifying the Clerk session.
- If no request context exists, the extension throws — fail closed at the middleware, not the database. This catches code paths that forget to use `withRequestContext()` before touching the DB.
- `sessionContextSet` is tracked per request (not per connection) so the SET runs once per request. Prisma's connection pool does not expose connection-affinity for extensions, so the SET runs at most once per request; if the request actually spans multiple connections in a single call, the `sp_set_session_context` simply runs again — it's idempotent.

The exact implementation is refined in Epic 001; this ADR defines the contract.

### 3. Identity-key write discipline (SESSION_CONTEXT keys are writable) **[Amended 2026-06-16 — supersedes the original `@read_only = 1` clause]**

> **Original decision (2026-04-16, now superseded):** *"Both `sp_set_session_context` calls pass
> `@read_only = 1`. Downstream code executing on the same connection — including raw SQL in
> `packages/db/sql/` — cannot overwrite the identity mid-request. An attempted overwrite raises an error,
> which is preferred to silent spoof."*

**Amended decision: both `sp_set_session_context` calls set the keys WITHOUT `@read_only` (the keys
remain writable).** The identity keys (`clerk_user_id`, `role`) are set exactly once per request from the
verified server-side identity, and a reused pooled connection re-sets them cleanly on the next request.

**Why the read-only flag is removed (the SQL Server mechanic + the pooling collision):**

- `@read_only = 1` locks a SESSION_CONTEXT key for the **lifetime of the SQL Server connection**, not the
  request. Once set, the key **cannot be changed or cleared by any subsequent `sp_set_session_context`
  call on that connection** — only a brand-new physical connection or a driver-issued
  `sp_reset_connection` clears it.
- Connection pooling is non-negotiable (ADR-004). When the pool hands a previously-used connection to the
  **next** request, the §2 middleware legitimately tries to set the keys again (the new request has a fresh
  `RequestContext` with `sessionContextSet: false`). On the locked key this throws **SQL Server error
  15664** (*"The key has been set as read_only for this session"*) → the request 500s. In EPIC-002 this
  manifested as the post-write `revalidatePath` RSC re-render failing on every reused connection. So
  `@read_only = 1` + pooling = **every reused connection fails its second request** — `@read_only` is not
  a free design choice here, it is forced out (the only ways to keep it — disabling pooling, or a reliable
  per-release reset — are rejected/unavailable; see §4 and Alternatives).

**What replaces the read-only flag (the compensating controls that preserve within-request immutability):**
The property §3 originally protected was *"downstream code on the same connection cannot overwrite identity
mid-request."* That property is preserved **structurally**, independent of `@read_only`:

1. **Set once per request.** The `if (!ctx.sessionContextSet)` guard (§2) flips `sessionContextSet = true`
   on the first set and is never re-entered within a request. There is no second set within a request.
2. **Verified-identity-only value.** The value set comes **only** from `currentRequestContext()`,
   populated by `withRequestContext(clerkUserId, role, …)` from the verified server-side identity
   (`getIdentity()` → Clerk session). **No client-supplied input (body / header / query) ever reaches
   `sp_set_session_context`** (ADR-005 trust boundary; the `session-context.propagation.test.ts`
   trust-boundary case asserts this).
3. **Single writer.** `sp_set_session_context` is issued from exactly one place — the §2 `$extends`
   middleware. No application code, route handler, repository, or raw SQL issues it. This is enforced by
   the ESLint `requestDb` import boundary (§6) and by the package barrel not exporting `requestDb` (only
   the wrapped `db`).

**Residual risk, explicitly accepted.** A within-request *second writer* would need to inject raw
`sp_set_session_context` SQL into a request-pool query. That is a SQL-injection vulnerability — and
`@read_only` never meaningfully mitigated it (the *same* injection could read or exfiltrate cross-tenant
rows directly, with or without the lock). `@read_only = 1` was therefore **defense-in-depth against a
writer that does not exist in this codebase**, purchased at the cost of pooling incompatibility. Removing
it grants **no new capability** to the `app_user_role` principal — that principal could already call
`sp_set_session_context` (it must, to set its own identity); `@read_only` only governed whether a *second*
call on the same connection was rejected, never *who* could call it. The trade is accepted: real,
shipping pooling correctness in exchange for retiring a redundant in-depth layer.

### 4. Pool-reuse re-settability — connection pool hygiene **[Amended 2026-06-16 — supersedes the original "reset-on-release" clause]**

> **Original decision (2026-04-16, now superseded):** the original §4 assumed SQL Server's default
> connection reset (`sp_reset_connection`) clears `SESSION_CONTEXT` on pool release, pinned the driver to
> a "configuration that resets `SESSION_CONTEXT` on release," and prescribed a leak regression test
> (acquire → set spoof → release → re-acquire → read null). **That reset-on-release mechanism is not
> deliverable on the delivered stack and the prescribed regression test was never implemented** — which is
> the precise reason the §3 read-only lock leaked across pooled requests undetected until EPIC-002.

**Determination (the load-bearing finding): reset-on-release in application code is NOT achievable with
Prisma 5.22 + the `sqlserver` provider for the request (`db`) path.**

- The request-pool `db` path runs through **Prisma's Rust query engine** (quaint) and its own sqlserver
  connection pool — **not** the npm `mssql`/tedious driver (which this repo uses only on the raw-mssql
  test/policy paths). Quaint's sqlserver pool **does not issue `sp_reset_connection` on checkout/checkin**
  and exposes **no application hook** to run a cleanup statement on connection release. So:
  - The application cannot reliably clear SESSION_CONTEXT (read-only or not) when a connection returns to
    the pool — there is no release callback to attach it to.
  - Even if such a hook existed, a key set with `@read_only = 1` **cannot be cleared by
    `sp_set_session_context` at all** (see §3 mechanic) — only a fresh connection or `sp_reset_connection`
    clears it, and the engine issues neither here.
- Therefore the original §4 ("rely on the driver's connection reset; the regression test validates it") was
  **founded on a behavior this stack does not exhibit**. Pinning a driver configuration cannot deliver it,
  because the request path does not use the configurable npm driver at all.

**Amended hygiene contract — re-settability instead of reset:** because the keys are now **writable** (§3),
correctness no longer depends on the pool clearing them. The contract is:

- **Every request re-sets the identity keys to its own verified identity** on first query (§2). A reused
  connection that still holds the *previous* request's identity is harmless: the new request overwrites
  both keys before any data query runs, so RLS always evaluates against the **current** request's verified
  identity. There is no stale-identity window — the write precedes the first read on that connection in the
  same `$allOperations` invocation.
- **The leak concern is satisfied by overwrite, not by clear.** A pooled connection never serves a query
  under a stale identity, because the per-request set (which now succeeds — no 15664) happens before the
  query. The only way a stale identity could be observed is if a request reached the DB *without* going
  through the §2 middleware — which §6 forbids and the middleware-guard throw catches (fail-closed).
- **Regression obligation (§4's never-written test, now redefined and made mandatory):** a tier-3
  integration test MUST exercise **cross-request pooled-connection reuse without `$disconnect` between the
  requests** — the exact path the existing `session-context.propagation.test.ts` deliberately avoided with
  its `afterEach($disconnect)`. See § Implementation contract and regression obligation (below) for the
  precise shape. This test is a **hard** part of the contract: the defect shipped *because* this test never
  existed.

### 5. Fail-closed RLS semantic

RLS predicate functions (ADR-005) are defined so that `SESSION_CONTEXT(N'clerk_user_id')` being `NULL` produces **zero rows**, not an error. Example predicate shape:

```sql
CREATE FUNCTION sec.fn_engagement_access(@clientId UNIQUEIDENTIFIER)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
  SELECT 1 AS allowed
  WHERE
    -- admin principal exemption
    IS_MEMBER('app_admin_role') = 1
    OR
    -- clerk user matches the engagement owner
    @clientId = (
      SELECT u.id FROM dbo.[User] u
      WHERE u.clerkId = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
    )
    OR
    -- participant table membership (ACCOUNTANT visibility or explicit participant)
    EXISTS (
      SELECT 1 FROM dbo.EngagementParticipant p
      JOIN dbo.[User] u ON u.id = p.userId
      WHERE p.engagementId = @engagementId
        AND u.clerkId = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
    )
);
```

When `SESSION_CONTEXT` is null, the inner lookup returns no match, the predicate returns empty, and the SECURITY POLICY filters out every row. No exception — just an empty result set. This is an RLS semantic, not a bug, and it is the correct fail-closed behavior for read paths.

For write paths (INSERT, UPDATE, DELETE), a BLOCK predicate that evaluates to false raises an error at the engine. See ADR-005.

### 6. Middleware / lint layer

Three defenses catch "forgot to set identity":

1. **Next.js middleware** — every request enters `withRequestContext()` which populates `AsyncLocalStorage` with `{ clerkUserId, role }` from the verified Clerk session. Requests without a valid session either redirect to sign-in or run as "anonymous" — anonymous paths (public services page, engagement request submission) must use the admin pool, never the request pool.
2. **The `$extends` wrapper (§2)** throws if `currentRequestContext()` is empty when a query is issued. This catches "accidentally imported `requestDb` directly and bypassed the wrapper."
3. **ESLint rule** — custom rule in `packages/eslint-config/` that forbids direct imports of `requestDb` outside of `packages/db/src/`. Only the wrapped `db` client is exported from the package barrel.

### 7. Admin pool — explicit bypass

Code paths that run outside a user request (migrations, webhooks, cron, seed) import `adminDb`. They do **not** set `SESSION_CONTEXT`. RLS policies include an `IS_MEMBER('app_admin_role') = 1` clause that unconditionally passes, so the admin pool sees all rows.

Admin-pool code must:

- Log every mutation with the reason (webhook ID, migration name, job name).
- Never be invoked from a request handler — enforced by module boundary (§1) and ESLint.
- Never accept user-supplied IDs without independent validation. The admin pool is the one place RLS does not protect; the code path is the authorization.

## Alternatives considered

### Dedicated DB user per Clerk user

Create a SQL Server login for every client, set the Prisma connection to `EXECUTE AS USER = @currentUser` per request. Rejected:

- Pool-breaking: each DB user needs its own pool entry, since `EXECUTE AS` changes the principal on the connection and can't be reset cheaply. Pool efficiency collapses.
- Administrative toxicity: adding a new client requires creating a DB user. Provisioning failure modes multiply.
- Azure SQL DB has hard limits on the number of logins per server.

### `EXECUTE AS USER` without per-user login (impersonate a role user)

`EXECUTE AS USER = 'app_user_role'` and pass identity by parameter. Identical to our chosen `SESSION_CONTEXT` approach but forces every stored-procedure call to pass identity, instead of a one-time `sp_set_session_context` at request start. More verbose and equivalent in security.

### Set identity in a `SET` at query-time inside stored procedures only

Require every data access to go through stored procedures that take `@clerk_user_id` as a parameter and enforce it internally. Strongest theoretical isolation — the app cannot issue arbitrary SQL. Rejected because:

- Prisma's strength is query building from TypeScript types; dropping to stored-proc-only negates most of the ORM value.
- Per-query identity-passing is just as easy to get wrong as `SESSION_CONTEXT`, with more code.
- Doesn't compose with dynamic filters.

### App-side RLS (WHERE userId = @caller in every query)

Defeats the point of RLS: one missed filter leaks data. Violates the database-trust-boundary principle (ADR-005).

### JWT-in-DB

Write a CLR function that validates the Clerk JWT via outbound HTTP to JWKS. Rejected:

- CLR is disabled on Azure SQL DB entirely; limiting production choices.
- CLR with outbound network access is a security and operational nightmare.
- Adds ~5-20 ms of latency per query for signature verification.

### `CONTEXT_INFO`

Predecessor to `SESSION_CONTEXT`. Single 128-byte binary value, no key/value semantics, no read-only flag. Strictly worse. `SESSION_CONTEXT` is the modern idiom.

### Hash of Clerk JWT in `SESSION_CONTEXT` for app-side double-check

Add a second key, `clerk_jwt_hash`, that the app compares against the incoming session before trusting the identity. Rejected as security theater: the app is the only writer of `SESSION_CONTEXT`, so verifying its own hash against its own input adds no assurance. The trust chain starts at Clerk (JWT signature), flows through the Next.js middleware (verifier), and ends at `sp_set_session_context`. Double-hashing adds complexity without moving the chain.

## Consequences

- **The app is load-bearing for identity.** A bug that forgets to set `SESSION_CONTEXT` fails closed (empty result set). A bug that sets *the wrong* user ID leaks data. The `$extends` wrapper + ESLint rule + request-context check catches both classes in development; the **pool-reuse re-settability** regression test (§4, Amendment 1) catches the cross-request reuse path — every request overwrites the keys with its own verified identity before any read, so a reused connection never serves a query under a stale identity.
- **Every request handler must pass through the request context initializer.** New routes that don't go through `withRequestContext()` either throw (good, caught in dev) or run with no identity (also caught — RLS returns empty). "Silently wrong" is not a reachable outcome.
- **Admin-pool usage is visible by design.** The pool split is the reified trust boundary — anyone reading the code can see `requestDb` vs `adminDb` and know which side of the line a call lives on.
- **Connection-pool tuning matters.** Pool size, reset-on-release behavior, and driver version all affect correctness. Pinned in `packages/db/` with regression tests.
- **Testing requires a seed helper.** Integration tests that hit the DB directly (not through Next.js) set `SESSION_CONTEXT` manually via a test helper: `withClerkIdentity('user_abc', 'CLIENT', () => { ... })`. The helper acquires a connection, sets context, runs the test body, and asserts connection cleanup.
- **RLS predicate performance is a concern.** `SESSION_CONTEXT(...)` lookups are fast (in-memory), but the joins inside predicates (e.g., `User.clerkId` lookup) run on every query. ADR-005 discusses mitigations (access-set tables, ITVFs, predicate shallowness).
- **Observability.** Query logs include the Clerk user ID (via `SESSION_CONTEXT` captured by the Prisma middleware) so production traces tie row-access back to principal. Sensitive — must not go to third-party log stores without redaction.
- **Migration-time admin principal is separate.** Migrations run under `app_admin_role`, so they don't set `SESSION_CONTEXT` and don't trip RLS policies. Schema migrations can touch all rows.
- **Stored-procedure compatibility.** If future performance work pushes hot queries into stored procs, the procs read `SESSION_CONTEXT` the same way predicates do. No extra parameter passing needed.

## Related

- **ADR-001** — Clerk session verification; source of the identity that reaches `SESSION_CONTEXT`.
- **ADR-002** — SQL Server primary datastore; defines why app-mediated propagation is necessary.
- **ADR-004** — Prisma as sole ORM; the `$extends` wrapper lives in the Prisma client module.
- **ADR-005** — RLS via Security Policies; the read side of the contract — predicates consume what this ADR writes.
- **ADR-006** — Monorepo layout; `packages/db/` holds the wrapped client and the request-context helper.
- **Database-trust-boundary principle** — the database is the trust boundary (ADR-005); the app propagates identity (this ADR).
- **SRS** — REQ-AUTH-003, REQ-NFR-001.

## Implementation contract and regression obligation (Amendment 1, 2026-06-16)

This section binds the §3/§4 amendment to a concrete, checkable implementation. It is the authoritative
spec a developer follows; this ADR does not write the code.

### `packages/db/src/client.ts` — required shape

- In the `$allOperations` middleware, the `sp_set_session_context` pair MUST set both keys **without**
  `@read_only` (writable):
  ```sql
  EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;
  EXEC sp_set_session_context @key = N'role',          @value = @p2;
  ```
- The `if (!ctx.sessionContextSet)` once-per-request guard MUST be left exactly as-is. The
  `ctx === null` fail-closed throw, the `AsyncLocalStorage` scope, and the verified-identity provenance
  path (`withRequestContext` ← `getIdentity()`) MUST NOT change. **The only change is dropping the two
  `@read_only = 1` flags.**
- Update the inline comment (currently lines ~167–168) to state: keys are writable so a reused pooled
  connection re-sets them on the next request; `@read_only` was removed because it locks the key for the
  connection lifetime and is incompatible with pool reuse (15664 on reused connections); within-request
  immutability is preserved by the once-per-request guard + verified-identity-only value + single-writer
  convention. Record a `// DECISION:` comment citing **ADR-003 §3 (Amendment 1, 2026-06-16)** and
  **BUG-002-003**.
- Also correct the file-header comment at lines 15–17 (it still asserts the retired §4 "connection reset
  clears SESSION_CONTEXT on release (driver default behavior)"). Replace with the amended §4 re-settability
  statement.

### Regression-test obligation (HARD — closes the gap that let the defect ship)

Add a **tier-3 integration test** (live SQL Server) in `packages/db/src/` that exercises
**cross-request pooled-connection reuse WITHOUT `$disconnect` between the two request scopes** — the path
`session-context.propagation.test.ts` deliberately avoided. It MUST fail against the old `@read_only = 1`
code (error 15664) and pass after the flags are removed (red-then-green proof). Minimum shape:

1. **Re-settability on a reused pooled connection.** Within one process, with **no** `$disconnect`
   between, run two sequential `withClerkIdentity(...)` scopes that each go through the `$extends` `db`
   path (forcing pool reuse). The second MUST NOT throw 15664 and MUST read back the **second** request's
   identity.
2. **(Stronger, preferred — doubles as the leak guard)** Cross-request reuse with an identity *change*:
   request 1 sets `user_A`/`ACCOUNTANT`; request 2 (reused connection, no disconnect) sets
   `user_B`/`CLIENT`; assert request 2 reads back `user_B`/`CLIENT` — the new identity wins, no 15664, no
   stale `user_A` leak. This is the ADR-003 §4 leak obligation that was never implemented, satisfied by
   **overwrite** rather than by clear.

Do **not** add a blanket `afterEach($disconnect)` that hides reuse for this test — exercising reuse is the
point. The existing `propagation.test.ts` may keep its `$disconnect` for its own cases, but it MUST NOT
mask the new reuse test. Tag the test header with the AC ids and reference **BUG-002-003** + this ADR
amendment. Per ADR-005, this test belongs to the request-pool / RLS regression set that runs on every PR
touching `packages/db/`.

### Security boundary — preserved (ADR-005)

The amendment keeps the ADR-005 trust boundary intact: RLS still keys on a **server-set, verified**
identity written only by the single §2 writer from `getIdentity()`; a CLIENT still cannot read or write
outside policy. No predicate, BLOCK rule, or admin-pool bypass changes. The EPIC-004 F1/F6 identity-spine
tests and the TASK-002-001 write-boundary tests remain valid — they assert *that the verified identity
reaches RLS and that cross-tenant access is denied*, neither of which depends on the read-only flag.

## Changelog

- **2026-04-16 — Accepted.** Original six-part contract, including §3 `@read_only = 1` and §4
  reset-on-release.
- **2026-06-16 — Amendment 1 (OQ-001 / BUG-002-003).** §3 `@read_only = 1` **removed** (keys are now
  writable); §4 "reset-on-release" **retired** as not deliverable on the Prisma 5.22 `sqlserver` (quaint)
  request path and **replaced** by "pool-reuse re-settability." Root cause: `@read_only = 1` locks a key
  for the connection lifetime, which collides with non-negotiable connection pooling (ADR-004) → SQL
  Server error 15664 on every reused connection's second request. Within-request immutability is now
  guaranteed structurally (once-per-request guard + verified-identity-only value + single-writer
  convention) rather than by the lock. Added the previously-missing pooled-reuse regression obligation
  (see § Implementation contract). The ADR's intent — identity verified-only, set once per request,
  reaching RLS intact — is unchanged; ADR-005's RLS dependency is unaffected. §2's conceptual code and the
  contract summary line were updated to match. Status remains **Accepted** (no open decision blocks it).

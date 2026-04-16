# ADR-003: Identity Propagation via SESSION_CONTEXT

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-001 (Clerk auth), ADR-002 (SQL Server), ADR-004 (Prisma ORM), ADR-005 (RLS via Security Policies)

## Context

The portal's access model (REQ-AUTH-002, REQ-AUTH-003, REQ-NFR-001, amended Tenet 7) requires row-level security enforced **at the database**, not the app. The authenticated caller's identity must reach the DB engine on every request so that policy predicates can filter rows by ownership.

Under the original Supabase plan, this was solved by a Supabase JWT template: the Clerk session token was minted in a shape Supabase Auth could verify, and Postgres RLS predicates read the verified claims via `auth.jwt()`. The database itself was a JWT verifier.

SQL Server has no equivalent. It cannot fetch JWKS, cannot verify RS256 signatures, and has no concept of an externally-authenticated request. The identity must be passed in by the caller. The question is: **how, without letting the caller lie?**

SQL Server offers several mechanisms:

1. **`SESSION_CONTEXT`** — a per-session key/value store, read-only flag optional, cleared by the engine on connection reset. Values survive across batches on the same connection.
2. **`CONTEXT_INFO`** — a single 128-byte binary blob per session. Strictly smaller and less ergonomic than `SESSION_CONTEXT`, which supersedes it.
3. **`EXECUTE AS USER`** — re-impersonate as a specific DB user for the current batch. Powerful but requires a DB user per app identity, which does not scale (one DB user per Clerk user means thousands of principals).
4. **One DB user per Clerk user** — literally provision a DB login/user per client. Pool-breaking, administratively toxic, rejected on sight.
5. **JWT-in-DB via CLR or external HTTP** — write a CLR function that verifies the Clerk JWT by calling JWKS. Rejected — CLR is a maintenance and security burden and is disabled by default on most managed engines (Azure SQL disables it entirely).
6. **App-side RLS only** — let the app compose `WHERE userId = @caller` into every query. Violates Tenet 7 (amended): the DB is the trust boundary. Rejected.

The accepted solution is (1). The design below nails down the operational discipline required to make it safe.

## Decision

**Every request-scoped DB connection sets `SESSION_CONTEXT` to the authenticated Clerk user's identity before any data query runs. SQL Server RLS predicates read from `SESSION_CONTEXT` and fail closed when the value is null.**

The full contract has six parts: principal separation, set-on-acquire, read-only flag, reset-on-release, a middleware guard, and an admin bypass.

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
        await requestDb.$executeRawUnsafe(
          `EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1, @read_only = 1;
           EXEC sp_set_session_context @key = N'role',          @value = @p2, @read_only = 1;`,
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

### 3. `@read_only = 1`

Both `sp_set_session_context` calls pass `@read_only = 1`. Downstream code executing on the same connection — including raw SQL in `packages/db/sql/` — cannot overwrite the identity mid-request. An attempted overwrite raises an error, which is preferred to silent spoof.

### 4. Reset-on-release — connection pool hygiene

SQL Server's default connection reset (when a pooled connection is returned) clears `SESSION_CONTEXT`. The Prisma + `mssql` driver stack inherits this behavior by default: connections are reset via `sp_reset_connection` on return to the pool.

However, connection reset is **not a hard guarantee across all drivers and configurations** — older `mssql` driver versions had bugs where `SESSION_CONTEXT` could leak. The contract here is:

- The driver version and connection-string options must be pinned to a configuration that resets `SESSION_CONTEXT` on release. Tested in Epic 001.
- A **regression test** exercises the leak scenario explicitly: acquire a connection, set a spoof `clerk_user_id`, release, acquire again, read `SESSION_CONTEXT` — must be null. This test runs in CI on every PR that touches `packages/db/`.
- As a belt-and-braces measure, the middleware wrapper (§2) could `EXEC sp_set_session_context @key=N'clerk_user_id', @value=NULL, @read_only=0` at the end of each request — but `@read_only=1` makes this impossible. Instead, we rely on the driver's connection reset; the regression test validates it.

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

Defeats the point of RLS: one missed filter leaks data. Violates Tenet 7.

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

- **The app is load-bearing for identity.** A bug that forgets to set `SESSION_CONTEXT` fails closed (empty result set). A bug that sets *the wrong* user ID leaks data. The `$extends` wrapper + ESLint rule + request-context check catches both classes in development; the regression test (§4) catches pool leakage.
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
- **Tenet 7 (amended)** — database is the trust boundary; the app propagates identity.
- **SRS** — REQ-AUTH-003, REQ-NFR-001.

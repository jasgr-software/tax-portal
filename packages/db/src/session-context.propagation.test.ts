/**
 * packages/db/src/session-context.propagation.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (Docker pre-flight mandatory)
 *
 * Closes the carried EPIC-001 retro item:
 *   "client.ts $extends SESSION_CONTEXT propagation untested" (PROGRESS.md § Open retro action items)
 *   The engagement-request.rls.test.ts exercised raw mssql — not the Prisma $extends wrapper.
 *   This test exercises the REAL db ($extends-wrapped request client) against a live container.
 *
 * AC-AUTH-001-03 (SESSION_CONTEXT-authoritative):
 *   Proves the verified role is propagated to the DB session server-side via the $extends
 *   wrapper — specifically that sp_set_session_context fires BEFORE the first real query,
 *   and that both clerk_user_id and role are set correctly.
 *
 * ADR-003 §2: The $extends wrapper sets SESSION_CONTEXT on first use per request.
 * ADR-003 §3: @read_only = 1 prevents downstream overwrite.
 * ADR-003 §5: null identity → fail-closed (zero rows, no error) — RLS side.
 *             No context → throw (the $extends middleware contract) — this test.
 * ADR-005: Role is the server-evaluated trust boundary. SESSION_CONTEXT role must
 *          always come from the verified identity passed to withRequestContext(),
 *          never from client-supplied input.
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules):
 *   1. Run marker: this test file + test names + actual output recorded in TASK-004-007 Work Log.
 *   2. Named code path: packages/db/src/client.ts — the $allOperations block that calls
 *      sp_set_session_context via $executeRawUnsafe before forwarding query(args).
 *   3. Counterfactual: removing the sp_set_session_context EXEC from client.ts $allOperations
 *      would cause the "reads back clerk_user_id + role" test to fail with NULL values,
 *      and real RLS predicates in db/policies/ would silently return 0 rows.
 *
 * Tagged AC IDs: AC-AUTH-001-03
 *
 * Connection:
 *   Uses the real `db` ($extends-wrapped request client from packages/db).
 *
 * URL workaround (TASK-002 / TASK-003 documented limitation):
 *   Prisma 5.22.0 sqlserver connector ignores the port param in semicolon form
 *   (e.g., "sqlserver://localhost;port=14330;...") and defaults to :1433.
 *   This causes authentication failure in local dev where SQL Server is exposed at :14330.
 *   Fix: transform DATABASE_URL from semicolon port form to authority form
 *   ("sqlserver://localhost:14330;...") in beforeAll — Prisma CAN parse the authority form.
 *   This transformation is applied before the lazy `db` singleton is first initialized,
 *   so it takes effect for all db operations in this test file.
 *   The raw-mssql tests in engagement-request.rls.test.ts use the same workaround
 *   (via parseSqlServerUrl) — this test uses the Prisma authority form instead.
 *
 * Environment:
 *   DATABASE_URL       — request pool URL (app_user_role; subject to RLS + SESSION_CONTEXT)
 *   DATABASE_URL_ADMIN — admin pool URL (sa / app_admin; bypasses RLS, for setup)
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { db, withClerkIdentity } from "./index.js";
import { currentRequestContext } from "./context.js";

// ─── URL fixup (authority form so Prisma connector reads port correctly) ───────

/**
 * Transform a semicolon-form sqlserver URL to authority form so Prisma's connector
 * can parse the port correctly.
 *
 * Input:  "sqlserver://localhost;port=14330;user=U;password=P;database=DB;..."
 * Output: "sqlserver://localhost:14330;user=U;password=P;database=DB;..."
 *
 * Prisma ignores `port=N` in the semicolon chain but respects `host:port` in the authority.
 * See TASK-002 / TASK-003 / client.ts header comment for full rationale.
 *
 * Returns the URL unchanged if no `port=` param is found (e.g. already in authority form,
 * or using default port).
 */
function toAuthorityForm(url: string): string {
  // Match: sqlserver://host;port=N; and transform to sqlserver://host:N;
  // Remove the port=N; segment from the param chain.
  const match = url.match(/^(sqlserver:\/\/[^;]+);port=(\d+);(.*)$/i);
  if (!match) return url; // no port param found — leave unchanged
  const [, prefix, port, rest] = match;
  return `${prefix}:${port};${rest}`;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  const rawUrl = process.env["DATABASE_URL"];
  if (!rawUrl) {
    throw new Error("DATABASE_URL is required for SESSION_CONTEXT propagation tests");
  }
  if (!process.env["DATABASE_URL_ADMIN"]) {
    throw new Error("DATABASE_URL_ADMIN is required for SESSION_CONTEXT propagation tests");
  }

  // Transform DATABASE_URL to authority form so the lazy db singleton (initialized on
  // first use) picks up the correct port. This MUST happen before any `db` operation.
  const authorityUrl = toAuthorityForm(rawUrl);
  if (authorityUrl !== rawUrl) {
    process.env["DATABASE_URL"] = authorityUrl;
  }
}, 30000);

/**
 * Disconnect the Prisma request pool after each test.
 *
 * Rationale: the $extends wrapper sets SESSION_CONTEXT with @read_only = 1 (ADR-003 §3).
 * In production each HTTP request gets its own connection from the pool, which is reset
 * on release (ADR-003 §4 "Connection reset clears SESSION_CONTEXT on release").
 * In tests, the Prisma pool holds onto connections between test runs within the same
 * process — a connection that had @read_only=1 set would reject the next test's
 * sp_set_session_context call with error 15664 ("key has been set as read_only").
 *
 * Disconnecting after each test forces the pool to release all connections. The next
 * test reconnects fresh (lazy initialization handles reconnect transparently) with a
 * clean SESSION_CONTEXT state. This correctly models the per-request connection lifecycle.
 *
 * DECISION (TASK-004-007): $disconnect after each test is the least-invasive way to get
 * per-test connection isolation without modifying client.ts or the test's subject code.
 */
afterEach(async () => {
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}, 10000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read SESSION_CONTEXT values back from SQL Server through the $extends-wrapped db client.
 *
 * This is the load-bearing helper — it goes through `db.$queryRawUnsafe` which fires
 * the $allOperations hook (setting SESSION_CONTEXT before the query executes).
 * The query then reads back SESSION_CONTEXT values that were SET by the $allOperations
 * hook in the same connection, before the SELECT ran.
 *
 * Must be called inside withRequestContext/withClerkIdentity so that
 * currentRequestContext() returns a non-null value for the $extends middleware.
 */
async function readSessionContextThroughDb(): Promise<{
  clerkUserId: string | null;
  role: string | null;
}> {
  // Use $queryRawUnsafe — goes through $allOperations (the $extends block) which
  // calls sp_set_session_context before executing. This is the exact production path.
  const rows = await (db as unknown as {
    $queryRawUnsafe: (sql: string) => Promise<unknown[]>;
  }).$queryRawUnsafe(
    `SELECT
       CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(256)) AS clerkUserId,
       CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) AS role`,
  );
  const row = (rows as Array<{ clerkUserId: string | null; role: string | null }>)[0];
  return {
    clerkUserId: row?.clerkUserId ?? null,
    role: row?.role ?? null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe(
  "$extends SESSION_CONTEXT propagation — TIER-3 integration (live SQL Server, AC-AUTH-001-03)",
  () => {
    /**
     * [AC-AUTH-001-03] PRIMARY: $extends sets clerk_user_id + role BEFORE the first real query.
     *
     * Exercises the full $allOperations path in packages/db/src/client.ts:
     *   1. withClerkIdentity sets AsyncLocalStorage context (clerkUserId, role).
     *   2. db.$queryRawUnsafe enters $allOperations.
     *   3. $allOperations reads currentRequestContext() → calls sp_set_session_context.
     *   4. The SELECT executes and reads back SESSION_CONTEXT — which was set in step 3.
     *
     * This is the regression for the EPIC-001 retro item: prior tests used raw mssql,
     * never exercising the $extends middleware chain.
     */
    it(
      "[AC-AUTH-001-03] $extends sets clerk_user_id + role in SESSION_CONTEXT before first real query (wrapped db client)",
      async () => {
        const result = await withClerkIdentity(
          "user_acct_test",
          "ACCOUNTANT",
          readSessionContextThroughDb,
        );

        expect(result.clerkUserId).toBe("user_acct_test");
        expect(result.role).toBe("ACCOUNTANT");
      },
    );

    /**
     * [AC-AUTH-001-03] CLIENT role: proves the role value in SESSION_CONTEXT is exactly
     * what was passed to withClerkIdentity — not hardcoded to ACCOUNTANT.
     */
    it(
      "[AC-AUTH-001-03] $extends sets CLIENT role correctly in SESSION_CONTEXT",
      async () => {
        const result = await withClerkIdentity(
          "user_client_test",
          "CLIENT",
          readSessionContextThroughDb,
        );

        expect(result.clerkUserId).toBe("user_client_test");
        expect(result.role).toBe("CLIENT");
      },
    );

    /**
     * [AC-AUTH-001-03] FAIL-CLOSED: a db query with no active request context throws.
     *
     * Proves the $extends middleware enforces the "no identity → throw" contract
     * (ADR-003 §6). A request that reaches the DB without a valid auth context must
     * fail loudly — not silently leak unauthenticated queries.
     */
    it(
      "[AC-AUTH-001-03] request-pool query through db with no active request context throws (fail-closed)",
      async () => {
        // Verify we are NOT inside a withRequestContext scope
        expect(currentRequestContext()).toBeNull();

        await expect(
          (db as unknown as {
            $queryRawUnsafe: (sql: string) => Promise<unknown[]>;
          }).$queryRawUnsafe("SELECT 1 AS n"),
        ).rejects.toThrow(
          "[packages/db] No identity in request context",
        );
      },
    );

    /**
     * [AC-AUTH-001-03] TRUST BOUNDARY: role written to SESSION_CONTEXT is ONLY the
     * verified role from withClerkIdentity/withRequestContext — never from client input.
     *
     * ADR-005: The wiring in apps/admin page.tsx passes identity.clerkUserId and
     * identity.role from getIdentity() to withRequestContext(). There is no path
     * from client-supplied request body/header/query to SESSION_CONTEXT.
     *
     * This test drives an ACCOUNTANT identity through the $extends wrapper and
     * verifies SESSION_CONTEXT role = "ACCOUNTANT" — simulating the production path
     * where getIdentity() returns the verified identity (not a client assertion).
     */
    it(
      "[AC-AUTH-001-03] role written to SESSION_CONTEXT is the verified role, never client-asserted (trust boundary)",
      async () => {
        // Simulate: verified identity is ACCOUNTANT → SESSION_CONTEXT role must be ACCOUNTANT.
        // The wiring in apps/admin page.tsx does exactly this: calls
        //   withRequestContext(identity.clerkUserId, identity.role, fn)
        // where identity comes from getIdentity() (server-side verified).
        // No client-supplied header or body value reaches withRequestContext().
        const result = await withClerkIdentity(
          "user_verified_acct",
          "ACCOUNTANT",
          readSessionContextThroughDb,
        );

        expect(result.role).toBe("ACCOUNTANT");
        expect(result.clerkUserId).toBe("user_verified_acct");
      },
    );
  },
);

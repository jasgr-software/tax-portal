/**
 * packages/db/src/session-context.pooled-reuse.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (Docker pre-flight mandatory)
 *
 * BUG-002-003 REGRESSION TEST — cross-request pooled-connection reuse of SESSION_CONTEXT.
 *
 * PURPOSE
 * -------
 * This test MUST be RED on the old `@read_only = 1` code (error 15664: "Cannot set key
 * 'clerk_user_id' in the session context. The key has been set as read_only for this session.")
 * and GREEN after removing `@read_only` (ADR-003 §3 Amendment 1 / BUG-002-003).
 *
 * It exercises the exact failure mode that was masked by the propagation test's
 * `afterEach($disconnect)`:
 *   - Request 1 runs withClerkIdentity(user_A, ACCOUNTANT) through the $extends db path.
 *   - NO $disconnect between requests — the pool keeps the connection alive.
 *   - Request 2 runs withClerkIdentity(user_B, CLIENT) on the SAME pooled connection.
 *   - With @read_only = 1: error 15664 on request 2's sp_set_session_context → the test fails.
 *   - With @read_only removed: request 2 re-sets SESSION_CONTEXT cleanly → assert reads
 *     back user_B/CLIENT (2nd identity wins; no stale user_A leak).
 *
 * COUNTERFACTUAL
 * --------------
 * Revert client.ts to restore `@read_only = 1` on either `sp_set_session_context` call.
 * The second withClerkIdentity call below will throw:
 *   "Cannot set key 'clerk_user_id' in the session context. The key has been set as
 *    read_only for this session." (Msg 15664)
 * Both "pooled connection reuse" tests will fail RED. This is the pre-fix failure mode
 * that caused 4 TASK-002-004 write-journey e2e to 500 on post-write RSC re-renders.
 *
 * DESIGN — WHY NO afterEach($disconnect)
 * ----------------------------------------
 * The propagation test (session-context.propagation.test.ts) calls $disconnect after
 * each test precisely to hide error 15664. This test does the OPPOSITE: it must NOT
 * disconnect between the two sequential request scopes within a test, so that the
 * pool hands back the same connection for the second scope. Adding a blanket
 * afterEach($disconnect) here would defeat the reuse purpose and produce a false green
 * on the old buggy code.
 *
 * A single afterAll($disconnect) is included to cleanly shut down the pool after the
 * entire suite finishes.
 *
 * DOUBLES AS ADR-003 §4 LEAK GUARD
 * ----------------------------------
 * The cross-request identity-change assertion (user_A then user_B → reads back user_B,
 * not user_A) verifies that there is no SESSION_CONTEXT identity leak across pooled
 * connections — the ADR-003 §4 obligation that was never implemented before this fix.
 *
 * Tagged AC IDs: AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03 (indirect — this fix
 *   unblocks the 4 write-journey e2e that block BRIEF-002's AC-DOOR-002 gate).
 * References: BUG-002-003, ADR-003 §3 Amendment 1, ADR-003 §4, ADR-004.
 *
 * Connection:
 *   Uses the real `db` ($extends-wrapped request client from packages/db).
 *   DATABASE_URL must point to the live SQL Server instance (loaded by vitest globalSetup
 *   from .env.local — no manual shell export needed).
 *
 * URL workaround (shared with session-context.propagation.test.ts):
 *   Transform DATABASE_URL from semicolon-port form to authority form so Prisma's
 *   sqlserver connector parses the port correctly.
 *   See TASK-002 / TASK-003 / client.ts header for full rationale.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, withClerkIdentity } from "./index.js";

// ─── URL fixup (authority form so Prisma connector reads port correctly) ───────

/**
 * Transform a semicolon-form sqlserver URL to authority form.
 *
 * Input:  "sqlserver://localhost;port=14330;user=U;password=P;database=DB;..."
 * Output: "sqlserver://localhost:14330;user=U;password=P;database=DB;..."
 *
 * Mirrors the helper in session-context.propagation.test.ts.
 */
function toAuthorityForm(url: string): string {
  const match = url.match(/^(sqlserver:\/\/[^;]+);port=(\d+);(.*)$/i);
  if (!match) return url;
  const [, prefix, port, rest] = match;
  return `${prefix}:${port};${rest}`;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  const rawUrl = process.env["DATABASE_URL"];
  if (!rawUrl) {
    throw new Error("DATABASE_URL is required for pooled-reuse SESSION_CONTEXT tests");
  }
  // Transform to authority form BEFORE the lazy db singleton is first initialized.
  const authorityUrl = toAuthorityForm(rawUrl);
  if (authorityUrl !== rawUrl) {
    process.env["DATABASE_URL"] = authorityUrl;
  }
}, 30000);

/**
 * Disconnect the pool once after ALL tests in this file finish.
 *
 * NOTE: Intentionally afterAll, NOT afterEach. The pooled-reuse tests depend on
 * the pool retaining the connection between the two sequential request scopes within
 * each test. An afterEach $disconnect would cause the pool to drop the connection and
 * reconnect fresh, making the test pass even against the old @read_only=1 code
 * (false green — exactly the masking that session-context.propagation.test.ts did).
 */
afterAll(async () => {
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}, 15000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read SESSION_CONTEXT values back from SQL Server through the $extends-wrapped db client.
 *
 * Goes through db.$queryRawUnsafe which fires the $allOperations hook (setting
 * SESSION_CONTEXT before the query executes via sp_set_session_context). This is
 * the exact production path — not raw mssql.
 *
 * Must be called inside withClerkIdentity/withRequestContext.
 */
async function readSessionContext(): Promise<{
  clerkUserId: string | null;
  role: string | null;
}> {
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
  "SESSION_CONTEXT pooled-connection reuse — TIER-3 regression (BUG-002-003 / ADR-003 §3 Amendment 1)",
  () => {
    /**
     * [BUG-002-003] CORE REGRESSION: two sequential request scopes on a reused pooled
     * connection must NOT throw error 15664 and must read back the correct identity.
     *
     * This is the exact production failure path:
     *   - Request 1 (write): server action sets SESSION_CONTEXT with @read_only=1 on
     *     pooled connection A → INSERT commits.
     *   - Request 2 (re-render): revalidatePath triggers RSC re-render → same pool hands
     *     back connection A → second sp_set_session_context throws 15664 → 500.
     *
     * With @read_only removed (this fix):
     *   - Request 2 re-sets SESSION_CONTEXT cleanly on the reused connection → 200.
     *
     * COUNTERFACTUAL: restore @read_only=1 in client.ts → this test throws:
     *   "Cannot set key 'clerk_user_id' in the session context. The key has been set as
     *    read_only for this session." (Msg 15664) → RED.
     *
     * AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03 (indirect — pooled-reuse fix
     *   unblocks the 4 write-journey e2e that were 500ing on post-write RSC re-renders).
     */
    it(
      "[BUG-002-003] second withClerkIdentity scope on a reused pooled connection does NOT throw 15664 (core regression)",
      async () => {
        // --- Request scope 1 (simulates the write request: e.g. createServiceAction) ---
        const result1 = await withClerkIdentity(
          "bug_002_003_user_a",
          "ACCOUNTANT",
          readSessionContext,
        );

        expect(result1.clerkUserId).toBe("bug_002_003_user_a");
        expect(result1.role).toBe("ACCOUNTANT");

        // --- NO $disconnect here — pool must retain the connection ---
        // The pool will reuse the connection for the next scope (same process, same pool).

        // --- Request scope 2 (simulates the RSC re-render: revalidatePath triggers
        //     a new request context with sessionContextSet: false on the SAME connection) ---
        // With @read_only=1 (old code): throws Msg 15664 here.
        // With @read_only removed (fix): re-sets SESSION_CONTEXT cleanly.
        const result2 = await withClerkIdentity(
          "bug_002_003_user_a_2nd",
          "ACCOUNTANT",
          readSessionContext,
        );

        expect(result2.clerkUserId).toBe("bug_002_003_user_a_2nd");
        expect(result2.role).toBe("ACCOUNTANT");
      },
      45000,
    );

    /**
     * [BUG-002-003] IDENTITY CHANGE / LEAK GUARD: cross-request identity change on a
     * reused pooled connection — the 2nd identity wins, no stale 1st-request identity leaks.
     *
     * This is the ADR-003 §4 obligation ("SESSION_CONTEXT-leak guard") that was never
     * implemented before this fix.
     *
     *   - Request 1: user_A / ACCOUNTANT → reads back user_A / ACCOUNTANT.
     *   - NO $disconnect.
     *   - Request 2: user_B / CLIENT on the same connection → MUST read back user_B / CLIENT.
     *     No stale user_A must be visible. No 15664 must be thrown.
     *
     * COUNTERFACTUAL: restore @read_only=1 → request 2 throws Msg 15664 → RED.
     */
    it(
      "[BUG-002-003] identity change across pooled-connection reuse: 2nd request identity wins, no stale 1st-request leak (ADR-003 §4 leak guard)",
      async () => {
        // --- Request scope 1: user_A / ACCOUNTANT ---
        const result1 = await withClerkIdentity(
          "bug_002_003_identity_a",
          "ACCOUNTANT",
          readSessionContext,
        );

        expect(result1.clerkUserId).toBe("bug_002_003_identity_a");
        expect(result1.role).toBe("ACCOUNTANT");

        // --- NO $disconnect — pool reuses the connection ---

        // --- Request scope 2: user_B / CLIENT on the SAME pooled connection ---
        // With @read_only=1 (old code): throws Msg 15664 → RED.
        // With @read_only removed (fix): re-sets SESSION_CONTEXT to user_B/CLIENT → GREEN.
        // Asserts: (a) no 15664, (b) 2nd identity wins, (c) no stale user_A leaked.
        const result2 = await withClerkIdentity(
          "bug_002_003_identity_b",
          "CLIENT",
          readSessionContext,
        );

        // 2nd identity wins
        expect(result2.clerkUserId).toBe("bug_002_003_identity_b");
        expect(result2.role).toBe("CLIENT");

        // No stale identity from request 1 must appear in request 2's reads
        expect(result2.clerkUserId).not.toBe("bug_002_003_identity_a");
        expect(result2.role).not.toBe("ACCOUNTANT");
      },
      45000,
    );
  },
);

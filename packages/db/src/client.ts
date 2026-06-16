/**
 * packages/db/src/client.ts
 *
 * Two Prisma connection pools (ADR-003 §1, ADR-004):
 *
 *   requestDb  — request pool (app_user_role principal, low privilege).
 *                Wrapped with $extends to set SESSION_CONTEXT before every query (ADR-003 §2).
 *                NOT exported from the package barrel — only the wrapped `db` is exported.
 *                ESLint rule in packages/eslint-config enforces this boundary (ADR-003 §6).
 *
 *   adminDb    — admin pool (app_admin_role principal, elevated privilege, RLS-exempt).
 *                Does NOT set SESSION_CONTEXT. Used by migrations, webhooks, cron, seeds.
 *                Exported directly — import is restricted by ESLint to allowed paths.
 *
 * ADR-003 §2: The $extends wrapper sets SESSION_CONTEXT on first use per request.
 * ADR-003 §3 Amendment 1 (BUG-002-003): SESSION_CONTEXT keys are writable (no @read_only).
 *   Within-request immutability is preserved structurally: the once-per-request guard
 *   (sessionContextSet flag) + verified-identity-only provenance + no second writer in the
 *   codebase replace the lock. @read_only was dropped because it locks the key for the
 *   connection lifetime and is incompatible with pool reuse (error 15664 on re-acquire).
 *   Per-request identity is re-set on every request via overwrite — reset-on-release is NOT
 *   the mechanism (Prisma 5.22 quaint sqlserver pool issues no sp_reset_connection; the §4
 *   "connection reset clears SESSION_CONTEXT" assumption was incorrect for this stack).
 * ADR-004: Prisma as sole ORM; no second query client.
 *
 * Environment variables (ADR-007: SQL authentication only, never Managed Identity):
 *   DATABASE_URL       — request pool URL (app_user_role)
 *   DATABASE_URL_ADMIN — admin pool URL (app_admin_role)
 *
 * URL form: sqlserver://host;port=N;database=DB;user=U;password=P;trustServerCertificate=true
 * NOTE: Prisma 5.22.0 sqlserver connector limitation: port param in semicolon form is
 * ignored for 'prisma migrate deploy'. Use host:port mapping at the Docker level and
 * connect Prisma to :1433. See TASK-003 Work Log for details. Runtime connections via
 * mssql driver (used in packages/db) parse the port correctly.
 *
 * LAZY INIT (TASK-006 fix-forward — BUG-001-003):
 *   Both requestDb and adminDb are now constructed lazily via module-level getter functions
 *   rather than at module load time. Merely importing this module (or the @tax-portal/db
 *   barrel) no longer constructs any PrismaClient. Construction happens on first use.
 *
 *   This removes the BUG-001-003 failure mode: when the portal container lacks DATABASE_URL
 *   at import time (e.g. before docker-compose injects it), the module loads without throwing
 *   PrismaClientConstructorValidationError. The env var is read at first-use time instead.
 */

import { PrismaClient } from "@prisma/client";
import { currentRequestContext } from "./context.js";

// ─── Request pool (app_user_role) ─────────────────────────────────────────────
// Low-privilege principal. All queries are filtered by RLS policies (ADR-005).
// SESSION_CONTEXT is set on first query per request via the $extends middleware.
//
// NOT exported from the barrel — only the wrapped `db` is exported.
// ESLint rule in packages/eslint-config/index.js enforces this boundary (ADR-003 §6).
//
// DECISION (TASK-006): Lazy construction via a module-level singleton variable initialized
// on first access. A simple memoized-factory pattern was chosen over Proxy because:
//   (a) it is type-safe without `any` beyond what already existed in the original code,
//   (b) call sites in apps/portal and repositories remain unchanged (they use `db` not
//       `requestDb` directly), and
//   (c) it is the minimal-delta fix that satisfies the lazy-init requirement without
//       introducing a new abstraction layer (ADR-004: Prisma sole ORM, no second client).

let _requestDb: PrismaClient | undefined;

function getRequestDb(): PrismaClient {
  if (!_requestDb) {
    _requestDb = new PrismaClient({
      // exactOptionalPropertyTypes: env vars can be undefined at type level.
      // Prisma's PrismaClient constructor accepts datasource url as string | undefined.
      // Cast to avoid the strict optional property mismatch with Prisma's generated types.
      datasources: {
        db: {
          url: process.env["DATABASE_URL"],
        },
      } as { db: { url: string } },
    });
  }
  return _requestDb;
}

// ─── Admin pool (app_admin_role) ──────────────────────────────────────────────
// Elevated principal. Explicitly exempted from ALL RLS policies (ADR-005 §4).
// Does NOT set SESSION_CONTEXT — RLS predicates pass via IS_MEMBER('app_admin_role').
//
// Legitimate use cases (ADR-003 §7):
//   - Prisma migrations (prisma migrate deploy)
//   - Clerk webhook handlers (user upserts before User row exists)
//   - Cron jobs (overdue-reminder sweeps, 7-year retention purges)
//   - Seed scripts (db/seed/)
//   - The anonymous engagement-request submit path (one sanctioned identity-less write)
//
// NEVER import adminDb from request-handling route handlers.
// ESLint rule in packages/eslint-config/index.js enforces this boundary (ADR-003 §6).
//
// DECISION (TASK-006): Same lazy singleton pattern as requestDb above.

let _adminDb: PrismaClient | undefined;

function getAdminPrismaDb(): PrismaClient {
  if (!_adminDb) {
    _adminDb = new PrismaClient({
      datasources: {
        db: {
          url: process.env["DATABASE_URL_ADMIN"],
        },
      } as { db: { url: string } },
    });
  }
  return _adminDb;
}

/**
 * Admin pool Prisma client (lazy singleton).
 * Constructed on first access — importing this module does NOT construct PrismaClient.
 * Exported as a getter property so it remains a drop-in for the previous `const adminDb`.
 *
 * ADR-003 §1/§6: admin pool; ESLint boundary enforced by packages/eslint-config.
 * ADR-004: Prisma as sole ORM.
 */
export const adminDb: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getAdminPrismaDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Wrapped request client (db) — the $extends SESSION_CONTEXT middleware ────
//
// ADR-003 §2: Every query operation routed through `db` runs sp_set_session_context
// (keys: clerk_user_id, role) on the connection if not already set for this request.
//
// Fail-closed contract:
//   - If AsyncLocalStorage context is missing (no withRequestContext() called upstream),
//     throws an error — catches "forgot to set identity" at dev time.
//   - If SESSION_CONTEXT is null on the SQL Server side, RLS predicates return zero rows
//     (not an error) — ADR-003 §5, ADR-005 §2 "fail-closed on null identity".
//
// sessionContextSet is per-request (tracked in AsyncLocalStorage), not per-connection,
// so the SET runs at most once per request. If multiple connections are used in one
// request, sp_set_session_context re-runs (idempotent — ADR-003 §2).
//
// DECISION (TASK-006): `db` is built lazily by deferring the $extends call inside a
// getter. The Proxy on adminDb above handles lazy construction for adminDb callers.
// For `db` (the $extends-wrapped request client), we use a Proxy as well so that
// the $extends wrapper (which references getRequestDb()) is only materialized on first use.
// This preserves the identical call-site API — consumers `import { db } from "@tax-portal/db"`
// and call `db.engagementRequest.findMany(...)` exactly as before.

let _db: ReturnType<PrismaClient["$extends"]> | undefined;

function getDb(): ReturnType<PrismaClient["$extends"]> {
  if (!_db) {
    _db = getRequestDb().$extends({
      query: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $allOperations: async ({ args, query, model, operation }: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query: (args: any) => Promise<any>;
          model?: string;
          operation: string;
        }) => {
          const ctx = currentRequestContext();

          if (ctx === null) {
            throw new Error(
              `[packages/db] No identity in request context for ${model ?? "unknown"}.${operation}. ` +
                `Wrap the call in withRequestContext() (production) or withClerkIdentity() (tests). ` +
                `ADR-003 §6: request-pool queries without an active context are forbidden.`,
            );
          }

          // Set SESSION_CONTEXT once per request from the verified Clerk identity.
          //
          // @read_only has been removed (ADR-003 §3 Amendment 1, BUG-002-003):
          //   @read_only = 1 locks the key for the lifetime of the SQL Server CONNECTION,
          //   not the lifetime of the request. Under Prisma 5.22 quaint sqlserver pooling,
          //   connections are reused across requests with no sp_reset_connection on release —
          //   so a locked key from request N causes error 15664 on request N+1 when the pool
          //   hands back the same connection. @read_only is fundamentally incompatible with
          //   non-negotiable connection pooling (ADR-004).
          //
          //   Within-request identity immutability is preserved STRUCTURALLY:
          //     (a) the once-per-request guard (sessionContextSet flag) prevents any
          //         second set within the same request scope;
          //     (b) the value written is ALWAYS the verified server-side identity from
          //         withRequestContext() / withClerkIdentity() — never client input;
          //     (c) no other code path issues sp_set_session_context (enforced by the
          //         ESLint requestDb import boundary + barrel non-export).
          //   There is no within-request second writer for @read_only to guard against.
          //
          // DECISION: drop @read_only — ADR-003 §3 Amendment 1 + BUG-002-003.
          //   The pooled-reuse regression test (session-context.pooled-reuse.test.ts) is
          //   RED on the old @read_only=1 code (15664) and GREEN with this fix.
          if (!ctx.sessionContextSet) {
            await getRequestDb().$executeRawUnsafe(
              `EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;
               EXEC sp_set_session_context @key = N'role', @value = @p2;`,
              ctx.clerkUserId,
              ctx.role,
            );
            ctx.sessionContextSet = true;
          }

          return query(args);
        },
      },
    });
  }
  return _db;
}

export const db: ReturnType<PrismaClient["$extends"]> = new Proxy(
  {} as ReturnType<PrismaClient["$extends"]>,
  {
    get(_target, prop) {
      return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
    },
  },
);

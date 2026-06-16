/**
 * packages/db/src/audit.ts — Audit-event write helper (ADR-019)
 *
 * ADR-019 §2: The audit record REQUIRES raw identity (the inverse-of-telemetry rule).
 * ADR-019 §3: Write seam — in the same DB transaction as the mutation, fail-closed.
 * ADR-019 §4: Insert only; no UPDATE/DELETE path from application code.
 * ADR-003:    Actor identity is the server-side request context (clerk_user_id + role),
 *             never from client-supplied body/header/query.
 *
 * DESIGN: recordAuthEvent accepts an explicit actor ({ clerkUserId, role }) so it can be
 * called from two contexts:
 *   (a) Admin-pool paths (mock-session establishment) — no request-scoped SESSION_CONTEXT;
 *       the caller supplies the actor from server-verified session data.
 *   (b) Request-pool paths (client account creation) — the actor comes from the server-side
 *       verified session; caller still passes it explicitly for clarity + testability.
 *
 * DECISION (TASK-004-010): The actor is always passed EXPLICITLY by the caller (from the
 * server-verified identity), not read from currentRequestContext() inside recordAuthEvent.
 * Rationale: (1) the accountant-sign-in seam runs before a request context exists (mock-session
 * endpoint doesn't set up AsyncLocalStorage); (2) explicit passing is clearer, testable,
 * and less "magic" than hidden AsyncLocalStorage reads inside the helper; (3) the caller is
 * always server-side code (actions.ts / route.ts) that already has the verified identity —
 * this matches ADR-003 §1 (the verified identity is available at the request boundary).
 *
 * TRANSACTION BINDING (ADR-019 §3):
 *   - For client-account-creation (apps/portal sign-up/actions.ts): the caller wraps
 *     BOTH the account-creation mutation AND this insert in the same mssql Transaction.
 *     If the audit insert throws, the transaction rolls back — no account without audit record.
 *   - For accountant-sign-in (apps/admin/api/mock-session/route.ts): there is NO matching
 *     DB mutation (the mock-session endpoint only sets a cookie, no DB write). The audit
 *     insert stands alone — fail-closed means: if it throws, the route catches and returns
 *     an error (session cookie not sent). See the DECISION comment in route.ts.
 *
 * ACTION VALUES (extensible without re-architecture):
 *   'auth.signin'          — accountant (or future client) signs in
 *   'auth.account_created' — client account created from invitation
 *   Future slices add new action strings without schema changes.
 *
 * SHAPED FOR BOTH SURFACES:
 *   - Client-account-creation is portal (apps/portal sign-up).
 *   - Accountant-sign-in is admin (apps/admin mock-session).
 *   This helper is surface-agnostic; sourceSurface is passed by the caller.
 *
 * IMPORTANT — no UPDATE/DELETE path: the AuditEvent table uses LEDGER = ON (APPEND_ONLY = ON).
 * App code ONLY ever INSERTs (via this function). No update or delete functions exist.
 * Any future code that attempts to update/delete audit rows is a deviation finding against ADR-019.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "./admin-connection.js";

const { Request: MssqlRequest, Transaction } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The actor performing the audit-worthy action.
 * Must come from server-side verified session data (ADR-003, ADR-019 §2).
 * NEVER from a client-supplied body/header/query field.
 */
export interface AuditActor {
  /** Raw Clerk user id — stored raw (not hashed), required for audit identity (ADR-019 §2) */
  clerkUserId: string;
  /** Application role from the verified session */
  role: "ACCOUNTANT" | "CLIENT";
}

/**
 * Input to recordAuthEvent.
 * Shaped so later slices add new action values without re-architecting.
 */
export interface RecordAuthEventInput {
  /** The actor from the server-verified session (ADR-003, ADR-019 §2) */
  actor: AuditActor;
  /**
   * The action that occurred.
   * Current values: 'auth.signin' | 'auth.account_created'
   * Later slices extend with: 'document.download', 'engagement.transition', etc.
   */
  action: string;
  /** Target entity type (nullable — sign-in has no specific target entity) */
  targetType?: string | undefined;
  /** Target entity id (nullable) */
  targetId?: string | undefined;
  /** Source surface: 'portal' | 'admin' */
  sourceSurface: "portal" | "admin";
  /** Outcome of the action — default 'success' */
  outcome?: "success" | "denied";
  /**
   * Optional mssql Transaction for same-transaction writes (ADR-019 §3).
   * Provided by the client-account-creation path so the audit insert and the
   * account-creation mutation commit/rollback atomically.
   * NOT provided for the accountant-sign-in path (no mutation to bind to).
   */
  transaction?: InstanceType<typeof Transaction> | undefined;
}

// ─── Transaction helper ───────────────────────────────────────────────────────

/**
 * Opens a mssql Transaction on the admin pool and runs `fn` inside it.
 * If `fn` throws (including a failed audit INSERT), the transaction is rolled back.
 * Callers do NOT need to import mssql or getAdminPool directly.
 *
 * Usage pattern (apps/portal sign-up/actions.ts):
 *   await withAuditTransaction(async (txn) => {
 *     await recordAuthEvent({ ..., transaction: txn });
 *     // Future: await insertUserRow({ ... }, txn);
 *   });
 *
 * If `fn` throws, the error propagates to the caller — no session cookie is set.
 * This is the ADR-019 §3 fail-closed guarantee at the call site.
 */
export async function withAuditTransaction<T>(
  fn: (transaction: InstanceType<typeof Transaction>) => Promise<T>,
): Promise<T> {
  const pool = await getAdminPool();
  const txn = new Transaction(pool);
  await txn.begin();
  try {
    const result = await fn(txn);
    await txn.commit();
    return result;
  } catch (err) {
    await txn.rollback().catch(() => {
      // Ignore rollback errors (connection may already be closed)
    });
    throw err;
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Records a security-significant auth event in the AuditEvent ledger table (ADR-019).
 *
 * INSERT only — never UPDATE or DELETE (append-only ledger, ADR-019 §1).
 *
 * When `input.transaction` is provided, executes inside that transaction (fail-closed
 * for mutations). When absent, executes as a standalone insert via the admin pool.
 *
 * ADR-019 §2: The actor fields (clerkUserId, role) are stored RAW — this is the
 * deliberate inverse of ADR-017 telemetry which forbids raw identity.
 * Audit records MAY contain PII by design; they must NEVER be exported to telemetry.
 *
 * @throws if the INSERT fails (caller's transaction rolls back if provided — fail-closed)
 */
export async function recordAuthEvent(input: RecordAuthEventInput): Promise<void> {
  const { actor, action, targetType, targetId, sourceSurface, outcome = "success", transaction } = input;

  // Validate — actor must be server-provided (enforce not empty to catch accidental empty strings)
  if (!actor.clerkUserId || !actor.role) {
    throw new Error(
      "[audit] recordAuthEvent: actor.clerkUserId and actor.role are required. " +
        "These must come from the server-verified session (ADR-003, ADR-019 §2), " +
        "never from client-supplied input.",
    );
  }

  // Build the INSERT request — on the provided transaction or the admin pool directly.
  // DECISION (TASK-004-010): We use the admin pool for all audit inserts.
  // For client-account-creation, the caller provides an mssql Transaction opened on the admin pool
  // (same pool as the account-creation mutation). For accountant-sign-in, we get the pool directly.
  // The admin pool is appropriate: the audit table grants INSERT to app_user_role as well, but
  // the admin pool is used by the account-creation mutation (createEngagementRequest pattern)
  // and is the stable, always-available pool for both surfaces.
  let req: InstanceType<typeof MssqlRequest>;

  if (transaction) {
    // Bind to the caller's transaction for atomic fail-closed writes (ADR-019 §3)
    req = new MssqlRequest(transaction);
  } else {
    // Standalone insert (accountant-sign-in path — no mutation to bind to)
    const pool = await getAdminPool();
    req = new MssqlRequest(pool);
  }

  req.input("clerkUserId", actor.clerkUserId);
  req.input("actorRole", actor.role);
  req.input("action", action);
  req.input("targetType", targetType ?? null);
  req.input("targetId", targetId ?? null);
  req.input("sourceSurface", sourceSurface);
  req.input("outcome", outcome);

  // INSERT — APPEND_ONLY ledger table; no OUTPUT needed (caller gets void)
  await req.query(
    `INSERT INTO [dbo].[AuditEvent]
       ([clerkUserId], [actorRole], [action], [targetType], [targetId], [sourceSurface], [outcome])
     VALUES
       (@clerkUserId, @actorRole, @action, @targetType, @targetId, @sourceSurface, @outcome)`,
  );
}

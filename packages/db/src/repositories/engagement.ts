/**
 * packages/db/src/repositories/engagement.ts
 *
 * Data-access functions for Engagement.
 *
 * AC-ONBD-002-01: Until the letter is e-signed, the questionnaire step is not accessible.
 *   → getEngagementForClient returns letterSignedAt; caller checks gate.
 * AC-ONBD-002-02: Until the letter is e-signed, the document-upload step is not accessible.
 *   → same as above.
 * AC-ONBD-002-04: The signed engagement letter is recorded against the engagement.
 *   → recordLetterSignature sets letterSignedAt + evidence + snapshot.
 *
 * EPIC-006 (TASK-006-001): Added questionnaireSubmittedAt field to EngagementItem.
 *   The questionnaire step's done flag is derived from this field in the onboarding read model.
 *
 * EPIC-010 (TASK-010-001): Added lifecycle transition/confirm/reopen seam.
 *   - transitionEngagementStatus — accountant-only forward transition (ADR-003 §7, DECISION-010-F)
 *   - confirmDelivery / confirmFiling — record delivery/filing confirmation timestamps
 *   - reopenEngagement — Complete → In Progress, clears both confirmation timestamps (DECISION-010-B)
 *   All writes: admin pool inside withAuditTransaction; guarded UPDATE + @@ROWCOUNT (DECISION-010-C).
 *   AC-LIFE-001-01/-02/-03: status invariant enforced at DB (CHECK) + app (allowed-edges map).
 *   AC-LIFE-003-02/-03: no auto-advance; request-pool CLIENT cannot UPDATE status (BLOCK).
 *   AC-LIFE-005-03: → Complete gated on BOTH deliveryConfirmedAt + filingConfirmedAt non-null.
 *   AC-LIFE-006-02: CLIENT cannot reopen (BLOCK on request pool).
 *   ADR-003, ADR-005, ADR-019, CS-TS-001, CS-TS-002, CS-SQL-001, CS-SQL-003.
 *
 * EPIC-011 (TASK-011-002): Added engagement-attribute seams + notes read seam.
 *   - setEngagementDueDate     — accountant-only guarded UPDATE (ADR-003, ADR-019, DECISION-011-D)
 *   - setEngagementPriority    — accountant-only flag/unflag (ADR-003, ADR-019, DECISION-011-D)
 *   - recordEngagementNote     — accountant-only INSERT into EngagementNote (ADR-003, ADR-019, DECISION-011-D)
 *   - listEngagementNotes      — request-pool read under withRequestContext so sec.pol_EngagementNote
 *                                is the access gate (ADR-003, ADR-005, CS-TS-001, DECISION-011-D)
 *   AC-LIFE-007-01/-02: setEngagementDueDate handles both first-set and update (single guarded UPDATE).
 *   AC-LIFE-007-03: per-engagement attribution proven in integration tests.
 *   AC-LIFE-008-02: recordEngagementNote INSERTs an EngagementNote row; audit action engagement.note_recorded.
 *   AC-LIFE-008-02: listEngagementNotes reads under withRequestContext (RLS is the access gate).
 *   AC-LIFE-009-01/-02: setEngagementPriority handles flag (true) + unflag (false).
 *   AC-LIFE-009-03: per-engagement attribution proven in integration tests.
 *   DECISION-011-E: audit action strings — engagement.due_date_set, engagement.priority_set,
 *     engagement.note_recorded.
 *   CS-GEN-001: note body NEVER logged in audit rows.
 *   CS-GEN-002: additive — extends existing functions, no fork.
 *   CS-GEN-003: // ADR-003, // ADR-005, // ADR-019, // DECISION-011-D, // DECISION-011-E.
 *
 * Pool strategy:
 *   - createEngagement: ADMIN POOL (app_admin_role, RLS-exempt).
 *     Engagement is created at accept-time inside withAuditTransaction (TASK-005-003),
 *     before the prospect has a Clerk identity. Using the admin pool is the sanctioned pattern
 *     for identity-less writes (ADR-003 §1/§6). The BLOCK predicate is defence-in-depth.
 *   - getEngagementForClient: REQUEST POOL (db / SESSION_CONTEXT).
 *     FILTER predicate sec.pol_Engagement enforces client isolation per-row.
 *     Must be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *   - recordLetterSignature: ADMIN POOL (substrate tests only — bypasses BLOCK).
 *     Not exported from the package barrel; import directly from this module in tests.
 *   - recordLetterSignatureAsClient: REQUEST POOL via raw mssql parameterised UPDATE.
 *     Runs under the client's SESSION_CONTEXT; the BLOCK predicate allows the owning client
 *     to sign their own letter (CLIENT branch in fn_engagement_access passes).
 *
 * // DECISION-A (deferred): Engagement.clientUserId is intentionally created NULL under the
 * // mock auth binding (the mock invitation cannot resolve an engagementRequestId from a ticket,
 * // so no back-fill runs at sign-up). RLS fails closed on NULL — no CLIENT principal can read
 * // a NULL-linked engagement row (sec.pol_Engagement FILTER predicate). The back-fill that
 * // resolves Engagement.clientUserId at client sign-up will be (re)introduced with the real
 * // auth-binding enablement slice that makes the ticket→request→engagement linkage reachable.
 *
 * // DECISION-B: Onboarding state (letterSignedAt, letterSignatureEvidence,
 * // letterTemplateSnapshot) stored as columns on Engagement, not a separate OnboardingState
 * // table. Simpler for Phase 2 single-step slice.
 *
 * // DECISION-C: letterTemplateSnapshot captures the template content at sign time so later
 * // template edits never retroactively change a signed letter.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { parseSqlServerUrl } from "../sql-server-url.js";
import { db } from "../client.js";
// ADR-019: audit writes; ADR-003 §7: admin pool inside withAuditTransaction for privileged writes
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Input for creating a new Engagement at accept-time.
 *
 * DECISION-A (deferred): clientUserId is optional (nullable) — created before the prospect
 * signs up. The back-fill that sets this field will be introduced with the real auth-binding
 * slice that makes the ticket→request→engagement linkage reachable.
 */
export interface CreateEngagementInput {
  /** The EngagementRequest id this Engagement is linked to (1:1, NOT NULL, UNIQUE). */
  engagementRequestId: string;
  /**
   * DECISION-A (deferred): Optional at creation — the prospect may not have a User row yet.
   */
  clientUserId?: string | undefined;
}

/** Returned from createEngagement. */
export interface CreateEngagementResult {
  /** The newly created Engagement id (UNIQUEIDENTIFIER as string). */
  id: string;
  /** Always 'New' at creation (DECISION-B). */
  status: string;
}

/**
 * Full Engagement shape returned to the client-facing surface.
 *
 * AC-ONBD-002-01/-02: letterSignedAt is the single dynamic onboarding-state field;
 *   NULL = unsigned (gate closed); non-null = signed (gate open).
 * AC-ONBD-002-04: letterSignatureEvidence + letterTemplateSnapshot are recorded on sign.
 * DECISION-010-A (EPIC-010): deliveryConfirmedAt + filingConfirmedAt lifecycle confirmation timestamps.
 *   NULL = not confirmed; non-null = confirmed. Both non-null gates the → Complete transition.
 */
export interface EngagementItem {
  id: string;
  engagementRequestId: string;
  /** DECISION-A (deferred): nullable until back-filled on sign-up. */
  clientUserId: string | null;
  /** 'New' | 'In Progress' | 'Review' | 'Complete' — EPIC-010 adds Review + Complete. */
  status: string;
  /** NULL = unsigned (gate closed); non-null = gate open (AC-ONBD-002-01/-02/-03). */
  letterSignedAt: Date | null;
  /** Mock provider signed-evidence JSON (AC-ONBD-002-04). NULL until signed. */
  letterSignatureEvidence: string | null;
  /** Template content snapshot at sign time (DECISION-C). NULL until signed. */
  letterTemplateSnapshot: string | null;
  /** DECISION-I (EPIC-006): NULL = questionnaire step not satisfied; non-null = satisfied (AC-ONBD-003-03/-04). */
  questionnaireSubmittedAt: Date | null;
  /** DECISION-010-A (EPIC-010): NULL = delivery not confirmed; non-null = confirmed timestamp. */
  deliveryConfirmedAt: Date | null;
  /** DECISION-010-A (EPIC-010): NULL = filing not confirmed; non-null = confirmed timestamp. */
  filingConfirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for recording a letter signature. */
export interface RecordLetterSignatureInput {
  /** The Engagement id to record the signature against. */
  engagementId: string;
  /**
   * The mock provider's deterministic signed-evidence JSON (AC-ONBD-002-04).
   * Typically a JSON string produced by the e-sign provider seam.
   */
  signatureEvidence: string;
  /**
   * The template content snapshot at the moment of signing (DECISION-C).
   * Captured so later template edits don't retroactively change a signed letter.
   */
  templateSnapshot: string;
}

// ─── Internal cast helper ─────────────────────────────────────────────────────

type EngagementRow = {
  id: string;
  engagementRequestId: string;
  clientUserId: string | null;
  status: string;
  letterSignedAt: Date | null;
  letterSignatureEvidence: string | null;
  letterTemplateSnapshot: string | null;
  /** DECISION-I (EPIC-006): questionnaire-step satisfaction marker. */
  questionnaireSubmittedAt: Date | null;
  /** DECISION-010-A (EPIC-010): delivery confirmation timestamp. */
  deliveryConfirmedAt?: Date | null;
  /** DECISION-010-A (EPIC-010): filing confirmation timestamp. */
  filingConfirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Cast the request-scoped `db` wrapper to a typed client for Engagement model access.
 * Pattern mirrors engagement-request.ts (TASK-002-002 DECISION).
 *
 * Two findUnique overloads: by id.
 * Also exposes findFirst (no-arg) for the getMyEngagement resolver.
 *
 * CS-TS-001: request-scoped reads go through the `db` wrapper (SESSION_CONTEXT set by wrapper).
 */
function dbAsEngagementClient() {
  // CS-TS-001: Only through the packages/db wrapper (SESSION_CONTEXT set by the extends client).
  return db as unknown as {
    engagement: {
      findUnique: (args: { where: { id: string } }) => Promise<EngagementRow | null>;
      findFirst: (args?: { orderBy?: { createdAt: "asc" | "desc" } }) => Promise<EngagementRow | null>;
    };
  };
}

// ─── Write: createEngagement (admin pool — RLS-exempt) ────────────────────────

/**
 * Creates a new Engagement at accept-time via the admin pool.
 *
 * DECISION (TASK-005-001): Uses admin pool (app_admin_role, RLS-exempt) — the accept-time
 * create runs inside withAuditTransaction (TASK-005-003) before the prospect has a User row.
 * This is the sanctioned admin-pool write pattern (ADR-003 §1/§6).
 * The BLOCK predicate on sec.pol_Engagement is defence-in-depth only.
 *
 * DECISION-A (deferred): clientUserId is optional; when provided it is set immediately;
 * when absent the field is NULL (RLS fails closed on NULL — see DECISION-A comment above).
 * The back-fill will be introduced with the real auth-binding enablement slice.
 *
 * Status defaults to 'New' (DB DEFAULT — not set explicitly here so the DB constraint
 * is the single source of truth for the default value).
 *
 * @param input.engagementRequestId — the 1:1 FK linking to the originating request.
 * @param input.clientUserId — optional, DECISION-A (deferred).
 * @param transaction — optional mssql Transaction for atomic audit-commit (TASK-005-003).
 */
export async function createEngagement(
  input: CreateEngagementInput,
  transaction?: InstanceType<typeof mssqlPkg.Transaction>,
): Promise<CreateEngagementResult> {
  let req: InstanceType<typeof MssqlRequest>;

  if (transaction) {
    req = new MssqlRequest(transaction);
  } else {
    const pool = await getAdminPool();
    req = new MssqlRequest(pool);
  }

  req.input("engagementRequestId", input.engagementRequestId);
  req.input("clientUserId", input.clientUserId ?? null);

  const result = await req.query<{ id: string; status: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id], INSERTED.[status]
     VALUES (@engagementRequestId, @clientUserId, SYSDATETIMEOFFSET())`
  );

  const newEngagement = result.recordset[0];
  if (!newEngagement) {
    throw new Error("createEngagement INSERT did not return a row — unexpected SQL Server behavior");
  }

  return { id: newEngagement.id, status: newEngagement.status };
}

// ─── Read: getEngagementForClient (request pool — subject to RLS) ─────────────

/**
 * Returns the Engagement visible to the current SESSION_CONTEXT identity, by engagement id.
 *
 * Under sec.pol_Engagement (0005-engagement-policy.sql):
 *   - CLIENT sees only their own engagement (clientUserId match via USER.clerkId join).
 *   - ACCOUNTANT sees any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - The ID does not exist.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 *
 * AC-ONBD-002-01/-02: letterSignedAt field is the gate indicator.
 * AC-ONBD-002-04: letterSignatureEvidence + letterTemplateSnapshot are the evidence fields.
 */
export async function getEngagementForClient(id: string): Promise<EngagementItem | null> {
  // DECISION: use db (Prisma request pool) so SESSION_CONTEXT is set and
  // sec.pol_Engagement FILTER predicate is exercised (fail-closed for null/wrong identity).
  const client = dbAsEngagementClient();
  const row = await client.engagement.findUnique({
    where: { id },
  });

  if (!row) return null;

  return mapRow(row);
}

// ─── Read: getMyEngagement (request pool — no-arg, FILTER-governed) ──────────

/**
 * Returns the Engagement visible to the current SESSION_CONTEXT identity, with no
 * caller-supplied id. In Phase 2 a CLIENT owns exactly one engagement.
 *
 * // DECISION (TASK-005-006): The client's engagement is resolved server-side under the
 * // sec.pol_Engagement FILTER predicate — never from a client-supplied URL param, form
 * // data, or body. The FILTER already scopes the query to the caller's own row(s);
 * // findFirst returns that single row. In Phase 2 the brief's out-of-scope fence
 * // (single primary participant per engagement) means at most one row is visible.
 * // If the CLIENT has no engagement yet (clientUserId not yet back-filled — DECISION-A)
 * // the FILTER returns ZERO rows → null (fail-closed). A non-owner or null
 * // SESSION_CONTEXT also returns null (fail-closed, ADR-003 §5).
 * //
 * // This function is the minimal additive read needed by the onboarding page (TASK-005-006)
 * // so the page never receives an id from the client. It mirrors the established FILTER
 * // pattern already used by getEngagementForClient.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - The CLIENT has no engagement (clientUserId not yet set — DECISION-A).
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 */
export async function getMyEngagement(): Promise<EngagementItem | null> {
  const client = dbAsEngagementClient();
  // findFirst under the FILTER-governed request pool: returns the caller's own row.
  // Phase 2: at most one Engagement is visible (one-per-client).
  const row = await client.engagement.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!row) return null;

  return mapRow(row);
}

// ─── Write: recordLetterSignature (admin pool — substrate/test path only) ────
//
// NOT exported from the package barrel (packages/db/src/index.ts).
// Import directly from this source module in substrate tests that need it:
//   import { recordLetterSignature } from "@tax-portal/db/src/repositories/engagement.js"
// For the production signing path use recordLetterSignatureAsClient (request pool, BLOCK-governed).

/**
 * Records the engagement-letter signature evidence against the engagement.
 *
 * Sets letterSignedAt (gate open), letterSignatureEvidence (AC-ONBD-002-04 evidence),
 * and letterTemplateSnapshot (DECISION-C: snapshot at sign-time).
 *
 * DECISION (TASK-005-001): This function uses the ADMIN POOL — it was introduced in
 * TASK-005-001 as a substrate-level write (bypasses the BLOCK predicate). It is retained
 * for substrate persistence tests (engagement.persistence.test.ts) that need to write
 * signature data directly without exercising the CLIENT ownership gate.
 *
 * For the production signing path that MUST exercise the BLOCK predicate (AC-ONBD-002-01/-02
 * server-side gate), use `recordLetterSignatureAsClient` below (request pool, SESSION_CONTEXT
 * in-batch, BLOCK-governed). That is the function called by signEngagementLetterAction in
 * apps/portal/src/app/onboarding/actions.ts.
 *
 * Returns: { rowsAffected: number }
 *   rowsAffected = 1 → success
 *   rowsAffected = 0 → engagement not found
 */
export async function recordLetterSignature(
  input: RecordLetterSignatureInput,
): Promise<{ rowsAffected: number }> {
  // DECISION (TASK-005-001/TASK-005-005): Admin pool — used for substrate tests only.
  // The production signing path uses recordLetterSignatureAsClient (request pool + BLOCK).
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("engagementId", input.engagementId);
  req.input("signatureEvidence", input.signatureEvidence);
  req.input("templateSnapshot", input.templateSnapshot);

  const result = await req.query<{ rowsAffected: number }>(
    `UPDATE [dbo].[Engagement]
     SET [letterSignedAt] = SYSDATETIMEOFFSET(),
         [letterSignatureEvidence] = @signatureEvidence,
         [letterTemplateSnapshot] = @templateSnapshot,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @engagementId;
     SELECT @@ROWCOUNT AS rowsAffected;`
  );

  const rowsAffected =
    (result.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

  return { rowsAffected };
}

// ─── Write: recordLetterSignatureAsClient (request pool — BLOCK-governed) ────

/**
 * Records the engagement-letter signature as the owning CLIENT via the REQUEST POOL.
 *
 * This is the PRODUCTION signing path called by signEngagementLetterAction. Unlike
 * `recordLetterSignature` (admin pool, above), this function:
 *   - Acquires a raw mssql connection from the REQUEST POOL (DATABASE_URL).
 *   - Sets SESSION_CONTEXT (clerk_user_id + role) IN THE SAME BATCH as the UPDATE,
 *     so the sec.pol_Engagement BLOCK predicate (BEFORE UPDATE) governs the write.
 *   - Returns rowsAffected = 0 when the BLOCK predicate denies the write
 *     (non-owner CLIENT or null SESSION_CONTEXT) — the caller must treat 0 as a
 *     refusal and STOP (do not audit a non-event).
 *
 * Pool hygiene: SESSION_CONTEXT keys are cleared after the UPDATE so the pooled
 * connection is returned in a clean state (ADR-003 §4 spirit).
 *
 * DECISION (TASK-005-005): Separate request-pool variant (not a rewrite of
 * `recordLetterSignature`) so substrate persistence tests remain unaffected.
 * The two-function approach is documented here and in the actions.ts DECISION comment.
 *
 * @param input.engagementId — the Engagement to sign.
 * @param input.signatureEvidence — provider evidence JSON (AC-ONBD-002-04).
 * @param input.templateSnapshot — template content at sign time (DECISION-C).
 * @param input.clerkUserId — the CLIENT's Clerk user ID (from verified session only).
 * @param input.role — must be 'CLIENT' (verified server-side, never client-asserted).
 *
 * Returns { rowsAffected: number }:
 *   1 → success (CLIENT is the owner, BLOCK passed, fields set)
 *   0 → denied (non-owner CLIENT, null SESSION_CONTEXT, or engagement not found)
 *
 * AC-ONBD-002-04: letterSignatureEvidence is the recorded evidence.
 * DECISION-C: templateSnapshot captured at sign time.
 * ADR-003 Amendment 1: no @read_only on sp_set_session_context.
 * ADR-005: BLOCK predicate sec.pol_Engagement enforces owner-only writes.
 */
export async function recordLetterSignatureAsClient(input: RecordLetterSignatureInput & {
  clerkUserId: string;
  role: "CLIENT";
}): Promise<{ rowsAffected: number }> {
  // DECISION (TASK-005-005): Use raw mssql request pool with SESSION_CONTEXT set IN THE SAME
  // BATCH as the UPDATE — the BLOCK predicate evaluates SESSION_CONTEXT at the UPDATE boundary.
  // Mirror the proven pattern from engagement.client-isolation.rls.test.ts (L100-122, L286-298).
  // @read_only = 0 per ADR-003 Amendment 1 — never @read_only = 1.

  const requestUrl = process.env["DATABASE_URL"];
  if (!requestUrl) {
    throw new Error(
      "[packages/db] DATABASE_URL is not set. " +
        "Required for request-pool CLIENT signature write (ADR-003).",
    );
  }

  const mssql = mssqlPkg;
  const { ConnectionPool: MssqlConnectionPool } = mssql;
  const config = parseSqlServerUrl(requestUrl);

  // Open a dedicated connection for this request (needed because getRequestDb is a Prisma
  // singleton — we need raw mssql to set SESSION_CONTEXT in-batch with a parameterised UPDATE).
  // DECISION (TASK-005-005): This creates a short-lived pool rather than a singleton to avoid
  // keeping request-pool connections open for the lifetime of the process in tests. The pool
  // is closed after the UPDATE. In production a shared request-pool singleton would be more
  // efficient, but the signing path is low-frequency (once per engagement) so the overhead is
  // acceptable. This can be optimised to a shared pool in a follow-up if needed.
  const pool = new MssqlConnectionPool(config);
  await pool.connect();

  try {
    // Injection-safety for sp_set_session_context args (cannot be parameterised in a .batch()):
    //   clerkUserId and role are server-derived from the verified session — never client-supplied.
    //   Single-quote-escaped before interpolation as string literals (mirror test helper pattern).
    //   The real authorization fence is sec.pol_Engagement FILTER+BLOCK (ADR-005).
    const escapedClerkId = input.clerkUserId.replace(/'/g, "''");
    const escapedRole = input.role.replace(/'/g, "''");

    // SEC-1: the three UPDATE data values (signatureEvidence, templateSnapshot, engagementId)
    // are bound via mssql .input() parameters and referenced as @-prefixed placeholders in the
    // batch text. Only the two sp_set_session_context args remain as escaped string literals
    // (they cannot be parameterised in a .batch()).
    const req = pool.request();
    req.input("signatureEvidence", mssql.NVarChar(mssql.MAX), input.signatureEvidence);
    req.input("templateSnapshot", mssql.NVarChar(mssql.MAX), input.templateSnapshot);
    req.input("engagementId", mssql.NVarChar(50), input.engagementId);

    const sql = `
      EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${escapedClerkId}', @read_only = 0;
      EXEC sp_set_session_context @key = N'role', @value = N'${escapedRole}', @read_only = 0;
      UPDATE [dbo].[Engagement]
      SET [letterSignedAt] = SYSDATETIMEOFFSET(),
          [letterSignatureEvidence] = @signatureEvidence,
          [letterTemplateSnapshot] = @templateSnapshot,
          [updatedAt] = SYSDATETIMEOFFSET()
      WHERE [id] = @engagementId;
      SELECT @@ROWCOUNT AS rowsAffected;
      EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
      EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;
    `;

    const result = await req.batch(sql);

    // The UPDATE recordset is in a middle position (between the sp_set calls before and after).
    // When there are N statements, recordsets[2] is the SELECT @@ROWCOUNT (0=sp_set, 1=sp_set,
    // 2=UPDATE, 3=SELECT, 4=sp_set, 5=sp_set). Actually SQL Server returns recordsets only for
    // statements that produce rows. The SELECT @@ROWCOUNT returns a single-row recordset.
    // The sp_set_session_context calls produce no rows (empty recordsets in the batch).
    // We find the first non-empty recordset after the sp_set calls that has rowsAffected.
    const recordsets = result.recordsets as Array<Array<{ rowsAffected?: number }>>;
    // The SELECT @@ROWCOUNT AS rowsAffected will be in a recordset — find it.
    let rowsAffected = 0;
    for (const rs of recordsets) {
      if (rs.length > 0 && rs[0] !== undefined && "rowsAffected" in rs[0]) {
        rowsAffected = rs[0].rowsAffected ?? 0;
        break;
      }
    }

    return { rowsAffected };
  } finally {
    await pool.close().catch(() => { /* ignore pool close errors */ });
  }
}

// ─── Read: getEngagementForAdmin (admin pool — RLS-exempt, lifecycle state) ───

/**
 * Returns the full lifecycle state of an Engagement for the admin surface.
 *
 * Used by: apps/admin engagement detail page (TASK-010-003) to display
 *   current status + deliveryConfirmedAt + filingConfirmedAt for the
 *   lifecycle control panel.
 *
 * EPIC-011 (TASK-011-003): Extended additively to include dueDate + isPriority.
 *   CS-GEN-002: additive extension — no existing fields removed or renamed.
 *   These fields are read by EngagementAttributesPanel (TASK-011-003).
 *
 * ADR-003 §7: Admin pool — correct for admin-surface reads without SESSION_CONTEXT.
 * ADR-006: Admin surface only — not accessible from apps/portal.
 * ADR-005: No new entity/column/policy. Reads existing Engagement columns.
 *
 * Returns null when the engagement is not found.
 *
 * @param engagementId — the Engagement.id from the URL route param (server-resolved).
 */
export async function getEngagementForAdmin(
  engagementId: string,
): Promise<{
  id: string;
  status: string;
  deliveryConfirmedAt: Date | null;
  filingConfirmedAt: Date | null;
  engagementRequestId: string;
  // EPIC-011 / TASK-011-003: additive attribute fields (CS-GEN-002)
  dueDate: Date | null;
  isPriority: boolean;
} | null> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", engagementId);

  const result = await req.query<{
    id: string;
    status: string;
    deliveryConfirmedAt: Date | null;
    filingConfirmedAt: Date | null;
    engagementRequestId: string;
    dueDate: Date | null;
    isPriority: boolean;
  }>(
    `SELECT [id], [status], [deliveryConfirmedAt], [filingConfirmedAt], [engagementRequestId],
            [dueDate], [isPriority]
     FROM [dbo].[Engagement]
     WHERE [id] = @engagementId`
  );

  const row = result.recordset[0];
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    deliveryConfirmedAt: row.deliveryConfirmedAt ?? null,
    filingConfirmedAt: row.filingConfirmedAt ?? null,
    engagementRequestId: row.engagementRequestId,
    // CS-GEN-002: additive — new fields from EPIC-011/TASK-011-003
    dueDate: row.dueDate ?? null,
    isPriority: row.isPriority ?? false,
  };
}

// ─── Read: listEngagementsForAdmin (admin pool — RLS-exempt, full-visibility list) ──

/**
 * Returns a full-visibility list of all Engagements (with request details) for the admin surface.
 *
 * AC-AUTH-002-01: The accountant sees engagements regardless of which client owns them.
 * AC-AUTH-002-02: The admin engagement list is accessible to the accountant.
 *
 * ADR-003 §7: Admin pool — RLS-exempt for accountant use (no SESSION_CONTEXT needed).
 * ADR-006: Admin surface only — not accessible from apps/portal.
 *
 * Returns an empty array when no engagements exist.
 */
export async function listEngagementsForAdmin(): Promise<Array<{
  id: string;
  status: string;
  engagementRequestId: string;
  clientFirstName: string | null;
  clientLastName: string | null;
  clientEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}>> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  const result = await req.query<{
    id: string;
    status: string;
    engagementRequestId: string;
    clientFirstName: string | null;
    clientLastName: string | null;
    clientEmail: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT e.[id],
            e.[status],
            e.[engagementRequestId],
            er.[firstName] AS clientFirstName,
            er.[lastName]  AS clientLastName,
            er.[email]     AS clientEmail,
            e.[createdAt],
            e.[updatedAt]
     FROM [dbo].[Engagement] e
     LEFT JOIN [dbo].[EngagementRequest] er ON er.[id] = e.[engagementRequestId]
     ORDER BY e.[createdAt] DESC`
  );

  return result.recordset.map((row) => ({
    id: row.id,
    status: row.status,
    engagementRequestId: row.engagementRequestId,
    clientFirstName: row.clientFirstName ?? null,
    clientLastName: row.clientLastName ?? null,
    clientEmail: row.clientEmail ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ─── Read: getEngagementStatusForAdmin (admin pool — RLS-exempt, status-only) ─

/**
 * Returns a minimal status-only view of an Engagement for the admin surface.
 *
 * Used by: apps/admin document-requests page to display a read-only engagement
 * status badge (AC-ONBD-006-01 UI observable).
 *
 * DECISION (TASK-008-003): Admin pool is correct here because:
 *   (a) The accountant needs to see the engagement's current status regardless of
 *       whether a CLIENT SESSION_CONTEXT is set (there is none on the admin page).
 *   (b) getEngagementForClient (request pool) requires a SESSION_CONTEXT-aware context
 *       and returns a full EngagementItem — overkill for a status-only badge.
 *   (c) The admin pool is already used for engagement writes at accept-time
 *       (createEngagement) — admin reads at the same trust level are consistent.
 *   (d) ADR-003 §7: admin pool is allowed for admin-surface reads that are not
 *       request-scoped (the admin is authenticated by the middleware guard, not
 *       by SESSION_CONTEXT).
 *
 * ADR-006: Admin surface only — not accessible from apps/portal.
 * ADR-005: No new entity/column/policy. Reads existing Engagement.status.
 * ADR-003: Admin pool; no withRequestContext required.
 *
 * Returns { id, status } when the engagement exists, null otherwise.
 *
 * @param engagementId — the Engagement.id from the URL route param (server-resolved).
 */
export async function getEngagementStatusForAdmin(
  engagementId: string,
): Promise<{ id: string; status: string } | null> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", engagementId);

  const result = await req.query<{ id: string; status: string }>(
    `SELECT [id], [status]
     FROM [dbo].[Engagement]
     WHERE [id] = @engagementId`
  );

  const row = result.recordset[0];
  if (!row) return null;

  return { id: row.id, status: row.status };
}

// ─── Lifecycle seam types (EPIC-010 / TASK-010-001) ──────────────────────────

/**
 * Allowed forward transition edges (DECISION-010-D).
 * Arbitrary backward/skip moves are not exposed by this seam.
 * EPIC-008 automatic New → In Progress is handled separately by processOnboardingCompletion.
 *
 * CS-GEN-002: Additive — no prior status values removed.
 */
export const LIFECYCLE_ALLOWED_TRANSITIONS: ReadonlyMap<string, string> = new Map([
  ["New", "In Progress"],
  ["In Progress", "Review"],
  ["Review", "Complete"],
  // Reopen is exposed via reopenEngagement (not via transitionEngagementStatus)
]);

/**
 * Input for accountant-initiated lifecycle transitions (DECISION-010-F).
 * All writes use the admin pool inside withAuditTransaction.
 *
 * AC-LIFE-001-03 / AC-LIFE-003-02: accountant drives the forward steps.
 * ADR-003 §7: admin pool is correct for accountant writes not in a request-pool context.
 */
export interface TransitionEngagementInput {
  /** The Engagement.id to transition (server-resolved — never client-supplied). */
  engagementId: string;
  /** Expected current status (guarded WHERE clause — DECISION-010-C). */
  fromStatus: string;
  /** Target status (must be in LIFECYCLE_ALLOWED_TRANSITIONS). */
  toStatus: string;
  /** The accountant's identity (from server-verified session — ADR-003, ADR-019 §2). */
  actor: AuditActor;
  /** Source surface for audit record (ADR-019). */
  sourceSurface: "admin";
}

/** Result of transitionEngagementStatus. */
export interface TransitionResult {
  /**
   * true  — the UPDATE succeeded (rowsAffected = 1).
   * false — guard failed: engagement not found, wrong status, or concurrent update won the race.
   */
  transitioned: boolean;
}

/**
 * Input for recording a delivery or filing confirmation (DECISION-010-A).
 * AC-LIFE-005-03: both confirmations required before → Complete.
 */
export interface ConfirmEngagementInput {
  /** The Engagement.id to confirm (server-resolved). */
  engagementId: string;
  /** The accountant's identity (from server-verified session). */
  actor: AuditActor;
  /** Source surface for audit record. */
  sourceSurface: "admin";
}

/** Result of a confirmation write. */
export interface ConfirmResult {
  /** true = confirmation recorded; false = engagement not found or already confirmed. */
  confirmed: boolean;
}

// ─── Write: transitionEngagementStatus (admin pool — accountant-only) ─────────

/**
 * Accountant-initiated lifecycle transition (DECISION-010-C/D/F).
 *
 * Allowed edges (DECISION-010-D): New→In Progress, In Progress→Review, Review→Complete.
 * For Review→Complete: ALSO requires deliveryConfirmedAt IS NOT NULL AND filingConfirmedAt IS NOT NULL
 * (AC-LIFE-005-03). The guard returns { transitioned: false } if either confirmation is missing.
 *
 * Fire-once guard: UPDATE WHERE id=@id AND status=@from + @@ROWCOUNT (DECISION-010-C).
 * Atomic with audit INSERT (ADR-019, withAuditTransaction).
 *
 * ADR-003 §7: admin pool — accountant write, no request-pool SESSION_CONTEXT needed.
 * ADR-005:    BLOCK predicate on the request pool prevents CLIENT from calling this path.
 *             (This function runs on the admin pool which is BLOCK-exempt — correct.)
 * ADR-019:    Audit event recorded in the same transaction as the status UPDATE.
 * CS-TS-001:  Request-scoped reads go through the db wrapper; this is an admin-pool write.
 * CS-TS-002:  Admin pool only through getAdminPool() inside withAuditTransaction.
 * CS-GEN-003: // ADR-003, // ADR-005, // ADR-019, // DECISION-010-C, // DECISION-010-D
 *
 * @returns { transitioned: true }  — UPDATE succeeded; audit row inserted.
 * @returns { transitioned: false } — Guard failed (wrong status, missing confirmations, not found).
 */
export async function transitionEngagementStatus(
  input: TransitionEngagementInput,
): Promise<TransitionResult> {
  // ADR-003, DECISION-010-D: validate the edge is in the allowed-transitions map before touching DB
  const allowedTo = LIFECYCLE_ALLOWED_TRANSITIONS.get(input.fromStatus);
  if (allowedTo !== input.toStatus) {
    // Not an allowed transition — caller guard (action layer is the trust fence)
    return { transitioned: false };
  }

  return withAuditTransaction(async (txn) => {
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", mssqlPkg.NVarChar(50), input.engagementId);
    updateReq.input("fromStatus", mssqlPkg.NVarChar(20), input.fromStatus);
    updateReq.input("toStatus", mssqlPkg.NVarChar(20), input.toStatus);

    let sql: string;

    if (input.toStatus === "Complete") {
      // AC-LIFE-005-03: → Complete additionally requires BOTH confirmations non-null
      // DECISION-010-C: guarded UPDATE WHERE status=@from AND both confirms non-null
      sql = `
        UPDATE [dbo].[Engagement]
        SET [status] = @toStatus,
            [updatedAt] = SYSDATETIMEOFFSET()
        WHERE [id] = @id
          AND [status] = @fromStatus
          AND [deliveryConfirmedAt] IS NOT NULL
          AND [filingConfirmedAt]   IS NOT NULL;
        SELECT @@ROWCOUNT AS rowsAffected;
      `;
    } else {
      // DECISION-010-C: standard guarded UPDATE WHERE status=@from
      sql = `
        UPDATE [dbo].[Engagement]
        SET [status] = @toStatus,
            [updatedAt] = SYSDATETIMEOFFSET()
        WHERE [id] = @id
          AND [status] = @fromStatus;
        SELECT @@ROWCOUNT AS rowsAffected;
      `;
    }

    const updateResult = await updateReq.query<{ rowsAffected: number }>(sql);
    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      // Guard fired: wrong status, missing confirmations, or engagement not found.
      // withAuditTransaction will commit a no-op.
      return { transitioned: false };
    }

    // ADR-019: audit event — same transaction as the status UPDATE
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.transition",  // DECISION-010-G: reuse engagement.transition for forward steps
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { transitioned: true };
  });
}

// ─── Write: confirmDelivery (admin pool — accountant-only) ────────────────────

/**
 * Records the delivery confirmation timestamp on an Engagement (DECISION-010-A).
 *
 * AC-LIFE-005-03: Both delivery and filing must be confirmed before → Complete.
 * Sets deliveryConfirmedAt = NOW() if currently NULL (idempotent-safe via IS NULL guard).
 *
 * ADR-003 §7: admin pool.
 * ADR-019: audit event in the same transaction.
 * DECISION-010-G: audit action 'engagement.confirm_delivery'.
 */
export async function confirmDelivery(input: ConfirmEngagementInput): Promise<ConfirmResult> {
  return withAuditTransaction(async (txn) => {
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", mssqlPkg.NVarChar(50), input.engagementId);

    const updateResult = await updateReq.query<{ rowsAffected: number }>(`
      UPDATE [dbo].[Engagement]
      SET [deliveryConfirmedAt] = SYSDATETIMEOFFSET(),
          [updatedAt]           = SYSDATETIMEOFFSET()
      WHERE [id] = @id
        AND [deliveryConfirmedAt] IS NULL;
      SELECT @@ROWCOUNT AS rowsAffected;
    `);

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      return { confirmed: false };
    }

    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.confirm_delivery",  // DECISION-010-G
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { confirmed: true };
  });
}

// ─── Write: confirmFiling (admin pool — accountant-only) ─────────────────────

/**
 * Records the filing confirmation timestamp on an Engagement (DECISION-010-A).
 *
 * AC-LIFE-005-03: Both delivery and filing must be confirmed before → Complete.
 * Sets filingConfirmedAt = NOW() if currently NULL (idempotent-safe via IS NULL guard).
 *
 * ADR-003 §7: admin pool.
 * ADR-019: audit event in the same transaction.
 * DECISION-010-G: audit action 'engagement.confirm_filing'.
 */
export async function confirmFiling(input: ConfirmEngagementInput): Promise<ConfirmResult> {
  return withAuditTransaction(async (txn) => {
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", mssqlPkg.NVarChar(50), input.engagementId);

    const updateResult = await updateReq.query<{ rowsAffected: number }>(`
      UPDATE [dbo].[Engagement]
      SET [filingConfirmedAt] = SYSDATETIMEOFFSET(),
          [updatedAt]         = SYSDATETIMEOFFSET()
      WHERE [id] = @id
        AND [filingConfirmedAt] IS NULL;
      SELECT @@ROWCOUNT AS rowsAffected;
    `);

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      return { confirmed: false };
    }

    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.confirm_filing",  // DECISION-010-G
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { confirmed: true };
  });
}

// ─── Write: reopenEngagement (admin pool — accountant-only) ──────────────────

/**
 * Reopens a Complete engagement: Complete → In Progress (DECISION-010-B).
 *
 * Clears both confirmation timestamps so a future re-completion re-gates on both
 * confirmations (deliveryConfirmedAt = NULL, filingConfirmedAt = NULL).
 *
 * AC-LIFE-006-02: CLIENT cannot call this (the BLOCK predicate blocks request-pool UPDATEs).
 * DECISION-010-B: reopen target is In Progress; confirmation timestamps cleared on reopen.
 *
 * Fire-once guard: UPDATE WHERE status='Complete' + @@ROWCOUNT.
 *
 * ADR-003 §7: admin pool.
 * ADR-019: audit event 'engagement.reopen' in the same transaction (DECISION-010-G).
 */
export async function reopenEngagement(
  input: ConfirmEngagementInput,
): Promise<{ reopened: boolean }> {
  return withAuditTransaction(async (txn) => {
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", mssqlPkg.NVarChar(50), input.engagementId);

    const updateResult = await updateReq.query<{ rowsAffected: number }>(`
      UPDATE [dbo].[Engagement]
      SET [status]                = N'In Progress',
          [deliveryConfirmedAt]   = NULL,
          [filingConfirmedAt]     = NULL,
          [updatedAt]             = SYSDATETIMEOFFSET()
      WHERE [id] = @id
        AND [status] = N'Complete';
      SELECT @@ROWCOUNT AS rowsAffected;
    `);

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      return { reopened: false };
    }

    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.reopen",  // DECISION-010-G
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { reopened: true };
  });
}

// ─── EPIC-011: Engagement attribute seams (TASK-011-002) ─────────────────────
//
// All write seams (setEngagementDueDate, setEngagementPriority, recordEngagementNote)
// follow the EPIC-010 pattern verbatim:
//   admin pool inside withAuditTransaction → guarded UPDATE/INSERT + @@ROWCOUNT → atomic audit event.
//
// The notes READ seam (listEngagementNotes) runs under withRequestContext so
// sec.pol_EngagementNote is the access gate — NOT app-layer filtering.
// ADR-003, ADR-005, CS-TS-001, CS-TS-002, CS-GEN-001, CS-GEN-002, CS-GEN-003.

/**
 * Input for setting the due date on an engagement (first-set or update).
 *
 * AC-LIFE-007-01/-02: single seam handles both first-set and update — a plain guarded UPDATE.
 * DECISION-011-D: accountant-only write; admin pool inside withAuditTransaction.
 * DECISION-011-E: audit action string 'engagement.due_date_set'.
 */
export interface SetEngagementDueDateInput {
  /** The Engagement.id to update (server-resolved — never client-supplied). */
  engagementId: string;
  /**
   * The new due date (calendar date only — @db.Date, not a timestamp).
   * Pass null to clear the due date.
   */
  dueDate: Date | null;
  /** The accountant's identity (from server-verified session — ADR-003, ADR-019 §2). */
  actor: AuditActor;
  /** Source surface for audit record (ADR-019). */
  sourceSurface: "admin";
}

/** Result of setEngagementDueDate. */
export interface SetDueDateResult {
  /**
   * true  — the UPDATE succeeded (rowsAffected = 1).
   * false — engagement not found.
   */
  success: boolean;
}

/**
 * Input for setting (flag) or clearing (unflag) the priority flag.
 *
 * AC-LIFE-009-01/-02: single seam handles flag (isPriority=true) and unflag (isPriority=false).
 * DECISION-011-D: accountant-only write; admin pool inside withAuditTransaction.
 * DECISION-011-E: audit action string 'engagement.priority_set'.
 */
export interface SetEngagementPriorityInput {
  /** The Engagement.id to update (server-resolved — never client-supplied). */
  engagementId: string;
  /** true = flag as priority; false = unflag. */
  isPriority: boolean;
  /** The accountant's identity (from server-verified session — ADR-003, ADR-019 §2). */
  actor: AuditActor;
  /** Source surface for audit record (ADR-019). */
  sourceSurface: "admin";
}

/** Result of setEngagementPriority. */
export interface SetPriorityResult {
  /**
   * true  — the UPDATE succeeded (rowsAffected = 1).
   * false — engagement not found.
   */
  success: boolean;
}

/**
 * Input for recording an accountant-internal note on an engagement.
 *
 * AC-LIFE-008-02: accountant can add internal notes to an engagement.
 * DECISION-011-D: accountant-only write; admin pool inside withAuditTransaction.
 * DECISION-011-E: audit action string 'engagement.note_recorded'.
 * CS-GEN-001: note body is NEVER written to the audit row — only the engagementId (targetId).
 */
export interface RecordEngagementNoteInput {
  /** The Engagement.id the note is attached to (server-resolved — never client-supplied). */
  engagementId: string;
  /**
   * The note body text (AC-LIFE-008-02).
   * CS-GEN-001: NEVER written to the audit row — stored only in EngagementNote.body.
   */
  body: string;
  /** The accountant's clerkId (mirrors DocumentRequest.createdBy pattern). */
  createdBy: string;
  /** The accountant's identity (from server-verified session — ADR-003, ADR-019 §2). */
  actor: AuditActor;
  /** Source surface for audit record (ADR-019). */
  sourceSurface: "admin";
}

/** Result of recordEngagementNote. */
export interface RecordNoteResult {
  /**
   * true  — the INSERT succeeded (note created).
   * false — engagement not found (FK violation caught; INSERT returned no rows).
   */
  success: boolean;
  /** The newly created EngagementNote id, when success=true. */
  noteId?: string;
}

/**
 * An EngagementNote item returned from the read seam.
 * AC-LIFE-008-02: accountant can view internal notes on any engagement.
 */
export interface EngagementNoteItem {
  id: string;
  engagementId: string;
  /** Note body (AC-LIFE-008-02). CS-GEN-001: never in audit rows. */
  body: string;
  /** Accountant clerkId at creation (audit trail). */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Write: setEngagementDueDate (admin pool — accountant-only) ───────────────

/**
 * Sets or updates the due date on an engagement (DECISION-011-D, AC-LIFE-007-01/-02).
 *
 * Handles both first-set (dueDate was NULL) and update (dueDate had a previous value) —
 * a single unconditioned UPDATE: no IS NULL guard needed because both are valid operations.
 * Pass dueDate=null to clear the due date.
 *
 * Fire-once guard: WHERE id=@id + @@ROWCOUNT = 0 → { success: false } (engagement not found).
 *
 * ADR-003 §7: admin pool — accountant write, no request-pool SESSION_CONTEXT needed.
 * ADR-019:    Audit event 'engagement.due_date_set' recorded in the same transaction.
 * DECISION-011-D: verbatim EPIC-010 pattern — admin pool inside withAuditTransaction.
 * DECISION-011-E: audit action string 'engagement.due_date_set'.
 * CS-TS-001:  Admin-pool write, not going through the request-scoped db wrapper.
 * CS-TS-002:  Admin pool only through getAdminPool() (via withAuditTransaction).
 * CS-GEN-003: // ADR-003, // ADR-019, // DECISION-011-D, // DECISION-011-E
 *
 * @returns { success: true }  — UPDATE succeeded; audit row inserted.
 * @returns { success: false } — engagement not found (@@ROWCOUNT = 0).
 */
export async function setEngagementDueDate(
  input: SetEngagementDueDateInput,
): Promise<SetDueDateResult> {
  // ADR-003, DECISION-011-D: admin pool inside withAuditTransaction
  return withAuditTransaction(async (txn) => {
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", mssqlPkg.NVarChar(50), input.engagementId);
    // CS-GEN-003: ADR-003 Amendment 1 — no @read_only flag; Date type for @db.Date column
    if (input.dueDate !== null) {
      updateReq.input("dueDate", mssqlPkg.Date, input.dueDate);
    } else {
      updateReq.input("dueDate", mssqlPkg.Date, null);
    }

    // DECISION-011-D: guarded UPDATE + @@ROWCOUNT — verbatim EPIC-010 pattern
    const updateResult = await updateReq.query<{ rowsAffected: number }>(`
      UPDATE [dbo].[Engagement]
      SET [dueDate]   = @dueDate,
          [updatedAt] = SYSDATETIMEOFFSET()
      WHERE [id] = @id;
      SELECT @@ROWCOUNT AS rowsAffected;
    `);

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      // Engagement not found — withAuditTransaction will commit a no-op.
      return { success: false };
    }

    // ADR-019: audit event in the same transaction — DECISION-011-E audit action string
    // CS-GEN-001: no note body / PII in the audit row; targetType=Engagement, targetId=engagementId
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.due_date_set",  // DECISION-011-E
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { success: true };
  });
}

// ─── Write: setEngagementPriority (admin pool — accountant-only) ──────────────

/**
 * Sets or clears the priority flag on an engagement (DECISION-011-D, AC-LIFE-009-01/-02).
 *
 * isPriority=true → flag as priority; isPriority=false → unflag.
 * Both operations go through the same seam (no separate flag/unflag path).
 *
 * Fire-once guard: WHERE id=@id + @@ROWCOUNT = 0 → { success: false } (engagement not found).
 *
 * ADR-003 §7: admin pool — accountant write, no request-pool SESSION_CONTEXT needed.
 * ADR-019:    Audit event 'engagement.priority_set' recorded in the same transaction.
 * DECISION-011-D: verbatim EPIC-010 pattern — admin pool inside withAuditTransaction.
 * DECISION-011-E: audit action string 'engagement.priority_set'.
 * CS-TS-001:  Admin-pool write, not going through the request-scoped db wrapper.
 * CS-TS-002:  Admin pool only through getAdminPool() (via withAuditTransaction).
 * CS-GEN-003: // ADR-003, // ADR-019, // DECISION-011-D, // DECISION-011-E
 *
 * @returns { success: true }  — UPDATE succeeded; audit row inserted.
 * @returns { success: false } — engagement not found (@@ROWCOUNT = 0).
 */
export async function setEngagementPriority(
  input: SetEngagementPriorityInput,
): Promise<SetPriorityResult> {
  // ADR-003, DECISION-011-D: admin pool inside withAuditTransaction
  return withAuditTransaction(async (txn) => {
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", mssqlPkg.NVarChar(50), input.engagementId);
    updateReq.input("isPriority", mssqlPkg.Bit, input.isPriority ? 1 : 0);

    // DECISION-011-D: guarded UPDATE + @@ROWCOUNT — verbatim EPIC-010 pattern
    const updateResult = await updateReq.query<{ rowsAffected: number }>(`
      UPDATE [dbo].[Engagement]
      SET [isPriority] = @isPriority,
          [updatedAt]  = SYSDATETIMEOFFSET()
      WHERE [id] = @id;
      SELECT @@ROWCOUNT AS rowsAffected;
    `);

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      // Engagement not found — withAuditTransaction will commit a no-op.
      return { success: false };
    }

    // ADR-019: audit event in the same transaction — DECISION-011-E audit action string
    // CS-GEN-001: no note body / PII in the audit row; targetType=Engagement, targetId=engagementId
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.priority_set",  // DECISION-011-E
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { success: true };
  });
}

// ─── Write: recordEngagementNote (admin pool — accountant-only) ───────────────

/**
 * Records an accountant-internal note on an engagement (DECISION-011-D, AC-LIFE-008-02).
 *
 * INSERTs an EngagementNote row (body, createdBy, engagementId). The audit event records
 * targetType='Engagement', targetId=engagementId — the body is NEVER written to the audit row
 * (CS-GEN-001: no PII/content in audit rows).
 *
 * ADR-003 §7: admin pool — accountant write, no request-pool SESSION_CONTEXT needed.
 * ADR-019:    Audit event 'engagement.note_recorded' recorded in the same transaction.
 * DECISION-011-D: verbatim EPIC-010 pattern — admin pool inside withAuditTransaction.
 * DECISION-011-E: audit action string 'engagement.note_recorded'.
 * CS-GEN-001:  note body is NEVER written to the audit row — stored only in EngagementNote.body.
 * CS-TS-001:  Admin-pool write, not going through the request-scoped db wrapper.
 * CS-TS-002:  Admin pool only through getAdminPool() (via withAuditTransaction).
 * CS-GEN-003: // ADR-003, // ADR-019, // CS-GEN-001, // DECISION-011-D, // DECISION-011-E
 *
 * @returns { success: true, noteId }  — INSERT succeeded; note created.
 * @returns { success: false }         — engagement not found (FK violation or bad id).
 */
export async function recordEngagementNote(
  input: RecordEngagementNoteInput,
): Promise<RecordNoteResult> {
  // ADR-003, DECISION-011-D: admin pool inside withAuditTransaction
  return withAuditTransaction(async (txn) => {
    const insertReq = new MssqlRequest(txn);
    insertReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    // CS-GEN-001: body is stored in EngagementNote, never in AuditEvent
    insertReq.input("body", mssqlPkg.NVarChar(mssqlPkg.MAX), input.body);
    insertReq.input("createdBy", mssqlPkg.NVarChar(64), input.createdBy);

    // DECISION-011-D: INSERT with OUTPUT to get the new id — no @@ROWCOUNT guard needed
    // (OUTPUT INSERTED.id will be empty if FK violation prevents the INSERT)
    let noteId: string | undefined;
    try {
      const insertResult = await insertReq.query<{ id: string }>(`
        INSERT INTO [dbo].[EngagementNote]
          ([engagementId], [body], [createdBy], [updatedAt])
        OUTPUT INSERTED.[id]
        VALUES (@engagementId, @body, @createdBy, SYSDATETIMEOFFSET());
      `);
      noteId = insertResult.recordset[0]?.id;
    } catch {
      // FK violation (engagement not found) — withAuditTransaction will rollback.
      return { success: false };
    }

    if (!noteId) {
      // Should not happen — OUTPUT INSERTED.id always returns on success
      return { success: false };
    }

    // ADR-019: audit event in the same transaction — DECISION-011-E audit action string
    // CS-GEN-001: body NEVER in audit row — targetType=Engagement, targetId=engagementId only
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.note_recorded",  // DECISION-011-E
      targetType: "Engagement",
      targetId: input.engagementId,        // CS-GEN-001: engagement id, NOT note body
      sourceSurface: input.sourceSurface,
      outcome: "success",
      transaction: txn,
    });

    return { success: true, noteId };
  });
}

// ─── Read: listEngagementNotes (request pool — RLS gate: sec.pol_EngagementNote) ─

/**
 * Lists engagement notes for an engagement, under the request-scoped wrapper.
 *
 * CRITICAL: this seam runs under withRequestContext so sec.pol_EngagementNote is the
 * access gate — NOT app-layer filtering. A CLIENT principal who sets SESSION_CONTEXT
 * with role='CLIENT' returns ZERO rows because the policy has no CLIENT branch.
 *
 * This is what makes the AC-LIFE-008-02 guarantee real:
 *   - ACCOUNTANT context → sees all notes for this engagement.
 *   - CLIENT context (even owning client) → ZERO rows (policy enforces it, not the seam).
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * ADR-003:     REQUEST POOL; SESSION_CONTEXT must be set before the query.
 * ADR-005:     sec.pol_EngagementNote FILTER predicate governs visibility.
 * CS-TS-001:   Uses db (Prisma request-pool wrapper) — SESSION_CONTEXT propagated automatically.
 * CS-GEN-003:  // ADR-003, // ADR-005, // CS-TS-001, // DECISION-011-D
 *
 * @param engagementId — the Engagement.id to list notes for (server-resolved — never client-supplied).
 * @returns Array of EngagementNoteItem visible to the current SESSION_CONTEXT principal.
 *          ACCOUNTANT → all notes for the engagement.
 *          CLIENT / null → empty array (RLS fail-closed).
 */
export async function listEngagementNotes(
  engagementId: string,
): Promise<EngagementNoteItem[]> {
  // CS-TS-001: uses db (Prisma request-pool wrapper) — SESSION_CONTEXT set by the wrapper.
  // CS-TS-002: never uses adminDb or requestDb directly — always through the db wrapper.
  // ADR-003: MUST be called inside withRequestContext() / withClerkIdentity().
  // ADR-005: sec.pol_EngagementNote FILTER predicate is the access gate (not app logic).

  // DECISION (TASK-011-002): db is a Proxy whose TypeScript type is `ReturnType<PrismaClient["$extends"]>`.
  // The $extends-based Proxy makes direct property access opaque to TypeScript (same issue as the
  // dbAsEngagementClient() pattern used for Engagement reads above). We explicitly cast to a typed
  // interface that matches the engagementNote delegate shape we need, following the established
  // pattern in this module. CS-TS-001: we still go through the `db` wrapper — the cast does not
  // bypass SESSION_CONTEXT propagation.
  type EngagementNoteRow = {
    id: string;
    engagementId: string;
    body: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  };
  const typedDb = db as unknown as {
    engagementNote: {
      findMany: (args: {
        where: { engagementId: string };
        orderBy: { createdAt: "asc" | "desc" };
      }) => Promise<EngagementNoteRow[]>;
    };
  };

  const rows = await typedDb.engagementNote.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    engagementId: row.engagementId,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapRow(row: {
  id: string;
  engagementRequestId: string;
  clientUserId: string | null;
  status: string;
  letterSignedAt: Date | null;
  letterSignatureEvidence: string | null;
  letterTemplateSnapshot: string | null;
  questionnaireSubmittedAt?: Date | null;
  deliveryConfirmedAt?: Date | null;
  filingConfirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): EngagementItem {
  return {
    id: row.id,
    engagementRequestId: row.engagementRequestId,
    clientUserId: row.clientUserId,
    status: row.status,
    letterSignedAt: row.letterSignedAt,
    letterSignatureEvidence: row.letterSignatureEvidence,
    letterTemplateSnapshot: row.letterTemplateSnapshot,
    questionnaireSubmittedAt: row.questionnaireSubmittedAt ?? null,
    // DECISION-010-A (EPIC-010): lifecycle confirmation timestamps
    deliveryConfirmedAt: row.deliveryConfirmedAt ?? null,
    filingConfirmedAt: row.filingConfirmedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

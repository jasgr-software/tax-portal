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
  }>(
    `SELECT [id], [status], [deliveryConfirmedAt], [filingConfirmedAt], [engagementRequestId]
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

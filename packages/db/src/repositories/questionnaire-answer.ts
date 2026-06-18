/**
 * packages/db/src/repositories/questionnaire-answer.ts
 *
 * Data-access functions for QuestionnaireAnswer.
 *
 * AC-ONBD-003-03: The questionnaire step is satisfied only when the client submits.
 *   → submitQuestionnaireAsClient sets Engagement.questionnaireSubmittedAt on submit.
 * AC-ONBD-003-04: The client's submitted answers are recorded against the engagement.
 *   → submitQuestionnaireAsClient inserts the QuestionnaireAnswer row.
 *
 * Pool strategy:
 *   - getMyQuestionnaireAnswer: REQUEST POOL — subject to RLS FILTER predicate.
 *     sec.pol_QuestionnaireAnswer FILTER (fn_questionnaire_answer_access) enforces client isolation.
 *     CLIENT sees only their own engagement's answers; ACCOUNTANT sees all.
 *     Must be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *   - submitQuestionnaireAsClient: REQUEST POOL — BLOCK-governed client write.
 *     Mirrors recordLetterSignatureAsClient (TASK-005-005): SESSION_CONTEXT set IN THE SAME
 *     BATCH as the INSERT, so the BLOCK predicate governs the write. Returns rowsAffected = 0
 *     when denied (non-owner CLIENT, null SESSION_CONTEXT, or engagement not found).
 *     Also sets Engagement.questionnaireSubmittedAt atomically (same batch).
 *
 * ADR-003: SESSION_CONTEXT (clerk_user_id + role) set in-batch with the mutation.
 * ADR-003 Amendment 1: no @read_only on any sp_set_session_context SET.
 * ADR-005: FILTER + BLOCK on QuestionnaireAnswer (sec.pol_QuestionnaireAnswer).
 *
 * // DECISION-H (EPIC-006): answers serialized as JSON blob keyed by question id.
 * //   { [questionId]: string } — v1 is static (no per-answer querying).
 * //   JSON shape validated at the action layer (TASK-006-005), not by a DB constraint.
 *
 * // DECISION (TASK-006-001): submitQuestionnaireAsClient sets BOTH the QuestionnaireAnswer
 * //   row AND Engagement.questionnaireSubmittedAt in the same raw-mssql batch. This is the
 * //   same single-batch atomicity pattern as recordLetterSignatureAsClient (TASK-005-005).
 * //   A separate admin-pool write (submitQuestionnaireAnswer) is also provided for substrate
 * //   persistence tests, mirroring the recordLetterSignature / recordLetterSignatureAsClient
 * //   dual-function pattern from engagement.ts.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { parseSqlServerUrl } from "../sql-server-url.js";
import { db } from "../client.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The full QuestionnaireAnswer shape.
 *
 * AC-ONBD-003-04: answers + engagementId record the submission against the engagement.
 * AC-ONBD-003-03: submittedAt (+ Engagement.questionnaireSubmittedAt) is the step-satisfaction marker.
 */
export interface QuestionnaireAnswerItem {
  id: string;
  /** FK → Engagement — the engagement this answer belongs to. */
  engagementId: string;
  /** FK → QuestionnaireTemplate — the template version that was answered. */
  templateId: string;
  /**
   * Serialized JSON: { [questionId: string]: string } (DECISION-H).
   * Parse with JSON.parse at the caller.
   */
  answers: string;
  /** When the client submitted the questionnaire (AC-ONBD-003-03). */
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for the admin-pool substrate write (persistence tests only). */
export interface SubmitQuestionnaireInput {
  /** FK → Engagement — the engagement to record answers for. */
  engagementId: string;
  /** FK → QuestionnaireTemplate — the template version answered. */
  templateId: string;
  /**
   * Serialized JSON: { [questionId: string]: string } (DECISION-H).
   * JSON shape validated at the action layer (TASK-006-005).
   */
  answers: string;
}

// ─── Internal cast helper ─────────────────────────────────────────────────────

type QuestionnaireAnswerRow = {
  id: string;
  engagementId: string;
  templateId: string;
  answers: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** Cast the request-scoped `db` wrapper to a typed client for QuestionnaireAnswer access. */
function dbAsAnswerClient() {
  return db as unknown as {
    questionnaireAnswer: {
      findFirst: (args?: {
        where?: { engagementId?: string };
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<QuestionnaireAnswerRow | null>;
    };
  };
}

// ─── Read: getMyQuestionnaireAnswer (request pool — FILTER-governed) ──────────

/**
 * Returns the QuestionnaireAnswer for the given engagement, visible to the current
 * SESSION_CONTEXT identity.
 *
 * Under sec.pol_QuestionnaireAnswer (0006-questionnaire-policy.sql):
 *   - CLIENT sees only answers for their own engagement (engagementId → Engagement.clientUserId match).
 *   - ACCOUNTANT sees all answer rows.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns null when:
 *   - The engagement has no submitted answers yet.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 *
 * AC-ONBD-003-04: the answers field carries the recorded submission.
 */
export async function getMyQuestionnaireAnswer(
  engagementId: string,
): Promise<QuestionnaireAnswerItem | null> {
  const client = dbAsAnswerClient();
  const row = await client.questionnaireAnswer.findFirst({
    where: { engagementId },
  });

  if (!row) return null;

  return mapRow(row);
}

// ─── Write: submitQuestionnaireAnswer (admin pool — substrate/test path only) ─
//
// NOT exported from the package barrel (packages/db/src/index.ts).
// Import directly from this source module in substrate tests that need it:
//   import { submitQuestionnaireAnswer } from "@tax-portal/db/src/repositories/questionnaire-answer.js"
// For the production submission path use submitQuestionnaireAsClient (request pool, BLOCK-governed).

/**
 * Records questionnaire answers against an engagement via the ADMIN POOL.
 *
 * DECISION (TASK-006-001): Admin-pool path for substrate persistence tests. Bypasses the
 * BLOCK predicate (IS_MEMBER('app_admin_role')=1). Does NOT set questionnaireSubmittedAt
 * on Engagement — the full atomic version is submitQuestionnaireAsClient.
 *
 * Also sets Engagement.questionnaireSubmittedAt so that persistence tests can verify
 * the step-satisfaction marker (AC-ONBD-003-03).
 *
 * Returns { rowsAffected: number }:
 *   1 → success
 *   0 → engagement not found
 */
export async function submitQuestionnaireAnswer(
  input: SubmitQuestionnaireInput,
): Promise<{ rowsAffected: number }> {
  const pool = await getAdminPool();

  // Insert QuestionnaireAnswer row
  const insertReq = new MssqlRequest(pool);
  insertReq.input("engagementId", input.engagementId);
  insertReq.input("templateId", input.templateId);
  insertReq.input("answers", mssqlPkg.NVarChar(mssqlPkg.MAX), input.answers);

  const insertResult = await insertReq.query<{ rowsAffected: number }>(
    `INSERT INTO [dbo].[QuestionnaireAnswer]
       ([engagementId], [templateId], [answers], [updatedAt])
     VALUES (@engagementId, @templateId, @answers, SYSDATETIMEOFFSET());
     SELECT @@ROWCOUNT AS rowsAffected;`,
  );

  const insertRows =
    (insertResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

  if (insertRows === 0) {
    return { rowsAffected: 0 };
  }

  // Set Engagement.questionnaireSubmittedAt (step-satisfaction marker — DECISION-I)
  const updateReq = new MssqlRequest(pool);
  updateReq.input("engagementId", input.engagementId);

  await updateReq.query(
    `UPDATE [dbo].[Engagement]
     SET [questionnaireSubmittedAt] = SYSDATETIMEOFFSET(),
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @engagementId;`,
  );

  return { rowsAffected: insertRows };
}

// ─── Write: submitQuestionnaireAsClient (request pool — BLOCK-governed) ───────

/**
 * Records questionnaire answers as the owning CLIENT via the REQUEST POOL.
 *
 * This is the PRODUCTION submission path called by submitQuestionnaireAction. Unlike
 * `submitQuestionnaireAnswer` (admin pool, above), this function:
 *   - Acquires a raw mssql connection from the REQUEST POOL (DATABASE_URL).
 *   - Sets SESSION_CONTEXT (clerk_user_id + role) IN THE SAME BATCH as the INSERT,
 *     so the sec.pol_QuestionnaireAnswer BLOCK predicate (AFTER INSERT) governs the write.
 *   - Also sets Engagement.questionnaireSubmittedAt in the same batch (atomic satisfaction marker).
 *   - Returns rowsAffected = 0 when the BLOCK predicate denies the write
 *     (non-owner CLIENT or null SESSION_CONTEXT) — the caller must treat 0 as a
 *     refusal and STOP (do not satisfy the step for a non-event).
 *
 * Pool hygiene: SESSION_CONTEXT keys are cleared after the batch so the pooled
 * connection is returned in a clean state (ADR-003 §4 spirit).
 *
 * DECISION (TASK-006-001): Mirrors recordLetterSignatureAsClient (TASK-005-005) exactly:
 *   - Short-lived raw mssql pool (close in finally).
 *   - SESSION_CONTEXT in-batch with the DML.
 *   - Single-quote-escape for sp_set_session_context args (server-derived only — never
 *     client-supplied; the real fence is the BLOCK predicate).
 *   - @read_only = 0 per ADR-003 Amendment 1.
 *
 * @param input.engagementId — the Engagement to record answers for.
 * @param input.templateId — the template version answered.
 * @param input.answers — serialized JSON { [questionId]: string } (DECISION-H).
 * @param input.clerkUserId — the CLIENT's Clerk user ID (from verified session only).
 * @param input.role — must be 'CLIENT' (verified server-side, never client-asserted).
 *
 * Returns { rowsAffected: number }:
 *   1 → success (CLIENT is the owner, BLOCK passed, answer + submittedAt set)
 *   0 → denied (non-owner CLIENT, null SESSION_CONTEXT, or engagement not found)
 *
 * AC-ONBD-003-04: answers are recorded against the engagement on success.
 * AC-ONBD-003-03: Engagement.questionnaireSubmittedAt is set on success (step satisfied).
 * ADR-003 Amendment 1: no @read_only on sp_set_session_context.
 * ADR-005: BLOCK predicate sec.pol_QuestionnaireAnswer enforces owner-only writes.
 */
export async function submitQuestionnaireAsClient(input: SubmitQuestionnaireInput & {
  clerkUserId: string;
  role: "CLIENT";
}): Promise<{ rowsAffected: number }> {
  // DECISION (TASK-006-001): Use raw mssql request pool with SESSION_CONTEXT set IN THE SAME
  // BATCH as the INSERT — the BLOCK predicate evaluates SESSION_CONTEXT at the INSERT boundary.
  // Mirror the proven pattern from recordLetterSignatureAsClient (TASK-005-005).
  // @read_only = 0 per ADR-003 Amendment 1 — never @read_only = 1.

  const requestUrl = process.env["DATABASE_URL"];
  if (!requestUrl) {
    throw new Error(
      "[packages/db] DATABASE_URL is not set. " +
        "Required for request-pool CLIENT questionnaire submission (ADR-003).",
    );
  }

  const mssql = mssqlPkg;
  const { ConnectionPool: MssqlConnectionPool } = mssql;
  const config = parseSqlServerUrl(requestUrl);

  // Open a dedicated connection for this request (short-lived pool — same pattern as
  // recordLetterSignatureAsClient; acceptable for low-frequency one-per-engagement writes).
  const pool = new MssqlConnectionPool(config);
  await pool.connect();

  try {
    // Injection-safety for sp_set_session_context args (cannot be parameterised in a .batch()):
    //   clerkUserId and role are server-derived from the verified session — never client-supplied.
    //   Single-quote-escaped before interpolation as string literals (mirror engagement.ts pattern).
    //   The real authorization fence is sec.pol_QuestionnaireAnswer FILTER+BLOCK (ADR-005).
    const escapedClerkId = input.clerkUserId.replace(/'/g, "''");
    const escapedRole = input.role.replace(/'/g, "''");

    // SEC-1: DML data values (answers, engagementId, templateId) bound via mssql .input()
    // parameters and referenced as @-prefixed placeholders in the batch text.
    // Only the two sp_set_session_context args remain as escaped string literals.
    const req = pool.request();
    req.input("answers", mssql.NVarChar(mssql.MAX), input.answers);
    req.input("engagementId", mssql.NVarChar(50), input.engagementId);
    req.input("templateId", mssql.NVarChar(50), input.templateId);

    // Batch: set SESSION_CONTEXT → INSERT answer row → set questionnaireSubmittedAt
    // → SELECT @@ROWCOUNT → clear SESSION_CONTEXT.
    // If the BLOCK predicate denies the INSERT, @@ROWCOUNT = 0 (no error thrown by SQL Server
    // for BLOCK predicates that suppress the operation — same behavior as BEFORE UPDATE).
    const sql = `
      EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${escapedClerkId}', @read_only = 0;
      EXEC sp_set_session_context @key = N'role', @value = N'${escapedRole}', @read_only = 0;
      INSERT INTO [dbo].[QuestionnaireAnswer]
        ([engagementId], [templateId], [answers], [updatedAt])
      VALUES (@engagementId, @templateId, @answers, SYSDATETIMEOFFSET());
      UPDATE [dbo].[Engagement]
      SET [questionnaireSubmittedAt] = SYSDATETIMEOFFSET(),
          [updatedAt] = SYSDATETIMEOFFSET()
      WHERE [id] = @engagementId;
      SELECT @@ROWCOUNT AS rowsAffected;
      EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
      EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;
    `;

    const result = await req.batch(sql);

    // The SELECT @@ROWCOUNT returns a single-row recordset. Find it among the recordsets
    // (sp_set calls produce no rows; INSERT/UPDATE produce no rows by default; SELECT does).
    // We capture the rowsAffected from the SELECT (last DML before clear context).
    const recordsets = result.recordsets as Array<Array<{ rowsAffected?: number }>>;
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

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapRow(row: QuestionnaireAnswerRow): QuestionnaireAnswerItem {
  return {
    id: row.id,
    engagementId: row.engagementId,
    templateId: row.templateId,
    answers: row.answers,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * packages/db/src/repositories/questionnaire-template.ts
 *
 * Data-access functions for QuestionnaireTemplate.
 *
 * AC-DASH-012-01: The accountant can create an intake questionnaire template.
 *   → upsertTemplateForService creates or updates the template for a service.
 * AC-DASH-012-02: A questionnaire template is associated with a specific service type.
 *   → getTemplateForService reads by serviceId; upsertTemplateForService binds to serviceId.
 * AC-DASH-012-03: The accountant can edit an existing questionnaire template.
 *   → upsertTemplateForService updates the existing row in place.
 * AC-ONBD-003-02: The accountant can define and maintain a distinct template per service type.
 *   → The serviceId UNIQUE constraint (@@unique([serviceId])) enforces one-per-service-type.
 *
 * Pool strategy:
 *   - getTemplateForService: ADMIN POOL — the QuestionnaireTemplate is not client-readable via
 *     the request pool. Clients read template content at step 2 via the admin pool (DECISION-G,
 *     like getCurrentLetterTemplate). No RLS FILTER on this table.
 *   - upsertTemplateForService: ADMIN POOL — accountant-only mutation. The admin actions layer
 *     (TASK-006-002) enforces accountant identity at the Next.js level; the DB BLOCK predicate
 *     (sec.pol_QuestionnaireTemplate fn_questionnaire_template_write_access) is defence-in-depth.
 *   - listTemplates: ADMIN POOL — accountant and system reads.
 *
 * // DECISION-G (EPIC-006): serialized-JSON `questions` blob over structured rows — v1
 * //   questionnaires are static (no per-question querying), mirroring LetterTemplate.content.
 * //   The JSON shape is validated at the action layer (TASK-006-002), not by a DB constraint.
 *
 * // DECISION (upsert pattern): "upsertTemplateForService" uses UPDATE then INSERT (check-and-set)
 * //   rather than MERGE because MERGE on SQL Server is known to have edge cases with concurrent
 * //   inserts; since this is a low-frequency accountant action the simple check-and-set is correct.
 *   The at-most-one-per-serviceId UNIQUE constraint enforces the single-template-per-service invariant.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single question definition in the serialized `questions` JSON array (DECISION-G).
 * Validated at the action layer (TASK-006-002), not by a DB constraint.
 */
export interface QuestionDef {
  /** Stable question identifier (used as key in QuestionnaireAnswer.answers blob). */
  id: string;
  /** The question text shown to the client. */
  prompt: string;
  /** Input type: single-line text or multi-line textarea. */
  type: "text" | "textarea";
  /** Whether the client must answer this question before submitting. */
  required: boolean;
}

/**
 * The full QuestionnaireTemplate shape.
 *
 * AC-DASH-012-02: serviceId is the service-type binding.
 * AC-ONBD-003-02: at most one template per serviceId (enforced by DB UNIQUE constraint).
 * DECISION-G: questions is a serialized JSON string — parse/validate at the action layer.
 */
export interface QuestionnaireTemplateItem {
  id: string;
  /** The Service this template is bound to (AC-DASH-012-02). */
  serviceId: string;
  /**
   * Serialized JSON array of QuestionDef objects (DECISION-G).
   * Parse with JSON.parse at the caller; validated on write at the action layer.
   */
  questions: string;
  /** Accountant's clerkId on create/edit. Null if never edited (should not occur in practice). */
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating or updating a questionnaire template for a service type. */
export interface UpsertTemplateInput {
  /**
   * The Service id this template is bound to (AC-DASH-012-02).
   * UNIQUE constraint — upsert updates the existing row if one exists for this serviceId.
   */
  serviceId: string;
  /**
   * Serialized JSON array of QuestionDef objects (DECISION-G).
   * JSON shape validated at the action layer (TASK-006-002).
   */
  questions: string;
  /** Accountant's Clerk user ID — recorded for the audit trail (mirrors LetterTemplate.updatedBy). */
  accountantClerkId: string;
}

// ─── Read: getTemplateForService (admin pool) ─────────────────────────────────

/**
 * Returns the questionnaire template for the given service type, or null if none exists.
 *
 * DECISION-G: Template is accountant-managed; clients read via the admin pool (not request pool).
 * No RLS FILTER on QuestionnaireTemplate — admin pool (IS_MEMBER('app_admin_role')=1) is exempt.
 *
 * AC-DASH-012-02: Template is bound to a specific service type via serviceId.
 * AC-ONBD-003-01: Called when preparing the questionnaire step for the client (TASK-006-005).
 *
 * @param serviceId — the Service.id to look up the template for.
 * Returns null when no template has been created for this service type yet.
 */
export async function getTemplateForService(
  serviceId: string,
): Promise<QuestionnaireTemplateItem | null> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("serviceId", serviceId);

  const result = await req.query<{
    id: string;
    serviceId: string;
    questions: string;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT [id], [serviceId], [questions], [updatedBy], [createdAt], [updatedAt]
     FROM [dbo].[QuestionnaireTemplate]
     WHERE [serviceId] = @serviceId`,
  );

  const row = result.recordset[0];
  if (!row) return null;

  return {
    id: row.id,
    serviceId: row.serviceId,
    questions: row.questions,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Read: listTemplates (admin pool) ─────────────────────────────────────────

/**
 * Returns all questionnaire templates, ordered by updatedAt DESC.
 *
 * Used by the admin template-management UI (AC-DASH-012-01/-03) to list all
 * service-type templates for the accountant to view and edit.
 *
 * DECISION-G: admin pool read — not filtered by RLS.
 */
export async function listTemplates(): Promise<QuestionnaireTemplateItem[]> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  const result = await req.query<{
    id: string;
    serviceId: string;
    questions: string;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT [id], [serviceId], [questions], [updatedBy], [createdAt], [updatedAt]
     FROM [dbo].[QuestionnaireTemplate]
     ORDER BY [updatedAt] DESC`,
  );

  return result.recordset.map((row) => ({
    id: row.id,
    serviceId: row.serviceId,
    questions: row.questions,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ─── Write: upsertTemplateForService (admin pool — accountant-guarded) ────────

/**
 * Creates or updates the questionnaire template for the given service type.
 *
 * If a template already exists for this serviceId, updates it in place.
 * If no template exists, inserts a new one.
 * The at-most-one-per-serviceId UNIQUE constraint enforces the invariant.
 *
 * DECISION (upsert): UPDATE-then-INSERT check-and-set pattern (not MERGE — SQL Server MERGE
 * has known edge cases with concurrency; this is a low-frequency accountant-only action).
 *
 * Returns { rowsAffected: number, action: 'created' | 'updated' }:
 *   action='created' → new template row inserted.
 *   action='updated' → existing template updated.
 *
 * AC-DASH-012-01: Creates a template (first write for a serviceId).
 * AC-DASH-012-02: Binds the template to the serviceId.
 * AC-DASH-012-03: Updates an existing template (subsequent write for a serviceId).
 * AC-ONBD-003-02: The UNIQUE constraint on serviceId enforces one-per-service-type.
 *
 * ADR-003: The accountant-level guard is at the Next.js action layer (TASK-006-002).
 * ADR-005: The DB BLOCK predicate (sec.pol_QuestionnaireTemplate) is defence-in-depth.
 */
export async function upsertTemplateForService(
  input: UpsertTemplateInput,
): Promise<{ rowsAffected: number; action: "created" | "updated" }> {
  const pool = await getAdminPool();

  // Step 1: Attempt UPDATE (existing template)
  const updateReq = new MssqlRequest(pool);
  updateReq.input("serviceId", input.serviceId);
  updateReq.input("questions", mssqlPkg.NVarChar(mssqlPkg.MAX), input.questions);
  updateReq.input("accountantClerkId", input.accountantClerkId);

  const updateResult = await updateReq.query<{ rowsAffected: number }>(
    `UPDATE [dbo].[QuestionnaireTemplate]
     SET [questions]  = @questions,
         [updatedBy]  = @accountantClerkId,
         [updatedAt]  = SYSDATETIMEOFFSET()
     WHERE [serviceId] = @serviceId;
     SELECT @@ROWCOUNT AS rowsAffected;`,
  );

  const updateRows =
    (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

  if (updateRows > 0) {
    return { rowsAffected: updateRows, action: "updated" };
  }

  // Step 2: INSERT (no existing template for this serviceId)
  const insertReq = new MssqlRequest(pool);
  insertReq.input("serviceId", input.serviceId);
  insertReq.input("questions", mssqlPkg.NVarChar(mssqlPkg.MAX), input.questions);
  insertReq.input("accountantClerkId", input.accountantClerkId);

  const insertResult = await insertReq.query<{ rowsAffected: number }>(
    `INSERT INTO [dbo].[QuestionnaireTemplate]
       ([serviceId], [questions], [updatedBy], [updatedAt])
     VALUES (@serviceId, @questions, @accountantClerkId, SYSDATETIMEOFFSET());
     SELECT @@ROWCOUNT AS rowsAffected;`,
  );

  const insertRows =
    (insertResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

  return { rowsAffected: insertRows, action: "created" };
}

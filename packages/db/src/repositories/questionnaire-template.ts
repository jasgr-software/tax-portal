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
import { db } from "../client.js";

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

/**
 * The resolved questionnaire for a given engagement.
 *
 * AC-ONBD-003-01: The questionnaire shown corresponds to the engagement's service type —
 *   resolved SERVER-SIDE from the engagement's EngagementRequest → Service join,
 *   never from a client-supplied serviceId or templateId.
 *
 * DECISION-F (EPIC-006): primary service type = first by Service.sortOrder ASC, then Service.id ASC.
 *   Multi-service-type questionnaires are a later concern; v1 uses one service type.
 *
 * template: null = no template authored for this service type yet — acceptable starting state;
 *   the portal page gates on this before rendering the questionnaire form.
 */
export interface QuestionnaireForEngagement {
  /** The engagement id used for the resolution (server-resolved, never client-supplied). */
  engagementId: string;
  /** The primary service type id resolved from the engagement (DECISION-F). */
  serviceId: string;
  /** The human-readable name of the primary service type. */
  serviceName: string;
  /**
   * The questionnaire template for this service type.
   * null = no template authored yet (resolution succeeds cleanly — AC-ONBD-003-01).
   */
  template: QuestionnaireTemplateItem | null;
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

// ─── Internal cast helper for request-pool Engagement read ───────────────────

/**
 * Cast the request-scoped `db` wrapper to a typed client for Engagement model access.
 * Mirrors the cast helper in engagement.ts (TASK-005-006 pattern).
 *
 * Used ONLY for the engagement visibility gate in getQuestionnaireForEngagement —
 * the engagement read runs under the request pool so sec.pol_Engagement FILTER governs
 * (ADR-003 / ADR-005). Only after the engagement is confirmed visible do we proceed to
 * resolve the service type and template via the admin pool.
 */
function dbAsEngagementClientForQuestionnaire() {
  return db as unknown as {
    engagement: {
      findUnique: (args: {
        where: { id: string };
        select: { engagementRequestId: true };
      }) => Promise<{ engagementRequestId: string } | null>;
      findFirst: (args?: {
        select: { id: true; engagementRequestId: true };
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<{ id: string; engagementRequestId: string } | null>;
    };
  };
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

// ─── Read: getQuestionnaireForEngagement (request pool gate → admin pool template) ─

/**
 * Resolves the questionnaire template for a given engagement, governed by the
 * sec.pol_Engagement FILTER predicate.
 *
 * Resolution path (AC-ONBD-003-01, TASK-006-003 design contract):
 *   Step 1: Load the engagement under the REQUEST POOL (db, SESSION_CONTEXT-governed).
 *           sec.pol_Engagement FILTER is the security boundary — if the engagement is
 *           not visible to the caller, returns null fail-closed (non-owner sees nothing).
 *   Step 2: Resolve the primary serviceId via admin-pool JOIN:
 *           Engagement.engagementRequestId → EngagementRequest →
 *           EngagementRequestService → Service
 *           Primary = first by Service.sortOrder ASC, then Service.id ASC (DECISION-F).
 *   Step 3: getTemplateForService(primaryServiceId) via admin pool (DECISION-G: template
 *           is accountant-owned; no client RLS FILTER on QuestionnaireTemplate).
 *   Step 4: Return { engagementId, serviceId, serviceName, template } or null.
 *           template: null = no template authored yet (clean, not a throw — AC-ONBD-003-01).
 *
 * // DECISION-F (EPIC-006): primary service type = first selected service ordered by
 * //   Service.sortOrder ASC, then Service.id ASC. Multi-service-type questionnaires
 * //   are fenced out of v1 — one questionnaire, one primary service type.
 *
 * Security:
 *   - engagementId is server-resolved (portal page calls getMyEngagement() or uses the
 *     server-resolved engagement id — never a client-supplied URL param or body value).
 *   - The engagement visibility gate (REQUEST POOL / FILTER) is the load-bearing boundary.
 *   - serviceId and templateId are NEVER client-supplied; they are derived server-side only.
 *   - A non-owning CLIENT (or null SESSION_CONTEXT) receives null — not an error, not a leak.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * @param engagementId — the engagement to resolve. Must be server-resolved (see security note).
 *
 * Returns:
 *   { engagementId, serviceId, serviceName, template }   on success
 *   null   when the engagement is not visible to the caller (FILTER fail-closed)
 *   { ..., template: null }   when engagement is visible but the service has no template yet
 */
export async function getQuestionnaireForEngagement(
  engagementId: string,
): Promise<QuestionnaireForEngagement | null> {
  // ── Step 1: Engagement visibility gate (REQUEST POOL — FILTER-governed) ──────
  // DECISION: Use db (Prisma request pool) so SESSION_CONTEXT is set and
  // sec.pol_Engagement FILTER predicate is exercised (fail-closed for null/wrong identity).
  // We only need engagementRequestId to proceed with the service join — select only that.
  const client = dbAsEngagementClientForQuestionnaire();
  const engagementRow = await client.engagement.findUnique({
    where: { id: engagementId },
    select: { engagementRequestId: true },
  });

  if (!engagementRow) {
    // Engagement not visible to this caller — FILTER fail-closed (ADR-003 §5, ADR-005).
    // Non-owning CLIENT or null SESSION_CONTEXT: return null, never throw, never leak.
    return null;
  }

  // ── Step 2: Resolve primary serviceId (ADMIN POOL — service catalog is not client-owned) ─
  // DECISION-F (EPIC-006): primary service type = first by Service.sortOrder ASC, then id ASC.
  // Admin pool is used here because the service resolution is a catalog read — no client
  // ownership concept on Service rows. The engagement visibility gate (Step 1) already ran
  // under the FILTER, so we have confirmed the caller owns this engagement.
  const pool = await getAdminPool();
  const primaryServiceReq = new MssqlRequest(pool);
  primaryServiceReq.input("engagementRequestId", engagementRow.engagementRequestId);

  const primaryServiceResult = await primaryServiceReq.query<{
    serviceId: string;
    serviceName: string;
  }>(
    // DECISION-F: ORDER BY Service.sortOrder ASC, Service.id ASC — deterministic tiebreak.
    // TOP 1 captures only the primary (one questionnaire per engagement in v1).
    `SELECT TOP 1
       ers.[serviceId],
       s.[name] AS serviceName
     FROM [dbo].[EngagementRequestService] ers
     JOIN [dbo].[Service] s ON s.[id] = ers.[serviceId]
     WHERE ers.[engagementRequestId] = @engagementRequestId
     ORDER BY s.[sortOrder] ASC, s.[id] ASC`,
  );

  const primaryServiceRow = primaryServiceResult.recordset[0];
  if (!primaryServiceRow) {
    // The engagement request has no services selected — unexpected but handle gracefully.
    // Return null so the portal page shows a "no service configured" state cleanly.
    return null;
  }

  // ── Step 3: Template read (ADMIN POOL — DECISION-G) ─────────────────────────
  // getTemplateForService uses the admin pool (template is accountant-managed, like LetterTemplate).
  // Returns null if no template has been authored for this service type yet — that is a valid
  // starting state (template: null in the returned shape — AC-ONBD-003-01 clean null).
  const template = await getTemplateForService(primaryServiceRow.serviceId);

  // ── Step 4: Return the resolved shape ────────────────────────────────────────
  return {
    engagementId,
    serviceId: primaryServiceRow.serviceId,
    serviceName: primaryServiceRow.serviceName,
    template,  // null = no template authored yet (clean, not a throw)
  };
}

// ─── Read: getMyQuestionnaire (no-arg, FILTER-governed) ──────────────────────

/**
 * Returns the questionnaire for the current SESSION_CONTEXT identity's engagement,
 * with no caller-supplied engagement id (mirrors getMyEngagement).
 *
 * The engagement id is resolved SERVER-SIDE by the FILTER predicate on the request pool.
 * In Phase 2 a CLIENT owns exactly one engagement; findFirst returns that single visible row.
 *
 * // DECISION (TASK-006-003): The no-arg variant mirrors getMyEngagement() (TASK-005-006):
 * //   the FILTER-governed findFirst resolves the caller's own engagement — the portal page
 * //   never supplies an engagement id from client input. If the CLIENT has no visible
 * //   engagement (DECISION-A: clientUserId not yet back-filled, or SESSION_CONTEXT null),
 * //   the FILTER returns ZERO rows → null (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * Returns:
 *   QuestionnaireForEngagement — when the caller has a visible engagement
 *   null — when no engagement is visible (fail-closed, no engagement yet, wrong SESSION_CONTEXT)
 */
export async function getMyQuestionnaire(): Promise<QuestionnaireForEngagement | null> {
  // Resolve the engagement server-side under the FILTER predicate (request pool).
  // findFirst under FILTER-governed request pool: returns the caller's own row.
  // Phase 2: at most one Engagement is visible per client (one-per-client).
  const client = dbAsEngagementClientForQuestionnaire();
  const engagementRow = await client.engagement.findFirst({
    select: { id: true, engagementRequestId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!engagementRow) {
    // No engagement visible to this caller (DECISION-A, ADR-003 §5 fail-closed).
    return null;
  }

  // Delegate to getQuestionnaireForEngagement with the server-resolved id.
  // The engagement visibility gate was already exercised by findFirst above;
  // getQuestionnaireForEngagement will re-confirm via findUnique (belt-and-suspenders,
  // both under the same SESSION_CONTEXT / request pool).
  return getQuestionnaireForEngagement(engagementRow.id);
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

/**
 * packages/db/src/repositories/document-request.ts
 *
 * Data-access functions for DocumentRequest.
 *
 * AC-FILE-007-01: Accountant creates document requests with a free-text label.
 * AC-FILE-007-03: The checklist (DocumentRequests) is visible to the client.
 * AC-FILE-008-01: Each engagement has a checklist of document requests (read model).
 * AC-FILE-012-02: An overdue document request is flagged/surfaced as overdue when the accountant views it.
 * AC-MSG-014-02: A client is notified (in-portal) when a document request is created for them.
 *
 * Pool strategy:
 *   - createDocumentRequestAsAccountant: ADMIN POOL (app_admin_role, RLS-exempt).
 *     DocumentRequest is accountant-authored — the fn_document_request_write_access BLOCK
 *     has no CLIENT branch (TASK-007-003). Using admin pool bypasses BLOCK which is fine
 *     for the accountant-creating path (the accountant's server action verifies session role).
 *     Mirror: createEngagement (TASK-005-001) + submitQuestionnaireAnswer (TASK-006-001) pattern.
 *   - listDocumentRequestsForEngagement: REQUEST POOL — subject to RLS FILTER predicate.
 *     sec.pol_DocumentRequest FILTER (fn_document_request_access) enforces client isolation.
 *     CLIENT sees only their own engagement's requests; ACCOUNTANT sees all.
 *     MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *   - listDocumentRequestsForEngagementAdmin: ADMIN POOL — RLS-exempt; for accountant-only surfaces.
 *     Returns enhanced DocumentRequestAdminItem[] with isFulfilled + isOverdue (AC-FILE-012-02).
 *
 * ADR-003: SESSION_CONTEXT (clerk_user_id + role) set by the request pool wrapper.
 * ADR-003 Amendment 1: no @read_only on sp_set_session_context.
 * ADR-005: FILTER + BLOCK on DocumentRequest (sec.pol_DocumentRequest).
 * ADR-018: isOverdue derived from the existing dueDate lifecycle attribute — no new clock. // ADR-018
 *
 * DECISION-019-C: effective due date = explicit dueDate ?? (createdAt + defaultRequestDueDays). // DECISION-019-C
 * DECISION-019-D: unfulfilled = no non-soft-deleted active Document with documentRequestId. // DECISION-019-D
 * DECISION-019-I: request-created CLIENT notification emitted at creation time. // DECISION-019-I
 * DECISION-019-J: no new email path — notification rides EPIC-018 digest. // DECISION-019-J
 *
 * NOTE: createDocumentRequestAsAccountant is NOT exported from the package barrel.
 * It is imported directly from this source module by server actions in apps/admin.
 * The barrel exports only the request-pool reads.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";
import { emitNotification } from "./notification.js";
import { getGlobalDefaultCadence } from "./reminder-cadence.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single DocumentRequest checklist item as seen by the client or accountant.
 *
 * AC-FILE-007-01: label describes what the client should upload.
 * AC-FILE-008-01: forms the engagement's document-upload checklist.
 * TASK-019-004: dueDate added (additive, nullable — CS-GEN-002). // CS-GEN-002
 */
export interface DocumentRequestItem {
  id: string;
  /** FK → Engagement — the engagement this request belongs to. */
  engagementId: string;
  /** Free-text label describing what the client should upload (AC-FILE-007-01). */
  label: string;
  /** Accountant clerkId who created this request (audit trail). */
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Optional due date for the request (TASK-019-004 / DECISION-019-C).
   * When set, overdue is: unfulfilled AND dueDate < injected_clock (AC-FILE-012-04).
   * When null: effective due date falls back to createdAt + defaultRequestDueDays
   * (if configured in ReminderSetting); absent fallback → never overdue.
   * // DECISION-019-C // ADR-018
   */
  dueDate: Date | null;
}

/**
 * Enhanced DocumentRequest item for the accountant (admin) view.
 *
 * Extends DocumentRequestItem with fulfillment state and derived overdue flag.
 *
 * AC-FILE-012-02: isOverdue surfaces when the accountant views the request. // AC-FILE-012-02
 * DECISION-019-C/-D: isOverdue is DERIVED (unfulfilled + effective due date passed). // DECISION-019-C // DECISION-019-D
 * ADR-018: no new stored clock — derived from existing dueDate lifecycle attribute. // ADR-018
 * CS-GEN-002: additive new type; DocumentRequestItem unchanged. // CS-GEN-002
 */
export interface DocumentRequestAdminItem extends DocumentRequestItem {
  /**
   * Whether this request has been fulfilled by the client.
   * Fulfilled = at least one non-soft-deleted active Document with documentRequestId = this request's id.
   * DECISION-019-D: unfulfilled = no such Document exists. // DECISION-019-D
   */
  isFulfilled: boolean;
  /**
   * Derived overdue flag (AC-FILE-012-02).
   * true iff unfulfilled AND effective due date < now.
   * Computed via computeIsOverdue; consistent with the reminder engine (DECISION-019-C/-D). // DECISION-019-C // DECISION-019-D
   * ADR-018: no new stored clock — derived from existing lifecycle attributes. // ADR-018
   */
  isOverdue: boolean;
}

/** Input for creating a DocumentRequest (accountant-only). */
export interface CreateDocumentRequestInput {
  /** FK → Engagement — the engagement to add a request to. */
  engagementId: string;
  /** Free-text label for what the client should upload (AC-FILE-007-01). */
  label: string;
  /** Accountant clerkId from the verified session (audit trail — never client-supplied). */
  createdByClerkId: string;
  /**
   * Optional explicit due date for the request (DECISION-019-C / AC-FILE-012-04).
   * When set, overdue is: unfulfilled AND dueDate < now.
   * When null/omitted: falls back to defaultRequestDueDays from ReminderSetting.
   * // DECISION-019-C // AC-FILE-012-04
   */
  dueDate?: Date | null;
}

// ─── computeIsOverdue — overdue predicate (used by listDocumentRequestsForEngagementAdmin) ──
//
// DECISION-019-C/-D: called from listDocumentRequestsForEngagementAdmin to derive the
// isOverdue flag surfaced on the accountant view.
//
// The reminder engine uses an independent SQL predicate (reminder-engine.ts Phase-1 WHERE).
// Both predicates target the same semantic condition, but they are maintained separately —
// a TypeScript function CANNOT enforce that a separate SQL predicate agrees with it.
// The explicit-dueDate paths currently agree; see reminder-engine.ts for the SQL form.
//
// NOTE: defaultRequestDueDays (ReminderSetting) is seeded NULL and has no setter, so the
// fallback branch (dueDate IS NULL + defaultRequestDueDays set) is dead in production.
//
// // DECISION-019-C // DECISION-019-D // ADR-018 // AC-FILE-012-04

/**
 * Input for computeIsOverdue.
 *
 * DECISION-019-C: effective due date = dueDate ?? (createdAt + defaultRequestDueDays). // DECISION-019-C
 * DECISION-019-D: unfulfilled = isFulfilled=false. // DECISION-019-D
 */
export interface ComputeIsOverdueInput {
  /** Explicit due date on the DocumentRequest (nullable — DECISION-019-C). */
  dueDate: Date | null;
  /** Request creation timestamp — used for the computed fallback due date. */
  createdAt: Date;
  /**
   * Global default days after creation for the fallback due date.
   * null → no fallback → a request without an explicit dueDate is never overdue. // DECISION-019-C
   */
  defaultRequestDueDays: number | null;
  /**
   * Whether the request has been fulfilled (at least one active non-deleted Document).
   * Fulfilled requests are NEVER overdue regardless of the due date. // DECISION-019-D
   */
  isFulfilled: boolean;
  /**
   * The reference clock (injected for deterministic testing — ADR-023).
   * Defaults to new Date() when omitted (production path).
   * // ADR-023
   */
  now?: Date;
}

/**
 * Derives the overdue flag for a single DocumentRequest.
 *
 * Used by listDocumentRequestsForEngagementAdmin to compute the isOverdue field on the
 * accountant view. The reminder engine uses an independent SQL predicate — this TypeScript
 * function cannot enforce that the two agree; they must be kept in sync manually.
 *
 * Returns true iff:
 *   - isFulfilled = false   (fulfilled requests are never overdue — DECISION-019-D)
 *   - effective due date exists (either dueDate or the fallback — DECISION-019-C)
 *   - effective due date < today (UTC calendar-day comparison, mirrors SQL CAST(@now AS DATE))
 *
 * AC-FILE-012-02: isOverdue surfaces when the accountant views the request. // AC-FILE-012-02
 * AC-FILE-012-04: only past-due requests are overdue. // AC-FILE-012-04
 * DECISION-019-C: effective due date derivation. // DECISION-019-C
 * DECISION-019-D: fulfilled requests are excluded. // DECISION-019-D
 * ADR-018: no new clock — derived from existing lifecycle attribute. // ADR-018
 * ADR-023: now is injectable for deterministic testing. // ADR-023
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */
export function computeIsOverdue(input: ComputeIsOverdueInput): boolean {
  // DECISION-019-D: fulfilled requests are never overdue. // DECISION-019-D
  if (input.isFulfilled) return false;

  // DECISION-019-C: effective due date = explicit dueDate ?? (createdAt + defaultRequestDueDays). // DECISION-019-C
  let effectiveDueDate: Date | null = input.dueDate;
  if (effectiveDueDate === null && input.defaultRequestDueDays !== null) {
    // Compute fallback: createdAt (UTC calendar day) + defaultRequestDueDays days
    effectiveDueDate = new Date(input.createdAt);
    effectiveDueDate.setUTCDate(effectiveDueDate.getUTCDate() + input.defaultRequestDueDays);
  }

  // No effective due date → never overdue (null dueDate + no defaultRequestDueDays). // DECISION-019-C
  if (effectiveDueDate === null) return false;

  // ADR-023: now is the injected clock seam. // ADR-023
  const now = input.now ?? new Date();

  // UTC calendar-day comparison — mirrors SQL: CAST(@now AS DATE). // DECISION-019-C
  // effectiveDueDate < today → overdue (strictly in the past, not today).
  const effectiveDay = toUTCDateOnly(effectiveDueDate);
  const nowDay = toUTCDateOnly(now);

  return effectiveDay < nowDay;
}

/**
 * Strips the time component from a Date, returning a UTC midnight Date.
 * Used for calendar-day-only comparisons, mirroring SQL CAST(… AS DATE). // DECISION-019-C
 */
function toUTCDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// ─── Internal cast helper ─────────────────────────────────────────────────────

type DocumentRequestRow = {
  id: string;
  engagementId: string;
  label: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** TASK-019-004: dueDate added to the row shape (DECISION-019-C). */
  dueDate: Date | null;
};

/** Cast the request-scoped `db` wrapper to a typed client for DocumentRequest access. */
function dbAsDocumentRequestClient() {
  return db as unknown as {
    documentRequest: {
      findMany: (args?: {
        where?: { engagementId?: string };
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<DocumentRequestRow[]>;
    };
  };
}

// ─── Write: createDocumentRequestAsAccountant (admin pool) ────────────────────
//
// NOT exported from the package barrel (packages/db/src/index.ts).
// Import directly from this source module in server actions:
//   import { createDocumentRequestAsAccountant } from "@tax-portal/db/src/repositories/document-request.js"

/**
 * Creates a DocumentRequest for an engagement (accountant-only path).
 *
 * Uses the ADMIN POOL (app_admin_role, RLS-exempt). The accountant's server action
 * verifies the ACCOUNTANT role from the server-verified session before calling this.
 * The fn_document_request_write_access BLOCK has no CLIENT branch, so admin pool is
 * the correct path for accountant writes (mirrors createEngagement / submitQuestionnaireAnswer).
 *
 * TASK-019-004 additions (DECISION-019-I / DECISION-019-J):
 *   After INSERT, looks up engagement.clientUserId (admin pool SELECT) and emits a
 *   CLIENT document_request_created notification if clientUserId is non-null.
 *   If clientUserId is null (unassigned engagement), the notification is skipped —
 *   there is no recipient User row to notify. // DECISION-019-I
 *   No new email path — notification rides EPIC-018 digest. // DECISION-019-J
 *
 * AC-MSG-014-02: client is notified when a document request is created for them. // AC-MSG-014-02
 * ADR-005: reuses sec.pol_Notification CLIENT branch — no new policy. // ADR-005
 * CS-GEN-001: notification title carries no PII (no request label / client identity). // CS-GEN-001
 * CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
 * DECISION-019-C: dueDate stored when provided; used for overdue derivation. // DECISION-019-C
 *
 * DECISION (TASK-007-004): Admin pool write for accountant-authored DocumentRequests.
 * The BLOCK predicate is defence-in-depth for the request pool; the admin pool bypasses it
 * lawfully for accountant-authored checklist items (IS_MEMBER('app_admin_role')=1 passes).
 *
 * Returns { id: string } — the new DocumentRequest id.
 * Throws on failure (FK violation — engagement not found or unexpected SQL behavior).
 */
export async function createDocumentRequestAsAccountant(
  input: CreateDocumentRequestInput,
): Promise<{ id: string }> {
  // CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
  req.input("label", mssqlPkg.NVarChar(500), input.label);
  req.input("createdBy", mssqlPkg.NVarChar(64), input.createdByClerkId);
  // DECISION-019-C: INSERT dueDate (nullable DATE column). // DECISION-019-C
  req.input("dueDate", mssqlPkg.Date, input.dueDate ?? null);

  const result = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [dueDate], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@engagementId, @label, @createdBy, @dueDate, SYSDATETIMEOFFSET())`
  );

  const row = result.recordset[0];
  if (!row) {
    throw new Error(
      "createDocumentRequestAsAccountant INSERT did not return a row — unexpected SQL Server behavior"
    );
  }

  const requestId = row.id;

  // ── DECISION-019-I: emit CLIENT document_request_created notification ─────────
  //
  // After insert: look up engagement.clientUserId via admin pool SELECT.
  // If non-null → emit CLIENT notification with recipientUserId=clientUserId.
  // If null (unassigned engagement) → skip (no recipient). // DECISION-019-I
  //
  // ADR-005: reuses sec.pol_Notification CLIENT branch — no new policy. // ADR-005
  // DECISION-019-J: no new email path — rides EPIC-018 digest. // DECISION-019-J
  // CS-GEN-001: title carries NO PII — no client name, label content, or engagement detail. // CS-GEN-001
  // CS-TS-002: admin pool lookup inside packages/db. // CS-TS-002
  // ADR-003 §7: admin pool write — no SESSION_CONTEXT needed. // ADR-003
  try {
    const engLookupReq = new MssqlRequest(pool);
    engLookupReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    const engResult = await engLookupReq.query<{ clientUserId: string | null }>(
      `SELECT [clientUserId] FROM [dbo].[Engagement] WHERE [id] = @engagementId`
    );
    const clientUserId = engResult.recordset[0]?.clientUserId ?? null;

    if (clientUserId) {
      // Emit CLIENT notification — AC-MSG-014-02. // AC-MSG-014-02
      // recipientUserId = clientUserId from the engagement (server-authoritative, never client-supplied).
      // ADR-005: admin-pool INSERT; BLOCK-exempt (IS_MEMBER('app_admin_role')=1). // ADR-005
      await emitNotification({
        recipientType: "CLIENT",
        recipientUserId: clientUserId,
        type: "document_request_created",
        // CS-GEN-001: generic title — no client name, no label content, no engagement detail. // CS-GEN-001
        title: "A document request has been created for you",
        body: null,
        linkedItemType: "request",
        linkedItemId: requestId,
      });
    }
    // If clientUserId is null: skip — unassigned engagement has no recipient User row. // DECISION-019-I
  } catch (err) {
    // Non-fatal: notification emit failure does not roll back the DocumentRequest insert.
    // CS-GEN-001: log category only — no client identity / request detail in log args. // CS-GEN-001
    console.error(
      "[document-request] document_request_created notification emit failed (detail suppressed per CS-GEN-001)",
      (err as Error | null)?.constructor?.name ?? "unknown",
    );
  }

  return { id: requestId };
}

// ─── Read: listDocumentRequestsForEngagement (request pool — FILTER-governed) ─

/**
 * Returns all DocumentRequests for the given engagement, visible to the current
 * SESSION_CONTEXT identity.
 *
 * Under sec.pol_DocumentRequest (0007-document-policy.sql):
 *   - CLIENT sees only requests for their own engagement (exists via Engagement.clientUserId join).
 *   - ACCOUNTANT sees all requests for any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * AC-FILE-007-03: Client can see the checklist (their engagement's requests).
 * AC-FILE-008-01: The checklist is the ordered list of DocumentRequests for the engagement.
 *
 * Returns [] when:
 *   - The engagement has no DocumentRequests yet.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 */
export async function listDocumentRequestsForEngagement(
  engagementId: string,
): Promise<DocumentRequestItem[]> {
  const client = dbAsDocumentRequestClient();
  const rows = await client.documentRequest.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map(mapRow);
}

// ─── Read: listDocumentRequestsForEngagementAdmin (admin pool — accountant view) ─

/**
 * Returns all DocumentRequests for an engagement in the admin (accountant) view.
 *
 * Uses the ADMIN POOL (app_admin_role, RLS-exempt) — correct for accountant-only
 * admin surfaces that do not need SESSION_CONTEXT (mirrors getEngagementForAdmin).
 *
 * Returns DocumentRequestAdminItem[] with:
 *   - All DocumentRequestItem fields (including dueDate — TASK-019-004)
 *   - isFulfilled: true iff at least one active non-soft-deleted Document references this request
 *   - isOverdue: derived via computeIsOverdue (DECISION-019-C/-D, AC-FILE-012-02)
 *
 * isOverdue computation uses computeIsOverdue (the shared TypeScript predicate that
 * mirrors the engine's SQL predicate) so the accountant flag and the engine stay aligned.
 * DECISION-019-C: effective due date = dueDate ?? (createdAt + defaultRequestDueDays). // DECISION-019-C
 * DECISION-019-D: unfulfilled = no active non-deleted Document. // DECISION-019-D
 *
 * AC-FILE-012-02: overdue flag surfaced on the accountant view. // AC-FILE-012-02
 * ADR-003 §7: admin pool — no SESSION_CONTEXT needed. // ADR-003
 * CS-TS-001: this is the admin-pool read; no SESSION_CONTEXT wrapper needed. // CS-TS-001
 * CS-TS-002: admin pool via getAdminPool() inside packages/db. // CS-TS-002
 * CS-GEN-002: additive new export — listDocumentRequestsForEngagement unchanged. // CS-GEN-002
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */
export async function listDocumentRequestsForEngagementAdmin(
  engagementId: string,
): Promise<DocumentRequestAdminItem[]> {
  // CS-TS-002: admin pool via getAdminPool() — RLS-exempt. // CS-TS-002
  const pool = await getAdminPool();

  // Get defaultRequestDueDays from the global ReminderSetting for the fallback due date.
  // DECISION-019-C: fallback = createdAt + defaultRequestDueDays when dueDate IS NULL. // DECISION-019-C
  const globalCadence = await getGlobalDefaultCadence();
  const defaultRequestDueDays = globalCadence.defaultRequestDueDays;

  // Query all DocumentRequests for the engagement, with fulfillment state.
  // DECISION-019-D: isFulfilled = EXISTS active non-deleted Document. // DECISION-019-D
  // CS-GEN-001: no PII selected beyond opaque IDs and timestamps. // CS-GEN-001
  const req = new MssqlRequest(pool);
  req.input("engagementId", mssqlPkg.NVarChar(50), engagementId);

  const result = await req.query<{
    id: string;
    engagementId: string;
    label: string;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    dueDate: Date | null;
    isFulfilled: number; // BIT as int
  }>(
    `SELECT
         dr.[id],
         dr.[engagementId],
         dr.[label],
         dr.[createdBy],
         dr.[createdAt],
         dr.[updatedAt],
         dr.[dueDate],
         -- DECISION-019-D: fulfilled = at least one active non-soft-deleted Document references this request // DECISION-019-D
         CASE WHEN EXISTS (
             SELECT 1 FROM [dbo].[Document] d
             WHERE d.[documentRequestId] = dr.[id]
               AND d.[deletedAt] IS NULL
               AND d.[status] = N'active'
         ) THEN 1 ELSE 0 END AS isFulfilled
     FROM [dbo].[DocumentRequest] dr
     WHERE dr.[engagementId] = @engagementId
     ORDER BY dr.[createdAt] ASC`
  );

  const now = new Date();

  return result.recordset.map((row) => {
    const isFulfilled = row.isFulfilled === 1;
    // DECISION-019-C/-D: derive isOverdue via the shared TypeScript predicate. // DECISION-019-C // DECISION-019-D
    // Mirrors the SQL predicate in reminder-engine.ts Phase-1 WHERE clause.
    const isOverdue = computeIsOverdue({
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      defaultRequestDueDays,
      isFulfilled,
      now,
    });

    return {
      id: row.id,
      engagementId: row.engagementId,
      label: row.label,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      dueDate: row.dueDate,
      isFulfilled,
      isOverdue,
    };
  });
}

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapRow(row: DocumentRequestRow): DocumentRequestItem {
  return {
    id: row.id,
    engagementId: row.engagementId,
    label: row.label,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    dueDate: row.dueDate,
  };
}

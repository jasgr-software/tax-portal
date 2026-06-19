/**
 * packages/db/src/repositories/document-request.ts
 *
 * Data-access functions for DocumentRequest.
 *
 * AC-FILE-007-01: Accountant creates document requests with a free-text label.
 * AC-FILE-007-03: The checklist (DocumentRequests) is visible to the client.
 * AC-FILE-008-01: Each engagement has a checklist of document requests (read model).
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
 *
 * ADR-003: SESSION_CONTEXT (clerk_user_id + role) set by the request pool wrapper.
 * ADR-003 Amendment 1: no @read_only on sp_set_session_context.
 * ADR-005: FILTER + BLOCK on DocumentRequest (sec.pol_DocumentRequest).
 *
 * NOTE: createDocumentRequestAsAccountant is NOT exported from the package barrel.
 * It is imported directly from this source module by server actions in apps/admin.
 * The barrel exports only the request-pool reads.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single DocumentRequest checklist item as seen by the client or accountant.
 *
 * AC-FILE-007-01: label describes what the client should upload.
 * AC-FILE-008-01: forms the engagement's document-upload checklist.
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
}

/** Input for creating a DocumentRequest (accountant-only). */
export interface CreateDocumentRequestInput {
  /** FK → Engagement — the engagement to add a request to. */
  engagementId: string;
  /** Free-text label for what the client should upload (AC-FILE-007-01). */
  label: string;
  /** Accountant clerkId from the verified session (audit trail — never client-supplied). */
  createdByClerkId: string;
}

// ─── Internal cast helper ─────────────────────────────────────────────────────

type DocumentRequestRow = {
  id: string;
  engagementId: string;
  label: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
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
 * DECISION (TASK-007-004): Admin pool write for accountant-authored DocumentRequests.
 * The BLOCK predicate is defence-in-depth for the request pool; the admin pool bypasses it
 * lawfully for accountant-authored checklist items (IS_MEMBER('app_admin_role')=1 passes).
 *
 * Returns { id: string } — the new DocumentRequest id.
 * Returns { rowsAffected: 0 } on failure (FK violation — engagement not found).
 */
export async function createDocumentRequestAsAccountant(
  input: CreateDocumentRequestInput,
): Promise<{ id: string }> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
  req.input("label", mssqlPkg.NVarChar(500), input.label);
  req.input("createdBy", mssqlPkg.NVarChar(64), input.createdByClerkId);

  const result = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@engagementId, @label, @createdBy, SYSDATETIMEOFFSET())`
  );

  const row = result.recordset[0];
  if (!row) {
    throw new Error(
      "createDocumentRequestAsAccountant INSERT did not return a row — unexpected SQL Server behavior"
    );
  }

  return { id: row.id };
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

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapRow(row: DocumentRequestRow): DocumentRequestItem {
  return {
    id: row.id,
    engagementId: row.engagementId,
    label: row.label,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

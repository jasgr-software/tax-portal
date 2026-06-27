/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/actions.ts
 *
 * Server actions for the per-engagement document-request authoring surface.
 *
 * AC-FILE-007-01: createDocumentRequestAction — accountant creates a labeled document request
 *   for an engagement. The labeled request becomes part of the engagement's document checklist.
 * AC-FILE-012-02: listDocumentRequestsForAdminAction — accountant views list with isOverdue flag.
 * AC-MSG-014-02: createDocumentRequestAction triggers document_request_created notification for client.
 *
 * ADR-006: Authoring lives in apps/admin ONLY. There is NO mirror action or export in apps/portal.
 *   This is a hard surface boundary; clients cannot reach this surface.
 * ADR-005: createdByClerkId comes ONLY from the verified session (getAccountantIdentity()) —
 *   NEVER from any action argument or form data.
 * ADR-003: listDocumentRequestsForEngagement uses the request-scoped db wrapper
 *   (SESSION_CONTEXT-aware) so it MUST be called inside withRequestContext.
 * ADR-019: Authoring is auditable via the existing seam.
 *
 * WRITE SEAM (TASK-007-004):
 *   createDocumentRequestAsAccountant — admin pool write (RLS-exempt; accountant path).
 *   NOT exported from the @tax-portal/db barrel — import directly from the source module.
 *   Mirrors createEngagement / submitQuestionnaireAnswer pattern (TASK-005-001/006-001).
 *
 * TASK-019-004 additions:
 *   - createDocumentRequestAction: accepts optional dueDate (DECISION-019-C); the repository
 *     layer emits document_request_created CLIENT notification (AC-MSG-014-02, DECISION-019-I).
 *   - listDocumentRequestsForAdminAction: uses listDocumentRequestsForEngagementAdmin (admin pool)
 *     to return DocumentRequestAdminItem[] with isFulfilled + isOverdue (AC-FILE-012-02).
 *
 * // DECISION (TASK-007-005): Route is apps/admin/engagements/[engagementId]/document-requests/.
 * // DECISION-019-C // DECISION-019-I // AC-FILE-012-02 // AC-MSG-014-02
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  listDocumentRequestsForEngagement,
  listDocumentRequestsForEngagementAdmin,
  getEngagementStatusForAdmin,
} from "@tax-portal/db";
import type { DocumentRequestItem, DocumentRequestAdminItem } from "@tax-portal/db";
// NOT on the barrel — import directly from the source module (TASK-007-004 constraint)
import { createDocumentRequestAsAccountant } from "@tax-portal/db/src/repositories/document-request.js";
import { validateLabel } from "./validation";

// ─── Result types ─────────────────────────────────────────────────────────────

export type CreateDocumentRequestResult =
  | { success: true; id: string }
  | { success: false; error: string };

export type ListDocumentRequestsResult =
  | { success: true; data: DocumentRequestItem[] }
  | { success: false; error: string };

/**
 * Result type for listDocumentRequestsForAdminAction (admin-pool, includes isOverdue).
 * AC-FILE-012-02: isOverdue surfaces when the accountant views the request. // AC-FILE-012-02
 */
export type ListDocumentRequestsForAdminResult =
  | { success: true; data: DocumentRequestAdminItem[] }
  | { success: false; error: string };

export type GetEngagementStatusResult =
  | { success: true; status: string }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/settings/questionnaire-templates/actions.ts pattern exactly.
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 *
 * ADR-005: identity.role comes from the verified session (Clerk public metadata
 * or mock session cookie) — NEVER from any server action argument or form data.
 * The trust fence is this guard; the BLOCK predicate is defence-in-depth only.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Create a labeled document request for an engagement.
 *
 * AC-FILE-007-01: The accountant can create a document request in an engagement with a free-text label.
 * AC-MSG-014-02: After insert, the repository layer emits a document_request_created CLIENT
 *   notification for the engagement's client (DECISION-019-I). No new action code needed —
 *   handled by createDocumentRequestAsAccountant in packages/db. // AC-MSG-014-02 // DECISION-019-I
 *
 * Flow:
 *   1. Verify ACCOUNTANT identity from the verified session.
 *   2. Validate engagementId (non-empty string).
 *   3. Validate label (non-empty, trimmed, ≤500 chars).
 *   4. Call createDocumentRequestAsAccountant on the admin pool (TASK-007-004 write seam).
 *      The repository emits document_request_created notification if engagement has a client.
 *   5. revalidatePath for the engagement's document-requests page.
 *
 * ADR-005: createdByClerkId comes ONLY from the verified session — never from action args/form data.
 * ADR-006: This action is apps/admin ONLY. No mirror in apps/portal.
 * DECISION-019-C: dueDate (optional) passed to the repository; stored as-is for overdue derivation.
 *
 * @param engagementId - The Engagement.id to add the request to (from the URL route param).
 * @param label - Free-text label describing what the client should upload.
 * @param dueDate - Optional explicit due date for the request (DECISION-019-C / AC-FILE-012-04).
 * @returns CreateDocumentRequestResult — success + new request id, or failure + error string.
 */
export async function createDocumentRequestAction(
  engagementId: string,
  label: string,
  dueDate?: Date | null,
): Promise<CreateDocumentRequestResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate engagementId ──────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Validate label ─────────────────────────────────────────────────────
  const labelError = validateLabel(label);
  if (labelError) {
    return { success: false, error: labelError };
  }

  // ── 4. Admin-pool write (TASK-007-004 write seam) ─────────────────────────
  // createDocumentRequestAsAccountant is NOT on the barrel — imported directly above.
  // createdByClerkId from the verified session — NEVER from action args (ADR-005).
  // DECISION-019-C: dueDate passed through to the repository (nullable). // DECISION-019-C
  // DECISION-019-I: the repository emits document_request_created CLIENT notification. // DECISION-019-I
  const result = await createDocumentRequestAsAccountant({
    engagementId: engagementId.trim(),
    label: label.trim(),
    createdByClerkId: identity.clerkUserId,
    dueDate: dueDate ?? null, // DECISION-019-C // AC-FILE-012-04
  });

  // ── 5. Revalidate the document-requests page ──────────────────────────────
  revalidatePath(`/engagements/${engagementId}/document-requests`);

  return { success: true, id: result.id };
}

/**
 * List the document requests for an engagement (request-pool, RLS-FILTER-governed).
 *
 * AC-FILE-007-01: Used to display the current list of document requests for an engagement.
 * AC-FILE-008-01: The checklist is the ordered list of DocumentRequests for the engagement.
 *
 * ADR-003: MUST run inside withRequestContext — listDocumentRequestsForEngagement uses the
 *   SESSION_CONTEXT-aware db wrapper. Without it, ADR-003 middleware throws.
 *
 * Under sec.pol_DocumentRequest FILTER:
 *   - ACCOUNTANT sees all requests for any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed).
 *
 * @param engagementId - The Engagement.id to list requests for.
 * @returns ListDocumentRequestsResult — success + list, or failure + error string.
 */
export async function listDocumentRequestsAction(
  engagementId: string,
): Promise<ListDocumentRequestsResult> {
  // ── Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // listDocumentRequestsForEngagement uses the request-scoped db wrapper.
  // Wrap in withRequestContext so SESSION_CONTEXT is set before the Prisma query executes.
  // ADR-003: MUST be inside withRequestContext.
  const data = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listDocumentRequestsForEngagement(engagementId.trim()),
  );

  return { success: true, data };
}

/**
 * List the document requests for an engagement — admin (accountant) view.
 *
 * Uses listDocumentRequestsForEngagementAdmin (admin pool, RLS-exempt) which returns
 * DocumentRequestAdminItem[] with isFulfilled + isOverdue fields (AC-FILE-012-02).
 *
 * AC-FILE-012-02: overdue flag is surfaced when the accountant views the request. // AC-FILE-012-02
 * DECISION-019-C/-D: isOverdue derived by computeIsOverdue (shared predicate). // DECISION-019-C // DECISION-019-D
 * ADR-003 §7: admin pool — no SESSION_CONTEXT needed for this read. // ADR-003
 * ADR-006: admin surface only — not exposed to apps/portal. // ADR-006
 * CS-GEN-002: additive new action; listDocumentRequestsAction unchanged. // CS-GEN-002
 *
 * @param engagementId - The Engagement.id from the URL route param.
 * @returns ListDocumentRequestsForAdminResult — success + list with overdue flags, or failure + error.
 */
export async function listDocumentRequestsForAdminAction(
  engagementId: string,
): Promise<ListDocumentRequestsForAdminResult> {
  // ── Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // Admin pool read — no withRequestContext needed (listDocumentRequestsForEngagementAdmin uses admin pool).
  // ADR-003 §7: admin pool write; no SESSION_CONTEXT needed. // ADR-003
  // AC-FILE-012-02: returns isOverdue per request. // AC-FILE-012-02
  const data = await listDocumentRequestsForEngagementAdmin(engagementId.trim());

  return { success: true, data };
}

/**
 * Get the engagement status for the admin per-engagement surface (read-only badge).
 *
 * AC-ONBD-006-01 (UI observable): The admin per-engagement page shows the engagement
 *   status, reading "In Progress" once the onboarding completion engine has transitioned it.
 *
 * ADR-003: Uses getEngagementStatusForAdmin (admin pool, RLS-exempt) — no SESSION_CONTEXT
 *   required for this admin-side read (the accountant's identity is already verified by the
 *   middleware guard; the admin pool is the correct pool for admin-surface reads, per
 *   DECISION in engagement.ts TASK-008-003).
 * ADR-006: Admin surface only — this action is apps/admin. Not in apps/portal.
 * ADR-005: No new entity/column/policy. Reads existing Engagement.status column.
 *
 * @param engagementId - The Engagement.id from the URL route param (server-resolved).
 * @returns GetEngagementStatusResult — success + status string, or failure + error string.
 */
export async function getEngagementStatusAction(
  engagementId: string,
): Promise<GetEngagementStatusResult> {
  // ── Identity guard (ACCOUNTANT-only, ADR-005) ─────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // Admin pool read — no withRequestContext needed (getEngagementStatusForAdmin uses admin pool).
  // ADR-003: admin pool is sanctioned for admin-surface reads (DECISION in engagement.ts TASK-008-003).
  const result = await getEngagementStatusForAdmin(engagementId.trim());

  if (!result) {
    return { success: false, error: "Engagement not found" };
  }

  return { success: true, status: result.status };
}

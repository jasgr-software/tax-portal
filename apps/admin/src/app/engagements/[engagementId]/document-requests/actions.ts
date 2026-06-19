/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/actions.ts
 *
 * Server actions for the per-engagement document-request authoring surface.
 *
 * AC-FILE-007-01: createDocumentRequestAction — accountant creates a labeled document request
 *   for an engagement. The labeled request becomes part of the engagement's document checklist.
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
 * // DECISION (TASK-007-005): Route is apps/admin/engagements/[engagementId]/document-requests/.
 * // There is no existing engagement-detail surface in apps/admin (top-level routes are:
 * // requests, services, settings). Creating new /engagements/ top-level route as the
 * // semantically correct home for per-engagement surfaces — mirrors future engagement-detail
 * // expansion. The trust fence is getAccountantIdentity() — not the BLOCK predicate.
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  listDocumentRequestsForEngagement,
} from "@tax-portal/db";
import type { DocumentRequestItem } from "@tax-portal/db";
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
 *
 * Flow:
 *   1. Verify ACCOUNTANT identity from the verified session.
 *   2. Validate engagementId (non-empty string).
 *   3. Validate label (non-empty, trimmed, ≤500 chars).
 *   4. Call createDocumentRequestAsAccountant on the admin pool (TASK-007-004 write seam).
 *   5. revalidatePath for the engagement's document-requests page.
 *
 * ADR-005: createdByClerkId comes ONLY from the verified session — never from action args/form data.
 * ADR-006: This action is apps/admin ONLY. No mirror in apps/portal.
 *
 * @param engagementId - The Engagement.id to add the request to (from the URL route param).
 * @param label - Free-text label describing what the client should upload.
 * @returns CreateDocumentRequestResult — success + new request id, or failure + error string.
 */
export async function createDocumentRequestAction(
  engagementId: string,
  label: string,
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
  const result = await createDocumentRequestAsAccountant({
    engagementId: engagementId.trim(),
    label: label.trim(),
    createdByClerkId: identity.clerkUserId,
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

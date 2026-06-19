/**
 * packages/db/src/checklist.ts — Document-upload checklist read model
 *
 * AC-FILE-008-01: Each engagement has a checklist of document requests.
 * AC-FILE-008-02: Checklist shows which items are outstanding vs. fulfilled.
 * AC-FILE-008-03: An item is fulfilled when ≥1 active Document references it.
 * AC-ONBD-004-02: Step is satisfied when all required items are provided.
 * AC-ONBD-004-04: Zero-requests case → vacuously satisfied (done: true).
 *
 * resolveChecklist(engagementId):
 *   - Request-pool / FILTER-scoped: the caller's SESSION_CONTEXT must be set.
 *   - Returns { items, allRequiredProvided } where each item has:
 *       requestId, label, status: 'outstanding' | 'fulfilled'
 *   - An item is 'fulfilled' when ≥1 Document with status='active' has
 *     documentRequestId = request.id.
 *   - 'outstanding' otherwise (no active document satisfies the request).
 *   - allRequiredProvided: true when every DocumentRequest is 'fulfilled'
 *     (or when there are zero DocumentRequests — vacuously satisfied).
 *   - DECISION (TASK-007-003): In v1, ALL DocumentRequests are required.
 *
 * Pool: REQUEST POOL — calls listDocumentRequestsForEngagement (FILTER-governed)
 * then listEngagementDocuments (FILTER-governed) to derive the read model.
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * ADR-003: SESSION_CONTEXT for both sub-queries.
 * ADR-005: FILTER predicate on DocumentRequest and Document ensures client isolation.
 */

import { listDocumentRequestsForEngagement } from "./repositories/document-request.js";
import { listEngagementDocuments } from "./repositories/document.js";
import type { DocumentRequestItem } from "./repositories/document-request.js";
import type { DocumentItem } from "./repositories/document.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The satisfaction status of a single checklist item.
 *
 * 'outstanding' — no active Document satisfies this DocumentRequest.
 * 'fulfilled'   — ≥1 active Document with documentRequestId = request.id exists.
 *
 * AC-FILE-008-02/-03.
 */
export type ChecklistItemStatus = "outstanding" | "fulfilled";

/**
 * A single checklist item in the read model.
 *
 * AC-FILE-008-01: Each item corresponds to one DocumentRequest.
 */
export interface ChecklistItem {
  requestId: string;
  label: string;
  status: ChecklistItemStatus;
}

/**
 * The checklist read model for a single engagement.
 *
 * AC-FILE-008-01: items is the ordered list of checklist items.
 * AC-ONBD-004-02: allRequiredProvided is the step-satisfaction signal.
 * AC-ONBD-004-04: allRequiredProvided=true when items is empty (vacuously satisfied).
 */
export interface ChecklistReadModel {
  engagementId: string;
  items: ChecklistItem[];
  /** true when every DocumentRequest is 'fulfilled' (or no requests exist). */
  allRequiredProvided: boolean;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Resolve the document-upload checklist read model for an engagement.
 *
 * Derives the outstanding/fulfilled status of each DocumentRequest by checking
 * whether ≥1 active Document references it via documentRequestId.
 *
 * Both sub-queries go through the request pool (FILTER-governed):
 *   - listDocumentRequestsForEngagement: CLIENT sees own engagement's requests.
 *   - listEngagementDocuments: CLIENT sees own engagement's documents.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * AC-FILE-008-01: Returns the checklist for the engagement.
 * AC-FILE-008-03: Fulfilled = ≥1 active Document with matching documentRequestId.
 * AC-ONBD-004-04: Zero requests → allRequiredProvided=true (vacuously satisfied).
 *
 * @param engagementId — the engagement to resolve the checklist for.
 */
export async function resolveChecklist(
  engagementId: string,
): Promise<ChecklistReadModel> {
  // Fetch DocumentRequests for this engagement (FILTER-scoped — caller must have SESSION_CONTEXT).
  const requests: DocumentRequestItem[] = await listDocumentRequestsForEngagement(engagementId);

  // Fetch Documents for this engagement (FILTER-scoped — same SESSION_CONTEXT).
  const documents: DocumentItem[] = await listEngagementDocuments(engagementId);

  // Build a set of documentRequestId values that have ≥1 active Document.
  // AC-FILE-008-03: A request is fulfilled when ≥1 Document with status='active' references it.
  const fulfilledRequestIds = new Set<string>();
  for (const doc of documents) {
    if (doc.status === "active" && doc.documentRequestId != null) {
      fulfilledRequestIds.add(doc.documentRequestId);
    }
  }

  // Derive checklist items.
  const items: ChecklistItem[] = requests.map((req) => ({
    requestId: req.id,
    label: req.label,
    status: fulfilledRequestIds.has(req.id) ? "fulfilled" : "outstanding",
  }));

  // AC-ONBD-004-04: Zero DocumentRequests → vacuously satisfied (allRequiredProvided=true).
  // DECISION (TASK-007-003): All DocumentRequests are required in v1.
  const allRequiredProvided =
    items.length === 0 || items.every((item) => item.status === "fulfilled");

  return {
    engagementId,
    items,
    allRequiredProvided,
  };
}

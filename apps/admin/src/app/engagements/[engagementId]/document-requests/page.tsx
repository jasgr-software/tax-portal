/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/page.tsx
 *
 * Accountant-guarded page for authoring labeled document requests within an engagement.
 *
 * AC-FILE-007-01: The accountant can create a document request in an engagement with a free-text
 *   label. The set of labeled requests composes the engagement's document checklist.
 * AC-FILE-012-02: Overdue requests are flagged/surfaced as overdue when the accountant views them.
 *   The page uses listDocumentRequestsForAdminAction (admin pool, returns isOverdue per request).
 *   // AC-FILE-012-02 // DECISION-019-C // DECISION-019-D
 *
 * ADR-006: This page is apps/admin ONLY. There is NO mirror route in apps/portal.
 *   Document-request authoring is an accountant capability — clients never reach this surface.
 *
 * ADR-010: apps/admin has NO public routes. The middleware guarantees ACCOUNTANT auth
 *   before this page renders. This page adds a defense-in-depth identity guard.
 *
 * ADR-003 §7: listDocumentRequestsForAdminAction uses admin pool (RLS-exempt) — no
 *   withRequestContext needed for the admin read path. // ADR-003
 * ADR-005: Identity from verified session only — never from URL params.
 *
 * TASK-019-004: Switched from listDocumentRequestsAction (request pool) to
 *   listDocumentRequestsForAdminAction (admin pool) to surface isOverdue (AC-FILE-012-02).
 *   CS-GEN-002: additive change — listDocumentRequestsAction remains available for the
 *   client-facing portal path (sec.pol_DocumentRequest FILTER still enforced there). // CS-GEN-002
 *
 * // DECISION (TASK-007-005): Route is /engagements/[engagementId]/document-requests.
 * // DECISION-019-C // DECISION-019-D // AC-FILE-012-02 // AC-MSG-014-02
 *
 * Pool strategy:
 *   Page guard: identity check via getAuthProvider() (mirrors request/questionnaire-template pattern).
 *   List read: listDocumentRequestsForAdminAction → listDocumentRequestsForEngagementAdmin (admin pool).
 *     Returns DocumentRequestAdminItem[] with isFulfilled + isOverdue. // AC-FILE-012-02
 *   Create write: action in actions.ts → createDocumentRequestAsAccountant (admin pool, TASK-007-004).
 *     Repository layer emits document_request_created CLIENT notification (DECISION-019-I). // AC-MSG-014-02
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { DocumentRequestEditor } from "./_components/DocumentRequestEditor";
import { listDocumentRequestsForAdminAction, getEngagementStatusAction } from "./actions";

// ─── Route params ─────────────────────────────────────────────────────────────

interface DocumentRequestsPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Document Requests",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocumentRequestsPage({
  params,
}: DocumentRequestsPageProps) {
  const { engagementId } = await params;

  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-red-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
          <p className="text-sm text-red-600">Authentication required. Please sign in.</p>
        </div>
      </div>
    );
  }

  // Load existing document requests for this engagement — admin view with isOverdue.
  // listDocumentRequestsForAdminAction uses admin pool (no withRequestContext needed).
  // Returns DocumentRequestAdminItem[] with isFulfilled + isOverdue (AC-FILE-012-02).
  // ADR-003 §7: admin pool read — no SESSION_CONTEXT required. // ADR-003 // AC-FILE-012-02
  const requestsResult = await listDocumentRequestsForAdminAction(engagementId);

  const initialRequests = requestsResult.success ? requestsResult.data : [];
  const dbError = requestsResult.success ? null : requestsResult.error;

  // AC-ONBD-006-01 (UI observable): Load the engagement status (admin pool, read-only badge).
  // DECISION (TASK-008-003): Minimal additive read — no new entity/column; reads existing
  //   Engagement.status via getEngagementStatusForAdmin (admin pool, ADR-003 §7).
  const statusResult = await getEngagementStatusAction(engagementId);
  const engagementStatus = statusResult.success ? statusResult.status : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirrors questionnaire-templates/page.tsx pattern */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
              <nav className="flex gap-4 text-sm" aria-label="Main navigation">
                <a
                  href="/"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/requests"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Requests
                </a>
                <a
                  href="/services"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Services
                </a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <a
          href="/requests"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Requests
        </a>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Document Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            Add labeled document requests for this engagement. Each request defines what
            the client should upload to fulfill the checklist item.
          </p>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Engagement: {engagementId}
          </p>

          {/* AC-ONBD-006-01 (UI observable): Minimal read-only engagement status display.
              Admin-side only — NOT a client-facing lifecycle label (Phase 3 out of scope).
              Shows "New" or "In Progress" once the completion engine has transitioned it.
              XSS-safe: engagementStatus is a DB-constrained enum value, rendered as text. */}
          {engagementStatus && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Status:</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  engagementStatus === "In Progress"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-700"
                }`}
                data-testid="engagement-status"
                data-status={engagementStatus}
              >
                {engagementStatus}
              </span>
            </div>
          )}
        </div>

        {dbError && (
          <div
            role="alert"
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dbError}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <DocumentRequestEditor
            engagementId={engagementId}
            initialRequests={initialRequests}
          />
        </div>
      </main>
    </div>
  );
}

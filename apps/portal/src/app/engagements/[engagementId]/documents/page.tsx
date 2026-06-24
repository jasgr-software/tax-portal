/**
 * apps/portal/src/app/engagements/[engagementId]/documents/page.tsx
 *
 * Client-participant document list and download page (portal surface).
 *
 * TASK-013-005: Both-surface download — client participant view (AC-FILE-001-04).
 *
 * Acceptance criteria:
 *   AC-FILE-001-04 — a client participant (owner or linked participant) can view and
 *     download their engagement's files over the authorize-then-sign path.
 *     An unrelated client is denied access (RLS FILTER fail-closed).
 *   AC-FILE-009-03 — each document's version history is listed; prior versions downloadable.
 *
 * ADR-003: All reads via withRequestContext(CLIENT). SESSION_CONTEXT set before any query.
 *   The fn_document_access FILTER (TASK-013-001) governs what the CLIENT can see —
 *   engagement owner OR linked participant.
 * ADR-005: sec.pol_Document FILTER is the access gate, not app-layer filtering.
 *   An unrelated CLIENT's SESSION_CONTEXT causes the FILTER to return ZERO rows.
 * ADR-006: /engagements/{id}/documents is apps/portal — no mirror upload surface.
 *   Download is the mirrored path; upload and folder management are admin-only.
 * ADR-010: /engagements/* is NOT public — requires CLIENT session.
 *
 * Pool strategy:
 *   Identity check: provider.getIdentity() (request-scoped headers).
 *   Documents read: listDocumentsForEngagementAction (withRequestContext, CLIENT role).
 *   Download: requestDownloadUrlAction (withRequestContext, CLIENT role — server action).
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010 // CS-TS-001 // CS-TS-002 // CS-GEN-003
 * // AC-FILE-001-04 // AC-FILE-009-03
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { DownloadButton } from "./_components/DownloadButton";
import { VersionHistory } from "./_components/VersionHistory";
import { listDocumentsForEngagementAction } from "./actions";
import type { DocumentItem } from "@tax-portal/db";

// ─── Route params ─────────────────────────────────────────────────────────────

interface DocumentsPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Engagement Documents",
  description: "View and download your engagement documents.",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PortalDocumentsPage({ params }: DocumentsPageProps) {
  const { engagementId } = await params;

  // Defense-in-depth identity guard — ADR-010 middleware guarantees CLIENT before this page.
  // ADR-003: identity from verified session headers, never from URL params.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "CLIENT") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-8 text-center"
          data-testid="portal-documents-unauthorized"
        >
          <p className="text-red-700 text-sm">
            Authentication required. Please sign in.
          </p>
        </div>
      </div>
    );
  }

  // Load document list via the portal action (CLIENT identity — FILTER-governed).
  // ADR-003: uses withRequestContext inside the action.
  // ADR-005: fn_document_access FILTER: owner + participant branch (TASK-013-001).
  //   An unrelated client sees ZERO documents (fail-closed).
  // AC-FILE-001-04: client participant sees their engagement's active documents.
  const documentsResult = await listDocumentsForEngagementAction(engagementId);
  const documents: DocumentItem[] = documentsResult.success ? documentsResult.data : [];

  // Filter to active-only documents for the client view.
  // ADR-009: only 'active' documents are downloadable (pending/infected are withheld).
  const activeDocuments = documents.filter((d) => d.status === "active");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back to engagement */}
      <div className="mb-6">
        <a
          href={`/engagements/${engagementId}`}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Engagement
        </a>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Files shared with you for this engagement. Download each file directly.
        </p>
      </div>

      {/* Error loading documents */}
      {!documentsResult.success && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
          data-testid="portal-documents-load-error"
        >
          Could not load documents. Please refresh the page.
        </div>
      )}

      {/* Document list */}
      <div
        className="rounded-lg border border-gray-200 bg-white overflow-hidden"
        data-testid="portal-documents-panel"
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Available Documents
            <span className="ml-2 text-xs font-normal text-gray-400">
              {activeDocuments.length} file{activeDocuments.length !== 1 ? "s" : ""}
            </span>
          </h2>
        </div>

        {activeDocuments.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-sm text-gray-500"
            data-testid="portal-documents-empty"
          >
            No files have been shared for this engagement yet.
          </div>
        ) : (
          <ul
            className="divide-y divide-gray-100"
            data-testid="portal-documents-list"
          >
            {activeDocuments.map((doc) => (
              <PortalDocumentRow
                key={doc.id}
                document={doc}
                engagementId={engagementId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Document row sub-component ────────────────────────────────────────────────

interface PortalDocumentRowProps {
  document: DocumentItem;
  engagementId: string;
}

/**
 * PortalDocumentRow — renders a single document row with download control and version history.
 *
 * AC-FILE-001-04: Each active document shows a download button.
 * AC-FILE-009-03: Version history toggle lists prior versions, each downloadable.
 *
 * // AC-FILE-001-04 // AC-FILE-009-03 // ADR-009 // CS-GEN-001
 */
function PortalDocumentRow({ document, engagementId }: PortalDocumentRowProps) {
  return (
    <li
      className="px-4 py-3"
      data-testid={`portal-document-item-${document.id}`}
      data-document-id={document.id}
    >
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="flex-shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5 text-gray-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 13Z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Document info */}
        <div className="flex-1 min-w-0">
          {/* Filename — GUARDRAIL: originalFilename auto-escaped as JSX text */}
          <p
            className="text-sm font-medium text-gray-900 truncate"
            data-testid={`portal-document-filename-${document.id}`}
          >
            {document.originalFilename}
          </p>

          <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
            {/* Version badge */}
            <span
              className="font-mono"
              data-testid={`portal-document-version-${document.id}`}
            >
              v{document.version}
            </span>
            <span>{document.contentType}</span>
            {document.sizeBytes > 0 && (
              <span>{formatBytes(document.sizeBytes)}</span>
            )}
            <span>{formatDate(document.createdAt)}</span>
          </div>

          {/* AC-FILE-009-03: version history panel */}
          <VersionHistory documentId={document.id} engagementId={engagementId} />
        </div>

        {/* AC-FILE-001-04: download button — right side */}
        <div className="flex-shrink-0">
          <DownloadButton
            documentId={document.id}
            engagementId={engagementId}
          />
        </div>
      </div>
    </li>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

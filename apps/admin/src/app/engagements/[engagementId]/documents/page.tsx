/**
 * apps/admin/src/app/engagements/[engagementId]/documents/page.tsx
 *
 * Engagement documents page — accountant upload + version-replace surface.
 *
 * TASK-013-003: Accountant upload + version-replace UI & server actions.
 *
 * Acceptance criteria:
 *   AC-FILE-001-01 — the accountant can upload a file to an engagement
 *   AC-FILE-009-01 — an existing file can be replaced with a new version
 *   AC-FILE-009-02 — after replacement, the newest version is presented as current
 *
 * ADR-010: apps/admin has NO public routes. Middleware guarantees ACCOUNTANT before this page.
 *   This page adds a defense-in-depth identity guard (mirrors engagement/page.tsx pattern).
 * ADR-003: Identity from verified session headers, never from URL params.
 *   Documents listed via listDocumentsAction which uses withRequestContext (ACCOUNTANT role).
 * ADR-005: Identity from verified session only — never from URL params or form data.
 * ADR-006: This page is apps/admin ONLY. No mirror route in apps/portal.
 *   (Download is the mirrored path — TASK-013-005.)
 *
 * Pool strategy:
 *   Page guard: identity check via getAuthProvider().
 *   Documents read: listDocumentsAction (withRequestContext, ACCOUNTANT role, request pool).
 *
 * // ADR-003: server-side authority; identity from session only
 * // ADR-006: admin surface only (apps/admin) — no mirror in apps/portal
 * // CS-TS-001: uses @tax-portal/db barrel for all reads
 * // CS-GEN-003: cite governing authority in comments
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
// CS-TS-001: uses @tax-portal/db barrel for all reads (no raw pool import)
import { listEngagementFolders, withRequestContext, adminDb, activeHoldsFor, purgeEligibility } from "@tax-portal/db";
import { DocumentsClientPage } from "./_components/DocumentsClientPage";
import { FolderTree } from "./_components/FolderTree";
import { RetentionPanel } from "./_components/RetentionPanel";
import { listDocumentsAction, listDeletedDocumentsAction } from "./actions";
// TASK-015-003: EPIC-015 retention / purge / legal-hold panel (ADR-018 §5/§6)
// ADR-006: RetentionPanel is imported ONLY in apps/admin — no mirror in apps/portal.
// // ADR-006 // ADR-018 // CS-GEN-003

// TASK-013-004: AC-FILE-010-01/-02/-03/-04 — folder tree is accountant-only, admin surface.
// ADR-006: FolderTree is imported ONLY in apps/admin — no mirror in apps/portal.
// // ADR-006 // CS-GEN-003

// ─── Route params ─────────────────────────────────────────────────────────────

interface DocumentsPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Engagement — Documents",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocumentsPage({ params }: DocumentsPageProps) {
  const { engagementId } = await params;

  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern.
  // ADR-003: identity from verified session headers, never from URL params.
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

  // Load document list for the engagement (working view — deletedAt IS NULL).
  // ADR-003: listDocumentsAction uses withRequestContext for ACCOUNTANT identity.
  // CS-TS-001: request pool read via @tax-portal/db barrel.
  // TASK-014-003: also load the archive (deleted) list for the Archive/Recover section.
  const documentsResult = await listDocumentsAction(engagementId);
  const initialDocuments = documentsResult.success ? documentsResult.data : [];

  // Load soft-deleted (archive) list (AC-FILE-006-01 / AC-FILE-006-03).
  // ADR-018: deleted docs are retained; accountant can recover in-window.
  // CS-TS-001: listDeletedDocumentsAction uses admin pool via @tax-portal/db barrel.
  const deletedDocumentsResult = await listDeletedDocumentsAction(engagementId);
  const initialDeletedDocuments = deletedDocumentsResult.success ? deletedDocumentsResult.data : [];

  // Load folder list for the engagement (AC-FILE-010-01 — folder tree for the accountant).
  // ADR-003: listEngagementFolders must run inside withRequestContext (request pool, FILTER-governed).
  // CS-TS-001: request pool read via @tax-portal/db barrel.
  // ADR-006: folder tree is accountant-only — rendered only here in apps/admin.
  // // ADR-003 // ADR-006 // CS-TS-001 // CS-GEN-003
  const initialFolders = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listEngagementFolders(engagementId),
  );

  // TASK-015-003: Load purge eligibility + active holds for the retention panel.
  // ADR-018 §3/§5/§6: eligibility = (window elapsed AND no hold).
  // CS-TS-001: activeHoldsFor from @tax-portal/db barrel (admin pool).
  // ADR-006: RetentionPanel is rendered ONLY in apps/admin — never in apps/portal.
  // // ADR-006 // ADR-018 §5/§6 // CS-TS-001 // CS-GEN-003
  // Use adminDb (admin pool Prisma client) to query completedAt for the engagement.
  // DECISION: adminDb is the appropriate client for admin-pool reads in apps/admin server components.
  //   (mirrors the established pattern in apps/admin/src/app/page.tsx and
  //    apps/admin/src/app/requests/[id]/page.tsx).
  // CS-TS-002: adminDb is on an allowed admin code path (apps/admin server component).
  // ADR-003 §1/§6: admin pool is correct for admin-surface reads without SESSION_CONTEXT.
  // // ADR-003 §1 // CS-TS-002 // CS-GEN-003
  const engagementRow = await (adminDb as unknown as {
    engagement: { findUnique: (args: { where: { id: string }; select: { completedAt: boolean } }) => Promise<{ completedAt: Date | null } | null> };
  }).engagement.findUnique({
    where: { id: engagementId },
    select: { completedAt: true },
  }).catch(() => null);
  const initialActiveHolds = await activeHoldsFor(engagementId).catch(() => []);
  const completedAt = engagementRow?.completedAt ?? null;
  const initialEligibility = purgeEligibility(
    { id: engagementId, completedAt },
    initialActiveHolds,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirrors engagement/page.tsx pattern */}
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
                  href="/engagements"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Engagements
                </a>
              </nav>
            </div>
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2">
          <nav className="flex text-sm text-gray-500" aria-label="Breadcrumb">
            <a href="/engagements" className="hover:text-gray-700">Engagements</a>
            <span className="mx-1" aria-hidden="true">/</span>
            <a
              href={`/engagements/${engagementId}`}
              className="hover:text-gray-700"
            >
              {/* GUARDRAIL: engagementId auto-escaped as JSX text — no dangerouslySetInnerHTML */}
              {engagementId}
            </a>
            <span className="mx-1" aria-hidden="true">/</span>
            <span className="text-gray-900 font-medium" aria-current="page">Documents</span>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">
            Engagement: {/* GUARDRAIL: auto-escaped JSX text */}
            <span className="font-mono text-xs">{engagementId}</span>
          </p>
        </div>

        {documentsResult.success ? null : (
          <div
            role="alert"
            className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            data-testid="documents-load-error"
          >
            {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
            Could not load documents. Please refresh the page.
          </div>
        )}

        {/* Client component handles upload + replace + delete + recover interactions */}
        {/* AC-FILE-001-01 / AC-FILE-009-01 / AC-FILE-009-02 */}
        {/* AC-FILE-004-01 / AC-FILE-006-01 / AC-FILE-006-03 (TASK-014-003) */}
        <DocumentsClientPage
          engagementId={engagementId}
          initialDocuments={initialDocuments}
          initialDeletedDocuments={initialDeletedDocuments}
        />

        {/* Folder tree — accountant-managed folder structure (TASK-013-004) */}
        {/* AC-FILE-010-01 / AC-FILE-010-02 / AC-FILE-010-03 / AC-FILE-010-04 */}
        {/* ADR-006: FolderTree is ONLY rendered in apps/admin — never in apps/portal */}
        <div className="mt-6">
          <FolderTree
            engagementId={engagementId}
            initialFolders={initialFolders}
            documents={initialDocuments}
          />
        </div>

        {/* Retention panel — purge-confirm + legal-hold place/lift (TASK-015-003 / EPIC-015) */}
        {/* AC-FILE-013-03: confirm-before-purge. AC-FILE-014-01: place hold. AC-FILE-014-05: lift hold. */}
        {/* ADR-006: RetentionPanel ONLY in apps/admin — no mirror in apps/portal (CS-TS-003). */}
        {/* ADR-018 §5/§6: purge is never-automatic; hold suspends indefinitely. */}
        {/* // ADR-006 // ADR-018 §5/§6 // CS-TS-003 // CS-GEN-003 */}
        <RetentionPanel
          engagementId={engagementId}
          eligibility={initialEligibility}
          activeHolds={initialActiveHolds}
        />
      </main>
    </div>
  );
}

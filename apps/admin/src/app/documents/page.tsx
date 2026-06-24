/**
 * apps/admin/src/app/documents/page.tsx
 *
 * Top-level organization view — engagements grouped by tax year, with drill-down
 * navigation into individual engagement folder structures.
 *
 * TASK-013-005: Top-level organization (AC-FILE-011-01/-02/-03).
 *
 * AC-FILE-011-01: Files grouped by engagement.
 * AC-FILE-011-02: Engagements grouped by taxYear (null → "unspecified" bucket, DECISION-013-D).
 * AC-FILE-011-03: Navigate from engagement + tax year down into the folder structure to locate files.
 *   Click-through on an engagement goes to /engagements/{id}/documents (the folder + document tree).
 *
 * ADR-003: All DB reads via withRequestContext (ACCOUNTANT role — SESSION_CONTEXT set).
 * ADR-005: RLS FILTER is the access gate — ACCOUNTANT sees all engagements.
 * ADR-006: Top-level org navigation is accountant-only (apps/admin surface).
 * CS-TS-001: Uses getTopLevelOrganization from @tax-portal/db barrel (request pool).
 * DECISION-013-D: null taxYear → "unspecified" bucket (no back-fill per EPIC-012).
 *
 * data-testid hooks:
 *   data-testid="documents-toplevel"             — outer container
 *   data-testid="documents-toplevel-empty"       — empty state (no engagements with files)
 *   data-testid="year-bucket-{year}"             — each year bucket (or "unspecified")
 *   data-testid="year-bucket-label-{year}"       — the year label heading
 *   data-testid="engagement-row-{engagementId}"  — each engagement row within a bucket
 *   data-testid="engagement-link-{engagementId}" — the drill-down link to the engagement documents
 *   data-testid="engagement-doc-count-{id}"      — active document count badge
 *   data-testid="engagement-folder-count-{id}"   — folder count badge
 *
 * // ADR-003 // ADR-005 // ADR-006 // CS-TS-001 // DECISION-013-D // AC-FILE-011-01 // AC-FILE-011-02 // AC-FILE-011-03 // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { getTopLevelOrganization, withRequestContext } from "@tax-portal/db";
import type { TopLevelOrganization, OrgYearBucket } from "@tax-portal/db";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Documents — All Engagements",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TopLevelDocumentsPage() {
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

  // Load top-level org model.
  // ADR-003: withRequestContext propagates ACCOUNTANT identity via SESSION_CONTEXT.
  // CS-TS-001: getTopLevelOrganization from @tax-portal/db barrel (no raw pool).
  // AC-FILE-011-01/-02: engagements grouped by engagement and by taxYear.
  // DECISION-013-D: null taxYear → "unspecified" bucket.
  let org: TopLevelOrganization;
  try {
    org = await withRequestContext(
      identity.clerkUserId,
      identity.role,
      () => getTopLevelOrganization(),
    );
  } catch {
    // CS-GEN-001: no internal details exposed to UI.
    org = { years: [], totalEngagements: 0 };
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
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
                <a
                  href="/documents"
                  className="text-gray-900 font-medium"
                  aria-current="page"
                >
                  Documents
                </a>
              </nav>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">All Documents</h1>
          <p className="text-sm text-gray-500">
            {/* GUARDRAIL: numbers auto-escaped as JSX text */}
            {org.totalEngagements} engagement{org.totalEngagements !== 1 ? "s" : ""} across{" "}
            {org.years.length} year{org.years.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div data-testid="documents-toplevel">
          {org.years.length === 0 ? (
            <div
              className="rounded-lg border border-gray-200 bg-white px-8 py-12 text-center"
              data-testid="documents-toplevel-empty"
            >
              <p className="text-sm text-gray-500">
                No engagements found. Files will appear here once engagements are created.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {org.years.map((bucket) => (
                <YearBucket key={bucket.taxYear ?? "unspecified"} bucket={bucket} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Year bucket sub-component ────────────────────────────────────────────────

interface YearBucketProps {
  bucket: OrgYearBucket;
}

/**
 * YearBucket — renders one tax-year bucket with its engagement rows.
 *
 * AC-FILE-011-02: Engagements grouped by taxYear.
 * DECISION-013-D: null taxYear → "unspecified" label.
 * AC-FILE-011-03: Each engagement row has a drill-down link to its documents page
 *   (/engagements/{id}/documents — the folder + document tree).
 */
function YearBucket({ bucket }: YearBucketProps) {
  const yearKey = bucket.taxYear !== null ? String(bucket.taxYear) : "unspecified";
  const yearLabel =
    bucket.taxYear !== null ? `Tax Year ${bucket.taxYear}` : "Unspecified Year";

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white overflow-hidden"
      data-testid={`year-bucket-${yearKey}`}
      aria-labelledby={`year-label-${yearKey}`}
    >
      {/* Year header */}
      <div className="border-b border-gray-100 px-4 py-3 bg-gray-50">
        <h2
          id={`year-label-${yearKey}`}
          className="text-sm font-semibold text-gray-700"
          data-testid={`year-bucket-label-${yearKey}`}
        >
          {/* GUARDRAIL: yearLabel is a server-constructed string — no dangerouslySetInnerHTML */}
          {yearLabel}
          <span className="ml-2 text-xs font-normal text-gray-400">
            {bucket.engagements.length} engagement{bucket.engagements.length !== 1 ? "s" : ""}
          </span>
        </h2>
      </div>

      {/* Engagement list for this year bucket */}
      {/* AC-FILE-011-01: engagements grouped within each year bucket */}
      <ul className="divide-y divide-gray-50">
        {bucket.engagements.map((eng) => (
          <li
            key={eng.engagementId}
            className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            data-testid={`engagement-row-${eng.engagementId}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Engagement id (primary identifier — no client name without a User lookup) */}
              {/* GUARDRAIL: engagementId auto-escaped as JSX text */}
              <span className="text-sm font-mono text-gray-700 truncate">
                {eng.engagementId}
              </span>

              {/* Status badge */}
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                {/* GUARDRAIL: status auto-escaped */}
                {eng.status}
              </span>
            </div>

            {/* Counts + drill-down link */}
            <div className="flex items-center gap-4 flex-shrink-0">
              {/* Active document count */}
              <span
                className="text-xs text-gray-500"
                data-testid={`engagement-doc-count-${eng.engagementId}`}
              >
                {eng.activeDocumentCount} file{eng.activeDocumentCount !== 1 ? "s" : ""}
              </span>

              {/* Folder count */}
              <span
                className="text-xs text-gray-500"
                data-testid={`engagement-folder-count-${eng.engagementId}`}
              >
                {eng.folderCount} folder{eng.folderCount !== 1 ? "s" : ""}
              </span>

              {/* AC-FILE-011-03: drill-down link → engagement's document+folder tree */}
              {/* GUARDRAIL: engagementId auto-escaped in the href construction */}
              <a
                href={`/engagements/${eng.engagementId}/documents`}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                data-testid={`engagement-link-${eng.engagementId}`}
                aria-label={`Open documents for engagement ${eng.engagementId}`}
              >
                Open →
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

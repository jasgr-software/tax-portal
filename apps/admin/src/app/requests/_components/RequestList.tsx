/**
 * apps/admin/src/app/requests/_components/RequestList.tsx
 *
 * Renders the accountant's engagement request inbox — all requests with state badges.
 *
 * AC-DASH-011-01: Lists ALL engagement requests (passed from the server component).
 * AC-DASH-011-02: Each row shows a visually distinct state badge (pending/accepted/declined).
 * AC-DASH-011-03: Pending requests are identifiable via a highlighted badge + data attribute.
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 * ADR-005: No mutations here — reads only; all decisions are in TASK-003-005.
 *
 * This component is a server component (no 'use client' directive).
 * Pending requests are rendered first (sorted by server component or by status).
 */

import type { EngagementRequestItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestListProps {
  requests: EngagementRequestItem[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

/**
 * Renders a visually distinct state badge for an engagement request.
 *
 * AC-DASH-011-02: pending / accepted / declined are visually distinct.
 * AC-DASH-011-03: Pending requests are further identifiable via `data-status="pending"`.
 */
function StatusBadge({ status }: { status: string }) {
  // DECISION (TASK-003-004): Three primary statuses matter for the inbox:
  //   pending   → amber badge (action-required)
  //   accepted  → green badge (decided, positive)
  //   declined  → red badge (decided, negative)
  //   any other (e.g. 'awaiting_review') → gray badge
  if (status === "pending") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-300"
        data-testid="status-badge"
        data-status="pending"
        aria-label="Pending — awaiting decision"
      >
        Pending
      </span>
    );
  }

  if (status === "accepted") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
        data-testid="status-badge"
        data-status="accepted"
        aria-label="Accepted"
      >
        Accepted
      </span>
    );
  }

  if (status === "declined") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700"
        data-testid="status-badge"
        data-status="declined"
        aria-label="Declined"
      >
        Declined
      </span>
    );
  }

  // Fallback for 'awaiting_review' or any future states
  return (
    <span
      className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
      data-testid="status-badge"
      data-status={status}
      aria-label={status}
    >
      {status}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * RequestList — accountant engagement request inbox list.
 *
 * AC-DASH-011-01: All requests are listed.
 * AC-DASH-011-02: Status badges distinguish pending/accepted/declined visually.
 * AC-DASH-011-03: Pending requests are identifiable (amber badge, data-status="pending").
 */
export function RequestList({ requests }: RequestListProps) {
  // DECISION (TASK-003-004): Sort pending requests first (action-required), then by
  // createdAt DESC. The server fetches newest-first by default; re-sort client-side here
  // is unnecessary for the DB — the list already arrives sorted by createdAt DESC.
  // Pending-first visual sort happens within that ordering by rendering pending at top.
  // We do a stable sort: pending first, then order as received (newest-first from DB).
  const sorted = [...requests].sort((a, b) => {
    const isPendingA = a.status === "pending" ? 0 : 1;
    const isPendingB = b.status === "pending" ? 0 : 1;
    return isPendingA - isPendingB;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Engagement Requests</h1>
        <p className="mt-1 text-sm text-gray-500">
          All engagement requests — pending requests appear first.
        </p>
      </div>

      {/* Empty state */}
      {requests.length === 0 ? (
        <div
          className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500"
          data-testid="empty-state"
        >
          No engagement requests yet.
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
          data-testid="request-list"
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Email
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Submitted
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.map((request) => (
                <tr
                  key={request.id}
                  className={
                    request.status === "pending"
                      ? "hover:bg-amber-50"
                      : "hover:bg-gray-50"
                  }
                  data-testid={`request-row-${request.id}`}
                  data-status={request.status}
                  aria-label={`Request from ${request.firstName} ${request.lastName} — ${request.status}`}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {request.firstName} {request.lastName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {request.email}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {request.createdAt.toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <a
                      href={`/requests/${request.id}`}
                      className="font-medium text-blue-600 hover:text-blue-800 underline"
                      data-testid={`view-link-${request.id}`}
                      aria-label={`View request from ${request.firstName} ${request.lastName}`}
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

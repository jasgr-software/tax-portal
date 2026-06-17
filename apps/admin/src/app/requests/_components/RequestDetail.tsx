/**
 * apps/admin/src/app/requests/_components/RequestDetail.tsx
 *
 * Renders the full submitted details for a single engagement request.
 *
 * AC-DOOR-006-01: Accountant can view each pending request and its submitted details:
 *   prospect name, email, phone, selected services, and message.
 * AC-DASH-011-02: Status badge distinguishes pending/accepted/declined.
 *
 * Decision slot: TASK-003-005 wires the accept/decline actions into the
 * `{children}` slot rendered below the details. This component owns the
 * READ-only display; no form actions are authored here.
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 * ADR-005: PII rendered server-side only; no PII leaked to a client bundle.
 *
 * This component is a server component (no 'use client' directive).
 */

import type { EngagementRequestItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestDetailProps {
  request: EngagementRequestItem;
  /**
   * Decision affordances slot — TASK-003-005 wires accept/decline forms here.
   * This component renders the slot below the submitted details.
   */
  decisionSlot?: React.ReactNode;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

/**
 * Detailed page status badge — mirrors RequestList's StatusBadge.
 * AC-DASH-011-02: pending/accepted/declined visually distinct.
 */
function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span
        className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 ring-1 ring-amber-300"
        data-testid="detail-status-badge"
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
        className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800"
        data-testid="detail-status-badge"
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
        className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700"
        data-testid="detail-status-badge"
        data-status="declined"
        aria-label="Declined"
      >
        Declined
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600"
      data-testid="detail-status-badge"
      data-status={status}
      aria-label={status}
    >
      {status}
    </span>
  );
}

// ─── Detail field helper ──────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="sm:col-span-1">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * RequestDetail — renders submitted engagement request details for the accountant.
 *
 * AC-DOOR-006-01: Renders name, email, phone, selected services, message.
 * AC-DASH-011-02: Status badge shown prominently.
 *
 * The `decisionSlot` prop is a forward-reference slot for TASK-003-005's
 * accept/decline forms. When null/undefined, only the submitted details are shown.
 */
export function RequestDetail({ request, decisionSlot }: RequestDetailProps) {
  return (
    <div className="space-y-6" data-testid="request-detail">
      {/* Header: name + status */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {request.firstName} {request.lastName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Submitted {request.createdAt.toLocaleString()}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Submitted details card */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Submitted Details</h2>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-6 px-6 py-6 sm:grid-cols-2">
          {/* AC-DOOR-006-01: name fields */}
          <DetailField
            label="First Name"
            value={<span data-testid="detail-first-name">{request.firstName}</span>}
          />
          <DetailField
            label="Last Name"
            value={<span data-testid="detail-last-name">{request.lastName}</span>}
          />

          {/* AC-DOOR-006-01: email */}
          <DetailField
            label="Email"
            value={
              <a
                href={`mailto:${request.email}`}
                className="text-blue-600 hover:underline"
                data-testid="detail-email"
              >
                {request.email}
              </a>
            }
          />

          {/* AC-DOOR-006-01: phone (optional) */}
          <DetailField
            label="Phone"
            value={
              request.phone ? (
                <span data-testid="detail-phone">{request.phone}</span>
              ) : (
                <span className="italic text-gray-400" data-testid="detail-phone-empty">
                  Not provided
                </span>
              )
            }
          />

          {/* AC-DOOR-006-01: selected services */}
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Services Requested</dt>
            <dd className="mt-1" data-testid="detail-services">
              {request.services.length > 0 ? (
                <ul className="space-y-1">
                  {request.services.map((s) => (
                    <li
                      key={s.serviceId}
                      className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800 mr-2 mb-1"
                      data-testid={`service-chip-${s.serviceId}`}
                    >
                      {s.serviceName}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-sm italic text-gray-400">None listed</span>
              )}
            </dd>
          </div>

          {/* AC-DOOR-006-01: message (optional) */}
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Message</dt>
            <dd className="mt-1 text-sm text-gray-900" data-testid="detail-message">
              {request.message ? (
                <p className="whitespace-pre-wrap">{request.message}</p>
              ) : (
                <span className="italic text-gray-400">No message provided</span>
              )}
            </dd>
          </div>

          {/* Decline reason — shown when request was declined (AC-DOOR-008-04) */}
          {request.status === "declined" && request.declineReason && (
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Decline Reason</dt>
              <dd
                className="mt-1 rounded border border-red-100 bg-red-50 p-3 text-sm text-red-800"
                data-testid="detail-decline-reason"
              >
                {request.declineReason}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Decision slot — TASK-003-005 wires accept/decline forms here */}
      {/* DECISION (TASK-003-004): decisionSlot is a React.ReactNode forward-reference.
          This keeps RequestDetail READ-only; TASK-003-005 passes its forms as children. */}
      {decisionSlot && (
        <div
          className="rounded-lg border border-gray-200 bg-white shadow-sm"
          data-testid="decision-slot"
        >
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Decision</h2>
          </div>
          <div className="px-6 py-4">{decisionSlot}</div>
        </div>
      )}
    </div>
  );
}

/**
 * apps/portal/src/components/EngagementCard.tsx
 *
 * Read-only engagement summary card for the client dashboard.
 *
 * Renders the client-facing label for an engagement via EngagementStatusBadge.
 * No status-change or reopen affordance is provided — these controls exist ONLY
 * in apps/admin (ADR-006, AC-LIFE-003-03, AC-LIFE-006-02).
 *
 * AC-LIFE-002-01/-02/-03: label rendered through EngagementStatusBadge (NEVER raw status).
 * AC-LIFE-003-03: NO status-change affordance in apps/portal.
 * AC-LIFE-006-02: NO reopen affordance in apps/portal.
 * AC-LIFE-004-02/-03: Review → "In Progress" with no action required of the client.
 * AC-AUTH-008-01/-02: Complete engagements remain fully viewable.
 *
 * ADR-006: client portal only — read-only view.
 * CS-TS-003: shared portal component (CS-TS-003).
 * CS-GEN-003: cite governing authority in comments.
 */

import { EngagementStatusBadge } from "./EngagementStatusBadge";
// CS-TS-003: reuse the shared badge component

interface EngagementCardProps {
  engagementId: string;
  /** Raw internal engagement status — mapped by EngagementStatusBadge. */
  internalStatus: string;
  /** ISO date string for when the engagement was created. */
  createdAt: Date;
}

/**
 * Formats a Date for display. Returns a short locale date string.
 */
function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Read-only engagement card for the client portal dashboard.
 *
 * Links to the direct-reference engagement view (/engagements/[id]).
 * Renders only the client-facing label — never the raw internal status.
 *
 * data-testid="engagement-card"  — e2e root.
 */
export function EngagementCard({
  engagementId,
  internalStatus,
  createdAt,
}: EngagementCardProps) {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      data-testid="engagement-card"
      data-engagement-id={engagementId}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">Your Engagement</p>
          <p className="mt-1 text-xs text-gray-500">
            Started {formatDate(createdAt)}
          </p>
        </div>
        {/* AC-LIFE-002-01/-02/-03: client-facing label only — NEVER raw internalStatus */}
        <EngagementStatusBadge internalStatus={internalStatus} />
      </div>

      {/*
        AC-LIFE-003-03, AC-LIFE-006-02: NO status-change or reopen affordance here.
        The transition and reopen controls live in apps/admin only (ADR-006).
        ADR-010: a client navigating toward the admin transition surface is redirected.
      */}

      {/* Link to the direct-reference engagement view — for AC-AUTH-003-03 coverage */}
      <div className="mt-4">
        <a
          href={`/engagements/${engagementId}`}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          data-testid="engagement-detail-link"
        >
          View details →
        </a>
      </div>
    </div>
  );
}

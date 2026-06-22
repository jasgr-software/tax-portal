/**
 * apps/portal/src/components/EngagementStatusBadge.tsx
 *
 * Read-only client-facing engagement status badge.
 *
 * Consumes clientFacingLabel() from @tax-portal/db to map the internal engagement
 * status to the simplified, friendly label shown to clients. The raw internal status
 * (especially "Review") must NEVER reach the client DOM.
 *
 * AC-LIFE-002-01: each internal status maps to a client-facing label.
 * AC-LIFE-002-02: the internal "Review" stage is hidden — shown as "In Progress".
 * AC-LIFE-002-03: exactly three distinct client-facing states.
 * AC-LIFE-004-02/-03: Review imposes no client action and is not presented as a
 *   client approval step — the badge presents only the mapped label with no action UI.
 * AC-LIFE-003-03: no status-change affordance in apps/portal.
 * AC-LIFE-006-02: no reopen affordance in apps/portal.
 *
 * ADR-006: apps/portal only — read-only client surface.
 * CS-TS-003: shared component (portal-level); the label helper is already in packages/db.
 * CS-GEN-003: cite governing authority in comments.
 */

import { clientFacingLabel } from "@tax-portal/db";
// CS-TS-003: consume the shared packages/db label helper (not a portal-private mapping).

interface EngagementStatusBadgeProps {
  /** The raw internal engagement status from the DB. NEVER rendered directly. */
  internalStatus: string;
  /** Optional CSS class overrides. */
  className?: string;
}

/**
 * Color variant per client-facing label.
 *
 * AC-LIFE-002-01: maps the three client-facing states to distinct visual treatments.
 */
const BADGE_VARIANTS: Record<string, { bg: string; text: string; ring: string }> = {
  Received: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-700/10",
  },
  "In Progress": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-700/10",
  },
  Completed: {
    bg: "bg-green-50",
    text: "text-green-700",
    ring: "ring-green-700/10",
  },
};

/**
 * Renders the client-facing engagement status label.
 *
 * The raw internal status is passed in and mapped via clientFacingLabel — it is
 * NEVER rendered directly (AC-LIFE-002-02).
 *
 * data-testid="engagement-client-status"  — for e2e assertions.
 * data-status attribute carries the mapped label (for e2e data-driven assertions).
 */
export function EngagementStatusBadge({
  internalStatus,
  className = "",
}: EngagementStatusBadgeProps) {
  // AC-LIFE-002-01/-02/-03: map internal status to the client-facing label.
  // clientFacingLabel throws on unexpected values (fail-closed — AC-LIFE-002-02).
  // CS-TS-003: consuming the shared label helper from packages/db.
  const label = clientFacingLabel(internalStatus);
  const variant = BADGE_VARIANTS[label] ?? BADGE_VARIANTS["In Progress"]!;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        variant.bg,
        variant.text,
        variant.ring,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="engagement-client-status"
      data-status={label}
    >
      {/* AC-LIFE-002-02: the MAPPED label is rendered — never internalStatus directly. */}
      {label}
    </span>
  );
}

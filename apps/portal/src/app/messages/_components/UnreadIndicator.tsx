/**
 * apps/portal/src/app/messages/_components/UnreadIndicator.tsx
 *
 * Unread indicator badge for thread list items — CLIENT surface.
 *
 * AC-MSG-005-01: New message → per-viewer unread indicator appears.
 * AC-MSG-005-02: Both 'engagement' and 'general' thread kinds show the indicator.
 *
 * Renders a small "Unread" badge when hasUnread=true; renders nothing when false.
 * Driven by the ThreadWithUnread.hasUnread derived boolean from listThreadsWithUnread.
 *
 * CS-TS-003: mirrors UnreadIndicator in apps/admin (same visual, same logic). // CS-TS-003
 * ADR-006: portal surface (CLIENT-facing). // ADR-006
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-005-01 // AC-MSG-005-02 // CS-TS-003 // ADR-006 // CS-GEN-003
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnreadIndicatorProps {
  /** True iff the current viewer has unread messages in this thread. */
  hasUnread: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * UnreadIndicator — renders a compact "Unread" badge when hasUnread is true.
 *
 * AC-MSG-005-01: present when there are messages the viewer hasn't read.
 * AC-MSG-005-02: applies uniformly to both 'engagement' and 'general' threads.
 *
 * // AC-MSG-005-01 // AC-MSG-005-02 // CS-TS-003 // ADR-006 // CS-GEN-003
 */
export function UnreadIndicator({ hasUnread }: UnreadIndicatorProps) {
  if (!hasUnread) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
      data-testid="unread-indicator"
      aria-label="Unread messages"
    >
      Unread
    </span>
  );
}

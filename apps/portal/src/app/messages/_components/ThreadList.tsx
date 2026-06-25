/**
 * apps/portal/src/app/messages/_components/ThreadList.tsx
 *
 * Thread list for the CLIENT (portal) messages surface.
 *
 * Renders the list of threads visible to the CLIENT viewer, each decorated with the
 * per-viewer unread indicator (AC-MSG-005-01/-02) derived from listThreadsWithUnread.
 *
 * Both 'engagement' and 'general' thread kinds are rendered (AC-MSG-005-02).
 * Engagement threads link to /engagements/{engagementId}/messages.
 * General threads link to /messages/{threadId}.
 *
 * AC-MSG-005-01: per-viewer unread indicator present for threads with unread messages.
 * AC-MSG-005-02: both 'engagement' and 'general' kinds show the unread indicator.
 * AC-MSG-001-04: CLIENT can open any thread they are a participant in and contribute.
 *
 * CS-TS-003: mirrors ThreadList in apps/admin (same structure, different surface). // CS-TS-003
 * ADR-006: portal surface (CLIENT-facing) — no start-general-thread affordance here. // ADR-006
 * CS-GEN-001: no message bodies or PII in data-testid attributes. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-001-04 // AC-MSG-005-01 // AC-MSG-005-02
 * // CS-TS-003 // ADR-006 // CS-GEN-001 // CS-GEN-003
 */

import type { ThreadWithUnread } from "@tax-portal/db";
import { UnreadIndicator } from "./UnreadIndicator";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThreadListProps {
  /** Threads visible to the CLIENT viewer (RLS-scoped, server-fetched). */
  threads: ThreadWithUnread[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ThreadList — renders the CLIENT's visible threads with per-viewer unread indicators.
 *
 * AC-MSG-005-01/-02: each thread row shows an unread badge if hasUnread=true.
 * AC-MSG-001-04: each thread is a link — the CLIENT clicks to read + contribute.
 *
 * // AC-MSG-001-04 // AC-MSG-005-01 // AC-MSG-005-02 // CS-TS-003 // ADR-006 // CS-GEN-003
 */
export function ThreadList({ threads }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div
        className="px-4 py-8 text-center text-sm text-gray-500"
        data-testid="thread-list-empty"
      >
        No messages yet.
      </div>
    );
  }

  return (
    <ul
      className="divide-y divide-gray-100"
      data-testid="thread-list"
    >
      {threads.map((thread) => (
        <ThreadListItem key={thread.id} thread={thread} />
      ))}
    </ul>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ThreadListItemProps {
  thread: ThreadWithUnread;
}

/**
 * ThreadListItem — one thread row in the list.
 *
 * Engagement threads → /engagements/{engagementId}/messages
 * General threads    → /messages/{threadId}
 *
 * AC-MSG-005-01: unread indicator visible when hasUnread=true.
 *
 * // AC-MSG-001-04 // AC-MSG-005-01 // AC-MSG-005-02 // CS-GEN-001 // CS-GEN-003
 */
function ThreadListItem({ thread }: ThreadListItemProps) {
  const href =
    thread.kind === "engagement" && thread.engagementId
      ? `/engagements/${thread.engagementId}/messages`
      : `/messages/${thread.id}`;

  const label =
    thread.kind === "engagement"
      ? `Engagement thread`
      : "Direct message";

  const statusLabel =
    thread.status === "archived" ? " (archived)" : "";

  return (
    <li
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      data-testid={`thread-list-item-${thread.id}`}
      data-thread-id={thread.id}
      data-thread-kind={thread.kind}
    >
      <a
        href={href}
        className="flex-1 min-w-0"
        data-testid={`thread-link-${thread.id}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {label}
            {statusLabel && (
              <span className="ml-1 text-xs text-gray-400 font-normal">
                {statusLabel}
              </span>
            )}
          </span>
          {/* AC-MSG-005-01/-02: per-viewer unread indicator */}
          <UnreadIndicator hasUnread={thread.hasUnread} />
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          {formatDate(thread.updatedAt)}
        </p>
      </a>
    </li>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

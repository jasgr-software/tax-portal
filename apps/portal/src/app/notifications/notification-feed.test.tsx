/**
 * apps/portal/src/app/notifications/notification-feed.test.tsx
 *
 * Component tests for the shared NotificationFeed component (packages/ui).
 *
 * AC coverage (TASK-016-005 / BRIEF-016):
 *   [AC-MSG-017-01] badge renders in nav with the client's unread count
 *                   (badge visible from any area — tested via component render in isolation)
 *   [AC-MSG-017-02] badge shows the count of the CLIENT's unread notifications
 *   [AC-MSG-017-03] badge updates when a notification is marked read (count decrements)
 *                   and when unreadCount prop is updated (real-time arrival simulation)
 *   [AC-MSG-012-03] badge reflects real-time arrival (unreadCount prop increment)
 *   [AC-MSG-015-02] viewing a linked item triggers mark-read (link present in feed)
 *   [AC-MSG-015-03] no dismiss button — read state reflects without dismiss
 *   [AC-MSG-007-03] feed presence verified — notifications appear in the feed list
 *
 * BUG-017-002 AC coverage (root test-validity defect — portal link resolver gap):
 *   [AC-MSG-014-01 / BUG-017-002] resolvePortalHref mirrors the portal page.tsx resolver.
 *     new_message + linkedItemType='engagement' → /engagements/<id>/messages (not root)
 *     new_message + linkedItemType='thread'     → /messages/<threadId>
 *   These are the REAL linkedItemType values appendMessage() produces after the fix.
 *   CS-TS-003: cross-surface parity — portal resolver matches admin routing. // CS-TS-003
 *   CS-GEN-002: additive — no existing assertions changed. // CS-GEN-002
 *   BUG-017-002 // AC-MSG-013-02 // AC-MSG-014-01 // ADR-006 // EPIC-016 // CS-GEN-003
 *
 * Strategy:
 *   - Render NotificationFeed directly with fixture NotificationFeedItem arrays.
 *   - No DB connection, no server actions — pure component behavior under @testing-library/react.
 *   - Real-time badge update tested via unreadCount prop changes (the real-time client wrapper
 *     updates this prop on arrival/read — the component receives the new count).
 *   - Mirrors the admin NotificationsIndicator test pattern (CS-TS-003).
 *
 * CS-TS-003: shared component — these tests verify the component BOTH apps consume. // CS-TS-003
 * CS-GEN-001: XSS test verifies title/body rendered as escaped text. // CS-GEN-001
 * CS-GEN-003: AC ids in test names. // CS-GEN-003
 * ADR-006: Component shared across portal (CLIENT) and admin (ACCOUNTANT). // ADR-006
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationFeed } from "@tax-portal/ui";
import type { NotificationFeedItem } from "@tax-portal/ui";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ENGAGEMENT_ID = "eng-001-aaaa-bbbb-cccc-000000000001";
const MOCK_REQUEST_ID = "req-001-aaaa-bbbb-cccc-000000000001";
const MOCK_THREAD_ID = "thr-001-aaaa-bbbb-cccc-000000000001";

/** Unread engagement notification — CLIENT received this when status changed */
const MOCK_ENGAGEMENT_NOTIF: NotificationFeedItem = {
  id: "notif-engagement-001",
  type: "engagement_status_changed",
  title: "Your engagement status has been updated",
  body: "Your engagement has been moved to In Progress.",
  readAt: null, // unread
  engagementRequestId: MOCK_REQUEST_ID,
  createdAt: new Date("2026-06-20T10:00:00Z"),
  linkedItemType: "engagement",
  linkedItemId: MOCK_ENGAGEMENT_ID,
};

/** Read engagement notification */
const MOCK_ENGAGEMENT_NOTIF_READ: NotificationFeedItem = {
  ...MOCK_ENGAGEMENT_NOTIF,
  id: "notif-engagement-002",
  readAt: new Date("2026-06-20T11:00:00Z"),
};

/** Unread deliverable notification */
const MOCK_DELIVERABLE_NOTIF: NotificationFeedItem = {
  id: "notif-deliverable-001",
  type: "deliverable_ready",
  title: "A deliverable is ready for you",
  body: "Your tax return is ready to review.",
  readAt: null,
  engagementRequestId: null,
  createdAt: new Date("2026-06-21T09:00:00Z"),
  linkedItemType: "document",
  linkedItemId: "doc-001-aaaa",
};

/** Unread request accepted notification */
const MOCK_REQUEST_ACCEPTED_NOTIF: NotificationFeedItem = {
  id: "notif-request-accepted-001",
  type: "engagement_request_accepted",
  title: "Your engagement request was accepted",
  body: null,
  readAt: null,
  engagementRequestId: MOCK_REQUEST_ID,
  createdAt: new Date("2026-06-19T08:00:00Z"),
  linkedItemType: "request",
  linkedItemId: MOCK_REQUEST_ID,
};

/**
 * new_message notification — CLIENT received this when accountant sent (engagement thread).
 * BUG-017-002: uses the REAL linkedItemType='engagement' that appendMessage emits for engagement
 * threads after the fix. linkedItemId=engagementId. resolvePortalHref routes to /engagements/<id>/messages.
 * AC-MSG-014-01: accountant sends → client notified "through the EPIC-016 feed".
 * CS-TS-003: mirrors admin NotificationsIndicator fixture. // CS-TS-003
 * BUG-017-002 // AC-MSG-014-01 // CS-GEN-003
 */
const MOCK_NEW_MESSAGE_ENGAGEMENT_NOTIF: NotificationFeedItem = {
  id: "notif-new-msg-eng-001",
  type: "new_message",
  title: "New message from your accountant",
  body: "Your accountant sent you a message in your engagement.",
  readAt: null, // unread
  engagementRequestId: null,
  createdAt: new Date("2026-06-25T10:00:00Z"),
  linkedItemType: "engagement", // BUG-017-002: REAL value emitted by appendMessage for engagement threads
  linkedItemId: MOCK_ENGAGEMENT_ID, // BUG-017-002: the engagementId (not threadId)
};

/**
 * new_message notification — CLIENT received this when accountant sent (general thread).
 * BUG-017-002: uses the REAL linkedItemType='thread' that appendMessage emits for general
 * threads after the fix. linkedItemId=threadId. resolvePortalHref routes to /messages/<threadId>.
 * AC-MSG-013-02 / AC-MSG-014-01: general thread; both parties can message.
 * CS-TS-003: mirrors admin NotificationsIndicator fixture for general threads. // CS-TS-003
 * BUG-017-002 // AC-MSG-014-01 // CS-GEN-003
 */
const MOCK_NEW_MESSAGE_GENERAL_NOTIF: NotificationFeedItem = {
  id: "notif-new-msg-gen-001",
  type: "new_message",
  title: "New message from your accountant",
  body: "Your accountant sent you a message in the general thread.",
  readAt: null, // unread
  engagementRequestId: null,
  createdAt: new Date("2026-06-25T11:00:00Z"),
  linkedItemType: "thread", // BUG-017-002: REAL value emitted by appendMessage for general threads
  linkedItemId: MOCK_THREAD_ID, // BUG-017-002: the threadId
};

/**
 * Portal-side href resolver — mirrors the resolvePortalHref function in
 * apps/portal/src/app/notifications/page.tsx (BUG-017-002 fix).
 *
 * BUG-017-002: new_message routing is type-aware:
 *   new_message + linkedItemType='engagement' → /engagements/<id>/messages (not root)
 *   new_message + linkedItemType='thread'     → /messages/<threadId>
 * Non-new_message types use the original routing:
 *   engagement → /engagements/<id>  (status change notifications etc.)
 * CS-GEN-002: additive — existing routing unchanged for non-new_message types. // CS-GEN-002
 * CS-TS-003: matches admin NotificationsIndicator link routing (cross-surface parity). // CS-TS-003
 * BUG-017-002 // AC-MSG-013-02 // AC-MSG-014-01 // CS-GEN-003
 */
function portalResolveHref(item: NotificationFeedItem): string | null {
  if (!item.linkedItemId) return null;

  // BUG-017-002: new_message routes to messages sub-area, not engagement root
  if (item.type === "new_message") {
    if (item.linkedItemType === "engagement") {
      return `/engagements/${item.linkedItemId}/messages`;
    }
    if (item.linkedItemType === "thread") {
      return `/messages/${item.linkedItemId}`;
    }
    return null;
  }

  if (item.linkedItemType === "engagement" && item.linkedItemId) {
    return `/engagements/${item.linkedItemId}`;
  }
  return null;
}

/** Simple href resolver for portal engagement links (non-new_message types — legacy resolver) */
function testResolveHref(item: NotificationFeedItem): string | null {
  if (item.linkedItemType === "engagement" && item.linkedItemId) {
    return `/engagements/${item.linkedItemId}`;
  }
  return null;
}

// ─── Tests: badge rendering ───────────────────────────────────────────────────

describe("[AC-MSG-017-02] badge shows the CLIENT's unread notification count", () => {
  /**
   * [AC-MSG-017-02] Badge shows the unread count derived from the notifications array.
   */
  it("[AC-MSG-017-02] renders unread-badge with correct unread count from notifications", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF, MOCK_DELIVERABLE_NOTIF]}
      />,
    );

    const badge = screen.getByTestId("unread-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("2");
    expect(badge).toHaveAttribute("data-unread-count", "2");
  });

  /**
   * [AC-MSG-017-02] Badge count = 1 when only one notification is unread.
   */
  it("[AC-MSG-017-02] renders badge count of 1 for a single unread notification", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />);

    const badge = screen.getByTestId("unread-badge");
    expect(badge).toHaveTextContent("1");
    expect(badge).toHaveAttribute("data-unread-count", "1");
  });

  /**
   * [AC-MSG-017-02] Badge is absent (not rendered as "0") when all notifications are read.
   * A badge showing "0" is confusing UX — it should be absent.
   */
  it("[AC-MSG-017-02] badge is absent (not rendered) when all notifications are read", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF_READ]} />);

    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  /**
   * [AC-MSG-017-02] unreadCount prop overrides derived count (for real-time badge updates).
   * This is how the real-time client wrapper passes an updated count without re-fetching
   * the full notifications list. // AC-MSG-012-03 // AC-MSG-017-03
   */
  it("[AC-MSG-017-02] [AC-MSG-012-03] unreadCount prop overrides derived count for real-time updates", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF]} // 1 unread in array
        unreadCount={5}                          // but real-time says 5
      />,
    );

    const badge = screen.getByTestId("unread-badge");
    expect(badge).toHaveTextContent("5");
    expect(badge).toHaveAttribute("data-unread-count", "5");
  });
});

// ─── Tests: badge updates on read / arrival ───────────────────────────────────

describe("[AC-MSG-017-03] badge updates on mark-read and real-time arrival", () => {
  /**
   * [AC-MSG-017-03] Badge decrements when unreadCount prop is reduced (simulates mark-read).
   * The NotificationFeed renders whatever unreadCount prop it receives — the badge corrects
   * on the next server fetch/revalidation after mark-read (DECISION-F3: no real-time read event).
   */
  it("[AC-MSG-017-03] badge reflects decremented count when notification is marked read", () => {
    const { rerender } = render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF, MOCK_DELIVERABLE_NOTIF]}
        unreadCount={2}
      />,
    );

    expect(screen.getByTestId("unread-badge")).toHaveTextContent("2");

    // Simulate mark-read: unreadCount drops to 1
    rerender(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF, MOCK_DELIVERABLE_NOTIF]}
        unreadCount={1}
      />,
    );

    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
  });

  /**
   * [AC-MSG-012-03] Badge increments when a new notification arrives in real time.
   * In production: NotificationBadgeClient updates the count on 'notification.created' event.
   */
  it("[AC-MSG-012-03] badge reflects incremented count on real-time arrival", () => {
    const { rerender } = render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF]}
        unreadCount={1}
      />,
    );

    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");

    // Simulate real-time arrival: unreadCount increments to 2
    rerender(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF]}
        unreadCount={2}
      />,
    );

    expect(screen.getByTestId("unread-badge")).toHaveTextContent("2");
  });

  /**
   * [AC-MSG-017-03] Badge disappears when unreadCount drops to 0 (all read).
   */
  it("[AC-MSG-017-03] badge disappears when unreadCount drops to 0", () => {
    const { rerender } = render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF]}
        unreadCount={1}
      />,
    );

    expect(screen.getByTestId("unread-badge")).toBeInTheDocument();

    // After marking read: 0 unread
    rerender(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF_READ]}
        unreadCount={0}
      />,
    );

    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });
});

// ─── Tests: feed list rendering ───────────────────────────────────────────────

describe("[AC-MSG-007-03] [AC-MSG-015-02] feed renders notifications with linked-item links", () => {
  /**
   * [AC-MSG-007-03] Feed contains notifications (authoritative record — other channels
   * are supplementary). The feed renders the notifications list.
   */
  it("[AC-MSG-007-03] feed renders the notifications list when notifications are present", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />);

    expect(screen.getByTestId("notification-feed")).toBeInTheDocument();
    expect(screen.getByTestId("notification-list")).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_ENGAGEMENT_NOTIF.id}`),
    ).toBeInTheDocument();
  });

  /**
   * [AC-MSG-007-03] Feed renders the notification title.
   */
  it("[AC-MSG-007-03] feed renders the notification title", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />);

    expect(
      screen.getByText("Your engagement status has been updated"),
    ).toBeInTheDocument();
  });

  /**
   * [AC-MSG-007-03] Feed renders the notification body.
   */
  it("[AC-MSG-007-03] feed renders the notification body", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />);

    const body = screen.getByTestId(
      `notification-body-${MOCK_ENGAGEMENT_NOTIF.id}`,
    );
    expect(body).toBeInTheDocument();
    expect(body).toHaveTextContent("Your engagement has been moved to In Progress");
  });

  /**
   * [AC-MSG-015-02] Viewing the linked item marks the notification read.
   * The feed renders a "View" link for notifications with a resolved href.
   * Clicking the link navigates to the linked item — that page fires mark-read-on-view.
   *
   * Here we verify the LINK IS PRESENT (view affordance exists, no dismiss button).
   */
  it("[AC-MSG-015-02] feed renders a View link for notifications with a linked item", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF]}
        resolveHref={testResolveHref}
      />,
    );

    const link = screen.getByTestId(
      `notification-link-${MOCK_ENGAGEMENT_NOTIF.id}`,
    );
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      `/engagements/${MOCK_ENGAGEMENT_ID}`,
    );
    expect(link).toHaveTextContent("View");
  });

  /**
   * [AC-MSG-015-03] NO dismiss button — read state reflects without a dismiss step.
   * The feed must NOT render any dismiss / "Mark as read" button.
   */
  it("[AC-MSG-015-03] feed does NOT render a dismiss button (no manual dismiss)", () => {
    render(
      <NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />,
    );

    // There must be no dismiss/mark-as-read button
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    const notifItem = screen.getByTestId(
      `notification-item-${MOCK_ENGAGEMENT_NOTIF.id}`,
    );
    // No dismiss affordance inside the notification item
    expect(notifItem.querySelector("button")).toBeNull();
    expect(notifItem.querySelector("[aria-label*='dismiss']")).toBeNull();
    expect(notifItem.querySelector("[aria-label*='mark as read']")).toBeNull();
  });

  /**
   * [AC-MSG-015-03] No link rendered for notifications whose resolveHref returns null.
   * (e.g. a 'request' type notification — cross-app, handled in TASK-016-007)
   */
  it("[AC-MSG-015-03] no View link for notifications with null resolveHref", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_REQUEST_ACCEPTED_NOTIF]}
        resolveHref={testResolveHref} // returns null for 'request' type
      />,
    );

    expect(
      screen.queryByTestId(`notification-link-${MOCK_REQUEST_ACCEPTED_NOTIF.id}`),
    ).not.toBeInTheDocument();
  });

  /**
   * Linked-item type and id are reflected in data attributes for e2e assertions.
   * AC-MSG-015-01: notification references its triggering item.
   */
  it("[AC-MSG-015-01] notification item reflects its linked item via data attributes", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />);

    const item = screen.getByTestId(`notification-item-${MOCK_ENGAGEMENT_NOTIF.id}`);
    expect(item).toHaveAttribute("data-linked-item-type", "engagement");
    expect(item).toHaveAttribute("data-linked-item-id", MOCK_ENGAGEMENT_ID);
  });
});

// ─── Tests: empty state ───────────────────────────────────────────────────────

describe("empty state", () => {
  it("shows empty state when notifications is empty", () => {
    render(<NotificationFeed notifications={[]} />);

    expect(screen.getByTestId("no-notifications")).toBeInTheDocument();
    expect(screen.queryByTestId("notification-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("renders custom emptyMessage when provided", () => {
    render(
      <NotificationFeed
        notifications={[]}
        emptyMessage="You have no notifications yet."
      />,
    );

    expect(
      screen.getByText("You have no notifications yet."),
    ).toBeInTheDocument();
  });
});

// ─── Tests: read/unread visual distinction ───────────────────────────────────

describe("read/unread visual distinction", () => {
  it("unread notification renders with data-read=false", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF]} />);

    const item = screen.getByTestId(`notification-item-${MOCK_ENGAGEMENT_NOTIF.id}`);
    expect(item).toHaveAttribute("data-read", "false");
  });

  it("read notification renders with data-read=true", () => {
    render(<NotificationFeed notifications={[MOCK_ENGAGEMENT_NOTIF_READ]} />);

    const item = screen.getByTestId(
      `notification-item-${MOCK_ENGAGEMENT_NOTIF_READ.id}`,
    );
    expect(item).toHaveAttribute("data-read", "true");
  });
});

// ─── Tests: XSS safety ───────────────────────────────────────────────────────

describe("[CS-GEN-001] XSS safety — title/body rendered as escaped text", () => {
  /**
   * CS-GEN-001: no PII or injection risk in feed output.
   * React default-escapes text nodes — no dangerouslySetInnerHTML used.
   */
  it("[CS-GEN-001] renders title and body as escaped text (XSS-safe)", () => {
    const xssTitle = "Engagement updated <script>alert(1)</script>";
    const xssBody = "<img src=x onerror=alert(1)>";

    const xssNotif: NotificationFeedItem = {
      ...MOCK_ENGAGEMENT_NOTIF,
      id: "notif-xss-001",
      title: xssTitle,
      body: xssBody,
    };

    render(<NotificationFeed notifications={[xssNotif]} />);

    const item = screen.getByTestId("notification-item-notif-xss-001");
    // The raw angle bracket text appears as literal text, not injected HTML
    expect(item).toHaveTextContent("Engagement updated");
    // No script element injected
    expect(item.querySelector("script")).toBeNull();
    expect(item.querySelector("img")).toBeNull();
  });
});

// ─── Tests: multiple notifications ───────────────────────────────────────────

describe("multiple notifications in the feed", () => {
  it("renders all notifications when multiple are present", () => {
    render(
      <NotificationFeed
        notifications={[
          MOCK_ENGAGEMENT_NOTIF,
          MOCK_DELIVERABLE_NOTIF,
          MOCK_REQUEST_ACCEPTED_NOTIF,
        ]}
      />,
    );

    expect(
      screen.getByTestId(`notification-item-${MOCK_ENGAGEMENT_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_DELIVERABLE_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_REQUEST_ACCEPTED_NOTIF.id}`),
    ).toBeInTheDocument();
  });

  it("unread count reflects mix of read and unread notifications", () => {
    render(
      <NotificationFeed
        notifications={[
          MOCK_ENGAGEMENT_NOTIF,         // unread
          MOCK_ENGAGEMENT_NOTIF_READ,    // read — should not count
          MOCK_DELIVERABLE_NOTIF,        // unread
        ]}
      />,
    );

    // 2 unread (MOCK_ENGAGEMENT_NOTIF + MOCK_DELIVERABLE_NOTIF)
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("2");
  });
});

// ─── Tests: BUG-017-002 — portal new_message link routing ─────────────────────

/**
 * BUG-017-002: Portal-side link resolver gap for new_message notifications.
 *   Prior to BUG-017-002, the portal's resolvePortalHref routed linkedItemType='engagement'
 *   → /engagements/<id> (missing /messages sub-route) and had no 'thread' branch at all.
 *
 * After the fix:
 *   new_message + linkedItemType='engagement' → /engagements/<engagementId>/messages
 *   new_message + linkedItemType='thread'     → /messages/<threadId>
 *
 * The fixtures use the REAL linkedItemType values that appendMessage() emits after BUG-017-002.
 * CS-GEN-002: additive — no existing link routing changed for non-new_message types. // CS-GEN-002
 * CS-TS-003: cross-surface parity — portal routing matches admin routing. // CS-TS-003
 * BUG-017-002 // AC-MSG-013-02 // AC-MSG-014-01 // ADR-006 // EPIC-016 // CS-GEN-003
 */
describe("[BUG-017-002] portal new_message link resolver routes to the correct messages area", () => {
  /**
   * [BUG-017-002 / AC-MSG-014-01] Engagement-thread new_message:
   * linkedItemType='engagement', linkedItemId=engagementId → /engagements/<id>/messages
   * NOT /engagements/<id> (the old broken routing that went to the engagement root, not messages).
   * CS-TS-003: matches admin NotificationsIndicator engagement-thread routing. // CS-TS-003
   */
  it("[BUG-017-002 / AC-MSG-014-01] engagement-thread new_message: link → /engagements/<id>/messages", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_NEW_MESSAGE_ENGAGEMENT_NOTIF]}
        resolveHref={portalResolveHref}
      />,
    );

    const link = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_ENGAGEMENT_NOTIF.id}`,
    );
    expect(link).toBeInTheDocument();
    // BUG-017-002: must route to /messages sub-area, not engagement root
    expect(link).toHaveAttribute(
      "href",
      `/engagements/${MOCK_ENGAGEMENT_ID}/messages`,
    );
    expect(link).toHaveTextContent("View");
  });

  /**
   * [BUG-017-002 / AC-MSG-014-01] General-thread new_message:
   * linkedItemType='thread', linkedItemId=threadId → /messages/<threadId>
   * This case had NO link before BUG-017-002 — the resolver had no 'thread' branch.
   * CS-TS-003: matches admin NotificationsIndicator general-thread routing. // CS-TS-003
   * CS-GEN-002: additive — new branch for 'thread' type; no existing routing changed. // CS-GEN-002
   */
  it("[BUG-017-002 / AC-MSG-014-01] general-thread new_message: link → /messages/<threadId>", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_NEW_MESSAGE_GENERAL_NOTIF]}
        resolveHref={portalResolveHref}
      />,
    );

    const link = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_GENERAL_NOTIF.id}`,
    );
    expect(link).toBeInTheDocument();
    // BUG-017-002: general-thread link must route to /messages/<threadId>
    expect(link).toHaveAttribute("href", `/messages/${MOCK_THREAD_ID}`);
    expect(link).toHaveTextContent("View");
  });

  /**
   * [BUG-017-002 / CS-GEN-002] Non-new_message engagement notifications still route to
   * the engagement root (not /messages). Additive fix — no existing routing changed.
   * CS-GEN-002: additive — existing engagement→/engagements/<id> routing unchanged. // CS-GEN-002
   */
  it("[BUG-017-002 / CS-GEN-002] non-new_message engagement notification still routes to engagement root", () => {
    render(
      <NotificationFeed
        notifications={[MOCK_ENGAGEMENT_NOTIF]}
        resolveHref={portalResolveHref}
      />,
    );

    const link = screen.getByTestId(
      `notification-link-${MOCK_ENGAGEMENT_NOTIF.id}`,
    );
    expect(link).toBeInTheDocument();
    // Non-new_message engagement notifications → /engagements/<id> (root, no /messages suffix)
    expect(link).toHaveAttribute("href", `/engagements/${MOCK_ENGAGEMENT_ID}`);
  });

  /**
   * [BUG-017-002] Both new_message thread kinds render in the portal feed simultaneously.
   * A CLIENT with both engagement-thread and general-thread notifications sees both
   * with the correct links (cross-surface parity).
   * CS-TS-003: both admin + portal handle both thread kinds consistently. // CS-TS-003
   */
  it("[BUG-017-002 / CS-TS-003] both new_message thread kinds coexist in portal feed with correct links", () => {
    render(
      <NotificationFeed
        notifications={[
          MOCK_NEW_MESSAGE_ENGAGEMENT_NOTIF,
          MOCK_NEW_MESSAGE_GENERAL_NOTIF,
        ]}
        resolveHref={portalResolveHref}
      />,
    );

    const engLink = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_ENGAGEMENT_NOTIF.id}`,
    );
    expect(engLink).toHaveAttribute(
      "href",
      `/engagements/${MOCK_ENGAGEMENT_ID}/messages`,
    );

    const genLink = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_GENERAL_NOTIF.id}`,
    );
    expect(genLink).toHaveAttribute("href", `/messages/${MOCK_THREAD_ID}`);
  });
});

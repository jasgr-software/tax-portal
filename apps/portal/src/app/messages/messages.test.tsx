/**
 * apps/portal/src/app/messages/messages.test.tsx
 *
 * Component tests for the portal (CLIENT) messaging UI components.
 *
 * TASK-017-006 / BRIEF-017 — Acceptance criteria verified here:
 *   [AC-MSG-003-01] message body rendered verbatim as plain text (React text nodes)
 *   [AC-MSG-003-02] `<script>alert(1)</script>` renders as literal text — NOT executed
 *   [AC-MSG-003-03] `<img>` tag / markdown renders verbatim; no inline image in the body
 *   [AC-MSG-005-01] per-viewer unread indicator appears on threads with unread messages
 *   [AC-MSG-005-02] unread indicator present for both 'engagement' and 'general' thread kinds
 *   [AC-MSG-001-04] portal surface renders a thread (read + compose affordance)
 *   [AC-MSG-002-01] portal does NOT show the start-general-thread affordance (CS-TS-004)
 *
 * Strategy:
 *   - Render components directly with fixture data (no DB, no server actions).
 *   - Assert on the rendered DOM: text content, absence of <script>/<img> execution,
 *     presence/absence of unread indicator, presence/absence of start-general-thread.
 *
 * CS-TS-003: component tests exist on both portal AND admin surfaces (mirrored). // CS-TS-003
 * CS-GEN-001: XSS test verifies body rendered as escaped text (React default). // CS-GEN-001
 * CS-GEN-003: AC ids cited in test names. // CS-GEN-003
 * ADR-006: portal surface (CLIENT-facing) — no start-general-thread. // ADR-006
 *
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // AC-MSG-005-01 // AC-MSG-005-02 // AC-MSG-001-04 // AC-MSG-002-01
 * // CS-TS-003 // CS-GEN-001 // CS-GEN-003 // ADR-006
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mock server actions ──────────────────────────────────────────────────────
// AttachmentList (via ThreadView) imports requestAttachmentUrlAction from the engagement
// messages actions module. Mock it for unit test isolation (no network/DB).
// Also mock sendMessageAction and attachMessageAction (via MessageComposer in ThreadView chain).

vi.mock("@/app/engagements/[engagementId]/messages/actions", () => ({
  requestAttachmentUrlAction: vi.fn(),
  sendMessageAction: vi.fn(),
  attachMessageAction: vi.fn(),
  markThreadReadAction: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { MessageBody } from "@tax-portal/ui";
import { ThreadList } from "./_components/ThreadList";
import { ThreadView } from "./_components/ThreadView";
import { UnreadIndicator } from "./_components/UnreadIndicator";
import type { ThreadWithUnread } from "@tax-portal/db";
import type { MessageItem, MessageAttachmentItem } from "@tax-portal/db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VIEWER_CLERK_ID = "user_portal_client_001";
const OTHER_CLERK_ID  = "user_admin_acct_001";

/** An engagement thread with hasUnread=true */
const UNREAD_ENGAGEMENT_THREAD: ThreadWithUnread = {
  id: "thread-engagement-001",
  kind: "engagement",
  engagementId: "engagement-001",
  clientUserId: null,
  status: "active",
  archivedAt: null,
  hasUnread: true,
  createdAt: new Date("2026-06-01T10:00:00Z"),
  updatedAt: new Date("2026-06-25T09:00:00Z"),
};

/** A general thread with hasUnread=false */
const READ_GENERAL_THREAD: ThreadWithUnread = {
  id: "thread-general-001",
  kind: "general",
  engagementId: null,
  clientUserId: "client-user-001",
  status: "active",
  archivedAt: null,
  hasUnread: false,
  createdAt: new Date("2026-06-10T10:00:00Z"),
  updatedAt: new Date("2026-06-24T15:00:00Z"),
};

/** A general thread with hasUnread=true */
const UNREAD_GENERAL_THREAD: ThreadWithUnread = {
  ...READ_GENERAL_THREAD,
  id: "thread-general-002",
  hasUnread: true,
};

/** A message from the viewer (CLIENT) */
const CLIENT_MESSAGE: MessageItem = {
  id: "msg-001",
  threadId: "thread-engagement-001",
  senderClerkId: VIEWER_CLERK_ID,
  body: "Hello, this is my message.",
  createdAt: new Date("2026-06-25T09:00:00Z"),
  updatedAt: new Date("2026-06-25T09:00:00Z"),
};

/** A message with a script-injection body (SECURITY test — AC-MSG-003-02) */
const SCRIPT_INJECTION_MESSAGE: MessageItem = {
  id: "msg-xss-001",
  threadId: "thread-engagement-001",
  senderClerkId: OTHER_CLERK_ID,
  body: "<script>alert(1)</script>",
  createdAt: new Date("2026-06-25T09:01:00Z"),
  updatedAt: new Date("2026-06-25T09:01:00Z"),
};

/** A message with an <img> tag + markdown (SECURITY test — AC-MSG-003-01/-03) */
const IMG_AND_MARKDOWN_MESSAGE: MessageItem = {
  id: "msg-img-001",
  threadId: "thread-engagement-001",
  senderClerkId: OTHER_CLERK_ID,
  body: '<img src="x" onerror="alert(2)"> **bold** _italic_',
  createdAt: new Date("2026-06-25T09:02:00Z"),
  updatedAt: new Date("2026-06-25T09:02:00Z"),
};

/** No-op empty attachments map */
const NO_ATTACHMENTS: Record<string, MessageAttachmentItem[]> = {};

// ─── MessageBody — plain-text render (shared component from packages/ui) ─────

describe("MessageBody (portal surface) — plain-text verbatim render", () => {
  it(
    "[AC-MSG-003-02] renders <script>alert(1)</script> as LITERAL text, not executed",
    () => {
      render(<MessageBody body="<script>alert(1)</script>" />);

      // The text content must be the LITERAL string — not interpreted HTML.
      // React renders {body} as a text node → JSX escapes < > automatically.
      // Assert the literal text is in the DOM as text content.
      const bodyEl = screen.getByTestId("message-body");
      expect(bodyEl).toHaveTextContent("<script>alert(1)</script>");

      // Assert no <script> element was injected into the DOM.
      // dangerouslySetInnerHTML would parse and inject a <script> element.
      // React text nodes do NOT create DOM elements from the text content.
      expect(document.querySelectorAll("script").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-003-01] renders body containing HTML markup as literal characters",
    () => {
      const body = '<b>bold</b> <i>italic</i> &amp; entities';
      render(<MessageBody body={body} />);

      const bodyEl = screen.getByTestId("message-body");
      // The entire body string is present as text content (auto-escaped by React).
      expect(bodyEl).toHaveTextContent(body);

      // No <b> or <i> HTML elements — it's a text node, not parsed HTML.
      expect(bodyEl.querySelector("b")).toBeNull();
      expect(bodyEl.querySelector("i")).toBeNull();
    },
  );

  it(
    "[AC-MSG-003-03] renders <img> tag verbatim; no inline image embedded in the body",
    () => {
      const body = '<img src="x" onerror="alert(2)"> **bold**';
      render(<MessageBody body={body} />);

      const bodyEl = screen.getByTestId("message-body");
      // The text must appear as literal characters.
      expect(bodyEl).toHaveTextContent('<img src="x" onerror="alert(2)"> **bold**');

      // AC-MSG-003-03: NO <img> element in the DOM — body is a text node, not parsed HTML.
      expect(bodyEl.querySelector("img")).toBeNull();
      expect(document.querySelectorAll("img").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-003-01] markdown syntax renders verbatim as literal text",
    () => {
      const body = "**bold** _italic_ `code`";
      render(<MessageBody body={body} />);

      const bodyEl = screen.getByTestId("message-body");
      expect(bodyEl).toHaveTextContent(body);

      // No <strong>, <em>, or <code> elements — markdown is not interpreted.
      expect(bodyEl.querySelector("strong")).toBeNull();
      expect(bodyEl.querySelector("em")).toBeNull();
    },
  );
});

// ─── ThreadView — plain-text render + no dangerouslySetInnerHTML ──────────────

describe("ThreadView (portal) — message body plain-text render", () => {
  it(
    "[AC-MSG-003-02] ThreadView: <script> body renders as literal text, NOT executed",
    () => {
      render(
        <ThreadView
          messages={[SCRIPT_INJECTION_MESSAGE]}
          attachmentsByMessageId={NO_ATTACHMENTS}
          viewerClerkId={VIEWER_CLERK_ID}
        />,
      );

      // The message row must exist
      const row = screen.getByTestId(`message-row-${SCRIPT_INJECTION_MESSAGE.id}`);
      expect(row).toBeInTheDocument();

      // The body text is inside the row — literal characters only
      expect(row).toHaveTextContent("<script>alert(1)</script>");

      // No <script> element injected
      expect(document.querySelectorAll("script").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-003-03] ThreadView: <img> body renders verbatim; no inline image",
    () => {
      render(
        <ThreadView
          messages={[IMG_AND_MARKDOWN_MESSAGE]}
          attachmentsByMessageId={NO_ATTACHMENTS}
          viewerClerkId={VIEWER_CLERK_ID}
        />,
      );

      const row = screen.getByTestId(`message-row-${IMG_AND_MARKDOWN_MESSAGE.id}`);
      expect(row).toHaveTextContent('<img src="x" onerror="alert(2)">');

      // AC-MSG-003-03: NO <img> element in the body — it is text, not parsed HTML.
      expect(document.querySelectorAll("img").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-001-04] ThreadView: renders messages from both parties (client + accountant)",
    () => {
      render(
        <ThreadView
          messages={[CLIENT_MESSAGE, SCRIPT_INJECTION_MESSAGE]}
          attachmentsByMessageId={NO_ATTACHMENTS}
          viewerClerkId={VIEWER_CLERK_ID}
        />,
      );

      // Both messages must appear in the DOM
      expect(screen.getByTestId(`message-row-${CLIENT_MESSAGE.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`message-row-${SCRIPT_INJECTION_MESSAGE.id}`)).toBeInTheDocument();

      // Client message shows "You"; accountant's message shows "Accountant"
      expect(screen.getByTestId(`message-sender-${CLIENT_MESSAGE.id}`)).toHaveTextContent("You");
      expect(screen.getByTestId(`message-sender-${SCRIPT_INJECTION_MESSAGE.id}`)).toHaveTextContent("Accountant");
    },
  );

  it(
    "[AC-MSG-001-04] ThreadView: empty thread renders the empty-state message",
    () => {
      render(
        <ThreadView
          messages={[]}
          attachmentsByMessageId={NO_ATTACHMENTS}
          viewerClerkId={VIEWER_CLERK_ID}
        />,
      );

      expect(screen.getByTestId("thread-view-empty")).toBeInTheDocument();
    },
  );
});

// ─── UnreadIndicator — per-viewer indicator ───────────────────────────────────

describe("UnreadIndicator (portal) — per-viewer unread indicator", () => {
  it(
    "[AC-MSG-005-01] renders an unread badge when hasUnread is true",
    () => {
      render(<UnreadIndicator hasUnread={true} />);
      expect(screen.getByTestId("unread-indicator")).toBeInTheDocument();
    },
  );

  it(
    "[AC-MSG-005-01] renders nothing when hasUnread is false",
    () => {
      render(<UnreadIndicator hasUnread={false} />);
      expect(screen.queryByTestId("unread-indicator")).not.toBeInTheDocument();
    },
  );
});

// ─── ThreadList — per-viewer unread indicator on both thread kinds ────────────

describe("ThreadList (portal) — unread indicator on both thread kinds", () => {
  it(
    "[AC-MSG-005-01] shows unread indicator on an engagement thread with hasUnread=true",
    () => {
      render(<ThreadList threads={[UNREAD_ENGAGEMENT_THREAD]} />);

      const item = screen.getByTestId(`thread-list-item-${UNREAD_ENGAGEMENT_THREAD.id}`);
      expect(item).toBeInTheDocument();
      expect(item.querySelector("[data-testid='unread-indicator']")).toBeInTheDocument();
    },
  );

  it(
    "[AC-MSG-005-01] does NOT show unread indicator on a thread with hasUnread=false",
    () => {
      render(<ThreadList threads={[READ_GENERAL_THREAD]} />);

      const item = screen.getByTestId(`thread-list-item-${READ_GENERAL_THREAD.id}`);
      expect(item.querySelector("[data-testid='unread-indicator']")).not.toBeInTheDocument();
    },
  );

  it(
    "[AC-MSG-005-02] shows unread indicator on a 'general' thread with hasUnread=true",
    () => {
      render(<ThreadList threads={[UNREAD_GENERAL_THREAD]} />);

      const item = screen.getByTestId(`thread-list-item-${UNREAD_GENERAL_THREAD.id}`);
      expect(item.querySelector("[data-testid='unread-indicator']")).toBeInTheDocument();
      expect(item.dataset.threadKind).toBe("general");
    },
  );

  it(
    "[AC-MSG-005-02] shows unread indicator on both 'engagement' and 'general' threads in a mixed list",
    () => {
      render(
        <ThreadList
          threads={[UNREAD_ENGAGEMENT_THREAD, UNREAD_GENERAL_THREAD, READ_GENERAL_THREAD]}
        />,
      );

      // Engagement thread — unread
      const engItem = screen.getByTestId(`thread-list-item-${UNREAD_ENGAGEMENT_THREAD.id}`);
      expect(engItem.querySelector("[data-testid='unread-indicator']")).toBeInTheDocument();

      // General thread — unread
      const genItem = screen.getByTestId(`thread-list-item-${UNREAD_GENERAL_THREAD.id}`);
      expect(genItem.querySelector("[data-testid='unread-indicator']")).toBeInTheDocument();

      // General thread — read (no badge)
      const readItem = screen.getByTestId(`thread-list-item-${READ_GENERAL_THREAD.id}`);
      expect(readItem.querySelector("[data-testid='unread-indicator']")).not.toBeInTheDocument();
    },
  );

  it(
    "[AC-MSG-002-01] portal ThreadList does NOT render a start-general-thread affordance",
    () => {
      // ADR-006 / CS-TS-004: portal has NO start-general-thread control — it belongs to admin only.
      render(<ThreadList threads={[UNREAD_ENGAGEMENT_THREAD]} />);

      // The portal ThreadList should NOT contain a start-general-thread control.
      expect(screen.queryByTestId("start-general-thread-button")).not.toBeInTheDocument();
      expect(screen.queryByTestId("start-general-thread-section")).not.toBeInTheDocument();
    },
  );
});

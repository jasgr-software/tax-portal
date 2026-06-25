/**
 * apps/admin/src/app/messages/messages.test.tsx
 *
 * Component tests for the admin (ACCOUNTANT) messaging UI components.
 *
 * TASK-017-006 / BRIEF-017 — Acceptance criteria verified here:
 *   [AC-MSG-003-01] message body rendered verbatim as plain text (React text nodes)
 *   [AC-MSG-003-02] `<script>alert(1)</script>` renders as literal text — NOT executed
 *   [AC-MSG-003-03] `<img>` tag / markdown renders verbatim; no inline image in the body
 *   [AC-MSG-005-01] per-viewer unread indicator appears on threads with unread messages
 *   [AC-MSG-005-02] unread indicator present for both 'engagement' and 'general' thread kinds
 *   [AC-MSG-001-04] admin surface renders a thread (read + compose affordance)
 *   [AC-MSG-006-01] admin DOES show the start-general-thread affordance (CS-TS-004)
 *   [AC-MSG-002-01] selector populated + choosing a client → createGeneralThreadForClientAction called
 *
 * TASK-017-010 — New acceptance criteria verified here:
 *   [AC-MSG-002-01] StartGeneralThread selector renders clients from the propClients list
 *     (list populated → accountant can pick a client + submit → thread created)
 *   [AC-MSG-002-01] choosing a client + submit calls createGeneralThreadForClientAction
 *   [AC-MSG-002-02] resulting thread associated with the chosen client (verified via action call)
 *
 * Strategy:
 *   - Render components directly with fixture data (no DB, no server actions).
 *   - Assert on the rendered DOM: text content, absence of <script>/<img> execution,
 *     presence/absence of unread indicator, presence of start-general-thread on admin.
 *   - For StartGeneralThread: inject clients via the prop (bypasses listClientsAction fetch)
 *     and verify the selector + submit flow.
 *
 * CS-TS-003: component tests exist on both portal AND admin surfaces (mirrored). // CS-TS-003
 * CS-TS-004: StartGeneralThread appears ONLY in apps/admin — never in apps/portal. // CS-TS-004
 * CS-GEN-001: XSS test verifies body rendered as escaped text (React default). // CS-GEN-001
 * CS-GEN-003: AC ids cited in test names. // CS-GEN-003
 * ADR-006: admin surface (ACCOUNTANT-facing) — start-general-thread IS present. // ADR-006
 *
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // AC-MSG-005-01 // AC-MSG-005-02 // AC-MSG-001-04 // AC-MSG-002-01 // AC-MSG-006-01
 * // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003 // ADR-006
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mock server actions ──────────────────────────────────────────────────────
// StartGeneralThread now imports listClientsAction + createGeneralThreadForClientAction.
// Mock both relative path (as seen from _components/) and absolute path.
// Pattern mirrors RetentionPanel.test.tsx — vi.hoisted + dual-path mocks.

const {
  mockCreateGeneralThreadForClientAction,
  mockListClientsAction,
  mockStartGeneralThreadAction,
} = vi.hoisted(() => ({
  mockCreateGeneralThreadForClientAction: vi.fn(),
  mockListClientsAction: vi.fn(),
  mockStartGeneralThreadAction: vi.fn(),
}));

vi.mock("./actions", () => ({
  startGeneralThreadAction: mockStartGeneralThreadAction,
  listClientsAction: mockListClientsAction,
  createGeneralThreadForClientAction: mockCreateGeneralThreadForClientAction,
}));

vi.mock("@/app/messages/actions", () => ({
  startGeneralThreadAction: mockStartGeneralThreadAction,
  listClientsAction: mockListClientsAction,
  createGeneralThreadForClientAction: mockCreateGeneralThreadForClientAction,
}));

// Mock engagement messages actions (AttachmentList + MessageComposer imports via ThreadView chain)
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
import { StartGeneralThread } from "./_components/StartGeneralThread";
import type { ThreadWithUnread } from "@tax-portal/db";
import type { MessageItem, MessageAttachmentItem } from "@tax-portal/db";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VIEWER_CLERK_ID = "user_admin_acct_001";
const CLIENT_CLERK_ID = "user_portal_client_001";

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

/** A message from the viewer (ACCOUNTANT) */
const ACCOUNTANT_MESSAGE: MessageItem = {
  id: "msg-acct-001",
  threadId: "thread-engagement-001",
  senderClerkId: VIEWER_CLERK_ID,
  body: "Hello, I have reviewed your documents.",
  createdAt: new Date("2026-06-25T09:00:00Z"),
  updatedAt: new Date("2026-06-25T09:00:00Z"),
};

/** A message with a script-injection body (SECURITY test — AC-MSG-003-02) */
const SCRIPT_INJECTION_MESSAGE: MessageItem = {
  id: "msg-xss-001",
  threadId: "thread-engagement-001",
  senderClerkId: CLIENT_CLERK_ID,
  body: "<script>alert(1)</script>",
  createdAt: new Date("2026-06-25T09:01:00Z"),
  updatedAt: new Date("2026-06-25T09:01:00Z"),
};

/** A message with an <img> tag + markdown (SECURITY test — AC-MSG-003-01/-03) */
const IMG_AND_MARKDOWN_MESSAGE: MessageItem = {
  id: "msg-img-001",
  threadId: "thread-engagement-001",
  senderClerkId: CLIENT_CLERK_ID,
  body: '<img src="x" onerror="alert(2)"> **bold** _italic_',
  createdAt: new Date("2026-06-25T09:02:00Z"),
  updatedAt: new Date("2026-06-25T09:02:00Z"),
};

/** No-op empty attachments map */
const NO_ATTACHMENTS: Record<string, MessageAttachmentItem[]> = {};

/** Fixture client list for selector tests (AC-MSG-002-01) */
const FIXTURE_CLIENTS = [
  { userId: "uid-alice-001", displayName: "Alice Smith" },
  { userId: "uid-bob-002", displayName: "Bob Jones" },
];

// ─── MessageBody — plain-text render (shared component from packages/ui) ─────

describe("MessageBody (admin surface) — plain-text verbatim render", () => {
  it(
    "[AC-MSG-003-02] renders <script>alert(1)</script> as LITERAL text, not executed",
    () => {
      render(<MessageBody body="<script>alert(1)</script>" />);

      const bodyEl = screen.getByTestId("message-body");
      expect(bodyEl).toHaveTextContent("<script>alert(1)</script>");

      // No <script> element injected into the DOM (would happen with dangerouslySetInnerHTML).
      expect(document.querySelectorAll("script").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-003-01] renders body containing HTML markup as literal characters",
    () => {
      const body = "<b>bold</b> <i>italic</i>";
      render(<MessageBody body={body} />);

      const bodyEl = screen.getByTestId("message-body");
      expect(bodyEl).toHaveTextContent(body);

      // No <b> or <i> elements — text node, not parsed HTML.
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
      expect(bodyEl).toHaveTextContent('<img src="x" onerror="alert(2)"> **bold**');

      // AC-MSG-003-03: NO <img> element in the DOM.
      expect(bodyEl.querySelector("img")).toBeNull();
      expect(document.querySelectorAll("img").length).toBe(0);
    },
  );
});

// ─── ThreadView (admin) — plain-text render ───────────────────────────────────

describe("ThreadView (admin) — message body plain-text render", () => {
  it(
    "[AC-MSG-003-02] ThreadView (admin): <script> body renders as literal text, NOT executed",
    () => {
      render(
        <ThreadView
          messages={[SCRIPT_INJECTION_MESSAGE]}
          attachmentsByMessageId={NO_ATTACHMENTS}
          viewerClerkId={VIEWER_CLERK_ID}
        />,
      );

      const row = screen.getByTestId(`message-row-${SCRIPT_INJECTION_MESSAGE.id}`);
      expect(row).toHaveTextContent("<script>alert(1)</script>");
      expect(document.querySelectorAll("script").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-003-03] ThreadView (admin): <img> body renders verbatim; no inline image",
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
      expect(document.querySelectorAll("img").length).toBe(0);
    },
  );

  it(
    "[AC-MSG-001-04] ThreadView (admin): renders messages from both parties (accountant + client)",
    () => {
      render(
        <ThreadView
          messages={[ACCOUNTANT_MESSAGE, SCRIPT_INJECTION_MESSAGE]}
          attachmentsByMessageId={NO_ATTACHMENTS}
          viewerClerkId={VIEWER_CLERK_ID}
        />,
      );

      expect(screen.getByTestId(`message-row-${ACCOUNTANT_MESSAGE.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`message-row-${SCRIPT_INJECTION_MESSAGE.id}`)).toBeInTheDocument();

      // Accountant message shows "You"; client's message shows "Client"
      expect(screen.getByTestId(`message-sender-${ACCOUNTANT_MESSAGE.id}`)).toHaveTextContent("You");
      expect(screen.getByTestId(`message-sender-${SCRIPT_INJECTION_MESSAGE.id}`)).toHaveTextContent("Client");
    },
  );
});

// ─── UnreadIndicator (admin) — per-viewer indicator ──────────────────────────

describe("UnreadIndicator (admin) — per-viewer unread indicator", () => {
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

// ─── ThreadList (admin) — per-viewer unread indicator on both thread kinds ────

describe("ThreadList (admin) — unread indicator on both thread kinds", () => {
  it(
    "[AC-MSG-005-01] shows unread indicator on an engagement thread with hasUnread=true",
    () => {
      render(<ThreadList threads={[UNREAD_ENGAGEMENT_THREAD]} />);

      const item = screen.getByTestId(`thread-list-item-${UNREAD_ENGAGEMENT_THREAD.id}`);
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

      const engItem = screen.getByTestId(`thread-list-item-${UNREAD_ENGAGEMENT_THREAD.id}`);
      expect(engItem.querySelector("[data-testid='unread-indicator']")).toBeInTheDocument();

      const genItem = screen.getByTestId(`thread-list-item-${UNREAD_GENERAL_THREAD.id}`);
      expect(genItem.querySelector("[data-testid='unread-indicator']")).toBeInTheDocument();

      const readItem = screen.getByTestId(`thread-list-item-${READ_GENERAL_THREAD.id}`);
      expect(readItem.querySelector("[data-testid='unread-indicator']")).not.toBeInTheDocument();
    },
  );
});

// ─── StartGeneralThread — accountant-only affordance + populated selector ─────
//
// TASK-017-010: tests verify the selector is populated and submit flow works.
// The component accepts an optional `clients` prop for test injection (bypasses
// listClientsAction fetch). Tests pass fixture clients via the prop.
//
// // AC-MSG-002-01 // AC-MSG-002-02 // AC-MSG-006-01 // CS-TS-004 // ADR-006

describe("StartGeneralThread (admin) — accountant-only create affordance", () => {
  it(
    "[AC-MSG-006-01] [CS-TS-004] StartGeneralThread renders the create-thread button for the accountant",
    () => {
      // CS-TS-004: This component exists ONLY in apps/admin. // CS-TS-004
      // AC-MSG-006-01: accountant can initiate a general thread.
      render(<StartGeneralThread clients={[]} />);

      expect(screen.getByTestId("start-general-thread-button")).toBeInTheDocument();
    },
  );

  it(
    "[AC-MSG-002-01] admin surface has start-general-thread affordance; portal does NOT",
    () => {
      // CS-TS-004: The StartGeneralThread component is imported ONLY in apps/admin.
      // apps/portal ThreadList NEVER contains this control. // CS-TS-004
      // This test proves the admin side has the control.
      render(<StartGeneralThread clients={[{ userId: "uid-001", displayName: "Alice Smith" }]} />);

      const btn = screen.getByTestId("start-general-thread-button");
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent("New Message Thread");
    },
  );

  it(
    "[AC-MSG-002-01] selector renders all clients from the prop list (selector is populated, not empty)",
    async () => {
      // TASK-017-010: verify the selector shows the fixture clients, not an empty list.
      // AC-MSG-002-01: accountant CAN pick a client — the selector is populated.
      render(<StartGeneralThread clients={FIXTURE_CLIENTS} />);

      // Click "New Message Thread" to expand the form
      fireEvent.click(screen.getByTestId("start-general-thread-button"));

      // The form is expanded
      expect(screen.getByTestId("start-general-thread-form")).toBeInTheDocument();

      // Both fixture clients appear as options in the selector
      const selector = screen.getByTestId("select-client") as HTMLSelectElement;
      const options = Array.from(selector.options).map((o) => o.value);
      expect(options).toContain("uid-alice-001");
      expect(options).toContain("uid-bob-002");

      // The option text is the displayName
      const optionTexts = Array.from(selector.options).map((o) => o.text);
      expect(optionTexts).toContain("Alice Smith");
      expect(optionTexts).toContain("Bob Jones");
    },
  );

  it(
    "[AC-MSG-002-01] choosing a client + submit calls createGeneralThreadForClientAction with that clientUserId",
    async () => {
      // TASK-017-010 / AC-MSG-002-01: submit with a chosen clientUserId reaches the validated action.
      // The action is mocked to return success.
      mockCreateGeneralThreadForClientAction.mockResolvedValueOnce({
        success: true,
        data: {
          id: "thread-new-001",
          kind: "general",
          engagementId: null,
          clientUserId: "uid-alice-001",
          status: "active",
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const onCreated = vi.fn();
      render(<StartGeneralThread clients={FIXTURE_CLIENTS} onCreated={onCreated} />);

      // Expand the form
      fireEvent.click(screen.getByTestId("start-general-thread-button"));

      // Select Alice
      fireEvent.change(screen.getByTestId("select-client"), {
        target: { value: "uid-alice-001" },
      });

      // Submit
      fireEvent.submit(screen.getByTestId("start-general-thread-form").querySelector("form")!);

      // AC-MSG-002-01: createGeneralThreadForClientAction called with Alice's clientUserId
      await waitFor(() => {
        expect(mockCreateGeneralThreadForClientAction).toHaveBeenCalledWith("uid-alice-001");
      });

      // onCreated called with the new thread id
      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledWith("thread-new-001");
      });
    },
  );

  it(
    "[AC-MSG-002-01] submit error from createGeneralThreadForClientAction is surfaced in the UI",
    async () => {
      // When the action returns an error (e.g. clientUserId not in listed set), the
      // error message is shown in the form. No PII logged. // CS-GEN-001
      mockCreateGeneralThreadForClientAction.mockResolvedValueOnce({
        success: false,
        error: "Invalid client selection. Please try again.",
      });

      render(<StartGeneralThread clients={FIXTURE_CLIENTS} />);

      // Expand the form
      fireEvent.click(screen.getByTestId("start-general-thread-button"));

      // Select a client
      fireEvent.change(screen.getByTestId("select-client"), {
        target: { value: "uid-alice-001" },
      });

      // Submit
      fireEvent.submit(screen.getByTestId("start-general-thread-form").querySelector("form")!);

      // Error surfaced in the UI
      await waitFor(() => {
        expect(screen.getByTestId("start-thread-error")).toHaveTextContent(
          "Invalid client selection. Please try again.",
        );
      });
    },
  );

  it(
    "[AC-MSG-002-01] empty clients list shows the selector with no options (graceful empty state)",
    async () => {
      // When no clients exist, the selector shows only the placeholder.
      // The accountant cannot start a thread (no client to pick from).
      // When clients=[] is passed, the component tries to fetch via listClientsAction.
      // Mock it to return an empty list.
      mockListClientsAction.mockResolvedValueOnce({ success: true, data: [] });

      render(<StartGeneralThread clients={[]} />);

      fireEvent.click(screen.getByTestId("start-general-thread-button"));

      // Wait for the fetch effect to settle (listClientsAction resolves with empty list)
      await waitFor(() => {
        const selector = screen.getByTestId("select-client") as HTMLSelectElement;
        // Only the placeholder option ("-- Select a client --") is present
        const nonPlaceholderOptions = Array.from(selector.options).filter((o) => o.value !== "");
        expect(nonPlaceholderOptions.length).toBe(0);
      });
    },
  );
});

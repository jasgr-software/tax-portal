/**
 * apps/admin/e2e/specs/notification-feed.spec.ts
 *
 * Tier-6 e2e — Accountant notification feed + persistent unread badge (EPIC-016 / TASK-016-006)
 *
 * Acceptance criteria covered:
 *   AC-MSG-017-01 — The unread-count badge is in the admin nav (visible from any area).
 *   AC-MSG-017-02 — The badge shows the ACCOUNTANT's unread count.
 *   AC-MSG-017-03 — The badge reflects the current read state (updates after mark-read).
 *   AC-MSG-013-03 — The accountant feed renders the document_uploaded notification.
 *   AC-MSG-015-02 — Viewing the linked item marks the corresponding notification as read.
 *   AC-MSG-015-03 — No separate dismiss button — mark-read fires on linked-item view.
 *   AC-MSG-012-01 — Notification surfaces in the feed without manual refresh (real-time arrival).
 *   AC-MSG-012-02 — New notifications appear in real time as events occur.
 *   AC-MSG-012-03 — The unread-count badge reflects real-time arrival (push-without-navigation).
 *
 * Strategy:
 *   1. Seed an ACCOUNTANT-scoped unread Notification (document_uploaded type) via admin pool.
 *   2. Set up an ACCOUNTANT session; navigate to the admin dashboard (/).
 *   3. Assert the badge is visible in the admin nav with unread count ≥ 1 (AC-MSG-017-01/-02).
 *   4. Assert the badge is visible from a different area (/services) (AC-MSG-017-01).
 *   5. Navigate to the request detail page that owns the notification's linked item.
 *   6. Assert mark-read fires on view; badge count decrements on reload (AC-MSG-015-02/-03/-017-03).
 *   7. Assert no dismiss button in nav (AC-MSG-015-03).
 *   8. Push-without-navigation: load admin, emit server-side, badge increments without reload (AC-MSG-012-03).
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_BASE_URL / ADMIN_PORT env).
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep notification-feed
 *
 * ADR-003: SESSION_CONTEXT set via mock session; DB read/write via withRequestContext.
 * ADR-005: RLS enforced by sec.pol_Notification — admin pool for fixture only.
 * ADR-006: Admin surface only.
 * ADR-012: Tier-6 e2e.
 * ADR-023: Real-time transport seam — SseBrowserMockTransport in e2e.
 * CS-TS-001: feed fetch + badge count via withRequestContext (server actions).
 * CS-TS-003: AccountantNotificationBadgeClient mirrors portal NotificationBadgeClient.
 * CS-TS-004: markNotificationOnViewAction resolves identity from cookie + guards ACCOUNTANT role.
 * CS-GEN-001: no PII in test data beyond necessary fixture identifiers.
 * CS-GEN-003: AC ids and governing keys cited.
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-012 // ADR-023
 * // CS-TS-001 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Unique identifiers — avoids collision with other suites.
const FIXTURE_ACCOUNTANT_CLERK_ID = "user_accountant_notif_feed_e2e_016_006";

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ─────────────

function parseSqlServerUrl(connectionUrl: string): mssqlPkg.config {
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");
  const firstSemi = withoutScheme.indexOf(";");
  const authority =
    firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr =
    firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

  const params: Record<string, string> = {};
  for (const part of paramStr.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) params[k] = v;
  }

  let user: string | undefined;
  let password: string | undefined;
  let hostPort = authority;

  const atIdx = authority.lastIndexOf("@");
  if (atIdx !== -1) {
    const credentials = authority.slice(0, atIdx);
    hostPort = authority.slice(atIdx + 1);
    const colonIdx = credentials.indexOf(":");
    if (colonIdx === -1) {
      user = decodeURIComponent(credentials);
    } else {
      user = decodeURIComponent(credentials.slice(0, colonIdx));
      password = decodeURIComponent(credentials.slice(colonIdx + 1));
    }
  }

  let server = hostPort;
  let port = 1433;
  const portMatch = hostPort.match(/:(\d+)$/);
  if (portMatch) {
    port = parseInt(portMatch[1] ?? "1433", 10);
    server = hostPort.slice(0, hostPort.length - portMatch[0].length);
  }

  return {
    server,
    port:
      port !== 1433
        ? port
        : params["port"]
          ? parseInt(params["port"], 10)
          : 1433,
    user: user ?? params["user"],
    password: password ?? params["password"],
    database: params["database"] ?? "master",
    options: {
      encrypt: (params["encrypt"] ?? "true").toLowerCase() !== "false",
      trustServerCertificate:
        (params["trustServerCertificate"] ?? "false").toLowerCase() === "true",
    },
  };
}

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[notification-feed.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
    );
  }
  const config = parseSqlServerUrl(url);
  _pool = new ConnectionPool(config);
  await _pool.connect();
  return _pool;
}

async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

// ─── Fixture state ────────────────────────────────────────────────────────────

interface NotifFixture {
  requestId: string;
  notificationId: string;
}

/**
 * Seeds an EngagementRequest + ACCOUNTANT-scoped unread Notification (document_uploaded).
 *
 * The Notification has:
 *   recipientType = 'ACCOUNTANT', recipientUserId = null (ACCOUNTANT = shared channel)
 *   linkedItemType = 'request', linkedItemId = requestId
 *   type = 'document_uploaded'
 *   readAt = NULL (unread)
 *
 * This is the shape emitAndPublishNotification() would produce for ACCOUNTANT recipients.
 * We use admin-pool direct INSERT to control the fixture precisely.
 *
 * ADR-005: admin pool for fixture only — RLS is exercised via the ACCOUNTANT request session.
 * AC-MSG-013-03: the document_uploaded notification type is tested here.
 */
async function seedAccountantNotification(): Promise<NotifFixture> {
  const pool = await getPool();

  // Cleanup any prior fixture for this test (idempotent setup)
  await cleanupFixture(pool).catch(() => {
    /* ignore on first run */
  });

  // 1. Seed EngagementRequest (so the request detail page exists)
  const reqResult = await pool
    .request()
    .input("email", "notif-feed-e2e-016-006@example.com")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'NotifFeedAdmin', N'E2ETest', @email, NULL, N'Please review my document upload', N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[notification-feed.spec] Failed to seed EngagementRequest");

  // 2. Seed an unread ACCOUNTANT Notification (document_uploaded type — AC-MSG-013-03)
  //    recipientType='ACCOUNTANT', recipientUserId=null (shared channel)
  //    linkedItemType='request', linkedItemId=requestId (so the request detail page marks it read)
  //    readAt = NULL (unread)
  const notifResult = await pool
    .request()
    .input("requestId", requestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [engagementRequestId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'document_uploaded',
         N'New document uploaded by client',
         N'Client uploaded Tax_Return_2024.pdf to your engagement.',
         N'ACCOUNTANT',
         NULL,
         N'request',
         @requestId,
         @requestId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id;
  if (!notificationId) throw new Error("[notification-feed.spec] Failed to seed Notification");

  // Normalize IDs to lowercase (mssql admin pool returns UPPERCASE UUIDs).
  return {
    requestId: requestId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
  };
}

/**
 * Cleanup: delete notifications + requests (cascade-ordered).
 */
async function cleanupFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  // 1. Delete ACCOUNTANT notifications linked to this email's requests
  await pool
    .request()
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[EngagementRequest] r ON n.[linkedItemId] = r.[id]
       WHERE r.[email] = N'notif-feed-e2e-016-006@example.com'
       AND n.[recipientType] = N'ACCOUNTANT'`,
    )
    .catch(() => {
      /* ignore */
    });

  // 2. Delete engagement requests for this email
  await pool
    .request()
    .query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'notif-feed-e2e-016-006@example.com'`,
    )
    .catch(() => {
      /* ignore */
    });
}

// ─── Test state ───────────────────────────────────────────────────────────────

let fixture: NotifFixture;

// ─── Suite setup/teardown ─────────────────────────────────────────────────────

test.beforeAll(async () => {
  fixture = await seedAccountantNotification();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupFixture(pool);
  await closePool();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * AC-MSG-017-01 / AC-MSG-017-02:
 *   The unread badge is visible in the admin nav with the correct initial count.
 *
 * Given the ACCOUNTANT has 1 unread notification,
 * When they load the admin dashboard (any page),
 * Then the nav shows a "Notifications" link with an unread badge showing count ≥ 1.
 *
 * // AC-MSG-017-01 // AC-MSG-017-02 // ADR-003 // CS-TS-001 // CS-TS-004
 */
test("AC-MSG-017-01/02 — unread badge is visible in admin nav with the correct count", async ({ page, request }) => {
  await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
  await page.goto(`${ADMIN_URL}/`);

  // AC-MSG-017-01: nav notifications link is present (visible from any area — root layout)
  const navLink = page.getByTestId("nav-notifications-link");
  await expect(navLink).toBeVisible();

  // AC-MSG-017-02: unread badge is present and shows count ≥ 1
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible();
  const countAttr = await badge.getAttribute("data-unread-count");
  expect(Number(countAttr)).toBeGreaterThanOrEqual(1);

  await clearSession(page);
});

/**
 * AC-MSG-017-01 — Badge is visible from any admin area (not just /requests).
 *
 * Given the ACCOUNTANT has 1 unread notification,
 * When they navigate to /services (a different area),
 * Then the unread badge is still visible in the nav.
 *
 * // AC-MSG-017-01 // ADR-006 // CS-TS-003
 */
test("AC-MSG-017-01 — badge is visible from any admin area (persistent in nav)", async ({ page, request }) => {
  await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);

  // Navigate to /services (a different area from /requests)
  await page.goto(`${ADMIN_URL}/services`);

  // AC-MSG-017-01: badge is still visible from the services area
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible();
  const countAttr = await badge.getAttribute("data-unread-count");
  expect(Number(countAttr)).toBeGreaterThanOrEqual(1);

  await clearSession(page);
});

/**
 * AC-MSG-013-03 — The accountant feed renders the document_uploaded notification.
 *
 * Given the ACCOUNTANT has a document_uploaded notification,
 * When they navigate to the /requests inbox,
 * Then the document_uploaded notification is listed in the NotificationsIndicator.
 * And the notification has the correct title.
 *
 * // AC-MSG-013-03 // ADR-003 // ADR-005 // CS-TS-001 // CS-GEN-002
 */
test("AC-MSG-013-03 — accountant feed renders the document_uploaded notification", async ({ page, request }) => {
  // Reset the notification to unread
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
  await page.goto(`${ADMIN_URL}/requests`);

  // The NotificationsIndicator should be visible
  const notifIndicator = page.getByTestId("notifications-indicator");
  await expect(notifIndicator).toBeVisible({ timeout: 10_000 });

  // The notification for this specific type should appear
  const notifId = fixture.notificationId.toLowerCase();
  const notifItem = page.getByTestId(`notification-item-${notifId}`);
  await expect(notifItem).toBeVisible({ timeout: 10_000 });

  // The notification type should be document_uploaded (AC-MSG-013-03)
  await expect(notifItem).toHaveAttribute("data-notification-type", "document_uploaded");

  // The notification title matches what was seeded
  await expect(notifItem).toContainText("New document uploaded by client");

  await clearSession(page);
});

/**
 * AC-MSG-015-03 — No dismiss button in the admin notification area.
 *
 * Given the ACCOUNTANT has 1 unread notification,
 * When they navigate to /requests (where the NotificationsIndicator is),
 * Then no "dismiss" or "mark as read" button is present.
 *
 * // AC-MSG-015-03 // ADR-003
 */
test("AC-MSG-015-03 — no dismiss button in the admin notification indicator", async ({ page, request }) => {
  // Reset the notification to unread
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
  await page.goto(`${ADMIN_URL}/requests`);

  // Assert no dismiss/close/mark-as-read button is present anywhere
  // (AC-MSG-015-03: no separate dismiss step)
  const dismissButton = page.locator("button:has-text('Dismiss')");
  await expect(dismissButton).not.toBeVisible();

  const markReadButton = page.locator("button:has-text('Mark as read')");
  await expect(markReadButton).not.toBeVisible();

  const closeButton = page.locator("button:has-text('Close')");
  await expect(closeButton).not.toBeVisible();

  await clearSession(page);
});

/**
 * AC-MSG-015-02 / AC-MSG-015-03 / AC-MSG-017-03:
 *   Viewing the linked request marks the notification read (no dismiss).
 *   The badge count reflects the read state after mark-read.
 *
 * Given the ACCOUNTANT has 1 unread notification linked to a request,
 * When they navigate to the linked request detail page,
 * Then markNotificationOnViewAction fires (automatic, no dismiss needed).
 * And when they reload the admin dashboard, the badge count decrements.
 *
 * // AC-MSG-015-02 // AC-MSG-015-03 // AC-MSG-017-03 // ADR-003 // CS-TS-004 // CS-TS-001
 */
test("AC-MSG-015-02/03 and AC-MSG-017-03 — viewing linked request marks notification read; badge reflects it", async ({ page, request }) => {
  // Reset the notification to unread
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);

  // Capture initial badge count from the admin dashboard
  await page.goto(`${ADMIN_URL}/`);
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible();
  const initialCountStr = await badge.getAttribute("data-unread-count");
  const initialCount = Number(initialCountStr ?? "0");
  expect(initialCount).toBeGreaterThanOrEqual(1);

  // Navigate to the linked request detail page.
  // This triggers markNotificationOnViewAction on the server (AC-MSG-015-02).
  // No dismiss button — the mark-read fires automatically on page view (AC-MSG-015-03).
  await page.goto(`${ADMIN_URL}/requests/${fixture.requestId}`);

  // Verify the request detail page loaded
  const requestDetail = page.getByTestId("request-detail");
  await expect(requestDetail).toBeVisible({ timeout: 10_000 });

  // Navigate back to the admin dashboard to get the updated server-side badge count.
  // AC-MSG-017-03: badge reflects the read state after mark-read.
  await page.goto(`${ADMIN_URL}/`);

  // After mark-read, the badge count should have decreased.
  // If count = 0, the badge element is absent (the component returns null when count ≤ 0).
  const badgeAfter = page.getByTestId("nav-unread-badge");
  const badgeVisible = await badgeAfter.isVisible();
  const countAfter = badgeVisible
    ? Number((await badgeAfter.getAttribute("data-unread-count")) ?? "0")
    : 0; // badge absent = count 0 → mark-read succeeded

  expect(
    countAfter,
    "[AC-MSG-017-03] Badge count must decrease after viewing the linked request",
  ).toBeLessThan(initialCount);

  await clearSession(page);
});

/**
 * AC-MSG-012-03 — PUSH-WITHOUT-NAVIGATION: badge increments in real time without reload.
 *
 * Given an ACCOUNTANT with a known initial unread count (≥ 1 from seeded notification),
 * When the admin dashboard is loaded and the SSE subscription is established,
 * And a new notification is emitted server-side via /api/notifications/emit-test,
 * Then the unread-count badge increments WITHOUT a manual page reload.
 *
 * This test is the accountant-surface mirror of the portal notification-feed push test
 * (TASK-016-005b / notification-feed.spec.ts for apps/portal).
 *
 * Also covers:
 *   AC-MSG-012-01 — notification surfaces without manual refresh
 *   AC-MSG-012-02 — new notifications appear in real time
 *
 * // AC-MSG-012-01 // AC-MSG-012-02 // AC-MSG-012-03
 * // ADR-023 §2/§4/§6 // CS-GEN-001 // CS-GEN-003 // CS-TS-003
 */
test("AC-MSG-012-03 — push-without-navigation: badge increments without reload (accountant surface)", async ({ page, request }) => {
  // Reset the seeded notification to unread so the initial count is known (≥ 1).
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  // Step 1: Set up ACCOUNTANT session and load the admin dashboard.
  // The SSE EventSource in SseBrowserMockTransport connects to /api/notifications/stream.
  await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
  await page.goto(`${ADMIN_URL}/`);

  // Step 2: Capture the initial badge count (must be ≥ 1 from the seeded notification).
  // AC-MSG-017-02: badge shows unread count.
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible({ timeout: 10_000 });
  const initialCountAttr = await badge.getAttribute("data-unread-count");
  const initialCount = Number(initialCountAttr ?? "0");
  expect(
    initialCount,
    "[AC-MSG-012-03] Initial unread count must be ≥ 1 (seeded notification)",
  ).toBeGreaterThanOrEqual(1);

  // Step 3: Wait for the SSE subscription to be established.
  // DECISION-016-006-SSE: 500ms is sufficient for the EventSource handshake.
  await page.waitForTimeout(500);

  // Step 4: Emit a notification server-side via the test-only endpoint.
  // /api/notifications/emit-test on admin publishes to "accountant:notifications".
  // The ACCOUNTANT channel is derived from the session — no channel parameter needed.
  // BUG-016-002 fix pattern: call from within the browser page via page.evaluate() so
  //   the browser's session cookie is automatically included in the fetch request.
  await page.evaluate(async () => {
    const res = await fetch("/api/notifications/emit-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // No "channel" field — the route derives the channel from the authenticated session.
        // DECISION-016-006-SSE // ADR-023
        event: {
          type: "notification.created",
          payload: {
            notificationId: "test-push-accountant-016-006",
            notificationType: "document_uploaded",
          },
        },
      }),
    });
    // Assert inside the browser context — a redirect-to-sign-in cannot read as green.
    if (!res.ok) {
      throw new Error(
        `[AC-MSG-012-03] /api/notifications/emit-test returned ${res.status} (not OK). ` +
          "Is ALLOW_MOCK_REALTIME=true set in the admin container? " +
          "Is the browser session cookie present? (mirrors BUG-016-002 fix for portal)",
      );
    }
  });

  // Step 5: WITHOUT navigating or reloading, wait for the badge to increment.
  // expect.poll() retries the check until it passes or times out.
  // AC-MSG-012-03: the badge MUST increment without a manual refresh.
  await expect
    .poll(
      async () => {
        const badgeEl = page.getByTestId("nav-unread-badge");
        const isVisible = await badgeEl.isVisible();
        if (!isVisible) return 0;
        const countAttr = await badgeEl.getAttribute("data-unread-count");
        return Number(countAttr ?? "0");
      },
      {
        message:
          "[AC-MSG-012-03] Badge count must increment after push — no page reload. " +
          "If this fails, the SSE bridge (SseBrowserMockTransport → /api/notifications/stream) " +
          "is not delivering events to the accountant browser. " +
          "DECISION-016-006-SSE. // ADR-023 §6",
        timeout: 10_000,
        intervals: [100, 200, 300, 500, 1000],
      },
    )
    .toBeGreaterThan(initialCount);

  // Step 6: Cleanup — clear the session.
  await clearSession(page);
});

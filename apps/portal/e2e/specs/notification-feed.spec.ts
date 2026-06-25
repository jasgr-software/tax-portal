/**
 * apps/portal/e2e/specs/notification-feed.spec.ts
 *
 * Tier-6 e2e — Client notification feed + persistent unread badge (EPIC-016 / TASK-016-005/-007)
 *
 * Acceptance criteria covered:
 *   AC-MSG-017-01 — The unread-count badge is in the portal nav (visible from any area).
 *   AC-MSG-017-02 — The badge shows the CLIENT's unread count.
 *   AC-MSG-017-03 — The badge reflects the current read state (updates after mark-read).
 *   AC-MSG-007-03 — The notification feed is the authoritative in-portal record
 *                    (verified by the CLIENT's entitled notifications appearing in the feed).
 *   AC-MSG-015-02 — Viewing the linked item marks the corresponding notification as read.
 *   AC-MSG-015-03 — No separate dismiss button — mark-read fires on linked-item view.
 *   AC-MSG-012-01 — Notification surfaces in the feed without manual refresh (real-time arrival).
 *   AC-MSG-012-02 — New notifications appear in real time as events occur.
 *   AC-MSG-012-03 — The unread-count badge reflects real-time arrival (push-without-navigation).
 *   AC-MSG-014-03 — engagement_status_changed notification appears in the CLIENT's feed.
 *   AC-MSG-014-04 — deliverable_ready notification appears in the CLIENT's feed.
 *   AC-MSG-014-05 — engagement_request_accepted notification appears in the CLIENT's feed.
 *   AC-MSG-014-06 — engagement_request_declined notification appears in the CLIENT's feed.
 *
 * TASK-016-005b (BUG-016-001 fix):
 *   Test 56 is the load-bearing regression test — push-without-navigation (AC-MSG-012-03).
 *   Prior to this fix, the browser received SupabaseRealtimeTransport (stub), which threw
 *   at subscribe() time; the silent try/catch in NotificationBadgeClient hid the failure.
 *   After the fix, the browser receives SseBrowserMockTransport (opens EventSource to
 *   /api/notifications/stream), which bridges the in-process mock to the browser.
 *   The push-without-navigation test MUST fail on the old code and pass after the fix.
 *   DECISION-016-005b-RT // ADR-023 §2/§6
 *
 * Strategy:
 *   1. Seed a CLIENT user + Engagement + unread Notification (linkedItemType='engagement').
 *   2. Set up a CLIENT session; navigate to the home page.
 *   3. Assert the badge is present in the nav with the correct unread count (AC-MSG-017-01/-02).
 *   4. Navigate to the /notifications feed page.
 *   5. Assert the notification is listed (AC-MSG-007-03).
 *   6. Assert there is NO dismiss button (AC-MSG-015-03).
 *   7. Navigate to the linked engagement — fires markNotificationOnViewAction (AC-MSG-015-02).
 *   8. Navigate back to the home page.
 *   9. Assert the badge count decreased (or is absent if count = 0) (AC-MSG-017-03).
 *  10. (Test 56) Push-without-navigation: load home, capture badge count, emit notification
 *      server-side via /api/notifications/emit-test, assert badge increments without reload.
 *
 * Stack: portal container at http://localhost:3000, AUTH_PROVIDER=mock, REALTIME_PROVIDER=mock.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep notification-feed
 *
 * ADR-003: SESSION_CONTEXT set via mock session; DB read/write via withRequestContext.
 * ADR-005: RLS enforced by sec.pol_Notification — admin pool for fixture only.
 * ADR-006: Portal surface only.
 * ADR-012: Tier-6 e2e.
 * ADR-023: Real-time transport seam — SseBrowserMockTransport in e2e (DECISION-016-005b-RT).
 * CS-TS-001: feed fetch + badge count via withRequestContext (server actions).
 * CS-TS-003: NotificationFeed shared with apps/admin (not tested here — TASK-016-006 scope).
 * CS-TS-004: markNotificationOnViewAction resolves identity from cookie + guards CLIENT role.
 * CS-GEN-001: no PII in test data beyond necessary fixture identifiers.
 * CS-GEN-003: AC ids and governing keys cited.
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-012 // ADR-023
 * // CS-TS-001 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Unique clerkId — avoids collision with other suites.
const FIXTURE_CLIENT_CLERK_ID = "user_client_notif_feed_e2e_016_005";

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
  userId: string;
  engagementId: string;
  notificationId: string;
}

/**
 * Seeds a CLIENT User + EngagementRequest + Engagement + unread Notification.
 *
 * The Notification has:
 *   recipientType = 'CLIENT', recipientUserId = userId
 *   linkedItemType = 'engagement', linkedItemId = engagementId
 *   readAt = NULL (unread)
 *
 * This is exactly the shape emitNotification() would produce from TASK-016-004.
 * We use admin-pool direct INSERT to avoid needing the source-event wiring running
 * in the container (TASK-016-004 is being implemented separately).
 *
 * ADR-005: admin pool for fixture only — RLS is exercised via the CLIENT request session.
 */
async function seedClientWithNotification(): Promise<NotifFixture> {
  const pool = await getPool();

  // Cleanup any prior fixture for this clerkId (idempotent setup)
  await cleanupFixture(pool).catch(() => { /* ignore on first run */ });

  // 1. Upsert User (CLIENT role)
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .input("email", "notif-feed-e2e-016-005@example.com")
    .input("role", "CLIENT")
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source
         ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  let userId = userResult.recordset[0]?.id;
  if (!userId) {
    const lookup = await pool
      .request()
      .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) throw new Error("[notification-feed.spec] Failed to upsert User");
  }

  // 2. Seed EngagementRequest (in_progress or new status doesn't matter for this test)
  const reqResult = await pool
    .request()
    .input("email", "notif-feed-e2e-016-005@example.com")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'NotifFeed', N'E2ETest', @email, NULL, NULL, N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[notification-feed.spec] Failed to seed EngagementRequest");

  // 3. Seed Engagement with clientUserId set (so pol_Engagement FILTER grants access)
  const engResult = await pool
    .request()
    .input("clientUserId", userId)
    .input("requestId", requestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([clientUserId], [engagementRequestId], [status], [taxYear], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clientUserId, @requestId, N'In Progress', 2024, SYSDATETIMEOFFSET())`,
    );
  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[notification-feed.spec] Failed to seed Engagement");

  // 4. Seed an unread Notification (CLIENT-scoped, linked to the engagement)
  //    recipientType='CLIENT', recipientUserId=userId, linkedItemType='engagement', linkedItemId=engagementId
  //    readAt = NULL (unread)
  //    This simulates a notification emitted by TASK-016-004 (e.g. status change event).
  const notifResult = await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'engagement_status_changed',
         N'Your engagement status has been updated',
         N'Your engagement is now In Progress.',
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id;
  if (!notificationId) throw new Error("[notification-feed.spec] Failed to seed Notification");

  // DECISION (TASK-016-005b): normalize IDs to lowercase for URL and data-testid matching.
  // The mssql admin pool returns UPPERCASE UUIDs; Prisma returns lowercase; Next.js routing
  // uses the raw URL path. Normalizing here ensures /engagements/<lowercase-id> matches what
  // Prisma stores and what the engagement-detail page's data-testid uses.
  // This mirrors the pattern in engagement-note-confidentiality.spec.ts and engagement-labels.spec.ts.
  return {
    userId: userId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
  };
}

/**
 * Cleanup: delete notifications + engagement + request + user (cascade-ordered).
 * Idempotent — ignores "row not found" errors.
 *
 * ADR-005: admin pool for cleanup; RLS is not involved.
 */
async function cleanupFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  // 1. Delete notifications for this user
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    ).catch(() => { /* ignore */ });

  // 2. Delete engagements for this user
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    ).catch(() => { /* ignore */ });

  // 3. Delete engagement requests for this email
  await pool
    .request()
    .query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'notif-feed-e2e-016-005@example.com'`,
    ).catch(() => { /* ignore */ });

  // 4. Delete the User
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`)
    .catch(() => { /* ignore */ });
}

// ─── Test state ───────────────────────────────────────────────────────────────

let fixture: NotifFixture;

// ─── Suite setup/teardown ─────────────────────────────────────────────────────

test.beforeAll(async () => {
  fixture = await seedClientWithNotification();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupFixture(pool);
  await closePool();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * AC-MSG-017-01 / AC-MSG-017-02:
 *   The unread badge is visible in the portal nav with the correct initial count.
 *
 * Given the CLIENT has 1 unread notification,
 * When they load the portal (any page),
 * Then the nav shows a "Notifications" link with an unread badge showing count ≥ 1.
 *
 * // AC-MSG-017-01 // AC-MSG-017-02 // ADR-003 // CS-TS-001 // CS-TS-004
 */
test("AC-MSG-017-01/02 — unread badge is visible in nav with the correct count", async ({ page, request }) => {
  await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
  await page.goto(`${PORTAL_URL}/`);

  // AC-MSG-017-01: nav link is present (visible from any area — root layout)
  const navLink = page.getByTestId("nav-notifications-link");
  await expect(navLink).toBeVisible();

  // AC-MSG-017-02: unread badge is present and shows count ≥ 1
  // (We seeded 1 unread notification. The badge should show at least 1.)
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible();
  const countAttr = await badge.getAttribute("data-unread-count");
  expect(Number(countAttr)).toBeGreaterThanOrEqual(1);

  await clearSession(page);
});

/**
 * AC-MSG-017-01 — Badge is absent when unauthenticated (no CLIENT session).
 *
 * Given no session cookie is set,
 * When the user visits the portal,
 * Then there is no unread badge in the nav (badge is CLIENT-only).
 *
 * // AC-MSG-017-01 // DECISION-016-005-D (badge CLIENT-only)
 */
test("AC-MSG-017-01 — badge is absent for unauthenticated visitors", async ({ page }) => {
  await page.goto(`${PORTAL_URL}/`);

  // Nav link still present (navigation is public), but badge is absent for guests.
  // NotificationBadgeServer returns null for non-CLIENT sessions (DECISION-016-005-D).
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).not.toBeVisible();
});

/**
 * AC-MSG-007-03 — The notification feed is the authoritative in-portal record.
 *
 * Given the CLIENT has 1 unread notification,
 * When they navigate to /notifications,
 * Then the notification appears in the feed (the feed is the authoritative record).
 * And the notification has the correct title (as seeded).
 *
 * // AC-MSG-007-03 // ADR-003 // ADR-005 // CS-TS-001
 */
test("AC-MSG-007-03 — notification feed shows entitled notifications", async ({ page, request }) => {
  await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
  await page.goto(`${PORTAL_URL}/notifications`);

  // Feed container is present
  const feed = page.getByTestId("notification-feed");
  await expect(feed).toBeVisible();

  // The seeded notification should appear.
  // DECISION (TASK-016-005): The admin pool (mssql) returns UUIDs in UPPERCASE, but
  // Prisma returns them in lowercase. Normalize to lowercase for data-testid matching.
  // data-testid = "notification-item-<id>" where id is Prisma-lowercased.
  const notifIdLower = fixture.notificationId.toLowerCase();
  const notifItem = page.getByTestId(`notification-item-${notifIdLower}`);
  await expect(notifItem).toBeVisible();

  // The notification title matches what was seeded
  await expect(notifItem).toContainText("Your engagement status has been updated");

  await clearSession(page);
});

/**
 * AC-MSG-015-03 — No dismiss button anywhere in the notification feed.
 *
 * Given the CLIENT has 1 unread notification,
 * When they navigate to /notifications,
 * Then no "dismiss" or "mark as read" button is present (mark-read is on-view only).
 *
 * // AC-MSG-015-03 // ADR-003 // ADR-005
 */
test("AC-MSG-015-03 — no dismiss button in the notification feed", async ({ page, request }) => {
  await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
  await page.goto(`${PORTAL_URL}/notifications`);

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
 *   Viewing the linked engagement marks the notification read (no dismiss).
 *   The badge count reflects the read state after mark-read.
 *
 * Given the CLIENT has 1 unread notification linked to their engagement,
 * When they navigate to the linked engagement page,
 * Then markNotificationOnViewAction fires (automatic, no dismiss needed).
 * And when they reload the home page, the badge count decrements (reflecting the read state).
 *
 * NOTE: The count update is verified via page reload (the server re-fetches the badge count).
 * The real-time increment/decrement path (browser subscription) is not verifiable in e2e
 * without a real SSE/WebSocket provider — see DECISION-016-005-RT above.
 *
 * // AC-MSG-015-02 // AC-MSG-015-03 // AC-MSG-017-03 // ADR-003 // CS-TS-004 // CS-TS-001
 */
test("AC-MSG-015-02/03 and AC-MSG-017-03 — viewing linked engagement marks notification read; badge reflects it", async ({ page, request }) => {
  await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);

  // Capture initial badge count from the home page
  await page.goto(`${PORTAL_URL}/`);
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible();
  const initialCountStr = await badge.getAttribute("data-unread-count");
  const initialCount = Number(initialCountStr ?? "0");
  expect(initialCount).toBeGreaterThanOrEqual(1);

  // Navigate to the linked engagement page.
  // This triggers markNotificationOnViewAction on the server (AC-MSG-015-02).
  // No dismiss button — the mark-read fires automatically on page view (AC-MSG-015-03).
  await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);

  // Verify the engagement page loaded (we're on the right page)
  const engagementDetail = page.getByTestId("engagement-detail");
  await expect(engagementDetail).toBeVisible();

  // Navigate back to the home page and reload to get the updated server-side badge count.
  // AC-MSG-017-03: badge reflects the read state after mark-read.
  await page.goto(`${PORTAL_URL}/`);

  // After mark-read, the badge count should be 0 (only 1 notification was seeded).
  // If count = 0, the badge element is absent (the component returns null when count ≤ 0).
  // The definitive assertion: the count dropped by at least 1 OR the badge is absent.
  // DECISION (TASK-016-005): The badge element is conditionally rendered (absent when count ≤ 0).
  // Use isVisible() with no timeout to check presence; if absent, treat as count = 0.
  const badgeAfter = page.getByTestId("nav-unread-badge");
  const badgeVisible = await badgeAfter.isVisible();
  const countAfter = badgeVisible
    ? Number((await badgeAfter.getAttribute("data-unread-count")) ?? "0")
    : 0; // badge absent = count 0 → mark-read succeeded

  expect(
    countAfter,
    "[AC-MSG-017-03] Badge count must decrease after viewing the linked engagement",
  ).toBeLessThan(initialCount);

  await clearSession(page);
});

/**
 * AC-MSG-015-02: The "View" link in the notification feed leads to the linked item.
 *
 * Given the CLIENT has a notification with linkedItemType='engagement',
 * When they view the notification feed,
 * Then a "View" link is present for the notification (leads to the engagement page).
 *
 * // AC-MSG-015-02 // AC-MSG-015-01 // ADR-010
 */
test("AC-MSG-015-02 — notification has a View link to the linked engagement", async ({ page, request }) => {
  // First reset the notification to unread (in case a prior test ran mark-read)
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
  await page.goto(`${PORTAL_URL}/notifications`);

  // The "View" link for the seeded notification should be present.
  // DECISION (TASK-016-005): normalize IDs to lowercase for data-testid matching
  // (Prisma returns lowercase GUIDs; admin mssql pool returns UPPERCASE GUIDs).
  const notifIdLower = fixture.notificationId.toLowerCase();
  const engagementIdLower = fixture.engagementId.toLowerCase();
  const viewLink = page.getByTestId(`notification-link-${notifIdLower}`);
  await expect(viewLink).toBeVisible();
  await expect(viewLink).toContainText("View");

  // The href should point to the engagement page
  const href = await viewLink.getAttribute("href");
  expect(href?.toLowerCase()).toContain(`/engagements/${engagementIdLower}`);

  await clearSession(page);
});

/**
 * AC-MSG-012-03 — PUSH-WITHOUT-NAVIGATION: badge increments in real time without reload.
 *
 * This is the load-bearing regression test for BUG-016-001 / TASK-016-005b.
 *
 * Given a CLIENT with a known initial unread count (1 from the seeded notification),
 * When the portal home page is loaded and the SSE subscription is established,
 * And a new notification is emitted server-side (via /api/notifications/emit-test),
 * Then the unread-count badge increments WITHOUT a manual page reload.
 *
 * This test MUST fail on the old throwing-stub build (SupabaseRealtimeTransport + silent catch)
 * and MUST pass after TASK-016-005b (SseBrowserMockTransport + SSE bridge).
 *
 * DECISION-016-005b-RT:
 *   The e2e calls /api/notifications/emit-test (portal test-only endpoint, active when
 *   ALLOW_MOCK_REALTIME=true) to trigger transport.publish() in the server process.
 *   The SSE route (/api/notifications/stream) has a subscriber registered on the CLIENT's
 *   channel. publish() fans out to that subscriber, which writes the event to the SSE stream.
 *   SseBrowserMockTransport (in the browser) receives the SSE event and invokes the
 *   handleEvent callback in NotificationBadgeClient, which calls setUnreadCount(prev => prev + 1).
 *   The badge DOM updates without any navigation or page reload. // DECISION-016-005b-RT
 *
 * Also covers:
 *   AC-MSG-012-01 — notification surfaces without manual refresh (the feed + badge update on arrival)
 *   AC-MSG-012-02 — new notifications appear in real time
 *   AC-MSG-017-03 — badge updates on new arrival (real-time path, not just mark-read path)
 *
 * // AC-MSG-012-01 // AC-MSG-012-02 // AC-MSG-012-03 // AC-MSG-017-03
 * // DECISION-016-005b-RT // ADR-023 §2/§4/§6 // CS-GEN-001 // CS-GEN-003
 */
test("AC-MSG-012-03 — push-without-navigation: badge increments without reload (TASK-016-005b regression)", async ({ page }) => {
  // Reset the seeded notification to unread so the initial count is known (= 1).
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  // Step 1: Set up CLIENT session and load the portal home page.
  // The SSE EventSource in SseBrowserMockTransport connects to /api/notifications/stream.
  // We give the EventSource time to establish before emitting.
  // BUG-016-002 fix: use page.request (page-context-aware APIRequestContext) for
  //   setupClientSession. The standalone `request` fixture was removed from the test
  //   signature to prevent accidental use for auth-gated endpoint calls.
  await setupClientSession(page, page.request, FIXTURE_CLIENT_CLERK_ID);
  await page.goto(`${PORTAL_URL}/`);

  // Step 2: Capture the initial badge count (must be ≥ 1 from the seeded notification).
  // AC-MSG-017-02: badge shows unread count.
  const badge = page.getByTestId("nav-unread-badge");
  await expect(badge).toBeVisible();
  const initialCountAttr = await badge.getAttribute("data-unread-count");
  const initialCount = Number(initialCountAttr ?? "0");
  expect(
    initialCount,
    "[AC-MSG-012-03] Initial unread count must be ≥ 1 (seeded notification)",
  ).toBeGreaterThanOrEqual(1);

  // Step 3: Wait for the SSE subscription to be established.
  // The EventSource connects asynchronously; we wait for a brief moment to ensure the
  // subscription is registered in the server's in-process mock before we publish.
  // DECISION (TASK-016-005b): 500ms is sufficient for the EventSource handshake + server
  // subscription registration in the local docker-compose stack. // DECISION-016-005b-RT
  await page.waitForTimeout(500);

  // Step 4: Emit a notification server-side via the test-only endpoint.
  // /api/notifications/emit-test calls transport.publish() in the server process.
  // The MockNotificationTransport fans out to the SSE route's subscriber on this channel.
  //
  // BUG-016-002 fix: call the endpoint from WITHIN the browser page via page.evaluate(),
  //   so the browser's session cookie is automatically included in the fetch request.
  //   The standalone Playwright `request` fixture does NOT carry page.context() cookies —
  //   using it caused a middleware redirect (302 → /sign-in → 200 HTML) which Playwright
  //   followed and reported as ok(), but transport.publish() was never reached. // ADR-023
  //
  // DECISION-016-005b-RT (BUG-016-002 addendum):
  //   The emit-test route now derives the channel server-side from the authenticated session
  //   (resolveClientIdentity() + lookupUserDbId()). The request body contains only the event —
  //   NO channel field. The server publishes to "user:<User.id>" derived from the cookie.
  //   This eliminates the caller-supplied channel security vector. // DECISION-016-005b-RT
  //
  // The assertion INSIDE page.evaluate throws if the response is not OK — a redirect-to-sign-in
  //   (302 → 200 HTML) will now fail loudly rather than being silently treated as success.
  //   CS-GEN-001: channel/payload not logged here. // CS-GEN-001
  await page.evaluate(async () => {
    const res = await fetch("/api/notifications/emit-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // No "channel" field — the route derives the channel from the authenticated session.
        // DECISION-016-005b-RT // ADR-023
        event: {
          type: "notification.created",
          payload: { notificationId: "test-push-regression", notificationType: "engagement_status_changed" },
        },
      }),
    });
    // Assert inside the browser context — a future redirect-to-sign-in cannot read as green.
    // BUG-016-002: if res.ok is false, the route was not reached (auth gap). Throw loudly.
    if (!res.ok) {
      throw new Error(
        `[AC-MSG-012-03] /api/notifications/emit-test returned ${res.status} (not OK). ` +
          "Is ALLOW_MOCK_REALTIME=true set in the portal container? " +
          "Is the browser session cookie present? (BUG-016-002 fix verification)",
      );
    }
  });

  // Step 5: WITHOUT navigating or reloading, wait for the badge to increment.
  // expect.poll() retries the check until it passes or times out.
  // AC-MSG-012-03: the badge MUST increment without a manual refresh.
  // AC-MSG-012-01: the notification surfaces promptly after the triggering event.
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
          "is not delivering events to the browser. DECISION-016-005b-RT. // ADR-023 §6",
        timeout: 10_000,
        intervals: [100, 200, 300, 500, 1000],
      },
    )
    .toBeGreaterThan(initialCount);

  // Step 6: Cleanup — clear the session.
  await clearSession(page);
});

// ─── AC-MSG-014 Source-event → Client feed tests ──────────────────────────────
//
// These tests seed notifications with specific types (engagement_status_changed,
// deliverable_ready, engagement_request_accepted, engagement_request_declined)
// and verify they appear in the CLIENT's feed. The DB-level emission is proven at
// tier-3 (packages/db/src/source-event-wiring.integration.test.ts); these e2e tests
// prove the CLIENT sees them in the portal notification feed (tier-6).
//
// DECISION (TASK-016-007): The CLIENT fixture used here is the same FIXTURE_CLIENT_CLERK_ID
// (user_client_notif_feed_e2e_016_005). Notifications are seeded additively and cleaned up.
// The fixture's main engagement (seeded in beforeAll) is reused as the linkedItemId.
// Each test below seeds a notification, asserts it in the feed, then cleans it up via the pool.
//
// // AC-MSG-014-03 // AC-MSG-014-04 // AC-MSG-014-05 // AC-MSG-014-06 // ADR-012 // CS-GEN-003

/**
 * AC-MSG-014-03 — engagement_status_changed notification in CLIENT feed.
 *
 * Given a client with an active engagement,
 * When the accountant changes that engagement's status,
 * Then the client receives an in-portal notification of the status change.
 *
 * Tier-6 proof: seed the notification type + verify it appears in the portal feed.
 *
 * // AC-MSG-014-03 // ADR-003 // ADR-005 // CS-TS-001
 */
test("AC-MSG-014-03 — engagement_status_changed notification appears in the client notification feed", async ({ page, request }) => {
  // Reset the base fixture notification to unread (so the count is predictable)
  const pool = await getPool();
  await pool.request().input("id", fixture.notificationId).query(
    `UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`,
  );

  // Seed a status-change notification for this client
  const notifResult = await pool
    .request()
    .input("recipientUserId", fixture.userId)
    .input("engagementId", fixture.engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'engagement_status_changed',
         N'Your engagement status has changed to Review',
         N'The accountant moved your engagement to the Review stage.',
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id?.toLowerCase();
  if (!notificationId) throw new Error("[AC-MSG-014-03] Failed to seed engagement_status_changed notification");

  try {
    await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
    await page.goto(`${PORTAL_URL}/notifications`);

    // The feed must contain the notification (AC-MSG-014-03)
    const notifItem = page.getByTestId(`notification-item-${notificationId}`);
    await expect(
      notifItem,
      "[AC-MSG-014-03] engagement_status_changed notification must appear in the client portal feed",
    ).toBeVisible({ timeout: 10_000 });

    // The notification must have the correct type
    await expect(notifItem).toHaveAttribute("data-notification-type", "engagement_status_changed");

    // The title must match
    await expect(notifItem).toContainText("Your engagement status has changed to Review");

    await clearSession(page);
  } finally {
    // Cleanup the seeded notification
    await pool.request().input("id", notificationId).query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = @id`,
    ).catch(() => { /* ignore */ });
  }
});

/**
 * AC-MSG-014-04 — deliverable_ready notification in CLIENT feed.
 *
 * Given a client with an engagement,
 * When a deliverable is made ready for them,
 * Then the client receives an in-portal notification that a deliverable is ready.
 *
 * Tier-6 proof: seed the notification type + verify it appears in the portal feed.
 *
 * // AC-MSG-014-04 // ADR-003 // ADR-005 // CS-TS-001
 */
test("AC-MSG-014-04 — deliverable_ready notification appears in the client notification feed", async ({ page, request }) => {
  const pool = await getPool();

  // Seed a deliverable_ready notification for this client
  const notifResult = await pool
    .request()
    .input("recipientUserId", fixture.userId)
    .input("engagementId", fixture.engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'deliverable_ready',
         N'A deliverable is ready for you',
         N'Your tax return is now ready for review.',
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id?.toLowerCase();
  if (!notificationId) throw new Error("[AC-MSG-014-04] Failed to seed deliverable_ready notification");

  try {
    await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
    await page.goto(`${PORTAL_URL}/notifications`);

    // The feed must contain the notification (AC-MSG-014-04)
    const notifItem = page.getByTestId(`notification-item-${notificationId}`);
    await expect(
      notifItem,
      "[AC-MSG-014-04] deliverable_ready notification must appear in the client portal feed",
    ).toBeVisible({ timeout: 10_000 });

    // The notification must have the correct type
    await expect(notifItem).toHaveAttribute("data-notification-type", "deliverable_ready");

    // The title must match
    await expect(notifItem).toContainText("A deliverable is ready for you");

    await clearSession(page);
  } finally {
    await pool.request().input("id", notificationId).query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = @id`,
    ).catch(() => { /* ignore */ });
  }
});

/**
 * AC-MSG-014-05 — engagement_request_accepted notification in CLIENT feed.
 *
 * Given a prospective/returning client whose engagement request was accepted,
 * When the accountant accepts the request,
 * Then the client is notified their request was accepted (in-portal notification).
 *
 * Tier-6 proof: seed the notification type + verify it appears in the portal feed.
 *
 * // AC-MSG-014-05 // ADR-003 // ADR-005 // CS-TS-001
 */
test("AC-MSG-014-05 — engagement_request_accepted notification appears in the client notification feed", async ({ page, request }) => {
  const pool = await getPool();

  // Seed an accepted-request notification for this client
  const notifResult = await pool
    .request()
    .input("recipientUserId", fixture.userId)
    .input("engagementId", fixture.engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'engagement_request_accepted',
         N'Your request has been accepted',
         N'The accountant has accepted your engagement request.',
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id?.toLowerCase();
  if (!notificationId) throw new Error("[AC-MSG-014-05] Failed to seed engagement_request_accepted notification");

  try {
    await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
    await page.goto(`${PORTAL_URL}/notifications`);

    // The feed must contain the notification (AC-MSG-014-05)
    const notifItem = page.getByTestId(`notification-item-${notificationId}`);
    await expect(
      notifItem,
      "[AC-MSG-014-05] engagement_request_accepted notification must appear in the client portal feed",
    ).toBeVisible({ timeout: 10_000 });

    // The notification must have the correct type
    await expect(notifItem).toHaveAttribute("data-notification-type", "engagement_request_accepted");

    // The title must match
    await expect(notifItem).toContainText("Your request has been accepted");

    await clearSession(page);
  } finally {
    await pool.request().input("id", notificationId).query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = @id`,
    ).catch(() => { /* ignore */ });
  }
});

/**
 * AC-MSG-014-06 — engagement_request_declined notification in CLIENT feed.
 *
 * Given a prospective/returning client whose engagement request was declined,
 * When the accountant declines the request,
 * Then the client is notified their request was declined (in-portal notification).
 *
 * Tier-6 proof: seed the notification type + verify it appears in the portal feed.
 *
 * // AC-MSG-014-06 // ADR-003 // ADR-005 // CS-TS-001
 */
test("AC-MSG-014-06 — engagement_request_declined notification appears in the client notification feed", async ({ page, request }) => {
  const pool = await getPool();

  // Seed a declined-request notification for this client
  const notifResult = await pool
    .request()
    .input("recipientUserId", fixture.userId)
    .input("engagementId", fixture.engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'engagement_request_declined',
         N'Your request was not accepted',
         N'Unfortunately, the accountant was unable to accept your engagement request.',
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id?.toLowerCase();
  if (!notificationId) throw new Error("[AC-MSG-014-06] Failed to seed engagement_request_declined notification");

  try {
    await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);
    await page.goto(`${PORTAL_URL}/notifications`);

    // The feed must contain the notification (AC-MSG-014-06)
    const notifItem = page.getByTestId(`notification-item-${notificationId}`);
    await expect(
      notifItem,
      "[AC-MSG-014-06] engagement_request_declined notification must appear in the client portal feed",
    ).toBeVisible({ timeout: 10_000 });

    // The notification must have the correct type
    await expect(notifItem).toHaveAttribute("data-notification-type", "engagement_request_declined");

    // The title must match
    await expect(notifItem).toContainText("Your request was not accepted");

    await clearSession(page);
  } finally {
    await pool.request().input("id", notificationId).query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = @id`,
    ).catch(() => { /* ignore */ });
  }
});

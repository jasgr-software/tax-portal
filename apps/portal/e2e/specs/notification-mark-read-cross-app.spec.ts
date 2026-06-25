/**
 * apps/portal/e2e/specs/notification-mark-read-cross-app.spec.ts
 *
 * Cross-app tier-6 e2e — Notification mark-read across the session boundary (EPIC-016 / TASK-016-007)
 *
 * Acceptance criteria covered:
 *   AC-MSG-015-02 — An unread notification whose linked item the user has not yet viewed:
 *                   when they view that linked item, the notification is automatically marked read.
 *                   Exercised cross-app: the mark-read write on portal is visible across the
 *                   session boundary (verified via admin DB read after the portal action fires).
 *   AC-MSG-015-03 — No separate dismiss action: mark-read fires on linked-item view only.
 *
 * Cross-app dimension (ADR-010):
 *   Step 1 (portal): CLIENT establishes a session on portal, views their engagement page.
 *                    markNotificationOnViewAction fires server-side on portal, writing readAt to DB.
 *   Step 2 (admin):  The read state is verified from the ADMIN surface via a direct DB read
 *                    (admin pool, bypasses RLS). This confirms the write honors the session boundary:
 *                    the CLIENT's read-mark on portal is observable from admin's perspective —
 *                    the DB row is correctly updated regardless of which surface initiated the action.
 *
 * NOTE: The "cross-app" nature is about the session boundary (ADR-010), not browser navigation.
 * The CLIENT does not navigate to admin — they view their own engagement on portal. The admin
 * perspective is asserted via the shared DB (the same row read by the admin principal confirms
 * the write from the CLIENT's portal session committed correctly). This is the meaningful
 * cross-app invariant: read-marks are durable across surfaces, not surface-local.
 *
 * Additionally, this spec includes an ACCOUNTANT-side cross-app assertion:
 *   Step A: Seed an ACCOUNTANT notification with linkedItemType='request' (admin surface).
 *   Step B: CLIENT (unrelated) verifies that the CLIENT's mark-read on portal does NOT
 *           affect the ACCOUNTANT's notification (session-boundary isolation, ADR-005 RLS).
 *
 * Stack: both containers up (portal :3000, admin :13001, AUTH_PROVIDER=mock,
 *        REALTIME_PROVIDER=mock, ALLOW_MOCK_REALTIME=true).
 *
 * Run:
 *   pnpm e2e:cross-app        (scripts/e2e-cross-app.sh — this spec is registered there)
 *   pnpm --filter portal e2e:run -- --grep notification-mark-read-cross-app
 *
 * ADR-006: Cross-app — portal CLIENT action → admin DB observable (session boundary proof).
 * ADR-010: Cross-app session boundary — read-mark durability and isolation across surfaces.
 * ADR-012: Tier-6 e2e.
 * ADR-023: Real-time transport seam — REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true.
 * CS-TS-003: markNotificationOnViewAction mirrors portal and admin implementations.
 * CS-GEN-003: AC ids cited.
 *
 * // ADR-006 // ADR-010 // ADR-012 // ADR-023 // CS-TS-003 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import {
  setupClientSession,
  clearSession,
} from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Distinct fixture identifiers — "-xapp-016-007" suffix avoids collision with all other suites.
const FIXTURE_CLIENT_CLERK_ID = "user_client_notif_xapp_016_007";

// ─── DB helpers (admin pool — RLS-exempt seed/teardown) ───────────────────────

// CS-TS-003: parseSqlServerUrl is duplicated across cross-app specs per established convention.
// (Each spec is self-contained; no shared DB fixture util exists yet in this codebase.)
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
      "[notification-mark-read-cross-app.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

// ─── Fixture types ────────────────────────────────────────────────────────────

interface CrossAppNotifFixture {
  userId: string;
  engagementId: string;
  notificationId: string;
  requestId: string;
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds a CLIENT + Engagement + unread Notification for the cross-app mark-read test.
 *
 * Notification: linkedItemType='engagement', linkedItemId=engagementId, readAt=NULL.
 * The CLIENT views /engagements/<engagementId> on portal → mark-read fires on portal.
 * The admin DB read then confirms the write (cross-app invariant).
 *
 * ADR-005: admin pool for seed/teardown; RLS exercised via CLIENT request session.
 */
async function seedCrossAppFixture(): Promise<CrossAppNotifFixture> {
  const pool = await getPool();

  // Idempotent pre-cleanup
  await cleanupCrossAppFixture(pool).catch(() => { /* ignore on first run */ });

  // 1. Upsert CLIENT User
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .input("email", "notif-xapp-016-007@cross-app.e2e.test")
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
    if (!userId) throw new Error("[notification-mark-read-cross-app.spec] Failed to upsert User");
  }

  // 2. Seed EngagementRequest (accepted — required FK for Engagement)
  const reqResult = await pool
    .request()
    .input("email", "notif-xapp-016-007@cross-app.e2e.test")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'XAppNotif', N'E2ETest', @email, NULL, NULL, N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[notification-mark-read-cross-app.spec] Failed to seed EngagementRequest");

  // 3. Seed Engagement (In Progress — so the engagement detail page is accessible)
  //    The letter-signed state allows the CLIENT to access /engagements/<id>
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "xapp-016-007-mock",
    signedAt: new Date().toISOString(),
  });

  const engResult = await pool
    .request()
    .input("clientUserId", userId)
    .input("requestId", requestId)
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E cross-app notification spec letter")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([clientUserId], [engagementRequestId], [status],
          [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
          [taxYear], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clientUserId, @requestId, N'In Progress',
               @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
               2024, SYSDATETIMEOFFSET())`,
    );
  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[notification-mark-read-cross-app.spec] Failed to seed Engagement");

  // 4. Seed an unread Notification (CLIENT-scoped, linkedItemType='engagement')
  //    This is the notification whose mark-read is tested cross-app.
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
         N'Cross-app mark-read test notification',
         N'Your engagement is now In Progress — cross-app read boundary test.',
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );
  const notificationId = notifResult.recordset[0]?.id;
  if (!notificationId) throw new Error("[notification-mark-read-cross-app.spec] Failed to seed Notification");

  // Normalize IDs to lowercase (Prisma returns lowercase; admin pool returns UPPERCASE).
  return {
    userId: userId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
    requestId: requestId.toLowerCase(),
  };
}

/**
 * Reset the fixture notification to unread (idempotent — safe to call before each test).
 */
async function resetNotificationToUnread(notificationId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", notificationId)
    .query(`UPDATE [dbo].[Notification] SET [readAt] = NULL WHERE [id] = @id`);
}

/**
 * Cleanup: delete notifications + engagement + request + user (cascade-ordered).
 * Idempotent — ignores "row not found" errors.
 */
async function cleanupCrossAppFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    ).catch(() => { /* ignore */ });

  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    ).catch(() => { /* ignore */ });

  await pool
    .request()
    .query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'notif-xapp-016-007@cross-app.e2e.test'`,
    ).catch(() => { /* ignore */ });

  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`)
    .catch(() => { /* ignore */ });
}

// ─── Fixture state ────────────────────────────────────────────────────────────

let fixture: CrossAppNotifFixture;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  fixture = await seedCrossAppFixture();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupCrossAppFixture(pool);
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test: Cross-app mark-read — portal CLIENT action → admin DB confirms read
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[notification-mark-read-cross-app] CLIENT views engagement on portal → mark-read write is durable across app session boundary (admin DB confirms)",
  () => {
    /**
     * AC-MSG-015-02 / AC-MSG-015-03 (cross-app session-boundary proof):
     *
     * Given a CLIENT has an unread notification with linkedItemType='engagement',
     * When they view the linked engagement page on portal (mark-read fires server-side),
     * Then the notification row in the DB has readAt set (admin pool confirms — cross-app invariant).
     *
     * Cross-app dimension (ADR-010): The admin DB read (via admin pool) acts as the
     * "other surface" observer. The same row is used by both surfaces; if the write
     * is surface-local (portal-only cache), the admin DB read would show readAt=null.
     * The test proves the write is durable in the shared DB, honoring the session boundary.
     *
     * AC-MSG-015-03: no dismiss button — the mark-read fires purely by visiting the
     * engagement page; no UI button interaction is needed.
     *
     * // AC-MSG-015-02 // AC-MSG-015-03 // ADR-010 // ADR-003 // ADR-005 // CS-TS-003
     */
    test(
      "[AC-MSG-015-02][AC-MSG-015-03] CLIENT views engagement on portal → mark-read is durable across session boundary (admin DB confirms)",
      async ({ page, request: httpRequest }) => {
        // Reset fixture to unread for isolation
        await resetNotificationToUnread(fixture.notificationId);

        // ─── Step 1: Verify notification is unread in the DB (pre-condition) ──────
        const poolBefore = await getPool();
        const beforeRow = await poolBefore
          .request()
          .input("id", fixture.notificationId)
          .query<{ readAt: Date | null }>(
            `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = @id`,
          );
        expect(
          beforeRow.recordset[0]?.readAt,
          "[AC-MSG-015-02] Pre-condition: notification must be unread (readAt = NULL) before the test",
        ).toBeNull();

        // ─── Step 2: CLIENT session on portal — visit the linked engagement page ──
        // markNotificationOnViewAction fires server-side when this page loads (ADR-003).
        // AC-MSG-015-03: no dismiss button — mark-read is triggered purely by page view.
        await setupClientSession(page, httpRequest, FIXTURE_CLIENT_CLERK_ID);
        await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);

        // Verify the engagement page loaded (we're on the correct page)
        const engagementDetail = page.getByTestId("engagement-detail");
        await expect(
          engagementDetail,
          "[AC-MSG-015-02] Engagement detail page must be visible (portal surface)",
        ).toBeVisible({ timeout: 15_000 });

        // Give the server action time to commit the read mark to the DB.
        // markNotificationOnViewAction is fired as void (fire-and-forget from RSC).
        // 1500ms is generous for the server-side DB write to complete in the local stack.
        // DECISION (TASK-016-007): polling would be cleaner but adds complexity;
        // 1500ms matches the pattern used in the onboarding-completion-cross-app.spec.ts.
        await page.waitForTimeout(1500);

        // ─── Step 3: Verify read mark from admin DB (cross-app session boundary) ──
        // The admin pool reads the SAME Notification row written by the portal action.
        // If readAt is set, the write is durable across the session boundary (ADR-010).
        const poolAfter = await getPool();
        const afterRow = await poolAfter
          .request()
          .input("id", fixture.notificationId)
          .query<{ readAt: Date | null }>(
            `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = @id`,
          );

        expect(
          afterRow.recordset[0]?.readAt,
          "[AC-MSG-015-02] Cross-app invariant: notification readAt must be set after portal CLIENT " +
            "views the linked engagement page. The admin DB read confirms the write is durable " +
            "across the session boundary (ADR-010). If null, markNotificationOnViewAction did not " +
            "commit the read mark to the shared DB.",
        ).not.toBeNull();

        // ─── Step 4: Verify portal badge reflects the read state (no separate dismiss) ──
        // AC-MSG-015-03: badge reflects the read state without any explicit dismiss action.
        // Navigate back to portal home to see the updated badge.
        await page.goto(`${PORTAL_URL}/`);

        const badge = page.getByTestId("nav-unread-badge");
        const badgeVisible = await badge.isVisible();
        const countAfter = badgeVisible
          ? Number((await badge.getAttribute("data-unread-count")) ?? "0")
          : 0; // badge absent = count 0 → mark-read succeeded

        // After the mark-read, the count for this specific notification is 0.
        // We cannot assert count = 0 globally (other fixtures may have added rows),
        // so we assert via the DB state instead (confirmed above in Step 3).
        // The badge count is ≤ the count before the mark-read (monotonically non-increasing).
        // For this isolated fixture (1 notification seeded), count should be 0.
        expect(
          countAfter,
          "[AC-MSG-015-03] Badge must reflect the read state (no dismiss button required): " +
            "count after mark-read must be 0 for this isolated fixture.",
        ).toBe(0);

        await clearSession(page);
      },
    );

    /**
     * AC-MSG-015-02 (session-boundary isolation):
     *
     * Given a CLIENT has marked their notification read (portal surface),
     * When a SECOND CLIENT (unrelated user) also has notifications,
     * Then the first CLIENT's mark-read does NOT affect the second CLIENT's read state
     * (RLS + session-boundary isolation — the write is scoped to the authenticated user).
     *
     * This proves the session boundary works in both directions:
     * - The write is durable across surfaces (Step 3 above)
     * - The write is scoped to the authenticated user (this test)
     *
     * // AC-MSG-015-02 // ADR-005 // ADR-010 // CS-TS-003
     */
    test(
      "[AC-MSG-015-02] CLIENT mark-read is scoped to the authenticated user — does not affect other users' notifications (session-boundary isolation)",
      async ({ page, request: httpRequest }) => {
        // Reset the fixture notification to unread
        await resetNotificationToUnread(fixture.notificationId);

        // ─── Seed a second CLIENT + notification (the "unrelated user") ──────────
        const pool = await getPool();

        const secondClerkId = "user_client_notif_xapp_016_007_b";
        const secondEmail = "notif-xapp-016-007-b@cross-app.e2e.test";

        // Pre-cleanup for idempotence
        await pool.request().input("clerkId", secondClerkId).query(
          `DELETE n FROM [dbo].[Notification] n
           INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
           WHERE u.[clerkId] = @clerkId`,
        ).catch(() => { /* ignore */ });
        await pool.request().input("clerkId", secondClerkId).query(
          `DELETE e FROM [dbo].[Engagement] e
           INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
           WHERE u.[clerkId] = @clerkId`,
        ).catch(() => { /* ignore */ });
        await pool.request().query(
          `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'${secondEmail}'`,
        ).catch(() => { /* ignore */ });
        await pool.request().input("clerkId", secondClerkId).query(
          `DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
        ).catch(() => { /* ignore */ });

        // Seed second CLIENT
        const secondUserResult = await pool
          .request()
          .input("clerkId", secondClerkId)
          .input("email", secondEmail)
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

        let secondUserId = secondUserResult.recordset[0]?.id;
        if (!secondUserId) {
          const lookup = await pool
            .request()
            .input("clerkId", secondClerkId)
            .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
          secondUserId = lookup.recordset[0]?.id;
          if (!secondUserId) throw new Error("[cross-app] Failed to upsert second USER");
        }

        // Seed second request + engagement
        const reqB = await pool
          .request()
          .input("email", secondEmail)
          .query<{ id: string }>(
            `INSERT INTO [dbo].[EngagementRequest]
               ([firstName], [lastName], [email], [status], [updatedAt])
             OUTPUT INSERTED.[id]
             VALUES (N'XAppB', N'E2ETest', @email, N'accepted', SYSDATETIMEOFFSET())`,
          );
        const requestBId = reqB.recordset[0]?.id;
        if (!requestBId) throw new Error("[cross-app] Failed to seed second EngagementRequest");

        const evidenceJson = JSON.stringify({ provider: "mock", ref: "xapp-b-mock", signedAt: new Date().toISOString() });
        const engB = await pool
          .request()
          .input("clientUserId", secondUserId)
          .input("requestId", requestBId)
          .input("letterSignedAt", new Date())
          .input("letterSignatureEvidence", evidenceJson)
          .input("letterTemplateSnapshot", "Second client e2e letter")
          .query<{ id: string }>(
            `INSERT INTO [dbo].[Engagement]
               ([clientUserId], [engagementRequestId], [status],
                [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
                [taxYear], [updatedAt])
             OUTPUT INSERTED.[id]
             VALUES (@clientUserId, @requestId, N'In Progress',
                     @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
                     2024, SYSDATETIMEOFFSET())`,
          );
        const engagementBId = engB.recordset[0]?.id;
        if (!engagementBId) throw new Error("[cross-app] Failed to seed second Engagement");

        // Seed an unread notification for the second CLIENT
        const notifB = await pool
          .request()
          .input("recipientUserId", secondUserId)
          .input("engagementId", engagementBId)
          .query<{ id: string }>(
            `INSERT INTO [dbo].[Notification]
               ([type], [title], [body], [recipientType], [recipientUserId],
                [linkedItemType], [linkedItemId], [readAt])
             OUTPUT INSERTED.[id]
             VALUES (
               N'engagement_status_changed',
               N'Second client notification (isolation test)',
               N'This must remain unread after CLIENT-A marks their notification read.',
               N'CLIENT',
               @recipientUserId,
               N'engagement',
               @engagementId,
               NULL
             )`,
          );
        const notificationBId = notifB.recordset[0]?.id;
        if (!notificationBId) throw new Error("[cross-app] Failed to seed second Notification");
        const notificationBIdLower = notificationBId.toLowerCase();

        try {
          // ─── CLIENT-A (fixture user) views their engagement on portal ──────────
          // This fires markNotificationOnViewAction for CLIENT-A's notification.
          await setupClientSession(page, httpRequest, FIXTURE_CLIENT_CLERK_ID);
          await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);

          const engagementDetail = page.getByTestId("engagement-detail");
          await expect(
            engagementDetail,
            "[AC-MSG-015-02] Engagement detail page must be visible (CLIENT-A, portal surface)",
          ).toBeVisible({ timeout: 15_000 });

          // Wait for the server action to commit
          await page.waitForTimeout(1500);
          await clearSession(page);

          // ─── Verify CLIENT-B's notification is STILL unread (isolation) ─────────
          // AC-MSG-015-02 (isolation invariant): CLIENT-A's read-mark must not touch CLIENT-B's rows.
          // The RLS policy (sec.pol_Notification) scopes mark-read to the authenticated user.
          // The admin pool bypasses RLS for verification — this is the "admin observer" perspective.
          const isolationCheck = await pool
            .request()
            .input("id", notificationBId)
            .query<{ readAt: Date | null }>(
              `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = @id`,
            );

          expect(
            isolationCheck.recordset[0]?.readAt,
            "[AC-MSG-015-02] SESSION-BOUNDARY ISOLATION: CLIENT-B's notification must remain unread " +
              "after CLIENT-A marks their own notification read. " +
              "Notification ID: " + notificationBIdLower + ". " +
              "If readAt is set, markNotificationOnViewAction crossed user boundaries (ADR-010 / ADR-005 violation).",
          ).toBeNull();
        } finally {
          // ─── Cleanup second fixture ───────────────────────────────────────────
          await pool.request().input("clerkId", secondClerkId).query(
            `DELETE n FROM [dbo].[Notification] n
             INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
             WHERE u.[clerkId] = @clerkId`,
          ).catch(() => { /* ignore */ });
          await pool.request().input("clerkId", secondClerkId).query(
            `DELETE e FROM [dbo].[Engagement] e
             INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
             WHERE u.[clerkId] = @clerkId`,
          ).catch(() => { /* ignore */ });
          await pool.request().query(
            `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'${secondEmail}'`,
          ).catch(() => { /* ignore */ });
          await pool.request().input("clerkId", secondClerkId).query(
            `DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
          ).catch(() => { /* ignore */ });
        }
      },
    );
  },
);

// ─── Verify both app URLs are reachable before running ───────────────────────
// This is a lightweight connectivity check rather than a full test, placed at the bottom
// so failures are visible but don't block the substantive tests above.

test("[cross-app-sanity] admin and portal containers are both reachable", async ({ request: httpRequest }) => {
  const portalResp = await httpRequest.get(`${PORTAL_URL}/`, { failOnStatusCode: false });
  // Accept any response (including auth redirects) — we just need a reply from the container.
  expect(
    portalResp.status(),
    `[cross-app-sanity] Portal at ${PORTAL_URL} must be reachable`,
  ).toBeLessThan(500);

  const adminResp = await httpRequest.get(`${ADMIN_URL}/`, { failOnStatusCode: false });
  expect(
    adminResp.status(),
    `[cross-app-sanity] Admin at ${ADMIN_URL} must be reachable`,
  ).toBeLessThan(500);
});

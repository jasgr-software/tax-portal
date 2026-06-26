/**
 * apps/admin/e2e/demo/epic-018-walkthrough.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-018 Email-fallback gallery (admin / Tax Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's email
 * suppression + feed-intact journeys against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to docs/demos/EPIC-018/.
 * NON-GATING.
 *
 * Persona:   jane-accountant (.planning/personas/jane-accountant.md)
 * Flow:      flow-notification-feed — email-fallback branch (EPIC-018)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-018 admin surface — screenshots 01–03):
 *   01-AC-MSG-010-01-admin-settings-email-enabled.png
 *       — jane opens /settings/notifications; toggle shows email ENABLED (AC-MSG-010-01 start state)
 *   02-AC-MSG-010-01-admin-settings-email-suppressed.png
 *       — jane turns off her email; toggle shows SUPPRESSED (AC-MSG-010-01 result)
 *   03-AC-MSG-010-03-admin-feed-intact-after-suppression.png
 *       — after suppression the in-portal notification feed (badge + indicator) still shows
 *         her unread activity — email suppression never touches Notification rows (AC-MSG-010-03)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-018/ so prior-epic
 * PNGs are not rewritten. The DEMO_DIR const is the ONLY path used. // CS-GEN-001
 *
 * ADR-006: Admin surface only (Tax Portal) for this spec. // ADR-006
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * CS-GEN-002: additive; no existing demo spec removed or narrowed. // CS-GEN-002
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   pnpm --filter admin e2e:demo
 *   pnpm --filter admin e2e:demo -- --grep "epic-018"
 *
 * // ADR-006 // ADR-012 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-018 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-018/.
// This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-018");
const shot = (file: string) => path.join(DEMO_DIR, file);

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Deterministic fixture clerkIds — "-demo-018-jane" suffix avoids collision with e2e gate specs.
// CS-GEN-001: no real PII — test-only identifiers.
const JANE_CLERK_ID = "user_accountant_demo_018_jane";

// ─── DB helpers (admin pool — RLS-exempt seed/teardown) ───────────────────────

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
      "[epic-018-walkthrough.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface DemoAdminEpic018Fixture {
  requestId: string;
  notifId: string;
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds the admin demo-018 fixture:
 *   1. Upsert jane ACCOUNTANT User row (emailNudgeEnabled=true — default-on, reset before each run).
 *   2. EngagementRequest (linked item for the notification).
 *   3. Unread ACCOUNTANT notification (so the feed badge shows activity).
 *
 * DECISION (TASK-018-006): We reset emailNudgeEnabled=true before each screen so the toggle
 * always starts in the "enabled" state. The suppression screen (02) clicks the toggle live.
 * Screen 03 re-seeds after suppression to verify the feed is still intact.
 *
 * // AC-MSG-010-01 // AC-MSG-010-03 // CS-GEN-001
 */
async function seedDemo018AdminFixture(): Promise<DemoAdminEpic018Fixture> {
  const pool = await getPool();

  // ── Idempotent pre-cleanup ──────────────────────────────────────────────────
  await pool.request().query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[EngagementRequest] r ON n.[linkedItemId] = r.[id]
     WHERE r.[email] = N'e2e-demo-018-jane@epic-018-walkthrough.demo.e2e.test'
     AND n.[recipientType] = N'ACCOUNTANT'`,
  ).catch(() => { /* ignore */ });
  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'e2e-demo-018-jane@epic-018-walkthrough.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });

  // ── 1. Upsert jane ACCOUNTANT User (emailNudgeEnabled=true — reset to default-on) ──
  // AC-MSG-011-01: default-on; the toggle starts enabled. // AC-MSG-011-01
  await pool.request().query(`
    MERGE [dbo].[User] AS target
    USING (SELECT N'${JANE_CLERK_ID}' AS [clerkId]) AS source
      ON target.[clerkId] = source.[clerkId]
    WHEN MATCHED THEN
      UPDATE SET
        [emailNudgeEnabled] = 1,
        [updatedAt]         = SYSDATETIMEOFFSET()
    WHEN NOT MATCHED THEN
      INSERT ([clerkId], [email], [role], [emailNudgeEnabled], [updatedAt])
      VALUES (
        N'${JANE_CLERK_ID}',
        N'jane-demo-018@example-accountant.com',
        N'ACCOUNTANT',
        1,
        SYSDATETIMEOFFSET()
      );
  `);

  // ── 2. Seed EngagementRequest (linked item for the notification) ─────────────
  const reqResult = await pool
    .request()
    .input("email", "e2e-demo-018-jane@epic-018-walkthrough.demo.e2e.test")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [message], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'JaneDemo018', N'AccountantFeed', @email, 'pending',
               N'Client uploaded 2024-Tax-Return.pdf to engagement', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[epic-018-walkthrough.demo.spec] Failed to seed EngagementRequest");

  // ── 3. Seed unread ACCOUNTANT notification (shared channel) ─────────────────
  //    recipientType='ACCOUNTANT', recipientUserId=null (shared accountant channel)
  //    AC-MSG-013-03: document_uploaded notification for the accountant.
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
         N'Your client uploaded 2024-Tax-Return.pdf to their engagement.',
         N'ACCOUNTANT',
         NULL,
         N'request',
         @requestId,
         @requestId,
         NULL
       )`,
    );
  const notifId = notifResult.recordset[0]?.id;
  if (!notifId) throw new Error("[epic-018-walkthrough.demo.spec] Failed to seed ACCOUNTANT notification");

  return {
    requestId: requestId.toLowerCase(),
    notifId: notifId.toLowerCase(),
  };
}

/**
 * Cleanup all seeded rows in reverse FK order.
 */
async function cleanupDemo018AdminFixture(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[EngagementRequest] r ON n.[linkedItemId] = r.[id]
     WHERE r.[email] = N'e2e-demo-018-jane@epic-018-walkthrough.demo.e2e.test'
     AND n.[recipientType] = N'ACCOUNTANT'`,
  ).catch(() => { /* ignore */ });
  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'e2e-demo-018-jane@epic-018-walkthrough.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });
  // Reset jane's emailNudgeEnabled to default-on so subsequent runs start clean.
  await pool.request().query(
    `UPDATE [dbo].[User] SET [emailNudgeEnabled]=1, [updatedAt]=SYSDATETIMEOFFSET()
     WHERE [clerkId] = N'${JANE_CLERK_ID}'`,
  ).catch(() => { /* ignore */ });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupDemo018AdminFixture();
  await closePool();
});

// ─── Screen 01: Settings page — email ENABLED (AC-MSG-010-01 start state) ─────

test(
  "[AC-MSG-010-01] @demo 01 — jane-accountant: notification settings page shows email ENABLED",
  async ({ page, request }) => {
    // Screen 01: jane opens /settings/notifications.
    // The email suppression toggle shows email ENABLED (the default-on state).
    // AC-MSG-010-01: the accountant can see and control her email preference.
    // Screenshot: /settings/notifications with toggle showing email enabled.

    test.setTimeout(30_000);

    await seedDemo018AdminFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/settings/notifications`);
      await page.waitForLoadState("load", { timeout: 15_000 });

      // The notification settings page must be visible (AC-MSG-010-01)
      const settingsPage = page.getByTestId("notification-settings-page");
      await expect(
        settingsPage,
        "[AC-MSG-010-01] notification-settings-page must be visible",
      ).toBeVisible({ timeout: 10_000 });

      // The toggle must show email ENABLED (default-on, emailNudgeEnabled=true)
      // AC-MSG-011-01: email is on by default — no opt-in step for the accountant.
      const toggle = page.getByTestId("email-suppression-toggle");
      await expect(
        toggle,
        "[AC-MSG-010-01] email-suppression-toggle must be visible on the settings page",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        toggle,
        "[AC-MSG-010-01] toggle must show email ENABLED (aria-checked=true) on initial load",
      ).toHaveAttribute("aria-checked", "true");

      // Screenshot 01: settings page with email enabled toggle.
      await page.screenshot({
        path: shot("01-AC-MSG-010-01-admin-settings-email-enabled.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemo018AdminFixture();
    }
  },
);

// ─── Screen 02: Settings page — jane turns off email (AC-MSG-010-01) ──────────

test(
  "[AC-MSG-010-01] @demo 02 — jane-accountant: turns off her email via the settings toggle",
  async ({ page, request }) => {
    // Screen 02: jane clicks the toggle to suppress (turn off) her email notifications.
    // AC-MSG-010-01: the accountant can turn off her own email notifications entirely.
    // Screenshot: /settings/notifications with toggle showing email SUPPRESSED.

    test.setTimeout(30_000);

    await seedDemo018AdminFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/settings/notifications`);
      await page.waitForLoadState("load", { timeout: 15_000 });

      const settingsPage = page.getByTestId("notification-settings-page");
      await expect(
        settingsPage,
        "[AC-MSG-010-01] notification-settings-page must be visible",
      ).toBeVisible({ timeout: 10_000 });

      const toggle = page.getByTestId("email-suppression-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });

      // Click to suppress (turn off) email notifications.
      // AC-MSG-010-01: the toggle calls setOwnEmailNudgeSuppressionAction(suppress=true).
      await toggle.click();

      // The toggle must now show SUPPRESSED (aria-checked=false, data-email-enabled=false).
      await expect(
        toggle,
        "[AC-MSG-010-01] toggle must show SUPPRESSED (aria-checked=false) after click",
      ).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
      await expect(
        toggle,
        "[AC-MSG-010-01] toggle must show data-email-enabled=false after suppression",
      ).toHaveAttribute("data-email-enabled", "false", { timeout: 10_000 });

      // The descriptive text must confirm email is suppressed.
      const toggleContainer = page.getByTestId("email-suppression-toggle-container");
      await expect(
        toggleContainer,
        "[AC-MSG-010-01] container must describe the suppressed state",
      ).toContainText("Email notifications are suppressed", { timeout: 10_000 });

      // Screenshot 02: settings page with email suppressed after toggle click.
      await page.screenshot({
        path: shot("02-AC-MSG-010-01-admin-settings-email-suppressed.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemo018AdminFixture();
    }
  },
);

// ─── Screen 03: In-portal feed intact after suppression (AC-MSG-010-03) ───────

test(
  "[AC-MSG-010-03] @demo 03 — jane-accountant: in-portal feed still shows activity after email suppression",
  async ({ page, request }) => {
    // Screen 03: after suppressing her email, jane navigates to /requests.
    // The NotificationsIndicator (in-portal feed) still shows her unread activity.
    // AC-MSG-010-03: email suppression never removes or touches Notification rows.
    // The in-portal feed is always the authoritative record (AC-MSG-007-03).
    // Screenshot: /requests with notifications-indicator and seeded notification visible.

    test.setTimeout(45_000);

    const fixture = await seedDemo018AdminFixture();

    try {
      // Suppress the accountant's email via the settings toggle (simulates AC-MSG-010-01 pre-state).
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/settings/notifications`);
      await page.waitForLoadState("load", { timeout: 15_000 });

      const settingsPage = page.getByTestId("notification-settings-page");
      await expect(settingsPage).toBeVisible({ timeout: 10_000 });

      const toggle = page.getByTestId("email-suppression-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      // Only click if currently enabled (idempotent: may already be suppressed from prior test).
      const currentEnabled = await toggle.getAttribute("aria-checked");
      if (currentEnabled === "true") {
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-checked", "false", { timeout: 10_000 });
      }

      // Navigate to /requests — the NotificationsIndicator (in-portal feed) is rendered here.
      // Use "load" (not "networkidle") — the admin layout keeps SSE connections open which
      // prevents networkidle from ever being reached. Same fix as accountant-email-suppression.spec.ts.
      await page.goto(`${ADMIN_URL}/requests`);
      await page.waitForLoadState("load", { timeout: 15_000 });

      // The in-portal notification feed (indicator) must be visible (AC-MSG-010-03).
      // Email suppression must NOT remove in-portal notifications.
      const notifIndicator = page.getByTestId("notifications-indicator");
      await expect(
        notifIndicator,
        "[AC-MSG-010-03] notifications-indicator must be visible on /requests after email suppression",
      ).toBeVisible({ timeout: 10_000 });

      // The seeded notification must appear in the feed — email suppression leaves Notification rows intact.
      // AC-MSG-010-03: the in-portal feed is authoritative regardless of email preference.
      const notifItem = page.getByTestId(`notification-item-${fixture.notifId}`);
      await expect(
        notifItem,
        "[AC-MSG-010-03] seeded notification must be visible in the in-portal feed after email suppression",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 03: /requests page with notifications-indicator showing activity
      // even after email is suppressed — the feed is intact (AC-MSG-010-03).
      await page.screenshot({
        path: shot("03-AC-MSG-010-03-admin-feed-intact-after-suppression.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemo018AdminFixture();
    }
  },
);

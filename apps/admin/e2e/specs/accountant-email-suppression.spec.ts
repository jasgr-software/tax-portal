/**
 * apps/admin/e2e/specs/accountant-email-suppression.spec.ts
 *
 * Tier-6 e2e — Accountant email-digest suppression toggle (EPIC-018 / TASK-018-004)
 *
 * Acceptance criteria covered:
 *   AC-MSG-010-01 — The accountant can turn off her own email notifications entirely via
 *                   the /settings/notifications toggle on apps/admin. The preference persists.
 *
 * Strategy:
 *   1. Upsert the demo ACCOUNTANT User row (demo_usr_jane_accountant) via admin pool;
 *      reset emailNudgeEnabled=true (default-on) before each test run.
 *   2. Set up an ACCOUNTANT session (mock cookie, AUTH_PROVIDER=mock).
 *   3. Navigate to /settings/notifications.
 *   4. Assert the toggle initially shows "email enabled" state.
 *   5. Click the toggle to turn off email notifications (suppress=true).
 *   6. Assert the UI reflects the suppressed state immediately.
 *   7. Reload the page to verify the preference persists (server re-reads the DB).
 *   8. Assert the toggle still shows suppressed after reload.
 *   9. Teardown: reset emailNudgeEnabled=true so the accountant is in the default state.
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_BASE_URL / ADMIN_PORT env).
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep accountant-email-suppression
 *
 * ADR-003: SESSION_CONTEXT set via mock session; DB write via withRequestContext.
 * ADR-005: own-row isolation enforced by WHERE clerkId in setEmailNudgePreferenceForCurrentUser.
 * ADR-006: Admin surface only (apps/admin). // ADR-006
 * ADR-012: Tier-6 e2e. // ADR-012
 * CS-TS-004: server action resolves identity from cookie + guards ACCOUNTANT role. // CS-TS-004
 * CS-TS-001: write through withRequestContext (SESSION_CONTEXT set). // CS-TS-001
 * CS-GEN-001: no PII in test data beyond necessary fixture identifiers. // CS-GEN-001
 * CS-GEN-003: AC ids and governing keys cited. // CS-GEN-003
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-012
 * // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// ─── URL resolution ────────────────────────────────────────────────────────────

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Fixture accountant identity ──────────────────────────────────────────────

/**
 * The seeded ACCOUNTANT clerkId — matches the demo_usr_jane_accountant seed row.
 * See db/seed/demo/clients.ts seedAccountant().
 *
 * // TASK-018-004: task spec requires use of the seeded demo accountant identity. // CS-GEN-003
 */
const FIXTURE_ACCOUNTANT_CLERK_ID = "demo_usr_jane_accountant";

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ─────────────

/**
 * Parse a sqlserver:// URL into mssql config (copied from notification-feed.spec.ts pattern).
 * Avoids importing from packages/db to keep the e2e layer self-contained.
 */
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
      "[accountant-email-suppression.spec] DATABASE_URL_ADMIN is not set " +
        "(required for fixture setup/teardown).",
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

/**
 * Upsert the demo ACCOUNTANT User row with emailNudgeEnabled=1 (default-on).
 *
 * Idempotent: creates the row if absent, resets emailNudgeEnabled if present.
 * Mirrors db/seed/demo/clients.ts seedAccountant() pattern.
 *
 * ADR-005: admin pool — RLS-exempt for seed/teardown writes. // ADR-005
 * CS-GEN-001: no PII logged (email is a fixed fixture address). // CS-GEN-001
 */
async function resetAccountantFixture(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    MERGE [dbo].[User] AS target
    USING (SELECT N'${FIXTURE_ACCOUNTANT_CLERK_ID}' AS [clerkId]) AS source
      ON target.[clerkId] = source.[clerkId]
    WHEN MATCHED THEN
      UPDATE SET
        [emailNudgeEnabled] = 1,
        [updatedAt]         = SYSDATETIMEOFFSET()
    WHEN NOT MATCHED THEN
      INSERT ([clerkId], [email], [role], [emailNudgeEnabled], [updatedAt])
      VALUES (
        N'${FIXTURE_ACCOUNTANT_CLERK_ID}',
        N'jane@example-accountant.com',
        N'ACCOUNTANT',
        1,
        SYSDATETIMEOFFSET()
      );
  `);
}

/**
 * Read the current emailNudgeEnabled value from the DB for the fixture accountant.
 * Used to verify the preference persists after the toggle action.
 *
 * ADR-005: admin pool — RLS-exempt for fixture reads. // ADR-005
 */
async function readEmailNudgeEnabled(): Promise<boolean | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<{ emailNudgeEnabled: boolean }>(
      `SELECT [emailNudgeEnabled]
       FROM   [dbo].[User]
       WHERE  [clerkId] = N'${FIXTURE_ACCOUNTANT_CLERK_ID}'`,
    );
  const row = result.recordset[0];
  return row?.emailNudgeEnabled ?? null;
}

// ─── Suite setup / teardown ───────────────────────────────────────────────────

test.beforeAll(async () => {
  // Ensure the demo accountant row exists and emailNudgeEnabled=true (clean state).
  await resetAccountantFixture();
});

test.afterAll(async () => {
  // Restore default-on state so other suites / manual runs start clean.
  await resetAccountantFixture();
  await closePool();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * [AC-MSG-010-01] Accountant turns off her own email notifications via the settings UI.
 *
 * Given the accountant has email notifications enabled (default state),
 * When she navigates to /settings/notifications and clicks the toggle,
 * Then the toggle reflects the suppressed state immediately,
 * And the preference persists on page reload.
 *
 * This is the primary e2e proof of AC-MSG-010-01.
 *
 * // AC-MSG-010-01 // CS-TS-004 // CS-TS-001 // ADR-003 // ADR-006 // ADR-012
 */
test(
  "AC-MSG-010-01 — accountant turns off her own email notifications via the settings toggle; preference persists",
  async ({ page, request }) => {
    // ── Step 1: Establish ACCOUNTANT session ───────────────────────────────────
    // CS-TS-004: mock session sets the ACCOUNTANT role in the signed cookie.
    // The server action reads this cookie to verify identity before any DB call.
    // // CS-TS-004 // ADR-003
    await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);

    // ── Step 2: Navigate to /settings/notifications ────────────────────────────
    await page.goto(`${ADMIN_URL}/settings/notifications`);

    // Assert the page loaded (defense-in-depth: auth middleware + page guard).
    const settingsPage = page.getByTestId("notification-settings-page");
    await expect(settingsPage).toBeVisible({ timeout: 10_000 });

    // ── Step 3: Assert initial "email enabled" state ───────────────────────────
    const toggle = page.getByTestId("email-suppression-toggle");
    await expect(toggle).toBeVisible({ timeout: 10_000 });

    // The toggle is a <button role="switch"> with aria-checked=true when email is enabled.
    // data-email-enabled="true" when emailNudgeEnabled=true.
    await expect(toggle).toHaveAttribute("data-email-enabled", "true");
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    // The descriptive text should confirm email is enabled.
    const toggleContainer = page.getByTestId("email-suppression-toggle-container");
    await expect(toggleContainer).toContainText("Email notifications are enabled");

    // ── Step 4: Click the toggle to suppress (turn off) email notifications ────
    // AC-MSG-010-01: the accountant turns off her email via the UI.
    // The action calls setOwnEmailNudgeSuppressionAction(suppress=true).
    // CS-TS-004: server action reads the ACCOUNTANT cookie → roles guard → writes.
    // CS-TS-001: write goes through withRequestContext → setEmailNudgePreferenceForCurrentUser(false).
    // // AC-MSG-010-01 // CS-TS-004 // CS-TS-001
    await toggle.click();

    // ── Step 5: Assert the UI immediately reflects the suppressed state ─────────
    // The EmailSuppressionToggle optimistically updates state via useTransition.
    // After the server action completes, data-email-enabled should be "false".
    await expect(toggle).toHaveAttribute("data-email-enabled", "false", { timeout: 10_000 });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggleContainer).toContainText("Email notifications are suppressed");

    // ── Step 6: Reload the page — verify the preference persists ───────────────
    // The server re-reads emailNudgeEnabled from the DB on each page render.
    // AC-MSG-010-01: the suppressed preference must survive a full page reload.
    // // AC-MSG-010-01
    // Use "load" (not "networkidle") — the admin layout keeps SSE connections open
    // which prevents networkidle from ever being reached (correct admin behavior).
    await page.reload();
    await page.waitForLoadState("load");

    const toggleAfterReload = page.getByTestId("email-suppression-toggle");
    await expect(toggleAfterReload).toBeVisible({ timeout: 10_000 });

    // After reload, the toggle must still show suppressed — the DB write persisted.
    await expect(toggleAfterReload).toHaveAttribute("data-email-enabled", "false");
    await expect(toggleAfterReload).toHaveAttribute("aria-checked", "false");

    const containerAfterReload = page.getByTestId("email-suppression-toggle-container");
    await expect(containerAfterReload).toContainText("Email notifications are suppressed");

    // ── Step 7: Verify via DB read that the preference persisted ───────────────
    // Belt-and-suspenders: read directly from the DB to confirm the write landed.
    // AC-MSG-010-01: the DB row must have emailNudgeEnabled=false after the toggle action.
    // ADR-005: admin pool bypasses RLS for this fixture read. // ADR-005
    const dbValue = await readEmailNudgeEnabled();
    expect(
      dbValue,
      "[AC-MSG-010-01] emailNudgeEnabled must be false in the DB after suppression toggle",
    ).toBe(false);

    // ── Cleanup: clear session ─────────────────────────────────────────────────
    await clearSession(page);
  },
);

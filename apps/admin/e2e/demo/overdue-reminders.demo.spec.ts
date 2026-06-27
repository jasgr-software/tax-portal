/**
 * apps/admin/e2e/demo/overdue-reminders.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-019 Overdue reminder engine (admin / Tax Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's overdue
 * reminder configuration happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to docs/demos/EPIC-019/.
 * NON-GATING.
 *
 * No phase-walkthrough video — this slice does not close Phase 4. // BRIEF-019 § Notes
 *
 * Persona:   jane-accountant (.planning/personas/jane-accountant.md)
 * Flow:      flow-notification-feed (reminder branch)
 *            (.planning/flows/flow-notification-feed.md)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-019 admin surface — screenshots 01–05):
 *   01-AC-DASH-008-01-reminder-settings.png
 *       — jane views the global default reminder settings page (AC-DASH-008-01)
 *   02-AC-DASH-008-01-cadence-saved.png
 *       — jane saves the global default cadence (AC-DASH-008-01 / AC-MSG-018-03)
 *   03-AC-DASH-008-02-engagement-override.png
 *       — jane views the per-engagement reminder override panel (AC-DASH-008-02)
 *   04-AC-DASH-008-02-override-saved.png
 *       — jane saves the per-engagement override (AC-DASH-008-02)
 *   05-AC-FILE-012-02-overdue-badge.png
 *       — jane views a document request flagged as overdue (AC-FILE-012-02)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting.
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-019/.
 * This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
 *
 * ADR-006: Admin surface only (Tax Portal). // ADR-006
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * ADR-023: Time-injectable seam; past-due dueDate drives overdue derivation. // ADR-023
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   ADMIN_PORT=13001 pnpm --filter admin e2e:demo -- --grep "overdue-reminders"
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool, UniqueIdentifier } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-019 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-019/.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-019");
const shot = (file: string) => path.join(DEMO_DIR, file);

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Demo-specific fixture clerkId (deterministic, avoids collision with e2e gate specs).
// CS-GEN-001: synthetic identifier — no real PII. // CS-GEN-001
const JANE_CLERK_ID = "user_accountant_demo_019_jane";
const DEMO_EMAIL = "overdue-demo-019-jane@demo.e2e.test";

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
      "[overdue-reminders.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

// ─── Fixture seed / cleanup ────────────────────────────────────────────────────

interface DemoSeedResult {
  engagementId: string;
  engagementRequestId: string;
  documentRequestId: string;
}

/**
 * Seeds a minimal EngagementRequest + Engagement + DocumentRequest with a past dueDate.
 * The DocumentRequest has dueDate 10 days in the past (isOverdue=true on page load).
 */
async function seedDemoFixture(): Promise<DemoSeedResult> {
  const pool = await getPool();

  // Cleanup any prior fixture for this demo email (idempotent setup)
  await cleanupDemoFixture(pool).catch(() => { /* ignore on first run */ });

  // 1. EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", DEMO_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'DemoJane', N'OverdueDemo019', @email, N'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[overdue-reminders.demo.spec] Failed to seed EngagementRequest");
  }

  // 2. Engagement (clientUserId = NULL — admin view, no client needed for demo)
  const engResult = await pool
    .request()
    .input("engagementRequestId", UniqueIdentifier, engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, N'New', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[overdue-reminders.demo.spec] Failed to seed Engagement");
  }

  // 3. DocumentRequest with dueDate 10 days in the past (isOverdue=true at page load)
  //    ADR-023: no wall-clock wait; past dueDate drives overdue derivation. // ADR-023
  const drResult = await pool
    .request()
    .input("engagementId", UniqueIdentifier, engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [dueDate], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (
         @engagementId,
         N'[AC-FILE-012-02] Demo: Tax return documents (overdue)',
         CAST(DATEADD(day, -10, GETUTCDATE()) AS DATE),
         GETUTCDATE()
       )`,
    );

  const documentRequestId = drResult.recordset[0]?.id;
  if (!documentRequestId) {
    throw new Error("[overdue-reminders.demo.spec] Failed to seed DocumentRequest");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
    documentRequestId: documentRequestId.toLowerCase(),
  };
}

async function cleanupDemoFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  await pool
    .request()
    .input("email", DEMO_EMAIL)
    .query(
      `DELETE dr FROM [dbo].[DocumentRequest] dr
       INNER JOIN [dbo].[Engagement] e ON dr.[engagementId] = e.[id]
       INNER JOIN [dbo].[EngagementRequest] er ON e.[engagementRequestId] = er.[id]
       WHERE er.[email] = @email`,
    )
    .catch(() => {});

  await pool
    .request()
    .input("email", DEMO_EMAIL)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[EngagementRequest] er ON e.[engagementRequestId] = er.[id]
       WHERE er.[email] = @email`,
    )
    .catch(() => {});

  await pool
    .request()
    .input("email", DEMO_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`)
    .catch(() => {});
}

test.afterAll(async () => {
  await closePool();
});

// ─── Screen 01–02: Global default reminder settings (AC-DASH-008-01) ──────────

test(
  "[AC-DASH-008-01] [AC-MSG-018-03] @demo 01-02 — jane-accountant: sets global default reminder cadence",
  async ({ page, request }) => {
    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await setupAccountantSession(page, request, JANE_CLERK_ID);

      // Navigate to the reminder settings page
      await page.goto(`${ADMIN_URL}/settings/reminders`);

      await expect(
        page.locator('[data-testid="reminder-settings-page"]'),
        "[AC-DASH-008-01] reminder-settings-page must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 01: Global default reminder settings page
      // Shows the current global default cadence form.
      await page.screenshot({
        path: shot("01-AC-DASH-008-01-reminder-settings.png"),
        fullPage: true,
      });

      // Set the frequency to 14 days and save
      const frequencyInput = page.locator('[data-testid="reminder-frequency-input"]');
      await expect(frequencyInput, "reminder-frequency-input must be visible").toBeVisible({ timeout: 10_000 });

      const originalValue = await frequencyInput.inputValue();
      await frequencyInput.fill("14");

      const saveButton = page.locator('[data-testid="save-cadence-button"]');
      await saveButton.click();

      const successMsg = page.locator('[data-testid="cadence-success"]');
      await expect(
        successMsg,
        "[AC-DASH-008-01] cadence-success must be visible after save",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 02: Success message after saving global default cadence
      await page.screenshot({
        path: shot("02-AC-DASH-008-01-cadence-saved.png"),
        fullPage: true,
      });

      // Restore original value for clean teardown
      await frequencyInput.fill(originalValue || "7");
      await saveButton.click();
      await expect(successMsg).toBeVisible({ timeout: 10_000 });
    } finally {
      await clearSession(page);
      if (seeded) {
        const pool = await getPool();
        await cleanupDemoFixture(pool);
      }
    }
  },
);

// ─── Screen 03–04: Per-engagement reminder override (AC-DASH-008-02) ──────────

test(
  "[AC-DASH-008-02] @demo 03-04 — jane-accountant: sets per-engagement reminder cadence override",
  async ({ page, request }) => {
    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await setupAccountantSession(page, request, JANE_CLERK_ID);

      // Navigate to the engagement detail page (has ReminderOverridePanel)
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const overridePanel = page.locator('[data-testid="reminder-override-panel"]');
      await expect(
        overridePanel,
        "[AC-DASH-008-02] reminder-override-panel must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 03: Per-engagement override panel (before setting override)
      await page.screenshot({
        path: shot("03-AC-DASH-008-02-engagement-override.png"),
        fullPage: true,
      });

      // Set override to 3 days
      const overrideInput = page.locator('[data-testid="override-frequency-input"]');
      await expect(overrideInput, "override-frequency-input must be visible").toBeVisible({ timeout: 10_000 });
      await overrideInput.fill("3");

      const setButton = page.locator('[data-testid="set-override-button"]');
      await setButton.click();

      const successMsg = page.locator('[data-testid="override-success"]');
      await expect(
        successMsg,
        "[AC-DASH-008-02] override-success must be visible after save",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 04: Success message after saving per-engagement override
      await page.screenshot({
        path: shot("04-AC-DASH-008-02-override-saved.png"),
        fullPage: true,
      });

      // Clean up the override
      const clearButton = page.locator('[data-testid="clear-override-button"]');
      if (await clearButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await clearButton.click();
        await expect(successMsg).toBeVisible({ timeout: 10_000 });
      }
    } finally {
      await clearSession(page);
      if (seeded) {
        const pool = await getPool();
        await cleanupDemoFixture(pool);
      }
    }
  },
);

// ─── Screen 05: Overdue request flagged (AC-FILE-012-02) ──────────────────────

test(
  "[AC-FILE-012-02] @demo 05 — jane-accountant: views a document request flagged as overdue",
  async ({ page, request }) => {
    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await setupAccountantSession(page, request, JANE_CLERK_ID);

      // Navigate to the document-requests page for the engagement
      // The seeded DocumentRequest has dueDate 10 days in the past (isOverdue=true at load).
      // ADR-023: no wall-clock wait — past dueDate drives overdue derivation. // ADR-023
      await page.goto(
        `${ADMIN_URL}/engagements/${seeded.engagementId}/document-requests`,
      );

      await expect(
        page.locator('[data-testid="document-request-editor"]'),
        "[AC-FILE-012-02] document-request-editor must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // Assert the overdue badge is visible for the seeded request
      const overdueBadge = page.locator(
        `[data-testid="overdue-badge-${seeded.documentRequestId}"]`,
      );

      await expect(
        overdueBadge,
        `[AC-FILE-012-02] overdue-badge-${seeded.documentRequestId} must be visible`,
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 05: Document-requests page with the overdue badge visible
      await page.screenshot({
        path: shot("05-AC-FILE-012-02-overdue-badge.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) {
        const pool = await getPool();
        await cleanupDemoFixture(pool);
      }
    }
  },
);

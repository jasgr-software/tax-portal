/**
 * apps/admin/e2e/specs/engagement-lifecycle.spec.ts
 *
 * Tier-6 e2e — Accountant engagement lifecycle management.
 *
 * Acceptance criteria covered:
 *   AC-LIFE-001-03 — accountant advances New → In Progress → Review → Complete in order
 *   AC-LIFE-003-01 — accountant changes engagement status
 *   AC-LIFE-005-01 — Complete requires delivery confirmation (UI gate + server enforcement)
 *   AC-LIFE-005-02 — Complete requires filing confirmation (UI gate + server enforcement)
 *   AC-LIFE-006-01 — accountant reopens a Complete engagement back to active work
 *   AC-AUTH-002-01 — accountant sees engagements across different clients (full-visibility list)
 *   AC-AUTH-002-02 — admin engagement list is accessible to the accountant
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * data-* hooks (must match EngagementStatusPanel.tsx exactly):
 *   data-testid="engagement-status-panel"    — root lifecycle panel container
 *   data-testid="engagement-status-badge"    — current status display
 *   data-testid="advance-status-button"      — forward-step button
 *   data-testid="confirm-delivery-button"    — delivery confirmation button
 *   data-testid="confirm-filing-button"      — filing confirmation button
 *   data-testid="confirm-delivery-check"     — delivery confirmed indicator
 *   data-testid="confirm-filing-check"       — filing confirmed indicator
 *   data-testid="complete-engagement-button" — Complete button
 *   data-testid="reopen-engagement-button"   — Reopen button
 *   data-testid="lifecycle-action-status"    — result message
 *   data-testid="engagements-list"           — full-visibility list container
 *   data-testid="engagements-empty"          — empty state
 *
 * DB fixtures (admin pool — RLS-exempt, setup + teardown):
 *   Seeds two minimal EngagementRequest + Engagement rows (two different "clients")
 *   to prove the full-visibility list (AC-AUTH-002-01/-02) shows both.
 *   Also seeds the journey engagement (New) for the lifecycle walk-through.
 *   Cleaned up in afterAll.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'engagement-lifecycle'
 *
 * ADR-006: Lifecycle controls are admin-only; clients never reach this surface.
 * ADR-005: Role is set server-side via the mock session cookie; never from client input.
 * ADR-012: Tier-6 e2e.
 * ADR-003: actor for audit comes from verified session (proven by the action-unit tests;
 *          e2e asserts the lifecycle advance actually succeeds via the UI).
 *
 * // ADR-003: session-verified accountant drives all transitions
 * // ADR-006: admin surface only
 * // CS-GEN-003: cite governing authority in comments
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── DB helpers (admin pool — fixture setup/teardown only) ─────────────────────

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
      "[engagement-lifecycle.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

// ─── Fixture helpers ───────────────────────────────────────────────────────────

interface SeededEngagement {
  engagementId: string;
  engagementRequestId: string;
}

/**
 * Seed a minimal EngagementRequest + Engagement row.
 * clientUserId is NULL per DECISION-A (nullable until client sign-up).
 */
async function seedEngagement(data: {
  email: string;
  firstName?: string;
  lastName?: string;
  status?: string;
}): Promise<SeededEngagement> {
  const pool = await getPool();

  // 1. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("firstName", data.firstName ?? "E2E")
    .input("lastName", data.lastName ?? "LifecycleSpec")
    .input("email", data.email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-lifecycle.spec] seedEngagement: no EngagementRequest id");
  const engagementRequestId = reqRow.id;

  // 2. Seed Engagement
  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("status", data.status ?? "New")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @status, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-lifecycle.spec] seedEngagement: no Engagement id");

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Seed a "Review"-status engagement with both confirmations set (ready to Complete).
 */
async function seedReviewEngagementWithBothConfirms(email: string): Promise<SeededEngagement> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", "E2E")
    .input("lastName", "ReadyToComplete")
    .input("email", email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-lifecycle.spec] seedReviewEngagementWithBothConfirms: no request");
  const engagementRequestId = reqRow.id;

  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status],
          [deliveryConfirmedAt], [filingConfirmedAt],
          [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, 'Review',
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(),
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-lifecycle.spec] seedReviewEngagementWithBothConfirms: no engagement");

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Seed a "Complete"-status engagement for the reopen test.
 */
async function seedCompleteEngagement(email: string): Promise<SeededEngagement> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", "E2E")
    .input("lastName", "AlreadyComplete")
    .input("email", email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-lifecycle.spec] seedCompleteEngagement: no request");
  const engagementRequestId = reqRow.id;

  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status],
          [deliveryConfirmedAt], [filingConfirmedAt],
          [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, 'Complete',
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(),
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-lifecycle.spec] seedCompleteEngagement: no engagement");

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Clean up document requests (if any), engagement, and engagement request.
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[DocumentRequest] WHERE [engagementId] = @engagementId`);

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-AUTH-002-01 / AC-AUTH-002-02 — Full-visibility engagement list
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-AUTH-002-01] [AC-AUTH-002-02] engagement-lifecycle: accountant sees full-visibility list", () => {
  let seeded1: SeededEngagement | null = null;
  let seeded2: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    // Seed two engagements for different "clients" (different emails)
    seeded1 = await seedEngagement({
      email: `e2e-lifecycle-client1-${Date.now()}@example.test`,
      firstName: "ClientOne",
      lastName: "LifecycleSpec",
    });
    seeded2 = await seedEngagement({
      email: `e2e-lifecycle-client2-${Date.now() + 1}@example.test`,
      firstName: "ClientTwo",
      lastName: "LifecycleSpec",
    });
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded1) {
      await cleanupEngagement(seeded1.engagementId, seeded1.engagementRequestId);
      seeded1 = null;
    }
    if (seeded2) {
      await cleanupEngagement(seeded2.engagementId, seeded2.engagementRequestId);
      seeded2 = null;
    }
  });

  test("[AC-AUTH-002-01][AC-AUTH-002-02] engagement-lifecycle: accountant sees engagements list page", async ({ page }) => {
    // Given: the accountant is authenticated
    // When: she navigates to /engagements
    await page.goto(`${ADMIN_URL}/engagements`);

    // Then: the engagements list is visible (AC-AUTH-002-02: list is accessible)
    const list = page.locator('[data-testid="engagements-list"]');
    await expect(list).toBeVisible({ timeout: 15_000 });
  });

  test("[AC-AUTH-002-01] engagement-lifecycle: accountant sees engagements from different clients", async ({ page }) => {
    if (!seeded1 || !seeded2) throw new Error("fixtures not seeded");

    // Given: two engagements seeded for different clients
    // When: the accountant views the engagements list
    await page.goto(`${ADMIN_URL}/engagements`);

    const list = page.locator('[data-testid="engagements-list"]');
    await expect(list).toBeVisible({ timeout: 15_000 });

    // Then: she can see both engagements (AC-AUTH-002-01: full visibility across clients)
    const eng1 = page.locator(`[data-testid="engagement-item-${seeded1.engagementId}"]`);
    const eng2 = page.locator(`[data-testid="engagement-item-${seeded2.engagementId}"]`);

    await expect(eng1).toBeVisible({ timeout: 10_000 });
    await expect(eng2).toBeVisible({ timeout: 10_000 });

    // Both rows show client names
    await expect(eng1).toContainText("ClientOne");
    await expect(eng2).toContainText("ClientTwo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-003-01 / AC-LIFE-001-03 — Accountant advances New → In Progress → Review
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-003-01] [AC-LIFE-001-03] engagement-lifecycle: accountant advances engagement status", () => {
  let seeded: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    seeded = await seedEngagement({
      email: `e2e-lifecycle-advance-${Date.now()}@example.test`,
      status: "New",
    });
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
  });

  test("[AC-LIFE-003-01] engagement-lifecycle: accountant advances New → In Progress", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    // Given: an engagement in status "New"
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Verify current status badge shows "New"
    const badge = page.locator('[data-testid="engagement-status-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("data-status", "New");
    await expect(badge).toContainText("New");

    // When: she clicks "Advance to In Progress"
    const advanceButton = page.locator('[data-testid="advance-status-button"]');
    await expect(advanceButton).toBeVisible();
    await expect(advanceButton).toContainText("In Progress");
    await advanceButton.click();

    // Then: status advances to "In Progress" (AC-LIFE-003-01, AC-LIFE-001-03)
    await expect(badge).toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });
    await expect(badge).toContainText("In Progress");

    // Success message shown
    const statusMsg = page.locator('[data-testid="lifecycle-action-status"]');
    await expect(statusMsg).toBeVisible({ timeout: 10_000 });
    await expect(statusMsg).toContainText(/advanced|In Progress/i);
  });

  test("[AC-LIFE-001-03] engagement-lifecycle: accountant advances New → In Progress → Review sequentially", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const badge = page.locator('[data-testid="engagement-status-badge"]');

    // Step 1: New → In Progress
    const advanceButton = page.locator('[data-testid="advance-status-button"]');
    await expect(advanceButton).toBeVisible({ timeout: 10_000 });
    await advanceButton.click();
    await expect(badge).toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });

    // Step 2: In Progress → Review
    await expect(advanceButton).toBeVisible({ timeout: 10_000 });
    await expect(advanceButton).toContainText("Review");
    await advanceButton.click();
    await expect(badge).toHaveAttribute("data-status", "Review", { timeout: 10_000 });
    await expect(badge).toContainText("Review");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-005-01 / AC-LIFE-005-02 — Two-confirmation gate + AC-LIFE-001-03 Complete
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-005-01] [AC-LIFE-005-02] [AC-LIFE-001-03] engagement-lifecycle: completion gate", () => {
  let seeded: SeededEngagement | null = null;
  let seededWithBoth: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
    if (seededWithBoth) {
      await cleanupEngagement(seededWithBoth.engagementId, seededWithBoth.engagementRequestId);
      seededWithBoth = null;
    }
  });

  test("[AC-LIFE-005-01][AC-LIFE-005-02] engagement-lifecycle: Complete button is disabled until both confirmations checked", async ({ page }) => {
    // Seed an engagement in "Review" status WITHOUT confirmations
    seeded = await seedEngagement({
      email: `e2e-lifecycle-review-noconfirm-${Date.now()}@example.test`,
      status: "Review",
    });

    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Verify status is "Review"
    const badge = page.locator('[data-testid="engagement-status-badge"]');
    await expect(badge).toHaveAttribute("data-status", "Review");

    // AC-LIFE-005-01: delivery confirmation button is present (not yet confirmed)
    const deliveryButton = page.locator('[data-testid="confirm-delivery-button"]');
    await expect(deliveryButton).toBeVisible({ timeout: 10_000 });

    // AC-LIFE-005-02: filing confirmation button is present (not yet confirmed)
    const filingButton = page.locator('[data-testid="confirm-filing-button"]');
    await expect(filingButton).toBeVisible({ timeout: 10_000 });

    // Complete button is DISABLED until both are confirmed (UI gate — AC-LIFE-005-01/-02)
    const completeButton = page.locator('[data-testid="complete-engagement-button"]');
    await expect(completeButton).toBeVisible({ timeout: 10_000 });
    await expect(completeButton).toBeDisabled();
  });

  test("[AC-LIFE-005-01] engagement-lifecycle: accountant confirms delivery, delivery check updates", async ({ page }) => {
    seeded = await seedEngagement({
      email: `e2e-lifecycle-review-delivery-${Date.now()}@example.test`,
      status: "Review",
    });

    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // When: she confirms delivery
    const deliveryButton = page.locator('[data-testid="confirm-delivery-button"]');
    await expect(deliveryButton).toBeVisible({ timeout: 10_000 });
    await deliveryButton.click();

    // Then: delivery check updates to confirmed
    const deliveryCheck = page.locator('[data-testid="confirm-delivery-check"]');
    await expect(deliveryCheck).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });

    // Delivery button disappears after confirmation
    await expect(deliveryButton).not.toBeVisible({ timeout: 10_000 });

    // Filing is still not confirmed — Complete still disabled (AC-LIFE-005-02)
    const completeButton = page.locator('[data-testid="complete-engagement-button"]');
    await expect(completeButton).toBeDisabled({ timeout: 5_000 });
  });

  test("[AC-LIFE-005-02] engagement-lifecycle: accountant confirms filing, filing check updates", async ({ page }) => {
    seeded = await seedEngagement({
      email: `e2e-lifecycle-review-filing-${Date.now()}@example.test`,
      status: "Review",
    });

    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // When: she confirms filing
    const filingButton = page.locator('[data-testid="confirm-filing-button"]');
    await expect(filingButton).toBeVisible({ timeout: 10_000 });
    await filingButton.click();

    // Then: filing check updates to confirmed
    const filingCheck = page.locator('[data-testid="confirm-filing-check"]');
    await expect(filingCheck).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });

    // Filing button disappears after confirmation
    await expect(filingButton).not.toBeVisible({ timeout: 10_000 });

    // Delivery is still not confirmed — Complete still disabled (AC-LIFE-005-01)
    const completeButton = page.locator('[data-testid="complete-engagement-button"]');
    await expect(completeButton).toBeDisabled({ timeout: 5_000 });
  });

  test("[AC-LIFE-005-01][AC-LIFE-005-02][AC-LIFE-001-03] engagement-lifecycle: both confirmed → Complete button enabled → engagement marked Complete", async ({ page }) => {
    // Seed an engagement already in "Review" with BOTH confirmations set
    // (so we can test the Complete button becomes enabled immediately)
    seededWithBoth = await seedReviewEngagementWithBothConfirms(
      `e2e-lifecycle-review-bothconfirm-${Date.now()}@example.test`,
    );

    await page.goto(`${ADMIN_URL}/engagements/${seededWithBoth.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const badge = page.locator('[data-testid="engagement-status-badge"]');
    await expect(badge).toHaveAttribute("data-status", "Review");

    // Both confirmation checks should already show as confirmed
    const deliveryCheck = page.locator('[data-testid="confirm-delivery-check"]');
    const filingCheck = page.locator('[data-testid="confirm-filing-check"]');
    await expect(deliveryCheck).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });
    await expect(filingCheck).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });

    // Complete button should be ENABLED (both confirmations present)
    const completeButton = page.locator('[data-testid="complete-engagement-button"]');
    await expect(completeButton).toBeEnabled({ timeout: 10_000 });

    // When: she clicks Complete
    await completeButton.click();

    // Then: engagement advances to Complete (AC-LIFE-001-03)
    await expect(badge).toHaveAttribute("data-status", "Complete", { timeout: 10_000 });
    await expect(badge).toContainText("Complete");

    // Success message
    const statusMsg = page.locator('[data-testid="lifecycle-action-status"]');
    await expect(statusMsg).toBeVisible({ timeout: 10_000 });
    await expect(statusMsg).toContainText(/complete/i);

    // Reopen button appears (AC-LIFE-006-01 affordance)
    const reopenButton = page.locator('[data-testid="reopen-engagement-button"]');
    await expect(reopenButton).toBeVisible({ timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-006-01 — Accountant reopens a Complete engagement
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-006-01] engagement-lifecycle: accountant reopens a Complete engagement", () => {
  let seeded: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    seeded = await seedCompleteEngagement(
      `e2e-lifecycle-reopen-${Date.now()}@example.test`,
    );
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
  });

  test("[AC-LIFE-006-01] engagement-lifecycle: accountant reopens a Complete engagement back to In Progress", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    // Given: an engagement in status "Complete"
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const badge = page.locator('[data-testid="engagement-status-badge"]');
    await expect(badge).toHaveAttribute("data-status", "Complete");

    // Reopen button is visible
    const reopenButton = page.locator('[data-testid="reopen-engagement-button"]');
    await expect(reopenButton).toBeVisible({ timeout: 10_000 });

    // When: she clicks Reopen
    await reopenButton.click();

    // Then: engagement reverts to "In Progress" (AC-LIFE-006-01)
    await expect(badge).toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });
    await expect(badge).toContainText("In Progress");

    // Success message
    const statusMsg = page.locator('[data-testid="lifecycle-action-status"]');
    await expect(statusMsg).toBeVisible({ timeout: 10_000 });
    await expect(statusMsg).toContainText(/reopen|In Progress/i);

    // Confirm buttons should appear again (confirmations were cleared)
    const confirmDeliveryButton = page.locator('[data-testid="confirm-delivery-button"]');
    // Delivery confirm button is NOT visible for "In Progress" — only visible in "Review"
    await expect(confirmDeliveryButton).not.toBeVisible({ timeout: 5_000 });

    // Advance button appears (now back in In Progress)
    const advanceButton = page.locator('[data-testid="advance-status-button"]');
    await expect(advanceButton).toBeVisible({ timeout: 5_000 });
    await expect(advanceButton).toContainText("Review");
  });
});

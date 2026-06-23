/**
 * apps/admin/e2e/specs/engagement-attributes.spec.ts
 *
 * Tier-6 e2e — Accountant engagement attribute journeys (BRIEF-011, TASK-011-004).
 *
 * Acceptance criteria covered:
 *   AC-LIFE-007-01 — accountant sets a due date on an engagement → it carries that date
 *   AC-LIFE-007-02 — accountant updates the due date → new value reflected
 *   AC-LIFE-008-01 — accountant records an internal note → stored against the engagement
 *   AC-LIFE-009-01 — accountant flags an engagement → marked prioritized (priority badge appears)
 *   AC-LIFE-009-02 — accountant removes the flag → no longer prioritized (badge gone)
 *
 * Gherkin binding (.planning/EPIC-011-engagement-attributes.md § Acceptance scenarios):
 *   AC-LIFE-007-01 scenario: "Given the accountant viewing an engagement with no due date /
 *     When she sets a due date on it / Then the engagement carries that due date"
 *   AC-LIFE-007-02 scenario: "Given an engagement that already has a due date /
 *     When the accountant changes it to a new date / Then the engagement's due date reflects the new value"
 *   AC-LIFE-008-01 scenario: "Given the accountant viewing an engagement /
 *     When she records an internal note on it / Then the note is stored against that engagement"
 *   AC-LIFE-009-01 scenario: "Given the accountant viewing an unflagged engagement /
 *     When she flags it as a priority / Then the engagement is marked as prioritized"
 *   AC-LIFE-009-02 scenario: "Given a flagged engagement /
 *     When the accountant removes the flag / Then the engagement is no longer marked as prioritized"
 *
 * (Scenarios 007-03, 008-02/-03, 009-03 are tier-3 tests — see TASK-011-001/002 for proof.)
 *
 * data-testid hooks (must match EngagementAttributesPanel.tsx exactly):
 *   data-testid="engagement-attributes-panel"   — root container
 *   data-testid="due-date-input"                — date input
 *   data-testid="set-due-date-button"           — submit due date button
 *   data-testid="due-date-display"              — current due date display
 *   data-testid="priority-toggle-button"        — flag / unflag button
 *   data-testid="priority-badge"                — badge shown when flagged
 *   data-testid="note-body-input"               — note textarea
 *   data-testid="record-note-button"            — "Add note" button
 *   data-testid="notes-list"                    — list of existing notes
 *   data-testid="note-item"                     — individual note item
 *   data-testid="attribute-action-status"       — result message (success/error)
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'engagement-attributes'
 *
 * // ADR-003: session-verified accountant drives all writes
 * // ADR-006: admin surface only — notes NEVER surfaced in apps/portal (CS-TS-003)
 * // ADR-012: tier-6 e2e
 * // CS-TS-003: cross-surface negative — notes are admin-only (portal spec enforces the negative)
 * // CS-GEN-003: governing keys cited; AC ids in test titles
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ───────────────

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
      "[engagement-attributes.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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
 * dueDate and isPriority default to NULL/false (for 007-01 and 009-01 tests).
 */
async function seedEngagement(data: {
  email: string;
  firstName?: string;
  lastName?: string;
  dueDate?: string | null;
  isPriority?: boolean;
}): Promise<SeededEngagement> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", data.firstName ?? "E2E")
    .input("lastName", data.lastName ?? "AttribSpec")
    .input("email", data.email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-attributes.spec] seedEngagement: no EngagementRequest id");
  const engagementRequestId = reqRow.id;

  // Build dynamic INSERT to support optional dueDate + isPriority seed values
  const columns = ["[engagementRequestId]", "[status]", "[createdAt]", "[updatedAt]"];
  const values = ["@engagementRequestId", "'New'", "SYSDATETIMEOFFSET()", "SYSDATETIMEOFFSET()"];

  if (data.dueDate !== undefined && data.dueDate !== null) {
    columns.push("[dueDate]");
    values.push("@dueDate");
  }
  if (data.isPriority !== undefined) {
    columns.push("[isPriority]");
    values.push("@isPriority");
  }

  const insertReq = pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId);

  if (data.dueDate !== undefined && data.dueDate !== null) {
    insertReq.input("dueDate", mssqlPkg.Date, new Date(data.dueDate));
  }
  if (data.isPriority !== undefined) {
    insertReq.input("isPriority", mssqlPkg.Bit, data.isPriority ? 1 : 0);
  }

  const engResult = await insertReq.query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       (${columns.join(", ")})
     OUTPUT INSERTED.[id]
     VALUES (${values.join(", ")})`,
  );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-attributes.spec] seedEngagement: no Engagement id");

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Clean up EngagementNotes, Engagement, and EngagementRequest.
 * Notes must be deleted before Engagement (FK onDelete: NoAction).
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  // 1. Delete notes first (FK onDelete: NoAction — cannot cascade)
  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[EngagementNote] WHERE [engagementId] = @engagementId`);

  // 2. Delete Engagement
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  // 3. Delete EngagementRequest
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-007-01 — Accountant sets a due date
// Given: an engagement with no due date
// When: she sets a due date
// Then: the engagement carries that due date
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-007-01] engagement-attributes: accountant sets a due date", () => {
  let seeded: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    seeded = await seedEngagement({
      email: `e2e-attrib-setdate-${Date.now()}@example.test`,
    });
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
  });

  // Gherkin: Given the accountant viewing an engagement with no due date /
  //          When she sets a due date on it /
  //          Then the engagement carries that due date
  // // CS-GEN-003: AC-LIFE-007-01 bound to this Playwright test
  test("[AC-LIFE-007-01] engagement-attributes: accountant sets a due date → engagement carries it", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    // Given: the accountant is on the engagement detail page (no due date set)
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // The initial due date display shows "Not set"
    const dueDateDisplay = page.locator('[data-testid="due-date-display"]');
    await expect(dueDateDisplay).toBeVisible();
    await expect(dueDateDisplay).toContainText("Not set");

    // When: she sets a due date
    const dueDateInput = page.locator('[data-testid="due-date-input"]');
    await expect(dueDateInput).toBeVisible();
    await dueDateInput.fill("2026-12-31");

    const setDueDateButton = page.locator('[data-testid="set-due-date-button"]');
    await expect(setDueDateButton).toBeVisible();
    await setDueDateButton.click();

    // Then: the action status shows success
    const actionStatus = page.locator('[data-testid="attribute-action-status"]');
    await expect(actionStatus).toBeVisible({ timeout: 10_000 });
    await expect(actionStatus).toContainText(/due date/i, { timeout: 10_000 });

    // And: the due date display reflects the new value (AC-LIFE-007-01)
    await expect(dueDateDisplay).not.toContainText("Not set", { timeout: 10_000 });
    // The display should contain "December" or "2026" (formatted date)
    const displayText = await dueDateDisplay.innerText();
    expect(displayText, "[AC-LIFE-007-01] Due date display must show the set date").toMatch(
      /2026|December|Dec/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-007-02 — Accountant updates a due date
// Given: an engagement that already has a due date
// When: the accountant changes it to a new date
// Then: the engagement's due date reflects the new value
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-007-02] engagement-attributes: accountant updates a due date", () => {
  let seeded: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    // Seed engagement with an existing due date (2026-11-01)
    seeded = await seedEngagement({
      email: `e2e-attrib-updatedate-${Date.now()}@example.test`,
      dueDate: "2026-11-01",
    });
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
  });

  // Gherkin: Given an engagement that already has a due date /
  //          When the accountant changes it to a new date /
  //          Then the engagement's due date reflects the new value
  // // CS-GEN-003: AC-LIFE-007-02 bound to this Playwright test
  test("[AC-LIFE-007-02] engagement-attributes: accountant updates the due date → new value reflected", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    // Given: the accountant is on the engagement detail page (existing due date: Nov 1, 2026)
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // The existing due date is displayed (November 1, 2026)
    const dueDateDisplay = page.locator('[data-testid="due-date-display"]');
    await expect(dueDateDisplay).toBeVisible();
    await expect(dueDateDisplay).not.toContainText("Not set");
    await expect(dueDateDisplay).toContainText(/November|Nov|2026/);

    // The "Update due date" button label (already set)
    const setDueDateButton = page.locator('[data-testid="set-due-date-button"]');
    await expect(setDueDateButton).toBeVisible();
    await expect(setDueDateButton).toContainText(/update/i);

    // When: she changes the due date to a new value (December 31, 2026)
    const dueDateInput = page.locator('[data-testid="due-date-input"]');
    await dueDateInput.fill("2026-12-31");
    await setDueDateButton.click();

    // Then: the action status shows success
    const actionStatus = page.locator('[data-testid="attribute-action-status"]');
    await expect(actionStatus).toBeVisible({ timeout: 10_000 });

    // And: the due date display shows the NEW value (December 31, 2026 — AC-LIFE-007-02)
    await expect(dueDateDisplay).toContainText(/December|Dec/, { timeout: 10_000 });
    // The OLD value (November) must no longer appear in the due date display
    const displayText = await dueDateDisplay.innerText();
    expect(displayText, "[AC-LIFE-007-02] Display must show new date, not old").not.toMatch(
      /November|Nov/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-008-01 — Accountant records an internal note
// Given: the accountant viewing an engagement
// When: she records an internal note on it
// Then: the note is stored against that engagement
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-008-01] engagement-attributes: accountant records an internal note", () => {
  let seeded: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    seeded = await seedEngagement({
      email: `e2e-attrib-note-${Date.now()}@example.test`,
    });
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
  });

  // Gherkin: Given the accountant viewing an engagement /
  //          When she records an internal note on it /
  //          Then the note is stored against that engagement
  // // ADR-006 / CS-TS-003: Internal notes are admin-only; NEVER surfaced in apps/portal
  // // CS-GEN-003: AC-LIFE-008-01 bound to this Playwright test
  test("[AC-LIFE-008-01] engagement-attributes: accountant records an internal note → stored against the engagement", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    const NOTE_TEXT = `E2E internal note ${Date.now()}`;

    // Given: the accountant is on the engagement detail page
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // The note textarea is present
    const noteBodyInput = page.locator('[data-testid="note-body-input"]');
    await expect(noteBodyInput).toBeVisible();

    // The "Add note" button is visible but initially disabled (empty textarea)
    const recordNoteButton = page.locator('[data-testid="record-note-button"]');
    await expect(recordNoteButton).toBeVisible();
    await expect(recordNoteButton).toBeDisabled();

    // When: she types a note and clicks "Add note"
    await noteBodyInput.fill(NOTE_TEXT);
    await expect(recordNoteButton).toBeEnabled({ timeout: 5_000 });
    await recordNoteButton.click();

    // Then: the action status shows success
    const actionStatus = page.locator('[data-testid="attribute-action-status"]');
    await expect(actionStatus).toBeVisible({ timeout: 10_000 });
    await expect(actionStatus).toContainText(/note recorded|note/i, { timeout: 10_000 });

    // And: the note appears in the notes list (AC-LIFE-008-01)
    const notesList = page.locator('[data-testid="notes-list"]');
    await expect(notesList).toBeVisible({ timeout: 10_000 });

    const noteItem = page.locator('[data-testid="note-item"]');
    await expect(noteItem).toBeVisible({ timeout: 10_000 });
    await expect(noteItem).toContainText(NOTE_TEXT);

    // The textarea is cleared after recording
    await expect(noteBodyInput).toHaveValue("", { timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-009-01 — Accountant flags an engagement
// Given: the accountant viewing an unflagged engagement
// When: she flags it as a priority
// Then: the engagement is marked as prioritized
//
// AC-LIFE-009-02 — Accountant removes the priority flag
// Given: a flagged engagement
// When: the accountant removes the flag
// Then: the engagement is no longer marked as prioritized
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-009-01] [AC-LIFE-009-02] engagement-attributes: accountant flags and unflags an engagement", () => {
  let seeded: SeededEngagement | null = null;

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
    // Seed engagement with isPriority=false (unflagged)
    seeded = await seedEngagement({
      email: `e2e-attrib-flag-${Date.now()}@example.test`,
      isPriority: false,
    });
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      seeded = null;
    }
  });

  // Gherkin AC-LIFE-009-01: Given the accountant viewing an unflagged engagement /
  //                          When she flags it as a priority /
  //                          Then the engagement is marked as prioritized
  // // CS-GEN-003: AC-LIFE-009-01 bound to this Playwright test
  test("[AC-LIFE-009-01] engagement-attributes: accountant flags an engagement → marked prioritized (badge appears)", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    // Given: the accountant is on the engagement detail page (unflagged)
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Priority badge is NOT shown (engagement is unflagged)
    const priorityBadge = page.locator('[data-testid="priority-badge"]');
    await expect(priorityBadge).not.toBeVisible();

    // The toggle button shows "Flag as priority"
    const toggleButton = page.locator('[data-testid="priority-toggle-button"]');
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toContainText(/flag as priority/i);
    await expect(toggleButton).toHaveAttribute("aria-pressed", "false");

    // When: she clicks "Flag as priority"
    await toggleButton.click();

    // Then: the action status shows success
    const actionStatus = page.locator('[data-testid="attribute-action-status"]');
    await expect(actionStatus).toBeVisible({ timeout: 10_000 });
    await expect(actionStatus).toContainText(/priority/i, { timeout: 10_000 });

    // And: the priority badge appears (AC-LIFE-009-01 — engagement is marked as prioritized)
    await expect(priorityBadge).toBeVisible({ timeout: 10_000 });
    await expect(priorityBadge).toContainText(/priority/i);

    // The toggle button now shows "Remove priority flag" and aria-pressed=true
    await expect(toggleButton).toContainText(/remove priority flag/i, { timeout: 10_000 });
    await expect(toggleButton).toHaveAttribute("aria-pressed", "true");
  });

  // Gherkin AC-LIFE-009-02: Given a flagged engagement /
  //                          When the accountant removes the flag /
  //                          Then the engagement is no longer marked as prioritized
  // // CS-GEN-003: AC-LIFE-009-02 bound to this Playwright test
  test("[AC-LIFE-009-02] engagement-attributes: accountant flags then removes the flag → badge disappears", async ({ page }) => {
    if (!seeded) throw new Error("fixture not seeded");

    // Given: the accountant navigates to an unflagged engagement and sets it to flagged first
    await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

    const panel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const toggleButton = page.locator('[data-testid="priority-toggle-button"]');
    const priorityBadge = page.locator('[data-testid="priority-badge"]');

    // Step 1: Flag the engagement (Given: a flagged engagement)
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toContainText(/flag as priority/i);
    await toggleButton.click();

    // Badge appears after flagging
    await expect(priorityBadge).toBeVisible({ timeout: 10_000 });
    await expect(toggleButton).toContainText(/remove priority flag/i, { timeout: 10_000 });
    await expect(toggleButton).toHaveAttribute("aria-pressed", "true");

    // When: she removes the flag
    await toggleButton.click();

    // Then: the action status shows success
    const actionStatus = page.locator('[data-testid="attribute-action-status"]');
    await expect(actionStatus).toBeVisible({ timeout: 10_000 });
    await expect(actionStatus).toContainText(/priority flag removed|removed/i, { timeout: 10_000 });

    // And: the priority badge disappears (AC-LIFE-009-02 — no longer marked as prioritized)
    await expect(priorityBadge).not.toBeVisible({ timeout: 10_000 });

    // The toggle button reverts to "Flag as priority" and aria-pressed=false
    await expect(toggleButton).toContainText(/flag as priority/i, { timeout: 10_000 });
    await expect(toggleButton).toHaveAttribute("aria-pressed", "false");
  });
});

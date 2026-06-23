/**
 * apps/admin/e2e/demo/engagement-attributes.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-011 Engagement Attributes (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * attribute-management journeys against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-011/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-engagement-lifecycle (.planning/flows/flow-engagement-lifecycle.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-011 admin surface — screenshots 01–06):
 *   01-AC-LIFE-007-01-set-due-date.png
 *       — jane-accountant sets a due date on an engagement with no due date.
 *         The due-date display updates from "Not set" to the chosen date.
 *         Proves AC-LIFE-007-01: accountant can set a due date.
 *   02-AC-LIFE-007-02-update-due-date.png
 *       — accountant changes an existing due date to a new value.
 *         The display reflects the new date; the old date is gone.
 *         Proves AC-LIFE-007-02: accountant can update a due date.
 *   03-AC-LIFE-008-01-record-note.png
 *       — accountant records an internal note; the note appears in the notes list.
 *         Proves AC-LIFE-008-01: accountant can record internal notes.
 *   04-AC-LIFE-009-01-flag-engagement.png
 *       — accountant flags an unflagged engagement as priority.
 *         The priority badge appears; the toggle button changes to "Remove priority flag".
 *         Proves AC-LIFE-009-01: accountant can flag/mark an engagement as prioritized.
 *   05-AC-LIFE-009-02-unflag-engagement-flagged-state.png
 *       — shows the engagement in the flagged state before removing the flag.
 *         Serves as context for the unflag action (AC-LIFE-009-02 "Given" state).
 *   06-AC-LIFE-009-02-unflag-engagement-removed.png
 *       — accountant removes the priority flag; the badge disappears.
 *         Proves AC-LIFE-009-02: accountant can remove the flag/priority marker.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * SCOPE DISCIPLINE (RETRO carry — retro-012-012 @demo PNG byte-churn):
 *   DEMO_DIR is pinned to docs/demos/EPIC-011 ONLY.
 *   No prior-epic gallery PNGs are touched.
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-011-005): Seed a minimal EngagementRequest + Engagement row per test.
 *   // Each test in this gallery receives a fresh fixture to ensure isolation.
 *   // Fixture suffix "-demo-011" avoids collision with engagement-attributes.spec.ts ("-spec")
 *   // and the EPIC-010 demo ("-demo-010").
 *   //
 *   // clerkId: "user_accountant_e2e_001" — shared ACCOUNTANT (same as other admin suites)
 *   // Cleanup happens in try/finally for safe teardown even on test failure.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers ONLY the admin surface (Tax Portal).
 *          Internal notes are NEVER surfaced in apps/portal (CS-TS-003).
 * ADR-012: Tier-6 e2e.
 * EPIC-011: engagement attributes (due date, internal notes, priority flag).
 * CS-GEN-003: cite governing authority in comments.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

// CS-GEN-003: governing authority cited in file header + inline comments.
// ADR-006: admin-only surface — internal notes NEVER appear in apps/portal.

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-011 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// RETRO-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-011/.
// This const is the ONLY path used; no prior-epic gallery is touched.
// CS-GEN-003: cite RETRO carry in comment.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-011");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + neighbor-squat remap (ADMIN_PORT=13001).
const ADMIN_PORT_ENV = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT_ENV}`;

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
      "[engagement-attributes.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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
}

/**
 * Seeds a minimal EngagementRequest + Engagement for the demo.
 * The fixture uses distinct "-demo-011" email suffixes to avoid collision with other suites.
 * clientUserId is NULL (DECISION-A nullability per engagement-attributes.spec.ts).
 * Supports optional dueDate and isPriority seed values for AC-LIFE-007-02 and AC-LIFE-009-02
 * "Given" states.
 *
 * ADR-005: admin pool is RLS-exempt; used for seed/teardown only.
 * ADR-012: Tier-6 e2e demo.
 */
async function seedEngagement(opts: {
  label: string;
  dueDate?: string | null;
  isPriority?: boolean;
}): Promise<DemoSeedResult> {
  const pool = await getPool();
  const email = `e2e-demo-011-${opts.label}-${Date.now()}@engagement-attributes.demo.e2e.test`;

  // 1. EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", email)
    .input("firstName", "DemoJane")
    .input("lastName", `Attribs-${opts.label}`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) {
    throw new Error(
      `[engagement-attributes.demo.spec] seedEngagement: no EngagementRequest id (${opts.label})`,
    );
  }
  const engagementRequestId = reqRow.id;

  // 2. Engagement — support optional dueDate + isPriority
  const columns = [
    "[engagementRequestId]",
    "[status]",
    "[createdAt]",
    "[updatedAt]",
  ];
  const values = [
    "@engagementRequestId",
    "'New'",
    "SYSDATETIMEOFFSET()",
    "SYSDATETIMEOFFSET()",
  ];

  const insertReq = pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId);

  if (opts.dueDate !== undefined && opts.dueDate !== null) {
    columns.push("[dueDate]");
    values.push("@dueDate");
    insertReq.input("dueDate", mssqlPkg.Date, new Date(opts.dueDate));
  }
  if (opts.isPriority !== undefined) {
    columns.push("[isPriority]");
    values.push("@isPriority");
    insertReq.input("isPriority", mssqlPkg.Bit, opts.isPriority ? 1 : 0);
  }

  const engResult = await insertReq.query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       (${columns.join(", ")})
     OUTPUT INSERTED.[id]
     VALUES (${values.join(", ")})`,
  );

  const engRow = engResult.recordset[0];
  if (!engRow) {
    throw new Error(
      `[engagement-attributes.demo.spec] seedEngagement: no Engagement id (${opts.label})`,
    );
  }

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Clean up EngagementNotes, Engagement, and EngagementRequest.
 * Notes must be deleted before Engagement (FK onDelete: NoAction).
 *
 * ADR-005: admin pool is RLS-exempt; used for seed/teardown only.
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

// ─── Screen 01: Set a due date (AC-LIFE-007-01) ───────────────────────────────

test(
  "[AC-LIFE-007-01] @demo 01 — jane-accountant: sets a due date on an engagement with no due date",
  async ({ page, request }) => {
    // Screen 01: jane-accountant navigates to an engagement with no due date.
    // She enters a date in the due-date input and clicks "Set due date".
    // The due-date display updates from "Not set" to the chosen date.
    // Proves AC-LIFE-007-01: the accountant can set a due date on an engagement.
    //
    // ADR-006: admin surface — attribute writes are accountant-only.
    // ADR-003: session-verified accountant drives the write.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      seeded = await seedEngagement({ label: "set-date" });
      await setupAccountantSession(page, request);

      // Given: the accountant is on the engagement detail page (no due date)
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-attributes-panel"]');
      await expect(
        panel,
        "engagement-attributes-panel must be visible (AC-LIFE-007-01)",
      ).toBeVisible({ timeout: 15_000 });

      // Assert: initial display shows "Not set"
      const dueDateDisplay = page.locator('[data-testid="due-date-display"]');
      await expect(dueDateDisplay).toBeVisible();
      await expect(dueDateDisplay, "Due date display must start as 'Not set'").toContainText("Not set");

      // When: she fills in a due date and submits
      const dueDateInput = page.locator('[data-testid="due-date-input"]');
      await expect(dueDateInput, "due-date-input must be visible").toBeVisible();
      await dueDateInput.fill("2026-12-31");

      const setDueDateButton = page.locator('[data-testid="set-due-date-button"]');
      await expect(setDueDateButton, "set-due-date-button must be visible").toBeVisible();
      await setDueDateButton.click();

      // Then: the action status appears and the due date display updates
      const actionStatus = page.locator('[data-testid="attribute-action-status"]');
      await expect(actionStatus, "attribute-action-status must appear (AC-LIFE-007-01)").toBeVisible({
        timeout: 10_000,
      });

      await expect(
        dueDateDisplay,
        "Due date display must no longer show 'Not set' after setting (AC-LIFE-007-01)",
      ).not.toContainText("Not set", { timeout: 10_000 });

      const displayText = await dueDateDisplay.innerText();
      expect(
        displayText,
        "[AC-LIFE-007-01] Due date display must show the set date (Dec 31 2026)",
      ).toMatch(/2026|December|Dec/);

      // Screenshot 01: attributes panel showing the newly-set due date
      await page.screenshot({
        path: shot("01-AC-LIFE-007-01-set-due-date.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 02: Update an existing due date (AC-LIFE-007-02) ─────────────────

test(
  "[AC-LIFE-007-02] @demo 02 — jane-accountant: updates an existing due date to a new value",
  async ({ page, request }) => {
    // Screen 02: jane-accountant navigates to an engagement that already has a due date
    // (seeded as Nov 1, 2026). She changes it to Dec 31, 2026.
    // The due-date display reflects the new value; the old date is gone.
    // Proves AC-LIFE-007-02: the accountant can update a due date after it has been set.
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      // Seed with an existing due date (Nov 1, 2026)
      seeded = await seedEngagement({ label: "update-date", dueDate: "2026-11-01" });
      await setupAccountantSession(page, request);

      // Given: the accountant is on the engagement detail page (existing due date: Nov 2026)
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-attributes-panel"]');
      await expect(
        panel,
        "engagement-attributes-panel must be visible (AC-LIFE-007-02)",
      ).toBeVisible({ timeout: 15_000 });

      // Assert: existing due date is shown (November 2026)
      const dueDateDisplay = page.locator('[data-testid="due-date-display"]');
      await expect(dueDateDisplay).toBeVisible();
      await expect(dueDateDisplay, "Existing date must show November 2026").not.toContainText("Not set");
      await expect(dueDateDisplay).toContainText(/November|Nov|2026/);

      // Assert: button label reflects "update" (already set)
      const setDueDateButton = page.locator('[data-testid="set-due-date-button"]');
      await expect(setDueDateButton, "set-due-date-button must be visible").toBeVisible();
      await expect(setDueDateButton, "Button must read 'Update' when a date is already set").toContainText(
        /update/i,
      );

      // When: she changes the due date to Dec 31, 2026
      const dueDateInput = page.locator('[data-testid="due-date-input"]');
      await dueDateInput.fill("2026-12-31");
      await setDueDateButton.click();

      // Then: the action status appears
      const actionStatus = page.locator('[data-testid="attribute-action-status"]');
      await expect(actionStatus, "attribute-action-status must appear (AC-LIFE-007-02)").toBeVisible({
        timeout: 10_000,
      });

      // And: the display now shows December 2026, not November
      await expect(
        dueDateDisplay,
        "Due date display must show new value (December 2026) — AC-LIFE-007-02",
      ).toContainText(/December|Dec/, { timeout: 10_000 });

      const displayText = await dueDateDisplay.innerText();
      expect(
        displayText,
        "[AC-LIFE-007-02] Display must show new date, not old",
      ).not.toMatch(/November|Nov/);

      // Screenshot 02: attributes panel showing the updated due date
      await page.screenshot({
        path: shot("02-AC-LIFE-007-02-update-due-date.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 03: Record an internal note (AC-LIFE-008-01) ─────────────────────

test(
  "[AC-LIFE-008-01] @demo 03 — jane-accountant: records an internal note on an engagement",
  async ({ page, request }) => {
    // Screen 03: jane-accountant navigates to an engagement and records an internal note.
    // The note text appears in the notes list after submission.
    // Proves AC-LIFE-008-01: the accountant can record internal notes on an engagement.
    //
    // Security note (AC-LIFE-008-02/-03): internal notes are NEVER shown in apps/portal.
    // The RLS policy (ADR-005) ensures a CLIENT principal reads ZERO notes server-side.
    // This gallery captures only the positive accountant case; the confidentiality
    // negative is proven by the tier-3 integration tests in TASK-011-001/-002.
    //
    // ADR-006: admin surface — notes are accountant-only; never surfaced in apps/portal.
    // CS-TS-003: notes management is admin-only (cross-surface negative enforced elsewhere).
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      seeded = await seedEngagement({ label: "note" });
      await setupAccountantSession(page, request);

      const NOTE_TEXT = `[AC-LIFE-008-01] Demo internal note — ${Date.now()}`;

      // Given: the accountant is on the engagement detail page
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-attributes-panel"]');
      await expect(
        panel,
        "engagement-attributes-panel must be visible (AC-LIFE-008-01)",
      ).toBeVisible({ timeout: 15_000 });

      // The note textarea and "Add note" button are present
      const noteBodyInput = page.locator('[data-testid="note-body-input"]');
      await expect(noteBodyInput, "note-body-input must be visible").toBeVisible();

      const recordNoteButton = page.locator('[data-testid="record-note-button"]');
      await expect(recordNoteButton, "record-note-button must be visible").toBeVisible();
      await expect(
        recordNoteButton,
        "record-note-button must be disabled when textarea is empty",
      ).toBeDisabled();

      // When: she types a note and clicks "Add note"
      await noteBodyInput.fill(NOTE_TEXT);
      await expect(
        recordNoteButton,
        "record-note-button must enable when textarea has content",
      ).toBeEnabled({ timeout: 5_000 });
      await recordNoteButton.click();

      // Then: the action status shows success
      const actionStatus = page.locator('[data-testid="attribute-action-status"]');
      await expect(
        actionStatus,
        "attribute-action-status must appear (AC-LIFE-008-01)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(actionStatus).toContainText(/note recorded|note/i, { timeout: 10_000 });

      // And: the note appears in the notes list (AC-LIFE-008-01)
      const notesList = page.locator('[data-testid="notes-list"]');
      await expect(
        notesList,
        "notes-list must be visible after recording a note (AC-LIFE-008-01)",
      ).toBeVisible({ timeout: 10_000 });

      const noteItem = page.locator('[data-testid="note-item"]');
      await expect(
        noteItem,
        "note-item must be visible in the notes list (AC-LIFE-008-01)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        noteItem,
        "note-item must contain the recorded note text (AC-LIFE-008-01)",
      ).toContainText(NOTE_TEXT);

      // The textarea is cleared after recording
      await expect(noteBodyInput, "textarea must clear after submission").toHaveValue("", {
        timeout: 5_000,
      });

      // Screenshot 03: attributes panel with the internal note recorded in the notes list
      await page.screenshot({
        path: shot("03-AC-LIFE-008-01-record-note.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 04: Flag an engagement (AC-LIFE-009-01) ─────────────────────────

test(
  "[AC-LIFE-009-01] @demo 04 — jane-accountant: flags an unflagged engagement as priority",
  async ({ page, request }) => {
    // Screen 04: jane-accountant navigates to an unflagged engagement and clicks
    // "Flag as priority". The priority badge appears; the toggle button changes to
    // "Remove priority flag".
    // Proves AC-LIFE-009-01: the accountant can flag/mark an engagement as prioritized.
    //
    // ADR-006: admin surface — flag writes are accountant-only.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      // Seed engagement with isPriority=false (unflagged)
      seeded = await seedEngagement({ label: "flag", isPriority: false });
      await setupAccountantSession(page, request);

      // Given: the accountant is on the engagement detail page (unflagged)
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-attributes-panel"]');
      await expect(
        panel,
        "engagement-attributes-panel must be visible (AC-LIFE-009-01)",
      ).toBeVisible({ timeout: 15_000 });

      // Priority badge is NOT shown (engagement is unflagged)
      const priorityBadge = page.locator('[data-testid="priority-badge"]');
      await expect(
        priorityBadge,
        "priority-badge must NOT be visible when engagement is unflagged",
      ).not.toBeVisible();

      // The toggle button shows "Flag as priority" and aria-pressed=false
      const toggleButton = page.locator('[data-testid="priority-toggle-button"]');
      await expect(toggleButton, "priority-toggle-button must be visible").toBeVisible();
      await expect(toggleButton, "Toggle must read 'Flag as priority' when unflagged").toContainText(
        /flag as priority/i,
      );
      await expect(toggleButton).toHaveAttribute("aria-pressed", "false");

      // When: she clicks "Flag as priority"
      await toggleButton.click();

      // Then: the action status shows success
      const actionStatus = page.locator('[data-testid="attribute-action-status"]');
      await expect(
        actionStatus,
        "attribute-action-status must appear (AC-LIFE-009-01)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(actionStatus).toContainText(/priority/i, { timeout: 10_000 });

      // And: the priority badge appears (AC-LIFE-009-01)
      await expect(
        priorityBadge,
        "priority-badge must appear after flagging (AC-LIFE-009-01)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(priorityBadge).toContainText(/priority/i);

      // The toggle button now shows "Remove priority flag" and aria-pressed=true
      await expect(
        toggleButton,
        "Toggle must read 'Remove priority flag' when engagement is flagged",
      ).toContainText(/remove priority flag/i, { timeout: 10_000 });
      await expect(toggleButton).toHaveAttribute("aria-pressed", "true");

      // Screenshot 04: attributes panel showing the engagement flagged as priority
      await page.screenshot({
        path: shot("04-AC-LIFE-009-01-flag-engagement.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screens 05–06: Flag then unflag (AC-LIFE-009-02) ────────────────────────

test(
  "[AC-LIFE-009-01] [AC-LIFE-009-02] @demo 05-06 — jane-accountant: flags then unflags an engagement",
  async ({ page, request }) => {
    // Screens 05–06: jane-accountant flags an unflagged engagement (05 — "Given" state),
    // then removes the flag (06 — after unflag). The priority badge disappears and the
    // toggle reverts to "Flag as priority".
    // Proves AC-LIFE-009-02: the accountant can remove the flag/priority marker.
    // Proves AC-LIFE-009-01 (contextually) in the "Given" screenshot.
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      // Seed engagement with isPriority=false (start unflagged — we drive the flag live)
      seeded = await seedEngagement({ label: "unflag", isPriority: false });
      await setupAccountantSession(page, request);

      // Given: the accountant is on the engagement detail page (unflagged)
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-attributes-panel"]');
      await expect(
        panel,
        "engagement-attributes-panel must be visible (AC-LIFE-009-02)",
      ).toBeVisible({ timeout: 15_000 });

      const toggleButton = page.locator('[data-testid="priority-toggle-button"]');
      const priorityBadge = page.locator('[data-testid="priority-badge"]');

      // Step 1: Flag the engagement (establishes "Given: a flagged engagement" for AC-LIFE-009-02)
      await expect(toggleButton, "Toggle must be visible").toBeVisible();
      await expect(toggleButton).toContainText(/flag as priority/i);
      await toggleButton.click();

      // Badge appears after flagging; toggle switches to "Remove priority flag"
      await expect(
        priorityBadge,
        "priority-badge must appear after flagging",
      ).toBeVisible({ timeout: 10_000 });
      await expect(toggleButton).toContainText(/remove priority flag/i, { timeout: 10_000 });
      await expect(toggleButton).toHaveAttribute("aria-pressed", "true");

      // Screenshot 05: engagement is now flagged — "Given" state for the unflag action
      // (AC-LIFE-009-01 positive state; AC-LIFE-009-02 "Given" state)
      await page.screenshot({
        path: shot("05-AC-LIFE-009-02-unflag-engagement-flagged-state.png"),
        fullPage: true,
      });

      // When: she removes the flag
      await toggleButton.click();

      // Then: the action status shows success
      const actionStatus = page.locator('[data-testid="attribute-action-status"]');
      await expect(
        actionStatus,
        "attribute-action-status must appear after unflagging (AC-LIFE-009-02)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(actionStatus).toContainText(/priority flag removed|removed/i, { timeout: 10_000 });

      // And: the priority badge disappears (AC-LIFE-009-02 — no longer prioritized)
      await expect(
        priorityBadge,
        "priority-badge must disappear after removing the flag (AC-LIFE-009-02)",
      ).not.toBeVisible({ timeout: 10_000 });

      // The toggle reverts to "Flag as priority" and aria-pressed=false
      await expect(
        toggleButton,
        "Toggle must revert to 'Flag as priority' after unflagging (AC-LIFE-009-02)",
      ).toContainText(/flag as priority/i, { timeout: 10_000 });
      await expect(toggleButton).toHaveAttribute("aria-pressed", "false");

      // Screenshot 06: engagement is now unflagged — badge gone, toggle reverted
      await page.screenshot({
        path: shot("06-AC-LIFE-009-02-unflag-engagement-removed.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

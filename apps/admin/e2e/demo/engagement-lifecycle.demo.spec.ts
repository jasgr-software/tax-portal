/**
 * apps/admin/e2e/demo/engagement-lifecycle.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-010 Engagement Lifecycle Pipeline (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * full lifecycle journey against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-010/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-engagement-lifecycle (.planning/flows/flow-engagement-lifecycle.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-010 admin surface — screenshots 01–06):
 *   01-AC-LIFE-001-02-engagement-list-new.png
 *       — jane-accountant views the engagements list; one engagement is in New status.
 *         Proves AC-LIFE-001-02: newly created engagement begins in New.
 *         Proves AC-AUTH-002-01/-02: accountant can view the engagements list.
 *   02-AC-LIFE-003-01-advance-to-in-progress.png
 *       — accountant advances New → In Progress.
 *         Proves AC-LIFE-003-01: accountant can change an engagement's status.
 *         Proves AC-LIFE-001-03: New → In Progress transition in the pipeline.
 *   03-AC-LIFE-001-03-advance-to-review.png
 *       — accountant advances In Progress → Review.
 *         Proves AC-LIFE-001-03: In Progress → Review forward order maintained.
 *   04-AC-LIFE-005-01-confirm-delivery.png
 *       — accountant confirms delivery; delivery check shows confirmed (AC-LIFE-005-01).
 *   05-AC-LIFE-005-02-confirm-filing-complete.png
 *       — accountant confirms filing; both checked → Complete button enabled → clicks Complete.
 *         Proves AC-LIFE-005-02: filing confirmation required.
 *         Proves AC-LIFE-005-03: both confirmations required for Complete.
 *   06-AC-LIFE-006-01-reopen.png
 *       — accountant reopens the Complete engagement back to In Progress.
 *         Proves AC-LIFE-006-01: accountant can reopen.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * SCOPE DISCIPLINE (RETRO carry — retro-012-012 @demo PNG byte-churn):
 *   DEMO_DIR is pinned to docs/demos/EPIC-010 ONLY.
 *   No prior-epic gallery PNGs are touched.
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-010-005): We seed a minimal EngagementRequest + Engagement row
 *   // starting at "New" status and drive the transitions live via the UI — this exercises
 *   // the actual EngagementStatusPanel lifecycle actions rather than seeding states.
 *   // We seed a separate row for screenshots that need pre-set confirmation states.
 *   //
 *   // clerkId: "user_accountant_e2e_001" — shared ACCOUNTANT (same as other admin suites)
 *   // fixture suffix: "-demo-010" to avoid collision with all other suites
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-012: Tier-6 e2e.
 * EPIC-010: engagement lifecycle pipeline.
 * CS-GEN-003: cite governing authority in comments.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

// CS-GEN-003: governing authority cited in file header + inline comments.

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-010 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// RETRO-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-010/.
// This const is the ONLY path used; no prior-epic gallery is touched.
// CS-GEN-003: cite RETRO carry in comment.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-010");
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
      "[engagement-lifecycle.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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
 * Seeds a minimal EngagementRequest + Engagement at the given status.
 * The fixture uses distinct "-demo-010" email suffixes to avoid collision with other suites.
 * clientUserId is NULL per the DECISION-A nullability in engagement-lifecycle.spec.ts.
 *
 * ADR-005: admin pool is RLS-exempt; used for seed/teardown only.
 * ADR-012: Tier-6 e2e demo.
 */
async function seedEngagement(opts: {
  label: string;
  status: string;
  deliveryConfirmedAt?: boolean;
  filingConfirmedAt?: boolean;
}): Promise<DemoSeedResult> {
  const pool = await getPool();
  const email = `e2e-demo-010-${opts.label}-${Date.now()}@engagement-lifecycle.demo.e2e.test`;

  // 1. EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", email)
    .input("firstName", "DemoJane")
    .input("lastName", `Lifecycle-${opts.label}`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error(`[engagement-lifecycle.demo.spec] seedEngagement: no EngagementRequest id (${opts.label})`);
  const engagementRequestId = reqRow.id;

  // 2. Engagement — set confirmations if requested
  let engResult: mssqlPkg.IResult<{ id: string }>;
  if (opts.deliveryConfirmedAt || opts.filingConfirmedAt) {
    const deliveryCol = opts.deliveryConfirmedAt ? "[deliveryConfirmedAt]," : "";
    const filingCol = opts.filingConfirmedAt ? "[filingConfirmedAt]," : "";
    const deliveryVal = opts.deliveryConfirmedAt ? "SYSDATETIMEOFFSET()," : "";
    const filingVal = opts.filingConfirmedAt ? "SYSDATETIMEOFFSET()," : "";
    engResult = await pool
      .request()
      .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
      .input("status", opts.status)
      .query<{ id: string }>(
        `INSERT INTO [dbo].[Engagement]
           ([engagementRequestId], [status],
            ${deliveryCol}
            ${filingCol}
            [createdAt], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (@engagementRequestId, @status,
                 ${deliveryVal}
                 ${filingVal}
                 SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
      );
  } else {
    engResult = await pool
      .request()
      .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
      .input("status", opts.status)
      .query<{ id: string }>(
        `INSERT INTO [dbo].[Engagement]
           ([engagementRequestId], [status], [createdAt], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (@engagementRequestId, @status, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
      );
  }

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error(`[engagement-lifecycle.demo.spec] seedEngagement: no Engagement id (${opts.label})`);

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

async function cleanupEngagement(engagementId: string, engagementRequestId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ─── Screen 01: Engagements list — New status (AC-LIFE-001-02 / AC-AUTH-002-01 / AC-AUTH-002-02) ──

test(
  "[AC-LIFE-001-02] [AC-AUTH-002-01] [AC-AUTH-002-02] @demo 01 — jane-accountant: views engagements list with an engagement in New status",
  async ({ page, request }) => {
    // Screen 01: jane-accountant navigates to /engagements.
    // The list shows an engagement (just seeded in New status).
    // Proves AC-LIFE-001-02: the engagement starts in New.
    // Proves AC-AUTH-002-01: accountant can view the engagements list.
    // Proves AC-AUTH-002-02: the list is accessible and shows the engagement.
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      seeded = await seedEngagement({ label: "list-new", status: "New" });
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements`);

      // Assert: engagements list is visible
      const list = page.locator('[data-testid="engagements-list"]');
      await expect(
        list,
        "engagements-list must be visible (AC-AUTH-002-01/-02)",
      ).toBeVisible({ timeout: 15_000 });

      // Assert: the seeded engagement row appears in the list
      const engRow = page.locator(`[data-testid="engagement-item-${seeded.engagementId}"]`);
      await expect(
        engRow,
        `engagement-item-${seeded.engagementId} must be visible in the list (AC-AUTH-002-01)`,
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 01: engagements list showing the New engagement
      await page.screenshot({
        path: shot("01-AC-LIFE-001-02-engagement-list-new.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 02: Advance New → In Progress (AC-LIFE-003-01 / AC-LIFE-001-03) ──

test(
  "[AC-LIFE-003-01] [AC-LIFE-001-03] @demo 02 — jane-accountant: advances engagement New → In Progress",
  async ({ page, request }) => {
    // Screen 02: jane-accountant navigates to the engagement detail page for a New engagement.
    // She clicks "Advance to In Progress" and the status badge updates.
    // Proves AC-LIFE-003-01: accountant can change an engagement's status.
    // Proves AC-LIFE-001-03: New → In Progress is the first step in the forward pipeline.
    //
    // ADR-006: admin surface.
    // ADR-003: session-verified accountant drives the transition.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      seeded = await seedEngagement({ label: "advance-new", status: "New" });
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      // Assert: status panel is visible and shows New
      const panel = page.locator('[data-testid="engagement-status-panel"]');
      await expect(panel, "engagement-status-panel must be visible").toBeVisible({ timeout: 15_000 });

      const badge = page.locator('[data-testid="engagement-status-badge"]');
      await expect(badge, "badge must show New before advancing").toHaveAttribute("data-status", "New");

      // When: accountant clicks Advance to In Progress
      const advanceButton = page.locator('[data-testid="advance-status-button"]');
      await expect(advanceButton, "advance-status-button must be visible").toBeVisible({ timeout: 10_000 });
      await advanceButton.click();

      // Then: badge advances to In Progress
      await expect(badge, "badge must show In Progress (AC-LIFE-003-01, AC-LIFE-001-03)").toHaveAttribute(
        "data-status",
        "In Progress",
        { timeout: 10_000 },
      );
      await expect(badge).toContainText("In Progress");

      // Screenshot 02: engagement panel showing In Progress after the New → In Progress transition
      await page.screenshot({
        path: shot("02-AC-LIFE-003-01-advance-to-in-progress.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 03: Advance In Progress → Review (AC-LIFE-001-03) ──

test(
  "[AC-LIFE-001-03] @demo 03 — jane-accountant: advances engagement In Progress → Review",
  async ({ page, request }) => {
    // Screen 03: from In Progress, accountant clicks Advance to Review.
    // Proves AC-LIFE-001-03: In Progress → Review is the second forward-pipeline step.
    // Proves AC-LIFE-004-01: Review means accountant is reviewing her own work before delivery.
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      // Seed at "In Progress" to demonstrate the next forward step
      seeded = await seedEngagement({ label: "advance-ip", status: "In Progress" });
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-status-panel"]');
      await expect(panel, "engagement-status-panel must be visible").toBeVisible({ timeout: 15_000 });

      const badge = page.locator('[data-testid="engagement-status-badge"]');
      await expect(badge, "badge must show In Progress before advancing").toHaveAttribute("data-status", "In Progress");

      // When: accountant clicks Advance to Review
      const advanceButton = page.locator('[data-testid="advance-status-button"]');
      await expect(advanceButton, "advance-status-button must be visible").toBeVisible({ timeout: 10_000 });
      await expect(advanceButton).toContainText("Review");
      await advanceButton.click();

      // Then: badge advances to Review
      await expect(badge, "badge must show Review (AC-LIFE-001-03)").toHaveAttribute("data-status", "Review", {
        timeout: 10_000,
      });
      await expect(badge).toContainText("Review");

      // Screenshot 03: engagement panel in Review status
      await page.screenshot({
        path: shot("03-AC-LIFE-001-03-advance-to-review.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 04: Confirm delivery (AC-LIFE-005-01) ──

test(
  "[AC-LIFE-005-01] @demo 04 — jane-accountant: confirms delivery (first of two-confirmation gate)",
  async ({ page, request }) => {
    // Screen 04: in Review status, accountant confirms delivery.
    // Proves AC-LIFE-005-01: marking Complete requires explicit delivery confirmation.
    // Shows the Complete button is still disabled (AC-LIFE-005-03 — one confirmation is not enough).
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      seeded = await seedEngagement({ label: "confirm-delivery", status: "Review" });
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-status-panel"]');
      await expect(panel, "engagement-status-panel must be visible").toBeVisible({ timeout: 15_000 });

      const badge = page.locator('[data-testid="engagement-status-badge"]');
      await expect(badge, "badge must show Review").toHaveAttribute("data-status", "Review");

      // Confirm delivery button is visible (AC-LIFE-005-01)
      const deliveryButton = page.locator('[data-testid="confirm-delivery-button"]');
      await expect(deliveryButton, "confirm-delivery-button must be visible (AC-LIFE-005-01)").toBeVisible({
        timeout: 10_000,
      });
      await deliveryButton.click();

      // Delivery check indicator shows confirmed
      const deliveryCheck = page.locator('[data-testid="confirm-delivery-check"]');
      await expect(
        deliveryCheck,
        "confirm-delivery-check must have data-confirmed='true' (AC-LIFE-005-01)",
      ).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });

      // Complete button is still disabled (AC-LIFE-005-03 — both required)
      const completeButton = page.locator('[data-testid="complete-engagement-button"]');
      await expect(
        completeButton,
        "complete-engagement-button must remain disabled after only delivery confirmed (AC-LIFE-005-03)",
      ).toBeDisabled({ timeout: 5_000 });

      // Screenshot 04: delivery confirmed, filing not yet confirmed, Complete still disabled
      await page.screenshot({
        path: shot("04-AC-LIFE-005-01-confirm-delivery.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 05: Both confirmed → Complete (AC-LIFE-005-02 / AC-LIFE-005-03 / AC-LIFE-001-03) ──

test(
  "[AC-LIFE-005-02] [AC-LIFE-005-03] [AC-LIFE-001-03] @demo 05 — jane-accountant: both confirmed → Complete engagement",
  async ({ page, request }) => {
    // Screen 05: in Review status with BOTH confirmations pre-set via fixture.
    // Complete button is enabled. Accountant clicks Complete.
    // Proves AC-LIFE-005-02: filing confirmation is required before Complete.
    // Proves AC-LIFE-005-03: both confirmations required — positive case.
    // Proves AC-LIFE-001-03: Review → Complete final pipeline step.
    // Reopen button appears (AC-LIFE-006-01 affordance visible after Complete).
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      // Seed at "Review" with BOTH confirmations already set
      seeded = await seedEngagement({
        label: "complete-both",
        status: "Review",
        deliveryConfirmedAt: true,
        filingConfirmedAt: true,
      });
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-status-panel"]');
      await expect(panel, "engagement-status-panel must be visible").toBeVisible({ timeout: 15_000 });

      const badge = page.locator('[data-testid="engagement-status-badge"]');
      await expect(badge, "badge must show Review").toHaveAttribute("data-status", "Review");

      // Both confirmation checks show confirmed
      const deliveryCheck = page.locator('[data-testid="confirm-delivery-check"]');
      const filingCheck = page.locator('[data-testid="confirm-filing-check"]');
      await expect(
        deliveryCheck,
        "delivery-check must be confirmed (AC-LIFE-005-01)",
      ).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });
      await expect(
        filingCheck,
        "filing-check must be confirmed (AC-LIFE-005-02)",
      ).toHaveAttribute("data-confirmed", "true", { timeout: 10_000 });

      // Complete button enabled (both confirmations present — AC-LIFE-005-03 positive case)
      const completeButton = page.locator('[data-testid="complete-engagement-button"]');
      await expect(
        completeButton,
        "complete-engagement-button must be enabled when both confirmations present (AC-LIFE-005-03)",
      ).toBeEnabled({ timeout: 10_000 });

      // Accountant clicks Complete
      await completeButton.click();

      // Badge advances to Complete (AC-LIFE-001-03 final step)
      await expect(badge, "badge must show Complete (AC-LIFE-001-03)").toHaveAttribute("data-status", "Complete", {
        timeout: 10_000,
      });
      await expect(badge).toContainText("Complete");

      // Reopen button appears (AC-LIFE-006-01 affordance)
      const reopenButton = page.locator('[data-testid="reopen-engagement-button"]');
      await expect(
        reopenButton,
        "reopen-engagement-button must be visible after Complete (AC-LIFE-006-01 affordance)",
      ).toBeVisible({ timeout: 5_000 });

      // Screenshot 05: engagement in Complete status with reopen button visible
      await page.screenshot({
        path: shot("05-AC-LIFE-005-02-confirm-filing-complete.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

// ─── Screen 06: Reopen (AC-LIFE-006-01) ──

test(
  "[AC-LIFE-006-01] @demo 06 — jane-accountant: reopens a Complete engagement back to In Progress",
  async ({ page, request }) => {
    // Screen 06: from Complete status, accountant clicks Reopen.
    // Proves AC-LIFE-006-01: accountant can reopen a Complete engagement back into active work.
    //
    // ADR-006: admin surface.
    // CS-GEN-003: AC tags in test name.

    let seeded: DemoSeedResult | null = null;
    try {
      // Seed at "Complete" with both confirmations
      seeded = await seedEngagement({
        label: "reopen",
        status: "Complete",
        deliveryConfirmedAt: true,
        filingConfirmedAt: true,
      });
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}`);

      const panel = page.locator('[data-testid="engagement-status-panel"]');
      await expect(panel, "engagement-status-panel must be visible").toBeVisible({ timeout: 15_000 });

      const badge = page.locator('[data-testid="engagement-status-badge"]');
      await expect(badge, "badge must show Complete before reopen").toHaveAttribute("data-status", "Complete");

      // Reopen button is visible (AC-LIFE-006-01 affordance)
      const reopenButton = page.locator('[data-testid="reopen-engagement-button"]');
      await expect(
        reopenButton,
        "reopen-engagement-button must be visible for a Complete engagement (AC-LIFE-006-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Accountant clicks Reopen
      await reopenButton.click();

      // Badge reverts to In Progress (AC-LIFE-006-01)
      await expect(badge, "badge must revert to In Progress after reopen (AC-LIFE-006-01)").toHaveAttribute(
        "data-status",
        "In Progress",
        { timeout: 10_000 },
      );
      await expect(badge).toContainText("In Progress");

      // Advance button appears (engagement is back in active work)
      const advanceButton = page.locator('[data-testid="advance-status-button"]');
      await expect(
        advanceButton,
        "advance-status-button must appear after reopen (back in active work)",
      ).toBeVisible({ timeout: 5_000 });

      // Screenshot 06: engagement reopened back to In Progress
      await page.screenshot({
        path: shot("06-AC-LIFE-006-01-reopen.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
    }
  },
);

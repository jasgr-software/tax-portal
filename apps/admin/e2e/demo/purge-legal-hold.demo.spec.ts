/**
 * apps/admin/e2e/demo/purge-legal-hold.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-015 Post-retention purge & legal hold gallery
 * (admin / Tax Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo` (which also excludes @video). It drives
 * jane-accountant's post-retention destructive-lifecycle happy-path against the live
 * docker-compose container stack (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot
 * gallery to docs/demos/EPIC-015/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-document-lifecycle (.planning/flows/flow-document-lifecycle.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * The journey (one engagement, expired retention window):
 *   place a legal hold → the held engagement shows the blocked-by-hold reason (cannot purge) →
 *   lift the hold → eligibility is restored → confirm the purge of the expired engagement →
 *   the audit record (engagement.purged + the hold place/lift events) survives the purge.
 *
 * Gallery ordering (EPIC-015 admin surface — screenshots 01–06):
 *   01-AC-FILE-014-01-place-legal-hold.png
 *       — jane-accountant sees the Place Legal Hold control on a purge-eligible engagement (AC-FILE-014-01)
 *   02-AC-FILE-014-03-held-engagement-blocked.png
 *       — After placing the hold: the engagement shows "blocked by an active legal hold" (AC-FILE-014-03)
 *   03-AC-FILE-014-07-lift-legal-hold.png
 *       — The active hold with its Lift control before lifting (AC-FILE-014-05/-07)
 *   04-AC-FILE-013-03-purge-confirm-required.png
 *       — After lifting: eligibility restored; the confirm-before-purge input is shown (AC-FILE-013-03)
 *   05-AC-FILE-013-03-purge-confirmed.png
 *       — The confirmed purge result — engagement data permanently removed (AC-FILE-013-03)
 *   06-AC-NFR-010-07-audit-survives-purge.png
 *       — The audit trail row survives the purge (AC-NFR-010-07 / AC-FILE-013-06) — DB-asserted + on-page state
 *
 * Each test ASSERTS the target element / DB state BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   DECISION (TASK-015-004): Use a deterministic "-demo-015" suffix for all fixture IDs to
 *   distinguish from the e2e gate suites and prior-epic demos. clientUserId is NULL (accountant-
 *   surface demo only). The engagement is seeded *completed* with completedAt ~8 years ago so the
 *   retention window has elapsed (purge-eligible). NO Document rows are seeded for the purge-target
 *   engagement: the destructive sweep's storage-delete loop is then empty, so the demo never
 *   depends on an Azurite byte round-trip (BUG-008-001 does not apply) — the server-side guarantees
 *   (eligibility, hold place/lift, confirmed purge, audit-survives) are what the gallery shows.
 *   Cleanup: cleanupFixture() in try/finally for each test.
 *
 * ADR-005: Sessions via /api/mock-session (role set server-side). RLS not relaxed.
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-018 §5/§6: purge is never-automatic + confirmed; hold suspends indefinitely.
 * ADR-019: place/lift/purge are audited; the audit store survives the purge.
 * ADR-012: Tier-6 e2e (demo variant — non-gating).
 *
 * // ADR-005 // ADR-006 // ADR-018 // ADR-019 // ADR-012 // CS-GEN-001 // CS-GEN-003
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-015 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-015/.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-015");
const shot = (file: string) => path.join(DEMO_DIR, file);

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

const ACCOUNTANT_CLERK_USER_ID = "user_accountant_e2e_001";

// ─── DB helpers (admin pool — RLS-exempt seed/teardown + audit assertions) ─────

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

  const resolvedUser = user ?? params["user"];
  const resolvedPassword = password ?? params["password"];
  const resolvedPort =
    port !== 1433
      ? port
      : params["port"]
        ? parseInt(params["port"], 10)
        : 1433;

  const encrypt = (params["encrypt"] ?? "true").toLowerCase() !== "false";
  const trustServerCertificate =
    (params["trustServerCertificate"] ?? "false").toLowerCase() === "true";

  return {
    server,
    port: resolvedPort,
    user: resolvedUser,
    password: resolvedPassword,
    database: params["database"] ?? "master",
    options: { encrypt, trustServerCertificate },
  };
}

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[purge-legal-hold.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

// ─── Fixture types ─────────────────────────────────────────────────────────────

interface DemoFixture {
  engagementId: string;
  engagementRequestId: string;
}

// ─── Fixture seed helpers ──────────────────────────────────────────────────────

/** completedAt ~8 years in the past → 7-year retention window elapsed → purge-eligible. */
function expiredCompletedAt(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 8);
  return d;
}

/**
 * Seed a *completed* (expired-window) Engagement with NO documents (clean purge, no Azurite bytes).
 * DECISION (TASK-015-004): clientUserId NULL (accountant-surface demo only). The "-demo-015"
 *   suffix distinguishes from all gate suites and prior-epic demos.
 */
async function seedExpiredEngagement(suffix: string): Promise<DemoFixture> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", "JaneDemo015")
    .input("lastName", "PurgeLegalHold")
    .input("email", `e2e-demo-015-${suffix}@purge-legal-hold.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[purge-legal-hold.demo.spec] Failed to seed EngagementRequest");
  }

  const engResult = await pool
    .request()
    .input("engagementRequestId", engagementRequestId)
    .input("completedAt", expiredCompletedAt())
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [completedAt], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, 'Complete', @completedAt, GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[purge-legal-hold.demo.spec] Failed to seed Engagement");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Read the exact rendered active-hold-item testid suffix (the holdId) from the DOM, so the lift
 * button locator matches the GUID's DB casing exactly (avoids optimistic-update id-casing drift).
 */
async function readRenderedHoldId(page: import("@playwright/test").Page): Promise<string | null> {
  const testid = await page
    .locator('[data-testid^="active-hold-item-"]')
    .first()
    .getAttribute("data-testid");
  if (!testid) return null;
  return testid.replace(/^active-hold-item-/, "");
}

async function activeHoldIdFor(engagementId: string): Promise<string | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `SELECT TOP 1 [id]
       FROM [dbo].[LegalHold]
       WHERE [engagementId] = @engagementId AND [liftedAt] IS NULL
       ORDER BY [placedAt] DESC`,
    );
  return result.recordset[0]?.id?.toLowerCase() ?? null;
}

/** Count AuditEvent rows for an action targeting the engagementId — proves audit-survives-purge. */
async function countAuditEventForEngagement(
  action: string,
  engagementId: string,
): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("action", action)
    .input("targetId", engagementId)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM [dbo].[AuditEvent]
       WHERE [action] = @action AND [targetId] = @targetId`,
    );
  return result.recordset[0]?.cnt ?? 0;
}

/** Count Document rows for an engagement — purge destroys the document data graph (ADR-018 §5). */
async function documentRowCount(engagementId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", engagementId)
    .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [dbo].[Document] WHERE [engagementId] = @id`);
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Clean up fixture rows in FK order (idempotent). Safe to call after a purge (rows already gone).
 * AuditEvent rows are append-only and intentionally NOT deleted here (ledger), but the demo
 * fixture's audit rows are keyed to the engagementId/holdId and harmless to retain.
 */
async function cleanupFixture(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("engagementId", engagementId)
    .query(`DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = @engagementId`);

  await pool
    .request()
    .input("engagementId", engagementId)
    .query(`
      DELETE dv FROM [dbo].[DocumentVersion] dv
      INNER JOIN [dbo].[Document] d ON dv.[documentId] = d.[id]
      WHERE d.[engagementId] = @engagementId
    `);

  await pool
    .request()
    .input("engagementId", engagementId)
    .query(`DELETE FROM [dbo].[Document] WHERE [engagementId] = @engagementId`);

  await pool
    .request()
    .input("id", engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  await pool
    .request()
    .input("id", engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── afterAll: close pool ──────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ─── The full jane-accountant journey: place → blocked → lift → confirm purge → audit survives ─

test(
  "[AC-FILE-014-01] [AC-FILE-014-03] [AC-FILE-013-03] [AC-NFR-010-07] @demo 01-06 — jane-accountant: place hold → blocked → lift → confirm purge → audit survives",
  async ({ page, request }) => {
    test.setTimeout(120_000);

    const suffix = `journey-${Date.now()}`;
    const fixture = await seedExpiredEngagement(suffix);

    try {
      await setupAccountantSession(page, request);

      // ── Screen 01: place a legal hold (AC-FILE-014-01) ──────────────────────────
      // Given: jane-accountant on a purge-eligible engagement's documents page.
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const retentionPanel = page.locator('[data-testid="retention-panel"]');
      await expect(retentionPanel, "retention-panel must be visible (AC-FILE-014-01)").toBeVisible({
        timeout: 15_000,
      });

      const placeButton = page.locator('[data-testid="legal-hold-place"]');
      await expect(
        placeButton,
        "legal-hold-place button must be visible (AC-FILE-014-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 01: the Place Legal Hold control on a purge-eligible engagement.
      await page.screenshot({
        path: shot("01-AC-FILE-014-01-place-legal-hold.png"),
        fullPage: true,
      });

      // When: she places the hold.
      await placeButton.click();
      await expect(
        page.locator('[data-testid="active-holds-list"]'),
        "active-holds-list must appear after placing the hold",
      ).toBeVisible({ timeout: 15_000 });

      const holdId = await activeHoldIdFor(fixture.engagementId);
      expect(holdId, "an active LegalHold row must exist after placing").toBeTruthy();

      // ── Screen 02: the held engagement is blocked-by-hold (AC-FILE-014-03) ─────
      // Reload so the server re-derives eligibility with the hold present.
      await page.reload();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const eligibilityReason = page.locator('[data-testid="purge-eligibility-reason"]');
      await expect(
        eligibilityReason,
        "purge-eligibility-reason must be visible (AC-FILE-014-03)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        eligibilityReason,
        "[AC-FILE-014-03] a held engagement must show the blocked-by-hold reason — cannot purge",
      ).toContainText(/active legal hold/i, { timeout: 10_000 });

      // While held, the purge confirm flow must NOT be available (eligible === false).
      await expect(
        page.locator('[data-testid="purge-button"]'),
        "[AC-FILE-014-03] no purge-button while the engagement is held",
      ).toHaveCount(0, { timeout: 5_000 });

      // Screenshot 02: held engagement blocked-by-hold.
      await page.screenshot({
        path: shot("02-AC-FILE-014-03-held-engagement-blocked.png"),
        fullPage: true,
      });

      // ── Screen 03: lift the hold (AC-FILE-014-05/-07) ──────────────────────────
      // Read the exact rendered holdId from the DOM so the lift locator matches GUID casing.
      const renderedHoldId = await readRenderedHoldId(page);
      expect(renderedHoldId, "an active-hold-item must be rendered before lift").toBeTruthy();

      const liftButton = page.locator(`[data-testid="legal-hold-lift-${renderedHoldId}"]`);
      await expect(
        liftButton,
        "legal-hold-lift button must be visible for the active hold (AC-FILE-014-05)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 03: the active hold with its Lift control.
      await page.screenshot({
        path: shot("03-AC-FILE-014-07-lift-legal-hold.png"),
        fullPage: true,
      });

      // When: she lifts the hold.
      await liftButton.click();
      await expect(
        page.locator(`[data-testid="active-hold-item-${renderedHoldId}"]`),
        "lifted hold must leave the active holds list (AC-FILE-014-07)",
      ).not.toBeVisible({ timeout: 15_000 });

      const stillActive = await activeHoldIdFor(fixture.engagementId);
      expect(stillActive, "no active hold should remain after lift (AC-FILE-014-07)").toBeNull();

      // ── Screen 04: eligibility restored → confirm-before-purge (AC-FILE-013-03) ─
      // Reload so the server re-derives eligibility (hold lifted, window elapsed → eligible).
      await page.reload();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      await expect(
        page.locator('[data-testid="purge-eligibility-reason"]'),
        "[AC-FILE-014-05] eligibility restored after lifting the hold",
      ).toContainText(/Eligible for purge/i, { timeout: 10_000 });

      const initiateButton = page.locator('[data-testid="purge-button"]');
      await expect(
        initiateButton,
        "purge-button must be visible once eligible (AC-FILE-013-03)",
      ).toBeVisible({ timeout: 10_000 });
      await initiateButton.click();

      const confirmInput = page.locator('[data-testid="purge-confirm-input"]');
      const confirmSubmit = page.locator('[data-testid="purge-confirm-submit"]');
      await expect(confirmInput, "purge-confirm-input must appear (AC-FILE-013-03)").toBeVisible({
        timeout: 10_000,
      });
      await expect(
        confirmSubmit,
        "[AC-FILE-013-03] purge-confirm-submit is DISABLED before the engagement ID is typed",
      ).toBeDisabled({ timeout: 5_000 });

      // Screenshot 04: confirm-before-purge — input shown, submit disabled.
      await page.screenshot({
        path: shot("04-AC-FILE-013-03-purge-confirm-required.png"),
        fullPage: true,
      });

      // When: she types the exact engagement ID — the explicit confirmation.
      await confirmInput.fill(fixture.engagementId);
      await expect(
        confirmSubmit,
        "[AC-FILE-013-03] purge-confirm-submit enables only on the exact engagementId",
      ).toBeEnabled({ timeout: 5_000 });

      // And confirms the purge.
      await confirmSubmit.click();

      const purgeResult = page.locator('[data-testid="purge-result"]');
      await expect(
        purgeResult,
        "[AC-FILE-013-03] purge-result must confirm the data was permanently removed",
      ).toBeVisible({ timeout: 20_000 });

      // Screenshot 05: purge confirmed.
      await page.screenshot({
        path: shot("05-AC-FILE-013-03-purge-confirmed.png"),
        fullPage: true,
      });

      // ── Screen 06: audit survives the purge (AC-NFR-010-07 / AC-FILE-013-06) ────
      // The engagement's document data graph is destroyed (ADR-018 §5: rows + bytes removed) …
      const docCount = await documentRowCount(fixture.engagementId);
      expect(docCount, "[AC-FILE-013-03] the engagement's document data is purged").toBe(0);

      // … but the 'engagement.purged' audit row for it SURVIVES (audit excluded from the sweep).
      const purgedAudit = await countAuditEventForEngagement("engagement.purged", fixture.engagementId);
      expect(
        purgedAudit,
        "[AC-NFR-010-07] the 'engagement.purged' audit row survives the purge",
      ).toBeGreaterThanOrEqual(1);

      // Screenshot 06: on-page state after a successful purge (the audit survives — DB-asserted above).
      await page.screenshot({
        path: shot("06-AC-NFR-010-07-audit-survives-purge.png"),
        fullPage: true,
      });

      console.info(
        `[AC-FILE-014-01] [AC-FILE-014-03] [AC-FILE-013-03] [AC-NFR-010-07] demo journey complete: ` +
          `engagement ${fixture.engagementId} — hold placed (${holdId}) → blocked → lifted → ` +
          `confirmed purge → 'engagement.purged' audit row survives (count=${purgedAudit}).`,
      );
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  },
);

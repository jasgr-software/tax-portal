/**
 * apps/admin/e2e/specs/purge-legal-hold.spec.ts
 *
 * Tier-6 e2e — Accountant purge-confirm + legal-hold place/lift surface (Tax Portal / apps/admin).
 *
 * TASK-015-004 / BRIEF-015 / EPIC-015 — post-retention destructive lifecycle.
 *
 * Acceptance criteria covered (tier-6 per the epic sign-off contract):
 *   AC-FILE-013-03 — the accountant must explicitly confirm a purge before any data is removed;
 *                    purge-confirm-submit stays disabled until the typed value === engagementId.
 *   AC-FILE-014-01 — the accountant can place a legal hold on an engagement (it shows held).
 *   AC-FILE-014-06 — placing a hold is recorded in the audit trail (AuditEvent 'legal_hold.placed').
 *   AC-FILE-014-07 — lifting a hold is recorded in the audit trail (AuditEvent 'legal_hold.lifted').
 *
 * Gherkin binding (BRIEF-015 § Acceptance scenarios — verbatim):
 *
 *   AC-FILE-013-03:
 *     Given a purge-eligible engagement and the accountant initiating a purge
 *     When she has not explicitly confirmed it
 *     Then no data is permanently removed until she confirms
 *
 *   AC-FILE-014-01:
 *     Given the accountant and an engagement
 *     When she places a legal hold on it
 *     Then the engagement is under legal hold
 *
 *   AC-FILE-014-06:
 *     Given the accountant placing a legal hold
 *     When the action completes
 *     Then it is recorded in the audit trail (who, on what, when)
 *
 *   AC-FILE-014-07:
 *     Given the accountant lifting a legal hold
 *     When the action completes
 *     Then it is recorded in the audit trail (who, on what, when)
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * Fixture strategy:
 *   Seeds a *completed* Engagement whose completedAt is ~8 years in the past so the 7-year
 *   retention window has already elapsed (RETENTION_WINDOW_YEARS default 7; the env override
 *   only accepts a value > 0, so the past-completedAt seed — not a 0 override — is the way to
 *   make a row purge-eligible). With no active hold this engagement is purge-eligible, which
 *   makes the RetentionPanel render the confirm-before-purge flow (AC-FILE-013-03).
 *   Place/lift are metadata-only operations (no byte round-trip) — BUG-008-001 does not apply.
 *
 *   The audit assertions (AC-FILE-014-06/-07) read the REAL AuditEvent ledger directly via the
 *   admin pool, mirroring packages/db/src/legal-hold.integration.test.ts — the audit row carries
 *   targetId = the LegalHold.id, so the spec reads the holdId from the LegalHold table by
 *   engagementId, then asserts the matching 'legal_hold.placed' / 'legal_hold.lifted' rows.
 *
 * data-testid hooks (must match _components/RetentionPanel.tsx):
 *   data-testid="retention-panel"             — panel container
 *   data-testid="purge-eligibility-reason"    — eligibility reason text
 *   data-testid="legal-hold-place"            — Place hold button
 *   data-testid="active-holds-list"           — list of active holds
 *   data-testid="active-hold-item-{holdId}"   — each active hold item
 *   data-testid="legal-hold-lift-{holdId}"    — Lift hold button (per hold)
 *   data-testid="purge-button"                — Initiate Purge button (eligible engagements only)
 *   data-testid="purge-confirm-input"         — confirmation input (type the engagementId)
 *   data-testid="purge-confirm-submit"        — Confirm Purge button (disabled until input === engagementId)
 *   data-testid="purge-cancel"                — Cancel confirm
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'purge-legal-hold'
 *
 * ADR-003: identity from session cookie (getAccountantIdentity before any write).
 * ADR-005: purge + hold are admin-pool, accountant-only; RLS policy + identity guard enforced.
 * ADR-006: purge + legal-hold surface is admin-only (apps/admin); portal exposes none.
 * ADR-010: cross-app — the no-client absence is proven on the portal surface (separate spec).
 * ADR-018 §5/§6: purge is never-automatic + confirmed; hold suspends indefinitely; lift restores eligibility.
 * ADR-019: place/lift/purge are audited; the audit store survives the purge (audit-excluded sweep).
 * ADR-012: Tier-6 e2e.
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010 // ADR-018 // ADR-019 // ADR-012
 * // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-013-03 // AC-FILE-014-01 // AC-FILE-014-06 // AC-FILE-014-07
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// The accountant clerk id used by setupAccountantSession (mock session default).
// The AuditEvent actor must match this (ADR-019 actor from verified session — CS-TS-004).
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
      "[purge-legal-hold.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

interface EngagementFixture {
  engagementId: string;
  engagementRequestId: string;
}

// ─── Fixture seed helpers ──────────────────────────────────────────────────────

/**
 * CompletedAt date ~8 years in the past so the 7-year retention window has elapsed.
 * RETENTION_WINDOW_YEARS default is 7; the env override only accepts values > 0, so a
 * past-completedAt seed (not a 0 override) is the way to make an engagement purge-eligible.
 * // ADR-018 §3 // DECISION (TASK-015-004): mirror packages/db purge.integration.test.ts expiredCompletedAt()
 */
function expiredCompletedAt(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 8);
  return d;
}

/**
 * Seed an EngagementRequest + a *completed* Engagement whose completedAt is ~8 years ago.
 * With no active hold this engagement is purge-eligible (window elapsed AND no hold).
 *
 * DECISION (TASK-015-004): seeds a completed engagement directly so the RetentionPanel
 *   renders the confirm-before-purge flow (AC-FILE-013-03). No Document rows are needed
 *   for the confirm-disabled and place/lift-hold assertions — the gate is server-side
 *   (eligibility derivation, hold place/lift, audit emission). Suffix "-e2e-015"
 *   distinguishes from all other suites (mirrors EPIC-014's deterministic per-run ids).
 *
 * // ADR-018 §3/§5/§6: completedAt is the retention-clock anchor; window elapsed → eligible.
 */
async function seedCompletedEngagement(suffix: string): Promise<EngagementFixture> {
  const pool = await getPool();

  // 1. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("firstName", "Jane")
    .input("lastName", "PurgeHold015")
    .input("email", `e2e-015-${suffix}@purge-legal-hold.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[purge-legal-hold.spec] seedCompletedEngagement: no EngagementRequest id");
  }

  // 2. Seed a *completed* Engagement with completedAt ~8 years ago (window elapsed).
  // ADR-018 §3: completedAt is the retention-clock anchor — elapsed window → purge-eligible.
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
    throw new Error("[purge-legal-hold.spec] seedCompletedEngagement: no Engagement id");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Read the most-recent active LegalHold.id for an engagement (admin pool).
 * The audit row's targetId is the holdId; the UI surfaces it only via the
 * active-hold-item-{holdId} testid — reading it from the table is the deterministic path.
 */
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

/**
 * Read the exact rendered active-hold-item testid suffix (the holdId) from the DOM.
 * The server renders data-testid="active-hold-item-{holdId}" with the GUID in the DB's casing;
 * reading it from the DOM guarantees the locator + lift button match exactly (avoids casing drift).
 */
async function readRenderedHoldId(page: import("@playwright/test").Page): Promise<string | null> {
  const testid = await page
    .locator('[data-testid^="active-hold-item-"]')
    .first()
    .getAttribute("data-testid");
  if (!testid) return null;
  return testid.replace(/^active-hold-item-/, "");
}

/**
 * Count AuditEvent rows for a given action + targetId (admin pool).
 * AC-FILE-014-06/-07: the audit store is the real ledger — assert the row exists.
 * // ADR-019 // AC-FILE-014-06 // AC-FILE-014-07
 */
async function countAuditEventRows(action: string, targetId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("action", action)
    .input("targetId", targetId)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM [dbo].[AuditEvent]
       WHERE [action] = @action AND [targetId] = @targetId`,
    );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Read the actor (clerkUserId + role + sourceSurface) of the latest audit row for action + targetId.
 * Proves the audit record captures WHO performed the action (ADR-019 / AC-FILE-014-06/-07).
 */
async function latestAuditActor(
  action: string,
  targetId: string,
): Promise<{ clerkUserId: string; actorRole: string; sourceSurface: string } | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("action", action)
    .input("targetId", targetId)
    .query<{ clerkUserId: string; actorRole: string; sourceSurface: string }>(
      `SELECT TOP 1 [clerkUserId], [actorRole], [sourceSurface]
       FROM [dbo].[AuditEvent]
       WHERE [action] = @action AND [targetId] = @targetId
       ORDER BY [id] DESC`,
    );
  return result.recordset[0] ?? null;
}

/**
 * Clean up all seeded rows in FK order. LegalHold rows reference the engagement
 * with onDelete: NoAction, so they must be removed before the engagement.
 * // ADR-002: LegalHold FK is NoAction — delete holds first.
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

// ══════════════════════════════════════════════════════════════════════════════
// AC-FILE-014-01 / AC-FILE-014-06 — Place a legal hold → it shows held + audited
//
// Gherkin (BRIEF-015 § Acceptance scenarios — verbatim):
//   Given the accountant and an engagement
//   When she places a legal hold on it
//   Then the engagement is under legal hold
//
//   Given the accountant placing a legal hold
//   When the action completes
//   Then it is recorded in the audit trail (who, on what, when)
// ══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-014-01] [AC-FILE-014-06] place a legal hold — engagement shows held + audit row exists", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request); // ADR-003: accountant identity
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-FILE-014-01] [AC-FILE-014-06] purge-legal-hold: accountant places a hold → it appears held → AuditEvent 'legal_hold.placed' exists", async ({ page }) => {
    test.setTimeout(45_000);

    const suffix = `place-${Date.now()}`;
    const fixture = await seedCompletedEngagement(suffix);

    try {
      // Given: the accountant on the engagement documents page (RetentionPanel renders here).
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const retentionPanel = page.locator('[data-testid="retention-panel"]');
      await expect(
        retentionPanel,
        "[AC-FILE-014-01] retention-panel must be visible (admin surface)",
      ).toBeVisible({ timeout: 15_000 });

      // When: she places a legal hold on it.
      const placeButton = page.locator('[data-testid="legal-hold-place"]');
      await expect(
        placeButton,
        "[AC-FILE-014-01] legal-hold-place button must be visible",
      ).toBeVisible({ timeout: 10_000 });
      await placeButton.click();

      // Then: the engagement is under legal hold — the active holds list shows the new hold.
      const activeHoldsList = page.locator('[data-testid="active-holds-list"]');
      await expect(
        activeHoldsList,
        "[AC-FILE-014-01] active-holds-list must be visible after placing a hold",
      ).toBeVisible({ timeout: 15_000 });

      // Reload so the server renders the holds list authoritatively (avoids any optimistic-update
      // id-casing drift — the GUID testid is read straight from the rendered DOM).
      await page.reload();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The hold marker must exist server-side.
      const holdId = await activeHoldIdFor(fixture.engagementId);
      expect(holdId, "[AC-FILE-014-01] an active LegalHold row must exist for the engagement").toBeTruthy();

      // The UI surfaces it as an active-hold-item-{holdId}; read the exact testid suffix from the DOM
      // so the audit assertion uses the same id the server rendered (GUID casing is collation-insensitive
      // in the DB, but the DOM locator must match exactly). // AC-FILE-014-01
      const renderedHoldId = await readRenderedHoldId(page);
      expect(
        renderedHoldId,
        "[AC-FILE-014-01] an active-hold-item must be rendered for the placed hold",
      ).toBeTruthy();

      const activeHoldItem = page.locator(`[data-testid="active-hold-item-${renderedHoldId}"]`);
      await expect(
        activeHoldItem,
        "[AC-FILE-014-01] active-hold-item must be visible for the placed hold",
      ).toBeVisible({ timeout: 10_000 });

      // AC-FILE-014-06: placing a hold is recorded in the audit trail (real AuditEvent ledger).
      // ADR-019: the 'legal_hold.placed' row's targetId is the holdId (collation-insensitive match).
      const placedCount = await countAuditEventRows("legal_hold.placed", holdId!);
      expect(
        placedCount,
        "[AC-FILE-014-06] an AuditEvent 'legal_hold.placed' row must exist for the placed hold",
      ).toBeGreaterThanOrEqual(1);

      // The audit row must capture WHO (the verified accountant) — ADR-019.
      const actor = await latestAuditActor("legal_hold.placed", holdId!);
      expect(actor?.clerkUserId, "[AC-FILE-014-06] audit actor must be the verified accountant").toBe(
        ACCOUNTANT_CLERK_USER_ID,
      );
      expect(actor?.actorRole, "[AC-FILE-014-06] audit actorRole must be ACCOUNTANT").toBe("ACCOUNTANT");
      expect(actor?.sourceSurface, "[AC-FILE-014-06] audit sourceSurface must be admin").toBe("admin");

      console.info(
        `[AC-FILE-014-01] [AC-FILE-014-06] purge-legal-hold: hold ${holdId} placed on ` +
          `engagement ${fixture.engagementId}; AuditEvent 'legal_hold.placed' confirmed (actor=${actor?.clerkUserId}).`,
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-FILE-014-07 — Lift a legal hold → audited
//
// Gherkin (BRIEF-015 § Acceptance scenarios — verbatim):
//   Given the accountant lifting a legal hold
//   When the action completes
//   Then it is recorded in the audit trail (who, on what, when)
// ══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-014-07] lift a legal hold — AuditEvent 'legal_hold.lifted' exists", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request); // ADR-003: accountant identity
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-FILE-014-07] purge-legal-hold: accountant lifts a hold → it leaves the active list → AuditEvent 'legal_hold.lifted' exists", async ({ page }) => {
    test.setTimeout(60_000);

    const suffix = `lift-${Date.now()}`;
    const fixture = await seedCompletedEngagement(suffix);

    try {
      // Given: the accountant places a hold first (so there is one to lift).
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const placeButton = page.locator('[data-testid="legal-hold-place"]');
      await expect(placeButton, "legal-hold-place button must be visible").toBeVisible({ timeout: 10_000 });
      await placeButton.click();

      // Wait for the hold to appear, then reload so the server renders the holds list authoritatively.
      await expect(
        page.locator('[data-testid="active-holds-list"]'),
        "active-holds-list must appear after placing the hold",
      ).toBeVisible({ timeout: 15_000 });
      await page.reload();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const holdId = await activeHoldIdFor(fixture.engagementId);
      expect(holdId, "an active LegalHold row must exist before lift").toBeTruthy();

      // Read the exact rendered holdId from the DOM so the lift button locator matches GUID casing.
      const renderedHoldId = await readRenderedHoldId(page);
      expect(renderedHoldId, "an active-hold-item must be rendered before lift").toBeTruthy();

      const liftButton = page.locator(`[data-testid="legal-hold-lift-${renderedHoldId}"]`);
      await expect(
        liftButton,
        "[AC-FILE-014-07] legal-hold-lift button must be visible for the active hold",
      ).toBeVisible({ timeout: 10_000 });

      // When: she lifts the hold.
      await liftButton.click();

      // Then: the hold leaves the active list — the active-hold-item is no longer visible.
      await expect(
        page.locator(`[data-testid="active-hold-item-${renderedHoldId}"]`),
        "[AC-FILE-014-07] lifted hold must leave the active holds list",
      ).not.toBeVisible({ timeout: 15_000 });

      // The hold must be marked lifted server-side (no longer active).
      const stillActive = await activeHoldIdFor(fixture.engagementId);
      expect(
        stillActive,
        "[AC-FILE-014-07] the engagement must have no active hold after lift",
      ).toBeNull();

      // AC-FILE-014-07: lifting a hold is recorded in the audit trail (real AuditEvent ledger).
      // ADR-019: the 'legal_hold.lifted' row's targetId is the holdId.
      const liftedCount = await countAuditEventRows("legal_hold.lifted", holdId!);
      expect(
        liftedCount,
        "[AC-FILE-014-07] an AuditEvent 'legal_hold.lifted' row must exist for the lifted hold",
      ).toBeGreaterThanOrEqual(1);

      const actor = await latestAuditActor("legal_hold.lifted", holdId!);
      expect(actor?.clerkUserId, "[AC-FILE-014-07] audit actor must be the verified accountant").toBe(
        ACCOUNTANT_CLERK_USER_ID,
      );
      expect(actor?.actorRole, "[AC-FILE-014-07] audit actorRole must be ACCOUNTANT").toBe("ACCOUNTANT");
      expect(actor?.sourceSurface, "[AC-FILE-014-07] audit sourceSurface must be admin").toBe("admin");

      console.info(
        `[AC-FILE-014-07] purge-legal-hold: hold ${holdId} lifted on engagement ` +
          `${fixture.engagementId}; AuditEvent 'legal_hold.lifted' confirmed (actor=${actor?.clerkUserId}).`,
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-FILE-013-03 — Confirm-before-purge: no purge fires without explicit confirmation
//
// Gherkin (BRIEF-015 § Acceptance scenarios — verbatim):
//   Given a purge-eligible engagement and the accountant initiating a purge
//   When she has not explicitly confirmed it
//   Then no data is permanently removed until she confirms
//
// The deliberate-confirmation mechanism (RetentionPanel): purge-confirm-submit stays
// DISABLED until purge-confirm-input === engagementId. This spec proves that no purge
// can fire without the explicit confirmation: the submit is disabled with an empty input,
// disabled with a wrong value, and only enabled once the exact engagementId is typed —
// AND that the engagement's data survives while unconfirmed (never-automatic, ADR-018 §5).
// ══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-013-03] confirm-before-purge — purge-confirm-submit stays disabled until input === engagementId", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request); // ADR-003: accountant identity
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-FILE-013-03] purge-legal-hold: no purge fires without explicit confirmation (submit disabled until exact engagementId typed)", async ({ page }) => {
    test.setTimeout(45_000);

    const suffix = `confirm-${Date.now()}`;
    const fixture = await seedCompletedEngagement(suffix);

    try {
      // Given: a purge-eligible engagement (window elapsed, no hold).
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const retentionPanel = page.locator('[data-testid="retention-panel"]');
      await expect(retentionPanel, "retention-panel must be visible").toBeVisible({ timeout: 15_000 });

      // The eligibility reason confirms the engagement is purge-eligible (window elapsed, no hold).
      const eligibilityReason = page.locator('[data-testid="purge-eligibility-reason"]');
      await expect(
        eligibilityReason,
        "[AC-FILE-013-03] purge-eligibility-reason must be visible",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        eligibilityReason,
        "[AC-FILE-013-03] engagement must be purge-eligible (window elapsed, no hold)",
      ).toContainText(/Eligible for purge/i, { timeout: 10_000 });

      // When: she initiates a purge — the confirm flow appears (input + submit).
      const initiateButton = page.locator('[data-testid="purge-button"]');
      await expect(
        initiateButton,
        "[AC-FILE-013-03] purge-button (Initiate Purge) must be visible for an eligible engagement",
      ).toBeVisible({ timeout: 10_000 });
      await initiateButton.click();

      const confirmInput = page.locator('[data-testid="purge-confirm-input"]');
      const confirmSubmit = page.locator('[data-testid="purge-confirm-submit"]');
      await expect(confirmInput, "[AC-FILE-013-03] purge-confirm-input must appear").toBeVisible({ timeout: 10_000 });
      await expect(confirmSubmit, "[AC-FILE-013-03] purge-confirm-submit must appear").toBeVisible({ timeout: 10_000 });

      // Then (1): with an EMPTY input, the submit is disabled — no purge can fire.
      await expect(
        confirmSubmit,
        "[AC-FILE-013-03] purge-confirm-submit MUST be disabled with an empty confirmation",
      ).toBeDisabled({ timeout: 5_000 });

      // Then (2): with a WRONG value, the submit stays disabled — confirmation must be exact.
      await confirmInput.fill("not-the-engagement-id");
      await expect(
        confirmSubmit,
        "[AC-FILE-013-03] purge-confirm-submit MUST stay disabled when the typed value !== engagementId",
      ).toBeDisabled({ timeout: 5_000 });

      // Then (3): only the EXACT engagementId enables the submit (the explicit confirmation).
      await confirmInput.fill(fixture.engagementId);
      await expect(
        confirmSubmit,
        "[AC-FILE-013-03] purge-confirm-submit is enabled ONLY once the exact engagementId is typed",
      ).toBeEnabled({ timeout: 5_000 });

      // Never-automatic (ADR-018 §5): the engagement still exists while UNCONFIRMED — we did NOT
      // click submit, so nothing is destroyed. Prove the row is intact and reachable.
      const pool = await getPool();
      const engRow = await pool
        .request()
        .input("id", fixture.engagementId)
        .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [dbo].[Engagement] WHERE [id] = @id`);
      expect(
        engRow.recordset[0]?.cnt,
        "[AC-FILE-013-03] no purge has fired — the engagement row remains until the accountant submits the confirmed purge",
      ).toBe(1);

      console.info(
        `[AC-FILE-013-03] purge-legal-hold: confirm-before-purge proven — submit disabled with ` +
          `empty/wrong input, enabled only on exact engagementId (${fixture.engagementId}); no purge fired ` +
          "without an explicit confirmed submit (engagement row intact).",
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });
});

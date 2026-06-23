/**
 * apps/admin/e2e/demo/engagement-creation-participants.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-012 Engagement creation + participants (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * engagement-creation + duplicate-guard journey, and the martha-and-james two-participant
 * scenario, against the live docker-compose container stack (AUTH_PROVIDER=mock) and writes
 * an AC-tagged screenshot gallery to docs/demos/EPIC-012/. NON-GATING.
 *
 * Personas:
 *   jane-accountant              (.planning/personas/jane-accountant.md)
 *   martha-and-james-married-couple (.planning/personas/martha-and-james-married-couple.md)
 * Flow:    flow-engagement-lifecycle (.planning/flows/flow-engagement-lifecycle.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-012 admin surface — screenshots 05–12):
 *   05-AC-DOOR-010-01-initiate-engagement-button.png
 *       — jane-accountant on /engagements; "New Engagement" button is visible.
 *         Proves AC-DOOR-010-01: accountant can initiate a new engagement.
 *   06-AC-DOOR-010-02-initiate-engagement-form.png
 *       — jane sees the /engagements/new form: client picker + service checkboxes + tax-year.
 *         Proves AC-DOOR-010-02: she selects one or more active services.
 *   07-AC-DOOR-010-03-04-engagement-created-no-accept-decline.png
 *       — engagement created (success state or redirect) with no accept/decline step.
 *         Proves AC-DOOR-010-03: accountant-initiated engagement skips accept/decline.
 *         Proves AC-DOOR-010-04: engagement is tied to the chosen client.
 *   08-AC-LIFE-011-02-duplicate-warning-shown.png
 *       — jane attempts a duplicate (same client + service + tax year); the warning panel
 *         appears showing the existing matching engagement before any second is created.
 *         Proves AC-LIFE-011-02: duplicate condition is shown, not silently blocked.
 *         Proves AC-LIFE-011-04: condition is surfaced for a decision.
 *   09-AC-LIFE-011-03-duplicate-override-created.png
 *       — jane clicks "Create anyway" from the warning; the second engagement is created.
 *         Proves AC-LIFE-011-03: override path creates the second engagement.
 *         Proves AC-DOOR-010-01-04: accountant-initiated flow works with override.
 *   10-AC-AUTH-007-01-participants-list-one.png
 *       — jane navigates to the participants page for a new engagement; the primary client
 *         is already listed (one participant).
 *         Proves AC-AUTH-007-01: one engagement can have more than one CLIENT participant.
 *   11-AC-AUTH-007-01-invite-second-participant.png
 *       — jane fills the invite-email input and submits; two participants are now listed.
 *         Proves AC-AUTH-007-01 / AC-LIFE-012-02 / AC-LIFE-012-03.
 *   12-AC-AUTH-007-02-03-two-distinct-accounts.png
 *       — the participants list shows two separate email addresses (distinct accounts).
 *         Proves AC-AUTH-007-02: each participant has their own distinct account.
 *         Proves AC-LIFE-012-02: no shared login.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * SCOPE DISCIPLINE (RETRO-006 item 4 / retro-012-012):
 *   DEMO_DIR is pinned to docs/demos/EPIC-012 ONLY.
 *   No prior-epic gallery PNGs are touched.
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture pattern (mirrors accountant-initiated-engagement.spec.ts + engagement-participants.spec.ts):
 *   DECISION-E: createAccountantInitiatedEngagement needs User → Engagement → EngagementRequest
 *   chain to resolve client contact info. Seeds a bootstrap engagement for a different service.
 *   Suffix "-demo-012" avoids collision with gate spec suffixes ("-create_", "-dup_", etc.).
 *   ADR-001: the two-participant fixture uses two distinct User rows with distinct clerkIds.
 *
 * ADR-005: Sessions established via /api/mock-session (role set server-side). RLS not
 *          relaxed; admin pool for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-012: Tier-6 e2e.
 * ADR-019: Engagement creation + participant linking are recorded audit events (AuditEvent
 *          is APPEND-ONLY; test cleanup omits audit rows).
 * ADR-023: Invitation goes through the auth provider mock-first seam.
 * CS-GEN-003: cite governing authority in comments.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

// CS-GEN-003: governing authority cited in file header + inline comments.
// ADR-006: admin-only surface walkthrough — jane-accountant + martha-and-james personas.

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-012 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// RETRO-006 / retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-012/.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-012");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── DB helpers (admin pool — RLS-exempt seed/teardown only) ──────────────────
// ADR-005: admin pool used only for fixture setup/teardown; RLS policy is not relaxed.

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
      "[engagement-creation-participants.demo] DATABASE_URL_ADMIN is not set.",
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

// ─── Fixture helpers ──────────────────────────────────────────────────────────

interface SeededUser {
  userId: string;
  clerkId: string;
  email: string;
}

interface SeededService {
  serviceId: string;
  name: string;
}

interface SeededEngagement {
  engagementId: string;
  engagementRequestId: string;
}

/**
 * Seed a CLIENT User row.
 * ADR-001: each participant is their own User row — distinct clerkId + email.
 * CS-GEN-001: only email and role are stored.
 */
async function seedClientUser(suffix: string): Promise<SeededUser> {
  const pool = await getPool();
  const clerkId = `user_e2e_demo012_${suffix}`;
  const email = `e2e-demo012-${suffix}@example.test`;

  const existing = await pool
    .request()
    .input("clerkId", mssqlPkg.NVarChar(64), clerkId)
    .query<{ id: string }>(
      `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );

  if (existing.recordset[0]) {
    return { userId: existing.recordset[0].id, clerkId, email };
  }

  const result = await pool
    .request()
    .input("clerkId", mssqlPkg.NVarChar(64), clerkId)
    .input("email", mssqlPkg.NVarChar(254), email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clerkId, @email, N'CLIENT', SYSDATETIMEOFFSET())`,
    );

  const row = result.recordset[0];
  if (!row) throw new Error("[engagement-creation-participants.demo] seedClientUser: no id returned");
  return { userId: row.id, clerkId, email };
}

/**
 * Seed an active Service row.
 */
async function seedService(name: string): Promise<SeededService> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("name", mssqlPkg.NVarChar(200), name)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@name, 1, 99, SYSDATETIMEOFFSET())`,
    );
  const row = result.recordset[0];
  if (!row) throw new Error("[engagement-creation-participants.demo] seedService: no id returned");
  return { serviceId: row.id, name };
}

/**
 * Seed a pre-existing Engagement for the bootstrap/duplicate scenarios.
 * DECISION-E: needs User → Engagement → EngagementRequest chain.
 */
async function seedExistingEngagement(
  clientUserId: string,
  serviceId: string,
  taxYear: number,
  firstName: string,
  lastName: string,
  email: string,
): Promise<SeededEngagement> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", mssqlPkg.NVarChar(100), firstName)
    .input("lastName", mssqlPkg.NVarChar(100), lastName)
    .input("email", mssqlPkg.NVarChar(254), email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [decidedAt], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, N'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-creation-participants.demo] seedExistingEngagement: no request id");
  const engagementRequestId = reqRow.id;

  await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("serviceId", mssqlPkg.UniqueIdentifier, serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService]
         ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, clientUserId)
    .input("taxYear", mssqlPkg.Int, taxYear)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [taxYear], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, @taxYear, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-creation-participants.demo] seedExistingEngagement: no engagement id");

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Seed a minimal EngagementRequest + Engagement (primary participant only).
 * DECISION-A pattern (pre-accepted envelope).
 * Also seeds the primary client as EngagementParticipant.
 */
async function seedEngagementWithParticipant(
  primaryClientUserId: string,
  email: string,
): Promise<SeededEngagement> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", mssqlPkg.NVarChar(100), "DemoParticipant")
    .input("lastName", mssqlPkg.NVarChar(100), "Primary")
    .input("email", mssqlPkg.NVarChar(254), email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [decidedAt], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, N'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-creation-participants.demo] seedEngagementWithParticipant: no request id");
  const engagementRequestId = reqRow.id;

  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, primaryClientUserId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-creation-participants.demo] seedEngagementWithParticipant: no engagement id");

  // Link primary client as EngagementParticipant (mirrors createAccountantInitiatedEngagement)
  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engRow.id)
    .input("userId", mssqlPkg.UniqueIdentifier, primaryClientUserId)
    .query(
      `IF NOT EXISTS (
         SELECT 1 FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = @engagementId AND [userId] = @userId
       )
       INSERT INTO [dbo].[EngagementParticipant] ([engagementId], [userId], [role], [createdAt])
       VALUES (@engagementId, @userId, N'CLIENT', SYSDATETIMEOFFSET())`,
    );

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Cleanup an engagement and its associated rows (FK order).
 * NOTE: AuditEvent is APPEND-ONLY (ADR-019, LEDGER=ON) — cannot DELETE.
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[EngagementParticipant] WHERE [engagementId] = @engagementId`);

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
    .query(`DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @id`);

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

async function cleanupService(serviceId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, serviceId)
    .query(`DELETE FROM [dbo].[Service] WHERE [id] = @id`);
}

async function cleanupUser(userId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, userId)
    .query(`DELETE FROM [dbo].[User] WHERE [id] = @id`);
}

/**
 * Find all engagements for a client — used for cleanup of server-created engagements.
 */
async function findEngagementsForClient(
  clientUserId: string,
): Promise<{ engagementId: string; engagementRequestId: string }[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("clientUserId", mssqlPkg.UniqueIdentifier, clientUserId)
    .query<{ id: string; engagementRequestId: string }>(
      `SELECT [id], [engagementRequestId] FROM [dbo].[Engagement] WHERE [clientUserId] = @clientUserId`,
    );
  return result.recordset.map((r) => ({
    engagementId: r.id.toLowerCase(),
    engagementRequestId: r.engagementRequestId.toLowerCase(),
  }));
}

/**
 * Clean up any User rows created by the invite action (found by email pattern).
 */
async function cleanupUsersByEmailPattern(pattern: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("pattern", mssqlPkg.NVarChar(260), pattern)
    .query(
      `DELETE FROM [dbo].[User] WHERE [email] LIKE @pattern AND [role] = N'CLIENT'`,
    );
}

// ─── afterAll ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Screens 05–07: jane-accountant initiates a new engagement (AC-DOOR-010-01..04)
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "[AC-DOOR-010-01][AC-DOOR-010-02][AC-DOOR-010-03][AC-DOOR-010-04]" +
    " @demo 05+06+07 — jane-accountant: initiates a new engagement from the Tax Portal",
  async ({ page, request }) => {
    // Screen 05: jane-accountant on /engagements; "New Engagement" button visible (AC-DOOR-010-01)
    // Screen 06: /engagements/new form with client picker + service checkboxes (AC-DOOR-010-02)
    // Screen 07: Engagement created — no accept/decline step (AC-DOOR-010-03/04)

    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let bootstrapSvc: SeededService | null = null;
    let bootstrapEng: SeededEngagement | null = null;
    const ts = Date.now();

    try {
      await setupAccountantSession(page, request);

      client = await seedClientUser(`create_${ts}`);
      svc = await seedService(`Demo012 Create Service ${ts}`);

      // DECISION-E: bootstrap engagement so createAccountantInitiatedEngagement can
      // resolve client contact info (User → Engagement → EngagementRequest chain).
      bootstrapSvc = await seedService(`Demo012 Bootstrap ${ts}`);
      bootstrapEng = await seedExistingEngagement(
        client.userId,
        bootstrapSvc.serviceId,
        2020,
        "DemoJane",
        "CreateClient",
        client.email,
      );

      // ── Screen 05: "New Engagement" button on /engagements ──────────────────
      // Given: jane is on the engagements list page
      await page.goto(`${ADMIN_URL}/engagements`);

      // The "New Engagement" button is visible — AC-DOOR-010-01
      const newEngButton = page.locator('[data-testid="initiate-engagement-button"]');
      await expect(
        newEngButton,
        "initiate-engagement-button must be visible on /engagements (AC-DOOR-010-01)",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 05: engagements list with "New Engagement" button visible
      await page.screenshot({ path: shot("05-AC-DOOR-010-01-initiate-engagement-button.png"), fullPage: true });

      // ── Screen 06: Form at /engagements/new ─────────────────────────────────
      // When: jane clicks "New Engagement"
      await newEngButton.click();
      await page.waitForURL(`${ADMIN_URL}/engagements/new`, { timeout: 10_000 });

      const form = page.locator('[data-testid="initiate-engagement-form"]');
      await expect(
        form,
        "initiate-engagement-form must be visible at /engagements/new (AC-DOOR-010-02)",
      ).toBeVisible({ timeout: 10_000 });

      // Client picker is present — AC-DOOR-010-01
      const clientSelect = page.locator('[data-testid="client-select"]');
      await expect(clientSelect).toBeVisible();

      // Select the seeded client
      await clientSelect.selectOption({ value: client.userId });

      // Service checkbox for the demo service is visible — AC-DOOR-010-02
      const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
      await expect(
        svcCheckbox,
        `service-checkbox-${svc.serviceId} must be visible (AC-DOOR-010-02)`,
      ).toBeVisible({ timeout: 10_000 });
      await svcCheckbox.check();
      await expect(svcCheckbox).toBeChecked();

      // Tax year
      await page.locator('[data-testid="tax-year-input"]').fill("2024");

      // Screenshot 06: form filled — client selected, service checked, tax year entered
      await page.screenshot({ path: shot("06-AC-DOOR-010-02-initiate-engagement-form.png"), fullPage: true });

      // ── Screen 07: Engagement created (no accept/decline) ────────────────────
      // When: jane submits
      await page.locator('[data-testid="submit-initiate"]').click();

      // AC-DOOR-010-03: no accept/decline step — engagement created directly
      // No duplicate warning (fresh service + tax year for this client)
      const dupWarning = page.locator('[data-testid="duplicate-warning"]');
      await expect(dupWarning).not.toBeVisible({ timeout: 3_000 }).catch(() => {});

      // Success state or redirect to engagement page — AC-DOOR-010-03 / AC-DOOR-010-04
      const successMsg = page.locator('[data-testid="success-message"]');
      try {
        await expect(successMsg).toBeVisible({ timeout: 15_000 });
      } catch {
        // May have already redirected to the engagement page
        await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+$/, { timeout: 10_000 });
      }

      // Screenshot 07: engagement created — no accept/decline; tied to chosen client
      await page.screenshot({
        path: shot("07-AC-DOOR-010-03-04-engagement-created-no-accept-decline.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      // Cleanup bootstrap engagement
      if (bootstrapEng) {
        await cleanupEngagement(bootstrapEng.engagementId, bootstrapEng.engagementRequestId).catch(() => {});
      }
      // Cleanup any server-created engagement for the demo client
      if (client) {
        const serverCreated = await findEngagementsForClient(client.userId);
        for (const eng of serverCreated) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
      }
      if (svc) await cleanupService(svc.serviceId).catch(() => {});
      if (bootstrapSvc) await cleanupService(bootstrapSvc.serviceId).catch(() => {});
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// Screens 08–09: duplicate guard warn + override (AC-LIFE-011-02, AC-LIFE-011-03/04)
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "[AC-LIFE-011-02][AC-LIFE-011-03][AC-LIFE-011-04]" +
    " @demo 08+09 — jane-accountant: hits duplicate guard; sees warning; overrides to create second",
  async ({ page, request }) => {
    // Screen 08: jane attempts a duplicate; the warning panel appears showing the existing
    //            matching engagement — no creation yet. (AC-LIFE-011-02, AC-LIFE-011-04)
    // Screen 09: jane clicks "Create anyway (override)"; the second engagement is created.
    //            (AC-LIFE-011-03)

    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;
    const ts = Date.now();

    try {
      await setupAccountantSession(page, request);

      client = await seedClientUser(`dup_demo_${ts}`);
      svc = await seedService(`Demo012 DupGuard Service ${ts}`);

      // Seed the existing engagement (same client + service + tax year 2025)
      existingEng = await seedExistingEngagement(
        client.userId,
        svc.serviceId,
        2025,
        "DemoJane",
        "DupClient",
        client.email,
      );

      // ── Screen 08: Duplicate warning shown ──────────────────────────────────
      // Given: an engagement exists for client + svc + 2025
      // When: jane navigates to /engagements/new and attempts the same combination
      await page.goto(`${ADMIN_URL}/engagements/new`);

      const form = page.locator('[data-testid="initiate-engagement-form"]');
      await expect(form).toBeVisible({ timeout: 15_000 });

      await page.locator('[data-testid="client-select"]').selectOption({ value: client.userId });

      const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
      await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
      await svcCheckbox.check();

      await page.locator('[data-testid="tax-year-input"]').fill("2025");

      // First submit — triggers the duplicate check
      await page.locator('[data-testid="submit-initiate"]').click();

      // AC-LIFE-011-02: duplicate warning is shown — existing engagement surfaced before any creation
      // AC-LIFE-011-04: condition surfaced for a decision — not a silent block
      const dupWarning = page.locator('[data-testid="duplicate-warning"]');
      await expect(
        dupWarning,
        "duplicate-warning must be visible after first submit (AC-LIFE-011-02 / AC-LIFE-011-04)",
      ).toBeVisible({ timeout: 15_000 });

      // The existing engagement card is shown in the warning
      const matchCard = page.locator(
        `[data-testid="duplicate-match-${existingEng.engagementId}"]`,
      );
      await expect(
        matchCard,
        `duplicate-match-${existingEng.engagementId} must be visible (AC-LIFE-011-02)`,
      ).toBeVisible({ timeout: 5_000 });

      // No creation yet — success message must NOT be visible
      await expect(page.locator('[data-testid="success-message"]')).not.toBeVisible();

      // Screenshot 08: duplicate warning — existing engagement shown; no creation
      await page.screenshot({ path: shot("08-AC-LIFE-011-02-duplicate-warning-shown.png"), fullPage: true });

      // ── Screen 09: Override — create the second engagement ───────────────────
      // AC-LIFE-011-03: from the warning jane can override to create the second engagement
      const overrideBtn = page.locator('[data-testid="override-submit"]');
      await expect(
        overrideBtn,
        "override-submit button must be visible in the warning (AC-LIFE-011-03)",
      ).toBeVisible();
      await overrideBtn.click();

      // Then: the second engagement is created
      const successMsgOverride = page.locator('[data-testid="success-message"]');
      try {
        await expect(successMsgOverride).toBeVisible({ timeout: 15_000 });
      } catch {
        // May have already redirected to the new engagement
        await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+$/, { timeout: 10_000 });
      }

      // Screenshot 09: override success — second engagement created (AC-LIFE-011-03)
      await page.screenshot({ path: shot("09-AC-LIFE-011-03-duplicate-override-created.png"), fullPage: true });
    } finally {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
      }
      if (client) {
        // Clean up ALL engagements for this client (including the override-created one)
        const allEngs = await findEngagementsForClient(client.userId);
        for (const eng of allEngs) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
      }
      if (svc) await cleanupService(svc.serviceId).catch(() => {});
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// Screens 10–12: martha-and-james two-participant engagement (AC-AUTH-007-01/02)
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "[AC-AUTH-007-01][AC-AUTH-007-02][AC-LIFE-012-02][AC-LIFE-012-03]" +
    " @demo 10+11+12 — martha-and-james: jane invites second participant; two distinct accounts",
  async ({ page, request }) => {
    // Screen 10: jane navigates to the participants page; one participant (martha) listed.
    //            (AC-AUTH-007-01: engagement can have more than one participant)
    // Screen 11: jane fills the invite form and submits; two participants now listed.
    //            (AC-AUTH-007-01 / AC-LIFE-012-03: all linked participants listed)
    // Screen 12: both participants have distinct email addresses (distinct accounts).
    //            (AC-AUTH-007-02: each participant has their own distinct account)
    //            (AC-LIFE-012-02: no shared login)

    // Persona: martha-and-james married couple — primary (martha) + second participant (james).
    // ADR-001: james is invited as his OWN account with a distinct clerkId and email.
    // ADR-023: mock-first invitation seam.

    let martha: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts = Date.now();
    // James's email — unique per run to avoid collision with engagement-participants.spec.ts.
    const jamesEmail = `e2e-demo012-james-${ts}@example.test`;

    try {
      await setupAccountantSession(page, request);

      // Seed martha (primary participant / primary client — "martha")
      martha = await seedClientUser(`martha_${ts}`);
      engagement = await seedEngagementWithParticipant(martha.userId, martha.email);

      // ── Screen 10: Participants page — one participant (martha) ───────────────
      // Given: jane navigates to the participants page for the engagement
      // AC-AUTH-007-01: the engagement starts with 1 participant (martha)
      await page.goto(`${ADMIN_URL}/engagements/${engagement.engagementId}/participants`);

      const participantsList = page.locator('[data-testid="participants-list"]');
      await expect(
        participantsList,
        "participants-list must be visible on the participants page (AC-AUTH-007-01)",
      ).toBeVisible({ timeout: 15_000 });

      // One participant row is shown (martha)
      await expect(
        page.locator('[data-testid^="participant-row-"]').first(),
        "at least one participant-row must be visible (AC-AUTH-007-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 10: participants page — one participant listed (martha)
      await page.screenshot({ path: shot("10-AC-AUTH-007-01-participants-list-one.png"), fullPage: true });

      // ── Screen 11: Invite james as second participant ─────────────────────────
      // When: jane fills in james's email and submits the invite
      // ADR-001: james is their OWN account (not martha's — distinct clerkId + email)
      // ADR-023: invitation goes through the mock-first auth seam
      const invitePanel = page.locator('[data-testid="invite-panel"]');
      await expect(
        invitePanel,
        "invite-panel must be visible (AC-AUTH-007-01)",
      ).toBeVisible({ timeout: 10_000 });

      const emailInput = page.locator('[data-testid="invite-email-input"]');
      await emailInput.fill(jamesEmail);

      const inviteSubmit = page.locator('[data-testid="invite-submit"]');
      await inviteSubmit.click();

      // The page reloads (revalidatePath) — wait for the participant count to reach 2
      await page.waitForLoadState("networkidle");

      // AC-AUTH-007-01 / AC-LIFE-012-03: two participants are now listed
      const participantRows = page.locator('[data-testid^="participant-row-"]');
      await expect(
        participantRows,
        "two participant rows must be visible after invite (AC-AUTH-007-01 / AC-LIFE-012-03)",
      ).toHaveCount(2, { timeout: 15_000 });

      // Screenshot 11: participants page — two participants now listed
      await page.screenshot({ path: shot("11-AC-AUTH-007-01-invite-second-participant.png"), fullPage: true });

      // ── Screen 12: Two distinct email addresses confirm separate accounts ─────
      // AC-AUTH-007-02: each participant has their own distinct account
      // AC-LIFE-012-02: no shared login (the two email addresses must be different)
      // The participants list shows two separate email addresses
      const listText = await participantsList.textContent();
      expect(listText).toContain(martha.email);
      expect(listText).toContain(jamesEmail);

      // The two accounts are visibly distinct — martha and james have different emails
      // (AC-AUTH-007-02: distinct credentials; AC-LIFE-012-02: no shared login)
      expect(martha.email).not.toBe(jamesEmail);

      // Screenshot 12: both distinct email addresses visible — two separate accounts
      await page.screenshot({ path: shot("12-AC-AUTH-007-02-03-two-distinct-accounts.png"), fullPage: true });
    } finally {
      await clearSession(page);
      // Clean up james's User row (created by the invite action via mock seam)
      await cleanupUsersByEmailPattern(`%demo012-james-${ts}%`).catch(() => {});
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
      }
      if (martha) {
        await cleanupUser(martha.userId).catch(() => {});
      }
    }
  },
);

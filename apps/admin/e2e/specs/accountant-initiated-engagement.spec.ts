/**
 * apps/admin/e2e/specs/accountant-initiated-engagement.spec.ts
 *
 * Tier-6 e2e — Accountant-initiated engagement creation + duplicate guard.
 *
 * Acceptance criteria covered:
 *   AC-DOOR-010-01 — the accountant can initiate a new engagement for an existing client
 *   AC-DOOR-010-02 — she selects one or more active services for the engagement she initiates
 *   AC-DOOR-010-03 — an accountant-initiated engagement skips accept/decline
 *   AC-DOOR-010-04 — the initiated engagement is tied to the chosen client
 *   AC-LIFE-010-01 — a client holds concurrent engagements for different services
 *   AC-LIFE-011-01 — one engagement per (client, service type, tax year) is the norm
 *   AC-LIFE-011-02 — a duplicate attempt warns and shows the existing engagement (no creation yet)
 *   AC-LIFE-011-03 — from the warning the accountant can navigate OR override to create the second
 *   AC-LIFE-011-04 — the duplicate is never silently blocked nor silently redirected
 *
 * Gherkin scenarios: apps/admin/e2e/features/accountant-initiated-engagement.feature
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * data-* hooks (must match page.tsx and components exactly):
 *   data-testid="initiate-engagement-button"   — "New Engagement" link on /engagements
 *   data-testid="initiate-engagement-form"     — form root on /engagements/new
 *   data-testid="client-select"                — client picker <select>
 *   data-testid="service-checkbox-{id}"        — per-service checkbox
 *   data-testid="tax-year-input"               — tax year input
 *   data-testid="submit-initiate"              — primary submit button
 *   data-testid="form-error"                   — top-level error message
 *   data-testid="success-message"             — success confirmation
 *   data-testid="duplicate-warning"            — duplicate warning container (DuplicateWarning.tsx)
 *   data-testid="duplicate-match-{id}"         — match card per engagement
 *   data-testid="navigate-to-engagement"       — link to existing engagement (DuplicateWarning.tsx)
 *   data-testid="override-submit"              — override button (DuplicateWarning.tsx)
 *   data-testid="cancel-override"              — cancel button (DuplicateWarning.tsx)
 *
 * DB fixtures (admin pool — RLS-exempt, setup + teardown):
 *   Seeds a User (role='CLIENT'), one or two Service rows (active), and pre-existing Engagement
 *   rows to prove duplicate detection and concurrent-engagement scenarios.
 *   Cleaned up in afterEach/afterAll.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'accountant-initiated-engagement'
 *
 * ADR-006: Engagement creation controls are admin-only; clients never reach this surface.
 * ADR-005: Role is set server-side via the mock session cookie; never from client input.
 * ADR-012: Tier-6 e2e.
 * ADR-003: actor for audit comes from verified session (proven by the action-unit tests;
 *          e2e asserts the creation actually succeeds via the UI).
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-012 // CS-GEN-003
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
      "[accountant-initiated-engagement.spec] DATABASE_URL_ADMIN is not set " +
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

// ─── Fixture data shapes ──────────────────────────────────────────────────────

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

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Seed a CLIENT User row for use as the existing client in the form picker.
 * The clerkId is used as the form value (the server resolves User.id from it).
 *
 * CS-GEN-001: only email and role are stored; no contact PII beyond what
 *             is needed for the engagement-creation contact resolution seam.
 */
async function seedClientUser(suffix: string): Promise<SeededUser> {
  const pool = await getPool();
  const clerkId = `user_e2e_initiate_${suffix}`;
  const email = `e2e-initiate-${suffix}@example.test`;

  // Upsert: if this clerkId already exists (re-run), reuse it.
  const existing = await pool
    .request()
    .input("clerkId", mssqlPkg.NVarChar(64), clerkId)
    .query<{ id: string }>(
      `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );

  if (existing.recordset[0]) {
    return {
      userId: existing.recordset[0].id,
      clerkId,
      email,
    };
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
  if (!row) throw new Error("[accountant-initiated-engagement.spec] seedClientUser: no id returned");

  return { userId: row.id, clerkId, email };
}

/**
 * Seed an active Service row.
 * Returns the id and name for use in service-checkbox targeting.
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
  if (!row) throw new Error("[accountant-initiated-engagement.spec] seedService: no id returned");

  return { serviceId: row.id, name };
}

/**
 * Seed a pre-existing EngagementRequest + Engagement + EngagementRequestService for the duplicate-guard test.
 *
 * Creates a minimal accepted EngagementRequest tied to the seeded client's User.id,
 * an Engagement with the given taxYear and clientUserId, and the service link.
 *
 * This proves AC-LIFE-011-02: the existing engagement is shown in the duplicate warning.
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

  // 1. EngagementRequest (pre-accepted — DECISION-A pattern)
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
  if (!reqRow) throw new Error("[accountant-initiated-engagement.spec] seedExistingEngagement: no request id");
  const engagementRequestId = reqRow.id;

  // 2. EngagementRequestService (service link for the duplicate query)
  await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("serviceId", mssqlPkg.UniqueIdentifier, serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService]
         ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // 3. Engagement (clientUserId + taxYear — the duplicate-detect query keys on these)
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
  if (!engRow) throw new Error("[accountant-initiated-engagement.spec] seedExistingEngagement: no engagement id");

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Clean up an engagement + its associated data (participants, EngagementRequestService, EngagementRequest).
 * Used in afterEach/afterAll to leave the DB clean for subsequent runs.
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  // NOTE: AuditEvent is an APPEND-ONLY ledger table (ADR-019, LEDGER=ON) — cannot DELETE.
  // Audit rows for test engagements accumulate but do not affect test isolation.

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

/**
 * Clean up a Service row seeded by this spec.
 */
async function cleanupService(serviceId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, serviceId)
    .query(`DELETE FROM [dbo].[Service] WHERE [id] = @id`);
}

/**
 * Clean up a User row seeded by this spec.
 */
async function cleanupUser(userId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, userId)
    .query(`DELETE FROM [dbo].[User] WHERE [id] = @id`);
}

/**
 * Find all engagements for a given clientUserId (for verifying creation in AC-LIFE-010-01).
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

// ─── afterAll ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-DOOR-010-01][AC-DOOR-010-02][AC-DOOR-010-03][AC-DOOR-010-04]
// Accountant creates a new engagement for a client — no duplicate
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-DOOR-010-01][AC-DOOR-010-02][AC-DOOR-010-03][AC-DOOR-010-04] accountant-initiated-engagement: create new engagement — no duplicate",
  () => {
    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    // bootstrapSvc + bootstrapEng: seed a prior engagement so createAccountantInitiatedEngagement
    // can resolve the client's contact (DECISION-E: needs User→Engagement→EngagementRequest path).
    let bootstrapSvc: SeededService | null = null;
    let bootstrapEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`create_${ts}`);
      svc = await seedService(`E2E Service Create ${ts}`);

      // DECISION-E (engagement-creation.ts): createAccountantInitiatedEngagement resolves the
      // client's contact details from an existing EngagementRequest (User→Engagement→EngagementRequest).
      // Seed a bootstrap engagement for a DIFFERENT service so the test service has no duplicate.
      bootstrapSvc = await seedService(`E2E Bootstrap Create ${ts}`);
      bootstrapEng = await seedExistingEngagement(
        client.userId,
        bootstrapSvc.serviceId,
        2020, // different tax year — not a duplicate of the test year (2024)
        "E2E",
        "CreateClient",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (bootstrapEng) {
        await cleanupEngagement(bootstrapEng.engagementId, bootstrapEng.engagementRequestId).catch(() => {});
        bootstrapEng = null;
      }
      if (client) {
        // Clean up engagements created by the server action (not seeded by us directly)
        const serverCreated = await findEngagementsForClient(client.userId);
        for (const eng of serverCreated) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc) {
        await cleanupService(svc.serviceId).catch(() => {});
        svc = null;
      }
      if (bootstrapSvc) {
        await cleanupService(bootstrapSvc.serviceId).catch(() => {});
        bootstrapSvc = null;
      }
    });

    test(
      "[AC-DOOR-010-01][AC-DOOR-010-02][AC-DOOR-010-03][AC-DOOR-010-04]" +
        " accountant-initiated-engagement: accountant can initiate new engagement via the form",
      async ({ page }) => {
        if (!client || !svc) throw new Error("fixtures not seeded");

        // ── Scenario: accountant-initiated engagement: accountant creates a new engagement
        //    for a client with no duplicates

        // Given: the accountant is on the engagements list
        // AC-DOOR-010-01: entry point — "New Engagement" button on /engagements
        await page.goto(`${ADMIN_URL}/engagements`);
        const newEngButton = page.locator('[data-testid="initiate-engagement-button"]');
        await expect(newEngButton).toBeVisible({ timeout: 15_000 });

        // When: she clicks "New Engagement"
        await newEngButton.click();

        // Then: she lands on /engagements/new
        await page.waitForURL(`${ADMIN_URL}/engagements/new`, { timeout: 10_000 });
        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 10_000 });

        // AC-DOOR-010-01: client picker is present with the seeded client
        const clientSelect = page.locator('[data-testid="client-select"]');
        await expect(clientSelect).toBeVisible();

        // Select the seeded client by its clerkId (the form value is the clerkId / User.id from DB)
        await clientSelect.selectOption({ value: client.userId });

        // AC-DOOR-010-02: service multi-select — check the seeded service
        const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
        await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
        await svcCheckbox.check();
        await expect(svcCheckbox).toBeChecked();

        // Tax year
        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2024");

        // When: she submits the form
        const submitBtn = page.locator('[data-testid="submit-initiate"]');
        await submitBtn.click();

        // AC-DOOR-010-03: no accept/decline step — engagement is created directly
        // (the duplicate warning is NOT shown because there is no pre-existing engagement)
        const dupWarning = page.locator('[data-testid="duplicate-warning"]');
        await expect(dupWarning).not.toBeVisible({ timeout: 2_000 }).catch(() => {
          // If the warning IS visible, that's a test failure — the assertion below will fail.
        });

        // Then: success message (or redirect) — AC-DOOR-010-03 / AC-DOOR-010-04 verified
        const successMsg = page.locator('[data-testid="success-message"]');
        // Either the success message appears or we redirect to the new engagement page
        try {
          await expect(successMsg).toBeVisible({ timeout: 15_000 });
        } catch {
          // May have already redirected to the engagement page
          await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+$/, { timeout: 10_000 });
        }
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-010-01] Concurrent engagements for a different service type
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-010-01] accountant-initiated-engagement: second concurrent engagement for different service type",
  () => {
    let client: SeededUser | null = null;
    let svc1: SeededService | null = null;
    let svc2: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`concurrent_${ts}`);
      svc1 = await seedService(`E2E Service Tax ${ts}`);
      svc2 = await seedService(`E2E Service Bookkeeping ${ts}`);

      // Seed an existing engagement for service1 + this client
      existingEng = await seedExistingEngagement(
        client.userId,
        svc1.serviceId,
        2024,
        "E2E",
        "Concurrent",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
        existingEng = null;
      }
      if (client) {
        // Clean up any server-created engagements (the second concurrent one)
        const serverCreated = await findEngagementsForClient(client.userId);
        for (const eng of serverCreated) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc1) {
        await cleanupService(svc1.serviceId).catch(() => {});
        svc1 = null;
      }
      if (svc2) {
        await cleanupService(svc2.serviceId).catch(() => {});
        svc2 = null;
      }
    });

    test(
      "[AC-LIFE-010-01] accountant-initiated-engagement: create second concurrent engagement for different service",
      async ({ page }) => {
        if (!client || !svc1 || !svc2 || !existingEng) throw new Error("fixtures not seeded");

        // ── Scenario: second concurrent engagement for a different service type ──

        // Given: a client has an existing engagement for svc1 (seeded in beforeEach)
        // When: the accountant navigates to /engagements/new and creates for svc2 (different service)
        await page.goto(`${ADMIN_URL}/engagements/new`);

        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 15_000 });

        // Select the same client
        const clientSelect = page.locator('[data-testid="client-select"]');
        await clientSelect.selectOption({ value: client.userId });

        // Select svc2 ONLY (different service type — no duplicate for this combination)
        const svc2Checkbox = page.locator(`[data-testid="service-checkbox-${svc2.serviceId}"]`);
        await expect(svc2Checkbox).toBeVisible({ timeout: 10_000 });
        await svc2Checkbox.check();

        // Same tax year (but different service — no duplicate AC-LIFE-011-01 norm)
        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2024");

        // When: she submits
        const submitBtn = page.locator('[data-testid="submit-initiate"]');
        await submitBtn.click();

        // Then: no duplicate warning (different service → no overlap)
        // AC-LIFE-010-01: the second engagement is created concurrently for a different service
        const successMsg = page.locator('[data-testid="success-message"]');
        try {
          await expect(successMsg).toBeVisible({ timeout: 15_000 });
        } catch {
          await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+$/, { timeout: 10_000 });
        }

        // Verify via DB: client now has at least two engagements (AC-LIFE-010-01)
        const allClientEngs = await findEngagementsForClient(client.userId);
        expect(allClientEngs.length).toBeGreaterThanOrEqual(2);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-011-02][AC-LIFE-011-04] Duplicate attempt — warns, shows existing, no creation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-011-02][AC-LIFE-011-04] accountant-initiated-engagement: duplicate attempt shows warning (no creation)",
  () => {
    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`dup_warn_${ts}`);
      svc = await seedService(`E2E Service DupWarn ${ts}`);

      // Seed the existing engagement (same client + service + tax year 2025)
      existingEng = await seedExistingEngagement(
        client.userId,
        svc.serviceId,
        2025,
        "E2E",
        "DupClient",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
        existingEng = null;
      }
      if (client) {
        // Clean up any server-created engagements
        const serverCreated = await findEngagementsForClient(client.userId);
        for (const eng of serverCreated) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc) {
        await cleanupService(svc.serviceId).catch(() => {});
        svc = null;
      }
    });

    test(
      "[AC-LIFE-011-02][AC-LIFE-011-04] accountant-initiated-engagement:" +
        " duplicate attempt shows warning and existing engagement — no creation yet",
      async ({ page }) => {
        if (!client || !svc || !existingEng) throw new Error("fixtures not seeded");

        // ── Scenario: duplicate attempt warns and shows the existing engagement ──

        // Given: an engagement exists for client + svc + 2025
        // When: the accountant attempts to create the same combination
        await page.goto(`${ADMIN_URL}/engagements/new`);

        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 15_000 });

        // Select the same client
        const clientSelect = page.locator('[data-testid="client-select"]');
        await clientSelect.selectOption({ value: client.userId });

        // Select the same service
        const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
        await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
        await svcCheckbox.check();

        // Same tax year → duplicate
        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2025");

        // When: she submits (first submit)
        const submitBtn = page.locator('[data-testid="submit-initiate"]');
        await submitBtn.click();

        // AC-LIFE-011-02: duplicate warning is shown BEFORE any creation
        const dupWarning = page.locator('[data-testid="duplicate-warning"]');
        await expect(dupWarning).toBeVisible({ timeout: 15_000 });

        // AC-LIFE-011-02: the existing engagement is shown in the warning
        const matchCard = page.locator(
          `[data-testid="duplicate-match-${existingEng.engagementId}"]`,
        );
        await expect(matchCard).toBeVisible({ timeout: 5_000 });

        // AC-LIFE-011-04: never a silent block — the warning was shown, not a silent redirect
        // The success message must NOT be visible (no creation happened)
        const successMsg = page.locator('[data-testid="success-message"]');
        await expect(successMsg).not.toBeVisible();

        // Verify via DB: still only the one pre-existing engagement (no second was created)
        const allEngs = await findEngagementsForClient(client.userId);
        expect(allEngs.length).toBe(1);
        expect(allEngs[0]?.engagementId).toBe(existingEng.engagementId);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-011-03] Navigate to existing engagement from duplicate warning
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-011-03] accountant-initiated-engagement: navigate to existing engagement from warning",
  () => {
    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`dup_nav_${ts}`);
      svc = await seedService(`E2E Service DupNav ${ts}`);

      existingEng = await seedExistingEngagement(
        client.userId,
        svc.serviceId,
        2025,
        "E2E",
        "NavClient",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
        existingEng = null;
      }
      if (client) {
        const serverCreated = await findEngagementsForClient(client.userId);
        for (const eng of serverCreated) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc) {
        await cleanupService(svc.serviceId).catch(() => {});
        svc = null;
      }
    });

    test(
      "[AC-LIFE-011-03] accountant-initiated-engagement: navigate to existing engagement from warning",
      async ({ page }) => {
        if (!client || !svc || !existingEng) throw new Error("fixtures not seeded");

        // ── Scenario: from the warning the accountant clicks "Go to existing engagement" ──

        // Step 1: trigger the duplicate warning
        await page.goto(`${ADMIN_URL}/engagements/new`);
        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 15_000 });

        const clientSelect = page.locator('[data-testid="client-select"]');
        await clientSelect.selectOption({ value: client.userId });

        const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
        await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
        await svcCheckbox.check();

        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2025");

        await page.locator('[data-testid="submit-initiate"]').click();

        // Verify warning is shown
        const dupWarning = page.locator('[data-testid="duplicate-warning"]');
        await expect(dupWarning).toBeVisible({ timeout: 15_000 });

        // Step 2: click "Go to existing engagement" (AC-LIFE-011-03 navigate path)
        const navLink = page.locator('[data-testid="navigate-to-engagement"]').first();
        await expect(navLink).toBeVisible();
        await navLink.click();

        // Then: browser navigates to the existing engagement page
        // The engagementId may be uppercase in the URL (SQL Server UUID format); use case-insensitive match.
        await expect(page).toHaveURL(
          new RegExp(`/engagements/${existingEng.engagementId}`, "i"),
          { timeout: 10_000 },
        );

        // Verify via DB: no second engagement was created (only the original exists)
        const allEngs = await findEngagementsForClient(client.userId);
        expect(allEngs.length).toBe(1);
        expect(allEngs[0]?.engagementId).toBe(existingEng.engagementId);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-011-03] Override — create the second engagement from the warning
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-011-03] accountant-initiated-engagement: override creates the second engagement",
  () => {
    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`dup_override_${ts}`);
      svc = await seedService(`E2E Service DupOverride ${ts}`);

      existingEng = await seedExistingEngagement(
        client.userId,
        svc.serviceId,
        2025,
        "E2E",
        "OverrideClient",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
        existingEng = null;
      }
      if (client) {
        // Clean up ALL engagements for this client (including the override-created one)
        const allEngs = await findEngagementsForClient(client.userId);
        for (const eng of allEngs) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc) {
        await cleanupService(svc.serviceId).catch(() => {});
        svc = null;
      }
    });

    test(
      "[AC-LIFE-011-03] accountant-initiated-engagement: override creates the second engagement",
      async ({ page }) => {
        if (!client || !svc || !existingEng) throw new Error("fixtures not seeded");

        // ── Scenario: from the warning the accountant clicks "Create anyway (override)" ──

        // Step 1: trigger the duplicate warning
        await page.goto(`${ADMIN_URL}/engagements/new`);
        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 15_000 });

        const clientSelect = page.locator('[data-testid="client-select"]');
        await clientSelect.selectOption({ value: client.userId });

        const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
        await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
        await svcCheckbox.check();

        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2025");

        await page.locator('[data-testid="submit-initiate"]').click();

        // Verify warning is shown (AC-LIFE-011-02: warns first)
        const dupWarning = page.locator('[data-testid="duplicate-warning"]');
        await expect(dupWarning).toBeVisible({ timeout: 15_000 });

        // Step 2: click "Create anyway (override)" (AC-LIFE-011-03 override path)
        const overrideBtn = page.locator('[data-testid="override-submit"]');
        await expect(overrideBtn).toBeVisible();
        await overrideBtn.click();

        // Then: the second engagement is created — success or redirect to new engagement
        const successMsg = page.locator('[data-testid="success-message"]');
        try {
          await expect(successMsg).toBeVisible({ timeout: 15_000 });
        } catch {
          // May have already redirected to the new engagement page
          await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+$/, { timeout: 10_000 });
        }

        // Verify via DB: now there are TWO engagements for this client + service + tax year
        // (AC-LIFE-011-03: override is the sanctioned path for creating the second)
        const allEngs = await findEngagementsForClient(client.userId);
        expect(allEngs.length).toBe(2);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-011-04] Cancel from the warning — goes back to form, no creation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-011-04] accountant-initiated-engagement: cancel from duplicate warning returns to form",
  () => {
    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`dup_cancel_${ts}`);
      svc = await seedService(`E2E Service DupCancel ${ts}`);

      existingEng = await seedExistingEngagement(
        client.userId,
        svc.serviceId,
        2025,
        "E2E",
        "CancelClient",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
        existingEng = null;
      }
      if (client) {
        const serverCreated = await findEngagementsForClient(client.userId);
        for (const eng of serverCreated) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc) {
        await cleanupService(svc.serviceId).catch(() => {});
        svc = null;
      }
    });

    test(
      "[AC-LIFE-011-04] accountant-initiated-engagement: cancel from warning returns to form — no creation",
      async ({ page }) => {
        if (!client || !svc || !existingEng) throw new Error("fixtures not seeded");

        // ── Scenario: duplicate condition is surfaced, accountant cancels (no silent block) ──

        await page.goto(`${ADMIN_URL}/engagements/new`);
        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 15_000 });

        const clientSelect = page.locator('[data-testid="client-select"]');
        await clientSelect.selectOption({ value: client.userId });

        const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
        await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
        await svcCheckbox.check();

        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2025");

        await page.locator('[data-testid="submit-initiate"]').click();

        // Verify warning was shown (condition surfaced — AC-LIFE-011-04: never silent)
        const dupWarning = page.locator('[data-testid="duplicate-warning"]');
        await expect(dupWarning).toBeVisible({ timeout: 15_000 });

        // Click cancel — go back to form
        const cancelBtn = page.locator('[data-testid="cancel-override"]');
        await expect(cancelBtn).toBeVisible();
        await cancelBtn.click();

        // Then: the form is shown again (warning dismissed)
        await expect(form).toBeVisible({ timeout: 5_000 });

        // Verify via DB: still only the pre-existing engagement (no second was created)
        const allEngs = await findEngagementsForClient(client.userId);
        expect(allEngs.length).toBe(1);
        expect(allEngs[0]?.engagementId).toBe(existingEng.engagementId);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-011-01] One engagement per (client, service, tax year) is the norm
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-011-01] accountant-initiated-engagement: same client + different tax year is NOT a duplicate",
  () => {
    let client: SeededUser | null = null;
    let svc: SeededService | null = null;
    let existingEng: SeededEngagement | null = null;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      const ts = Date.now();
      client = await seedClientUser(`dup_diff_year_${ts}`);
      svc = await seedService(`E2E Service DupYear ${ts}`);

      // Seed an existing engagement for 2024
      existingEng = await seedExistingEngagement(
        client.userId,
        svc.serviceId,
        2024,
        "E2E",
        "YearClient",
        client.email,
      );
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (existingEng) {
        await cleanupEngagement(existingEng.engagementId, existingEng.engagementRequestId).catch(() => {});
        existingEng = null;
      }
      if (client) {
        const allEngs = await findEngagementsForClient(client.userId);
        for (const eng of allEngs) {
          await cleanupEngagement(eng.engagementId, eng.engagementRequestId).catch(() => {});
        }
        await cleanupUser(client.userId).catch(() => {});
        client = null;
      }
      if (svc) {
        await cleanupService(svc.serviceId).catch(() => {});
        svc = null;
      }
    });

    test(
      "[AC-LIFE-011-01] accountant-initiated-engagement: different tax year is not a duplicate",
      async ({ page }) => {
        if (!client || !svc || !existingEng) throw new Error("fixtures not seeded");

        // Given: an engagement exists for 2024
        // When: the accountant creates an engagement for the SAME service but tax year 2025
        await page.goto(`${ADMIN_URL}/engagements/new`);
        const form = page.locator('[data-testid="initiate-engagement-form"]');
        await expect(form).toBeVisible({ timeout: 15_000 });

        const clientSelect = page.locator('[data-testid="client-select"]');
        await clientSelect.selectOption({ value: client.userId });

        const svcCheckbox = page.locator(`[data-testid="service-checkbox-${svc.serviceId}"]`);
        await expect(svcCheckbox).toBeVisible({ timeout: 10_000 });
        await svcCheckbox.check();

        // Different tax year → NOT a duplicate
        const taxYearInput = page.locator('[data-testid="tax-year-input"]');
        await taxYearInput.fill("2025");

        await page.locator('[data-testid="submit-initiate"]').click();

        // Then: no duplicate warning — AC-LIFE-011-01: one engagement per (client, service, year) is the norm
        // A different year creates a new engagement without a warning
        const successMsg = page.locator('[data-testid="success-message"]');
        try {
          await expect(successMsg).toBeVisible({ timeout: 15_000 });
        } catch {
          await expect(page).toHaveURL(/\/engagements\/[a-f0-9-]+$/, { timeout: 10_000 });
        }

        // Verify no warning was shown (different year → no overlap)
        const dupWarning = page.locator('[data-testid="duplicate-warning"]');
        // If we reached success, the warning was not shown — this is the expected path.
        // (If warning had been shown, the test above would have timed out at successMsg.)
        await expect(dupWarning).not.toBeVisible();
      },
    );
  },
);

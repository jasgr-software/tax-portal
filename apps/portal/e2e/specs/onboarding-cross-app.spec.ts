/**
 * apps/portal/e2e/specs/onboarding-cross-app.spec.ts
 *
 * Cross-app tier-6 e2e: accountant edits the letter template in admin →
 * client reaches the letter step in portal → sees the edited content → signs.
 *
 * Acceptance criteria covered (EPIC-005):
 *   AC-IDNT-007-03 — the letter presented for signature is the accountant's edited template
 *
 * Gherkin binding (prose-bound until Cucumber tooling lands — CLAUDE.md § Executable gherkin tooling):
 *   Scenario: The edited template is what the client signs
 *   Given the accountant has edited the engagement-letter template
 *   When a client reaches the letter step in onboarding
 *   Then the letter presented for signature is the accountant's edited template
 *
 * Also exercises the full cross-surface loop:
 *   1. Accountant edits template in admin (apps/admin at http://localhost:13001)
 *   2. Client session established in portal (apps/portal at http://localhost:3000)
 *   3. Client sees the edited content in the engagement letter step
 *   4. Client signs → steps 2/3 unlock (end-to-end confirmation of ONBD-002-03)
 *
 * CLAUDE.md § Platform-frontend scope: this spec legitimately touches BOTH surfaces
 * (admin edit + portal sign) — this is the multi-surface case, not single-surface-by-name.
 *
 * Stack: both containers up (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock, ALLOW_MOCK_ESIGN=true).
 *
 * Fixture:
 *   // DECISION (TASK-005-007): The cross-app spec reuses the same admin-pool seeding approach
 *   // as onboarding.spec.ts, but uses a DIFFERENT deterministic clerkUserId suffix "-cross-"
 *   // to avoid collision with the onboarding spec's fixture user.
 *   // A different requestId is seeded per test for clean isolation.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'cross-app'
 *   pnpm e2e:cross-app     (after root package.json wiring — see below)
 *
 * ADR-006: Cross-app edit→sign loop — admin (accountant) + portal (client).
 * ADR-012: Tier-6 e2e.
 * ADR-023/024: e-sign through ESignatureProvider PORT (ESIGN_PROVIDER=mock).
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import {
  setupClientSession,
  setupAccountantSession,
  clearSession,
} from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// DECISION (TASK-005-007): The accountant session is established via the PORTAL's
// /api/mock-session (same endpoint, role=ACCOUNTANT). The shared-localhost cookie
// (ADR-010 §3 session continuity) means the cookie set by the portal endpoint is
// honored by the admin app. We do NOT call the admin's /api/mock-session directly —
// that would require crossing Playwright's request context domain boundary.
// This is the same pattern used by apps/portal/e2e/specs/cross-app-redirect.spec.ts.

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// DECISION (TASK-005-007): Different clerkUserId from onboarding.spec.ts to prevent
// unique constraint collision across suites running in sequence.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_cross_001";

// ─── DB helpers (admin pool, RLS-exempt seed/teardown) ──────────────────────────

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
      "[onboarding-cross-app.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

interface SeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
}

async function seedClientEngagement(): Promise<SeedResult> {
  const pool = await getPool();

  // Upsert User with the fixture clerkUserId
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-cross-001@cross-app.e2e.test")
    .input("role", "CLIENT")
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source
         ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  let userId = userResult.recordset[0]?.id;
  if (!userId) {
    const lookupResult = await pool
      .request()
      .input("clerkId", FIXTURE_CLERK_USER_ID)
      .query<{ id: string }>(
        `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
      );
    userId = lookupResult.recordset[0]?.id;
    if (!userId) {
      throw new Error("[onboarding-cross-app.spec] Failed to upsert/find User fixture row");
    }
  }

  // Seed EngagementRequest (FK for Engagement)
  const requestResult = await pool
    .request()
    .input("firstName", "CrossApp")
    .input("lastName", "E2E")
    .input("email", `e2e-cross-req-${Date.now()}@cross-app.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) {
    throw new Error("[onboarding-cross-app.spec] Failed to seed EngagementRequest fixture row");
  }

  // Seed Engagement with clientUserId = User.id
  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@engagementRequestId, @clientUserId, @status, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engagementResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[onboarding-cross-app.spec] Failed to seed Engagement fixture row");
  }

  return { userId, requestId, engagementId };
}

async function cleanupFixture(requestId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`);
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`);
}

async function cleanupFixtureUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

test.afterAll(async () => {
  await cleanupFixtureUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-IDNT-007-03 — The edited template is what the client signs (cross-app loop)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-IDNT-007-03] the accountant's edited template is what the client signs", () => {
  /**
   * Gherkin (EPIC-005 § Acceptance scenarios — verbatim):
   * Given the accountant has edited the engagement-letter template
   * When a client reaches the letter step in onboarding
   * Then the letter presented for signature is the accountant's edited template
   *
   * Full cross-surface loop:
   *   1. Accountant session on admin → navigates to /settings/letter-template
   *   2. Accountant edits the template with unique content + saves
   *   3. Client session on portal (seeded engagement, owned by fixture user)
   *   4. Client opens /onboarding → sees the accountant's edited content in the letter step
   *   5. Client clicks "Sign Engagement Letter" → step 1 done, steps 2/3 unlock
   */

  let seeded: SeedResult | null = null;

  test.afterEach(async ({ page }) => {
    // Clear whichever session the page is currently in
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-IDNT-007-03] client signs the accountant's edited template (cross-app edit→sign loop)", async ({ page, request }) => {
    // ─── Step 1: Accountant edits the template in admin ───────────────────────

    // Given: the accountant has the engagement-letter template setting open
    // The portal's /api/mock-session is called with role=ACCOUNTANT.
    // The shared-localhost cookie (ADR-010 §3) means the admin app honors it.
    await setupAccountantSession(page, request);
    await page.goto(`${ADMIN_URL}/settings/letter-template`);

    const templateTextarea = page.locator('[data-testid="template-content"]');
    await expect(templateTextarea).toBeVisible({ timeout: 15_000 });

    // When: the accountant edits the template with unique, test-identifiable content
    const editedContent = `[AC-IDNT-007-03] Cross-App E2E Template — ${Date.now()}`;
    await templateTextarea.fill(editedContent);

    // And saves
    const saveButton = page.locator('button:has-text("Save template")');
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await saveButton.click();

    // Then: save succeeds
    await expect(
      page.locator('[role="status"]:has-text("Template saved successfully")'),
    ).toBeVisible({ timeout: 10_000 });

    // ─── Step 2: Switch to client session on portal ───────────────────────────
    // Clear the accountant session (shared cookie), establish the client session

    await clearSession(page);
    seeded = await seedClientEngagement();
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

    // ─── Step 3: Client opens the onboarding page ─────────────────────────────

    // When: the client reaches the letter step in onboarding
    await page.goto(`${PORTAL_URL}/onboarding`);

    // Then: the engagement letter step is accessible
    const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
    await expect(letterStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

    // Then: the letter content shown to the client is the accountant's EDITED template
    const letterContent = page.locator('[data-testid="letter-content"]');
    await expect(letterContent).toBeVisible({ timeout: 10_000 });
    await expect(letterContent).toContainText(editedContent);

    // ─── Step 4: Client signs → steps 2/3 unlock ──────────────────────────────

    // When: the client clicks the sign button
    const signButton = page.locator('[data-testid="sign-letter-button"]');
    await expect(signButton).toBeVisible({ timeout: 10_000 });
    await signButton.click();

    // Then: signing succeeds (mock e-sign → signed: true)
    await expect(
      page.locator('[data-testid="letter-signed-confirmation"]'),
    ).toBeVisible({ timeout: 15_000 });

    // Then: step 1 is marked done
    await expect(letterStep).toHaveAttribute("data-done", "true");

    // Then: steps 2/3 are now accessible (gate unlocked — confirms ONBD-002-03 end-to-end)
    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });
    await expect(
      page.locator('[data-testid="onboarding-step-document-upload"]'),
    ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });
  });
});

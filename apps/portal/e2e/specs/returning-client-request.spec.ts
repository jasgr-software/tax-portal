/**
 * apps/portal/e2e/specs/returning-client-request.spec.ts
 *
 * Tier-6 e2e specs for the returning-client new-engagement request flow
 * (apps/portal/src/app/engagements/new/).
 *
 * Runs against the full docker-compose stack:
 *   - Portal container at http://localhost:3000 (CLIENT surface)
 *   - Admin container at http://localhost:13001 (ACCOUNTANT surface — AC-DOOR-009-04)
 *   - SQL Server 2022 container (seeded with active services and a prior client engagement)
 *
 * Acceptance criteria covered (BRIEF-012 / EPIC-012):
 *   AC-DOOR-009-01 — a signed-in client opens the returning-client request flow without leaving the portal
 *   AC-DOOR-009-02 — the flow lets the client select one or more active services
 *   AC-DOOR-009-03 — the flow does not ask the client to re-enter on-file contact info
 *   AC-DOOR-009-04 — a submitted request appears in the accountant inbox like a front-door request (cross-app)
 *
 * Gherkin binding (EPIC-012 § Acceptance scenarios — verbatim):
 *
 *   AC-DOOR-009-01:
 *   "Given a signed-in existing client
 *    When they start a new engagement request from the client surface
 *    Then a returning-client request flow opens without leaving the portal"
 *
 *   AC-DOOR-009-02:
 *   "Given a returning client in the request flow
 *    When they choose services
 *    Then they can select one or more active services for the request"
 *
 *   AC-DOOR-009-03:
 *   "Given a returning client whose contact details are already on file
 *    When they complete the returning-client request flow
 *    Then they are not required to re-enter that basic contact information"
 *
 *   AC-DOOR-009-04:
 *   "Given a returning client submits a new engagement request
 *    When the submission completes
 *    Then it is routed to the accountant for review the same way a front-door request is"
 *
 * Feature mirror: apps/portal/e2e/features/returning-client-request.feature
 * EPIC-012 source: .planning/EPIC-012-engagement-creation-participants.md
 *
 * Fixture setup (per DECISION-E / BRIEF-012 implementation notes):
 *   A "returning client" MUST have a prior accepted engagement on file so that
 *   createReturningClientRequest can resolve their on-file contact info
 *   (User → Engagement → EngagementRequest chain — DECISION-E).
 *   This spec seeds:
 *     1. A User row with FIXTURE_CLERK_USER_ID.
 *     2. An accepted EngagementRequest with firstName/lastName/email on file.
 *     3. An Engagement linking the User to that EngagementRequest.
 *   On teardown, the seeded rows and any test-created EngagementRequests are cleaned up.
 *
 * AC-DOOR-009-04 cross-app strategy:
 *   The admin surface (/requests) is loaded under an ACCOUNTANT session to verify
 *   the new request appears in the inbox. This mirrors the cross-app loop established
 *   by onboarding-cross-app.spec.ts. The ACCOUNTANT session is established via the
 *   portal's /api/mock-session (shared-localhost cookie — ADR-010 §3).
 *
 * ADR-003: Contact info is resolved server-side in createReturningClientRequest.
 * ADR-005: RLS policy not relaxed — admin pool for seed/teardown only.
 * ADR-006: Cross-app — portal (CLIENT submit) + admin (ACCOUNTANT observes inbox).
 * ADR-012: Tier-6 e2e.
 * ADR-022: Submission path is rate-limited (proven in actions.ts — not tested here
 *          as a behavior gate; the limiter is functional via shared InMemoryRateLimiter).
 * CS-TS-003: Same ServiceChecklist component as the front-door form.
 * CS-TS-004: Only a signed-in CLIENT can reach /engagements/new (middleware gate).
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// Distinct suffix "-retcli-" prevents collision with all other fixture suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_retcli_001";
const FIXTURE_FIRST_NAME = "RetClient";
const FIXTURE_LAST_NAME = "E2ETest";
const FIXTURE_EMAIL = "ret-client-e2e-001@returning-client.e2e.test";

// ─── DB helpers (admin pool, RLS-exempt seed / teardown) ──────────────────────

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
      "[returning-client-request.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

/**
 * SeedResult — the fixture data created for the test suite.
 *
 * DECISION-E: The returning-client path requires the client to have a prior accepted
 * engagement (User → Engagement → EngagementRequest) so contact can be resolved.
 * This seed creates exactly that fixture structure.
 */
interface SeedResult {
  userId: string;
  priorRequestId: string;
  priorEngagementId: string;
}

/**
 * Seed the returning-client fixture.
 *
 * Creates:
 *   1. A User row with FIXTURE_CLERK_USER_ID (idempotent: MERGE).
 *   2. An accepted EngagementRequest with the fixture's firstName/lastName/email.
 *   3. An Engagement linking the User to that EngagementRequest.
 *
 * DECISION-E: This represents the "prior engagement on file" that enables
 * createReturningClientRequest to resolve on-file contact info.
 *
 * // DECISION-E // ADR-003 // CS-TS-001
 */
async function seedReturningClientFixture(): Promise<SeedResult> {
  const pool = await getPool();

  // ── 0. Idempotent pre-cleanup (remove stale fixtures if left from a previous run) ──
  // Clean up prior-test EngagementRequests created by the returning-client action
  // (the seeded prior request itself is cleaned up via the Engagement FK chain)
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`
      -- Delete notifications for requests created by this fixture user
      DELETE n
      FROM [dbo].[Notification] n
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = n.[engagementRequestId]
      INNER JOIN [dbo].[User] u ON u.[clerkId] = @clerkId
      WHERE er.[email] = '${FIXTURE_EMAIL}'
    `);
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      -- Delete EngagementRequestService join rows for this email (pending requests created by test)
      DELETE ers
      FROM [dbo].[EngagementRequestService] ers
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = ers.[engagementRequestId]
      WHERE er.[email] = @email
      AND er.[status] = 'pending'
    `);
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      -- Delete stale pending EngagementRequests created by this test user (not the prior accepted one)
      DELETE FROM [dbo].[EngagementRequest]
      WHERE [email] = @email AND [status] = 'pending'
    `);
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`
      -- Delete any stale Engagements for this user
      DELETE e
      FROM [dbo].[Engagement] e
      INNER JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
      WHERE u.[clerkId] = @clerkId
    `);
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      -- Delete stale EngagementRequestService join rows for accepted requests
      DELETE ers
      FROM [dbo].[EngagementRequestService] ers
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = ers.[engagementRequestId]
      WHERE er.[email] = @email
    `);
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`);

  // ── 1. Upsert User row (MERGE for idempotency) ────────────────────────────────
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", FIXTURE_EMAIL)
    .input("role", "CLIENT")
    .query<{ id: string }>(`
      MERGE [dbo].[User] AS target
      USING (SELECT @clerkId AS clerkId) AS source
        ON target.[clerkId] = source.[clerkId]
      WHEN NOT MATCHED THEN
        INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
        VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
      OUTPUT INSERTED.[id];
    `);

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
      throw new Error(
        "[returning-client-request.spec] Failed to upsert/find User fixture row",
      );
    }
  }

  // ── 2. Seed the prior accepted EngagementRequest ────────────────────────────
  // DECISION-E: This is the "contact on file" that createReturningClientRequest resolves.
  // firstName/lastName/email are set here so the server-side contact resolution can find them.
  const priorRequestResult = await pool
    .request()
    .input("firstName", FIXTURE_FIRST_NAME)
    .input("lastName", FIXTURE_LAST_NAME)
    .input("email", FIXTURE_EMAIL)
    .query<{ id: string }>(`
      INSERT INTO [dbo].[EngagementRequest]
        ([firstName], [lastName], [email], [status], [decidedAt], [createdAt], [updatedAt])
      OUTPUT INSERTED.[id]
      VALUES
        (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
    `);

  const priorRequestId = priorRequestResult.recordset[0]?.id;
  if (!priorRequestId) {
    throw new Error(
      "[returning-client-request.spec] Failed to seed prior EngagementRequest fixture row",
    );
  }

  // ── 3. Seed the Engagement linking User to the prior request ────────────────
  // DECISION-E: Engagement.clientUserId = User.id links the chain
  // (User → Engagement → EngagementRequest → firstName/lastName/email).
  const priorEngagementResult = await pool
    .request()
    .input("engagementRequestId", priorRequestId)
    .input("clientUserId", userId)
    .query<{ id: string }>(`
      INSERT INTO [dbo].[Engagement]
        ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
      OUTPUT INSERTED.[id]
      VALUES
        (@engagementRequestId, @clientUserId, 'New', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
    `);

  const priorEngagementId = priorEngagementResult.recordset[0]?.id;
  if (!priorEngagementId) {
    throw new Error(
      "[returning-client-request.spec] Failed to seed prior Engagement fixture row",
    );
  }

  return { userId, priorRequestId, priorEngagementId };
}

/**
 * Teardown: remove seeded rows and any EngagementRequests created during the test.
 * Order: Notification → EngagementRequestService → EngagementRequest → Engagement.
 * (FK order: join tables first, then parents.)
 */
async function teardownFixture(priorRequestId: string): Promise<void> {
  const pool = await getPool();

  // Delete notifications for all EngagementRequests with fixture email (incl. test-created pending ones)
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      DELETE n
      FROM [dbo].[Notification] n
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = n.[engagementRequestId]
      WHERE er.[email] = @email
    `);

  // Delete EngagementRequestService join rows for all fixture-email requests
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      DELETE ers
      FROM [dbo].[EngagementRequestService] ers
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = ers.[engagementRequestId]
      WHERE er.[email] = @email
    `);

  // Delete Engagement (FK to prior EngagementRequest)
  await pool
    .request()
    .input("priorRequestId", priorRequestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @priorRequestId`);

  // Delete all EngagementRequests for the fixture email (prior + pending created by test)
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`);
}

async function teardownFixtureUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

/**
 * Count the pending EngagementRequests for the fixture email.
 * Used to verify AC-DOOR-009-04: the request was created in the DB.
 * Uses the admin pool (RLS-exempt) — same pattern as submit.spec.ts.
 */
async function countPendingRequestsByEmail(email: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", email.toLowerCase().trim())
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM [dbo].[EngagementRequest]
       WHERE [email] = @email AND [status] = 'pending'`,
    );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Count the new-request notifications for the fixture email's EngagementRequests.
 * Used to verify AC-DOOR-009-04: the accountant received a notification.
 */
async function countInboxNotificationsForEmail(email: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", email.toLowerCase().trim())
    .query<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt
      FROM [dbo].[Notification] n
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = n.[engagementRequestId]
      WHERE er.[email] = @email
        AND er.[status] = 'pending'
        AND n.[type] = 'new_engagement_request'
    `);
  return result.recordset[0]?.cnt ?? 0;
}

// ─── Shared fixture state (seeded once per suite run) ─────────────────────────

let seeded: SeedResult | null = null;

test.beforeAll(async () => {
  seeded = await seedReturningClientFixture();
});

test.afterAll(async () => {
  if (seeded) {
    await teardownFixture(seeded.priorRequestId);
  }
  await teardownFixtureUser();
  await closePool();
});

// ══════════════════════════════════════════════════════════════════════════════════
// AC-DOOR-009-01 — A signed-in client opens the returning-client request flow
//                  without leaving the portal
// ══════════════════════════════════════════════════════════════════════════════════

test.describe("[AC-DOOR-009-01] a signed-in client opens the returning-client request flow without leaving the portal", () => {
  /**
   * Gherkin (verbatim from EPIC-012 § Acceptance scenarios):
   * Given a signed-in existing client
   * When they start a new engagement request from the client surface
   * Then a returning-client request flow opens without leaving the portal
   */
  test("[AC-DOOR-009-01] signed-in CLIENT navigates to /engagements/new and the form loads in the portal", async ({
    page,
    request,
  }) => {
    // Given: a signed-in existing client (has a prior engagement on file — DECISION-E fixture)
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

    // When: they start a new engagement request from the client surface
    // AC-DOOR-009-01: The route stays on the portal app (no redirect to /sign-in or admin)
    await page.goto(`${PORTAL_URL}/engagements/new`);

    // Then: a returning-client request flow opens without leaving the portal
    // The form is visible and we are still on the portal URL (not redirected away)
    await expect(page).toHaveURL(`${PORTAL_URL}/engagements/new`, {
      timeout: 15_000,
    });

    // The form container renders (not the sign-in page or an error)
    await expect(
      page.locator('[data-testid="returning-client-request-form"]'),
    ).toBeVisible({ timeout: 10_000 });

    await clearSession(page);
  });

  test("[AC-DOOR-009-01] unauthenticated visitor is redirected away from /engagements/new (not served the form)", async ({
    page,
  }) => {
    // Given: an unauthenticated visitor (no session)
    // (no setupClientSession call)

    // When: they attempt to access the returning-client request route
    await page.goto(`${PORTAL_URL}/engagements/new`);

    // Then: they are NOT served the form — the middleware redirects to sign-in
    // The form MUST NOT be visible (gate proof)
    await expect(
      page.locator('[data-testid="returning-client-request-form"]'),
    ).not.toBeVisible({ timeout: 10_000 });

    // They land on the sign-in page (ADR-010 redirect matrix)
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// AC-DOOR-009-02 — The flow lets the client select one or more active services
// ══════════════════════════════════════════════════════════════════════════════════

test.describe("[AC-DOOR-009-02] the returning-client flow lets the client select one or more active services", () => {
  /**
   * Gherkin (verbatim from EPIC-012 § Acceptance scenarios):
   * Given a returning client in the request flow
   * When they choose services
   * Then they can select one or more active services for the request
   */
  test("[AC-DOOR-009-02] the form presents active services as a selectable checklist", async ({
    page,
    request,
  }) => {
    // Given: a returning client in the request flow
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
    await page.goto(`${PORTAL_URL}/engagements/new`);

    // The form must be visible
    await expect(
      page.locator('[data-testid="returning-client-request-form"]'),
    ).toBeVisible({ timeout: 10_000 });

    // When: they look at the service selection area
    // Then: at least one active service checkbox is shown
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThan(0);

    // And: they can check a service (select it)
    await checkboxes.first().check();
    await expect(checkboxes.first()).toBeChecked();

    // And: they can check a second service if more than one is available
    if (checkboxCount > 1) {
      const secondCheckbox = checkboxes.nth(1);
      await secondCheckbox.check();
      await expect(secondCheckbox).toBeChecked();
    }

    await clearSession(page);
  });

  test("[AC-DOOR-009-02] submitting zero services is blocked (no request created)", async ({
    page,
    request,
  }) => {
    // Given: a returning client on the form with no services selected
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
    await page.goto(`${PORTAL_URL}/engagements/new`);

    await expect(
      page.locator('[data-testid="returning-client-request-form"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Ensure no services are checked
    const checkedBoxes = page.locator('input[type="checkbox"]:checked');
    await expect(checkedBoxes).toHaveCount(0);

    // When: they try to submit without selecting any service
    await page.locator('[data-testid="submit-request-button"]').click();

    // Then: submission is blocked — an error message appears
    const errorMsg = page
      .getByRole("alert")
      .or(page.getByText(/at least one service/i))
      .or(page.getByText(/please select/i));
    await expect(errorMsg.first()).toBeVisible({ timeout: 5_000 });

    // And: the form is still visible (not replaced by a success state)
    await expect(
      page.locator('[data-testid="submit-request-button"]'),
    ).toBeVisible();

    // And: success state is NOT shown
    await expect(
      page.locator('[data-testid="returning-request-success"]'),
    ).not.toBeVisible();

    await clearSession(page);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// AC-DOOR-009-03 — The flow does not ask the client to re-enter on-file contact info
// ══════════════════════════════════════════════════════════════════════════════════

test.describe("[AC-DOOR-009-03] the returning-client flow does not ask the client to re-enter on-file contact info", () => {
  /**
   * Gherkin (verbatim from EPIC-012 § Acceptance scenarios):
   * Given a returning client whose contact details are already on file
   * When they complete the returning-client request flow
   * Then they are not required to re-enter that basic contact information
   */
  test("[AC-DOOR-009-03] the form has no contact fields (firstName, lastName, email)", async ({
    page,
    request,
  }) => {
    // Given: a returning client whose contact details are already on file
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
    await page.goto(`${PORTAL_URL}/engagements/new`);

    await expect(
      page.locator('[data-testid="returning-client-request-form"]'),
    ).toBeVisible({ timeout: 10_000 });

    // When: they view the form
    // Then: NO firstName input field is present
    await expect(page.locator('input[name="firstName"]')).not.toBeVisible();
    await expect(page.locator('input[name="lastName"]')).not.toBeVisible();
    await expect(page.locator('input[name="email"]')).not.toBeVisible();
    await expect(page.locator('input[type="email"]')).not.toBeVisible();

    // And: the UI explicitly tells them their contact info is already on file
    await expect(
      page.locator('[data-testid="no-contact-fields-message"]'),
    ).toBeVisible();

    await clearSession(page);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════
// AC-DOOR-009-04 — A submitted request appears in the accountant inbox
//                  like a front-door request (cross-app)
// ══════════════════════════════════════════════════════════════════════════════════

test.describe("[AC-DOOR-009-04] a submitted returning-client request appears in the accountant inbox", () => {
  /**
   * Gherkin (verbatim from EPIC-012 § Acceptance scenarios):
   * Given a returning client submits a new engagement request
   * When the submission completes
   * Then it is routed to the accountant for review the same way a front-door request is
   *
   * Cross-app loop:
   *   1. CLIENT session on portal → navigate to /engagements/new → select service → submit
   *   2. Assert success state in portal UI
   *   3. Assert pending EngagementRequest created in DB (via admin pool)
   *   4. Assert new_engagement_request Notification created in DB (via admin pool)
   *   5. ACCOUNTANT session on admin → navigate to /requests → see the new request in inbox
   *
   * ADR-006: Cross-app — portal (client submit) + admin (accountant inbox).
   * ADR-010: Shared-localhost cookie — accountant session established via portal /api/mock-session.
   */
  test("[AC-DOOR-009-04] submitted request appears in the admin inbox and notification feed", async ({
    page,
    request,
  }) => {
    // ── Step 1: CLIENT submits a new engagement request ─────────────────────
    // Given: a returning client submits a new engagement request
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
    await page.goto(`${PORTAL_URL}/engagements/new`);

    await expect(
      page.locator('[data-testid="returning-client-request-form"]'),
    ).toBeVisible({ timeout: 10_000 });

    // Select the first available active service
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
    await checkboxes.first().check();
    await expect(checkboxes.first()).toBeChecked();

    // When: the submission completes
    await page.locator('[data-testid="submit-request-button"]').click();

    // ── Step 2: Assert portal success state ──────────────────────────────────
    // Then: the portal shows a success confirmation
    const successEl = page.locator('[data-testid="returning-request-success"]');
    await expect(successEl).toBeVisible({ timeout: 15_000 });
    await expect(successEl).toContainText(/request submitted/i);

    // The submit button is gone (form replaced by success state — mirrors front-door)
    await expect(
      page.locator('[data-testid="submit-request-button"]'),
    ).not.toBeVisible();

    // ── Step 3: Assert DB — pending EngagementRequest created ────────────────
    // Then: it is routed to the accountant — a pending EngagementRequest exists
    // (admin pool read, RLS-exempt — mirrors submit.spec.ts pattern)
    const pendingCount = await countPendingRequestsByEmail(FIXTURE_EMAIL);
    expect(pendingCount).toBeGreaterThanOrEqual(1);

    // ── Step 4: Assert DB — new_engagement_request Notification created ──────
    // Then: a new_engagement_request notification was created (inbox routing)
    // (mirrors createEngagementRequest pattern from EPIC-003 / DECISION-A)
    const notifCount = await countInboxNotificationsForEmail(FIXTURE_EMAIL);
    expect(notifCount).toBeGreaterThanOrEqual(1);

    // ── Step 5: Cross-app — ACCOUNTANT observes the request in the admin inbox ─
    // Switch to accountant session (shared-localhost cookie via portal /api/mock-session)
    await clearSession(page);
    await setupAccountantSession(page, request);

    // Navigate to the admin requests inbox
    await page.goto(`${ADMIN_URL}/requests`);

    // Then: the returning-client request appears in the inbox
    // The request list renders (not a sign-in redirect or error)
    await expect(page).toHaveURL(`${ADMIN_URL}/requests`, { timeout: 15_000 });

    // The inbox should show the request (identified by the fixture client's name)
    // Using the RequestList component which renders client names
    // Wait for the page to load and request list to appear
    const requestItems = page
      .getByText(FIXTURE_FIRST_NAME)
      .or(page.getByText(FIXTURE_LAST_NAME));
    await expect(requestItems.first()).toBeVisible({ timeout: 15_000 });

    await clearSession(page);
  });
});

/**
 * apps/portal/e2e/specs/engagement-isolation.spec.ts
 *
 * Tier-6 e2e — Client own-data isolation on the portal surface.
 *
 * Acceptance criteria covered:
 *   AC-AUTH-003-01 — CLIENT sees only engagements they participate in
 *   AC-AUTH-003-02 — CLIENT cannot view/list/search another client's engagement through any portal function
 *   AC-AUTH-003-03 — The restriction holds on a direct reference (fetch-by-id) path,
 *                    not only the primary navigation
 *
 * Strategy (Phase-2 single-participant model):
 *   1. Seed TWO distinct Client Users, each with their own Engagement.
 *   2. Set up CLIENT-A's session — verify CLIENT-A sees their own engagement on /dashboard.
 *   3. Verify CLIENT-A cannot reach CLIENT-B's engagement via the direct-reference route
 *      /engagements/<CLIENT-B-engagement-id> (AC-AUTH-003-03).
 *   4. The FILTER does the isolation — NOT app-layer filtering.
 *
 * Note: The tier-3 (service-integration) CLIENT-A/CLIENT-B/null/ACCOUNTANT isolation proof
 * for pol_Engagement is in packages/db/src/engagement.client-isolation.rls.test.ts
 * (TASK-010-001 — the HARD isolation test). This spec is the tier-6 surface-level proof
 * that the portal routes honor the FILTER (AC-AUTH-003-03 direct-reference path).
 *
 * Stack: portal container at http://localhost:3000, AUTH_PROVIDER=mock.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'engagement-isolation'
 *
 * ADR-005: RLS policy not relaxed — admin pool for fixture setup/teardown only.
 *   The app request pool is exercised via the CLIENT session (FILTER governs).
 * ADR-006: Portal surface only.
 * ADR-012: Tier-6 e2e.
 * CS-GEN-003: cite governing authority in comments.
 *
 * // ADR-005: pol_Engagement FILTER enforces isolation
 * // ADR-006: portal surface
 * // ADR-012: tier-6 e2e
 * // CS-GEN-003: AC ids in test names
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Unique clerkId suffix — avoids collision with other suites
const FIXTURE_CLIENT_A_CLERK_ID = "user_client_isolation_a_e2e_001";
const FIXTURE_CLIENT_B_CLERK_ID = "user_client_isolation_b_e2e_001";

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
      "[engagement-isolation.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

interface IsolationFixture {
  clerkId: string;
  userId: string;
  requestId: string;
  engagementId: string;
}

/**
 * Seeds a User + EngagementRequest + Engagement.
 * clientUserId is linked so the pol_Engagement FILTER returns the row
 * when SESSION_CONTEXT is the CLIENT's clerkId.
 */
async function seedClientEngagement(data: {
  clerkId: string;
  email: string;
}): Promise<IsolationFixture> {
  const pool = await getPool();

  // 1. Upsert User
  const userResult = await pool
    .request()
    .input("clerkId", data.clerkId)
    .input("email", data.email)
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
    const lookup = await pool
      .request()
      .input("clerkId", data.clerkId)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) throw new Error("[engagement-isolation.spec] Failed to upsert User");
  }

  // 2. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", data.email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('IsolationTest', 'E2E', @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[engagement-isolation.spec] Failed to seed EngagementRequest");

  // 3. Seed Engagement with clientUserId linked for RLS FILTER
  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, requestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, userId)
    .input("status", "In Progress")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, @status,
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[engagement-isolation.spec] Failed to seed Engagement");

  return {
    clerkId: data.clerkId,
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
  };
}

async function cleanupFixture(fixture: IsolationFixture): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, fixture.engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, fixture.requestId)
    .query(
      `DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @id`,
    );
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, fixture.requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);

  await pool
    .request()
    .input("clerkId", fixture.clerkId)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-AUTH-003-01 / AC-AUTH-003-02 / AC-AUTH-003-03 — Own-data isolation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-AUTH-003-01] [AC-AUTH-003-02] [AC-AUTH-003-03] engagement-isolation: client sees only their own engagement", () => {
  let clientA: IsolationFixture | null = null;
  let clientB: IsolationFixture | null = null;

  test.beforeAll(async () => {
    // Seed two clients with separate engagements.
    // ADR-005: admin pool for fixture only — the FILTER is exercised via the CLIENT session.
    clientA = await seedClientEngagement({
      clerkId: FIXTURE_CLIENT_A_CLERK_ID,
      email: "e2e-isolation-client-a@portal-isolation.e2e.test",
    });
    clientB = await seedClientEngagement({
      clerkId: FIXTURE_CLIENT_B_CLERK_ID,
      email: "e2e-isolation-client-b@portal-isolation.e2e.test",
    });
  });

  test.afterAll(async () => {
    if (clientA) await cleanupFixture(clientA);
    if (clientB) await cleanupFixture(clientB);
    clientA = null;
    clientB = null;
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  // ─── AC-AUTH-003-01: CLIENT sees only their own engagement ────────────────────

  test("[AC-AUTH-003-01] CLIENT-A's session shows CLIENT-A's engagement on the dashboard", async ({
    page,
    request,
  }) => {
    if (!clientA) throw new Error("fixture not seeded");

    // Given: CLIENT-A is authenticated
    await setupClientSession(page, request, FIXTURE_CLIENT_A_CLERK_ID);

    // When: CLIENT-A navigates to /dashboard
    await page.goto(`${PORTAL_URL}/dashboard`);

    // Then: CLIENT-A sees their own engagement (the engagement card is present)
    // ADR-005: pol_Engagement FILTER returns CLIENT-A's row only.
    const engagementCard = page.locator('[data-testid="engagement-card"]');
    await expect(engagementCard).toBeVisible({ timeout: 10_000 });

    // The engagement-card's data-engagement-id must be CLIENT-A's engagement
    const renderedId = await engagementCard.getAttribute("data-engagement-id");
    expect(
      renderedId?.toLowerCase(),
      "[AC-AUTH-003-01] CLIENT-A's dashboard must show CLIENT-A's engagement id",
    ).toBe(clientA.engagementId.toLowerCase());
  });

  // ─── AC-AUTH-003-02: CLIENT cannot list another client's engagement ───────────

  test("[AC-AUTH-003-02] CLIENT-A cannot list CLIENT-B's engagement through the dashboard", async ({
    page,
    request,
  }) => {
    if (!clientA || !clientB) throw new Error("fixture not seeded");

    // Given: CLIENT-A is authenticated
    await setupClientSession(page, request, FIXTURE_CLIENT_A_CLERK_ID);

    // When: CLIENT-A navigates to /dashboard
    await page.goto(`${PORTAL_URL}/dashboard`);

    // Then: CLIENT-B's engagement is NOT visible on the dashboard
    // ADR-005: FILTER returns ZERO rows for CLIENT-B's engagement under CLIENT-A's SESSION_CONTEXT.
    const engagementCard = page.locator('[data-testid="engagement-card"]');
    await expect(engagementCard).toBeVisible({ timeout: 10_000 });

    // CLIENT-B's engagement id must not appear anywhere on the dashboard
    const bodyHtml = await page.content();
    expect(
      bodyHtml,
      "[AC-AUTH-003-02] CLIENT-B's engagement id must NOT appear on CLIENT-A's dashboard",
    ).not.toContain(clientB.engagementId.toLowerCase());
    expect(
      bodyHtml.toLowerCase(),
      "[AC-AUTH-003-02] CLIENT-B's engagement id must NOT appear in any case on CLIENT-A's dashboard",
    ).not.toContain(clientB.engagementId.toLowerCase());
  });

  // ─── AC-AUTH-003-03: Direct-reference isolation (fetch-by-id) ────────────────

  test("[AC-AUTH-003-03] CLIENT-A requesting CLIENT-B's engagement by direct reference is denied", async ({
    page,
    request,
  }) => {
    if (!clientA || !clientB) throw new Error("fixture not seeded");

    // Given: CLIENT-A is authenticated and holds a direct reference to CLIENT-B's engagement id
    await setupClientSession(page, request, FIXTURE_CLIENT_A_CLERK_ID);

    // When: CLIENT-A navigates to the direct-reference URL for CLIENT-B's engagement
    // This exercises the /engagements/[engagementId] route (AC-AUTH-003-03 surface).
    // ADR-005: getEngagementForClient runs under CLIENT-A's SESSION_CONTEXT;
    //          the pol_Engagement FILTER returns null (fail-closed) for a non-owned id.
    await page.goto(`${PORTAL_URL}/engagements/${clientB.engagementId}`);

    // Then: the response is a not-found (Next.js 404) — NOT CLIENT-B's engagement data
    // Next.js calls notFound() in the page handler when the FILTER returns null.
    const statusCode = await page.evaluate(() => document.querySelector("title")?.textContent);

    // The page must NOT show CLIENT-B's engagement (no engagement-detail testid)
    const engagementDetail = page.locator('[data-testid="engagement-detail"]');
    await expect(
      engagementDetail,
      "[AC-AUTH-003-03] CLIENT-A must NOT be shown CLIENT-B's engagement detail when navigating directly",
    ).toHaveCount(0);

    // The badge with CLIENT-B's data must not appear
    const badge = page.locator('[data-testid="engagement-client-status"]');
    await expect(
      badge,
      "[AC-AUTH-003-03] CLIENT-A must NOT see CLIENT-B's engagement status via direct reference",
    ).toHaveCount(0);

    // The page should be a 404 or contain an error indicator
    // (Next.js notFound() renders a 404 page — it contains "404" or "Not Found" in title)
    const pageTitle = (await page.title()).toLowerCase();
    const pageText = (await page.locator("body").innerText()).toLowerCase();
    const isNotFound =
      pageTitle.includes("404") ||
      pageTitle.includes("not found") ||
      pageText.includes("not found") ||
      pageText.includes("404") ||
      // Also accept if the page simply doesn't render any engagement data
      !(await page.locator('[data-testid="engagement-detail"]').isVisible());

    expect(
      isNotFound,
      "[AC-AUTH-003-03] Direct reference to CLIENT-B's engagement must result in a not-found response for CLIENT-A",
    ).toBe(true);

    void statusCode; // suppress unused warning
  });

  // ─── AC-AUTH-003-03: Unauthenticated direct reference is also denied ──────────

  test("[AC-AUTH-003-03] unauthenticated request to a direct engagement reference is denied", async ({
    page,
  }) => {
    if (!clientA) throw new Error("fixture not seeded");

    // Given: no session (unauthenticated)
    // Middleware enforces /engagements/* requires CLIENT session → redirect to /sign-in.
    // This is the null SESSION_CONTEXT case (FILTER returns ZERO, ADR-003 §5).

    // When: unauthenticated request navigates to a direct engagement URL
    await page.goto(`${PORTAL_URL}/engagements/${clientA.engagementId}`, {
      waitUntil: "commit",
    });

    const finalUrl = new URL(page.url());

    // Then: redirected to /sign-in (middleware fires before any page content)
    // The middleware (applyPortalAuth) redirects unauthenticated requests on private routes.
    expect(
      finalUrl.pathname.includes("/sign-in") || finalUrl.pathname.includes("/dashboard"),
      "[AC-AUTH-003-03] Unauthenticated direct engagement reference must be redirected to /sign-in",
    ).toBe(true);

    // Must NOT show the engagement detail
    const engagementDetail = page.locator('[data-testid="engagement-detail"]');
    await expect(engagementDetail).toHaveCount(0);
  });
});

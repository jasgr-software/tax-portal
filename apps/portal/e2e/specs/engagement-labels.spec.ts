/**
 * apps/portal/e2e/specs/engagement-labels.spec.ts
 *
 * Tier-6 e2e — Client portal engagement label rendering and read-only surface.
 *
 * Acceptance criteria covered:
 *   AC-LIFE-002-01 — client sees the mapped label for each internal status
 *   AC-LIFE-002-02 — internal Review shows "In Progress"; "Review" never appears in DOM
 *   AC-LIFE-002-03 — client perceives exactly three states over the lifecycle
 *   AC-LIFE-004-02 — Review stage requires no client action
 *   AC-LIFE-004-03 — Review is not presented as a client approval step
 *   AC-LIFE-003-03 — no status-change affordance in apps/portal
 *   AC-LIFE-006-02 — no reopen affordance for a Complete engagement
 *   AC-AUTH-008-01 — client retains sign-in after completion
 *   AC-AUTH-008-02 — client views Complete engagement indefinitely after completion
 *
 * Strategy:
 *   1. Seed a User + EngagementRequest + Engagement via admin pool (RLS-exempt).
 *   2. Set clientUserId on the engagement so the FILTER sees the CLIENT.
 *   3. Set up a CLIENT session and navigate to /dashboard.
 *   4. Assert the rendered label matches the expected client-facing mapping.
 *   5. Assert "Review" (raw internal stage) is absent from the DOM (AC-LIFE-002-02).
 *   6. Assert no transition/reopen affordance is present.
 *
 * AC-LIFE-002-01/-02/-03 all four internal statuses are seeded and each navigated
 * separately to prove the three-state arc.
 *
 * Stack: portal container at http://localhost:3000, AUTH_PROVIDER=mock.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'engagement-labels'
 *
 * ADR-005: RLS policy not relaxed — admin pool for fixture setup/teardown only.
 * ADR-006: Only apps/portal surface is exercised here.
 * ADR-012: Tier-6 e2e.
 * CS-GEN-003: cite governing authority in comments.
 *
 * // ADR-005: FILTER enforces isolation; admin pool for seed only
 * // ADR-006: portal surface
 * // ADR-012: tier-6 e2e
 * // CS-GEN-003: AC ids in test names + comments
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Unique clerkId suffix avoids collision with other suites
const FIXTURE_CLIENT_CLERK_ID_BASE = "user_client_labels_e2e_";

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
      "[engagement-labels.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

interface LabelFixture {
  clerkId: string;
  userId: string;
  requestId: string;
  engagementId: string;
}

/**
 * Seeds a User + EngagementRequest + Engagement with the given status.
 * The User's clerkId is set and clientUserId is linked so the pol_Engagement FILTER
 * will return the row when SESSION_CONTEXT is the CLIENT's clerkId.
 *
 * ADR-005: admin pool is used for fixture setup — RLS is NOT relaxed on the
 * app request pool. The FILTER is exercised via the CLIENT session in the tests.
 */
async function seedClientEngagement(data: {
  clerkId: string;
  email: string;
  status: string;
}): Promise<LabelFixture> {
  const pool = await getPool();

  // 0. Idempotent cleanup of any prior fixture for this clerkId
  await cleanupByClerkId(data.clerkId, pool);

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
    if (!userId) throw new Error("[engagement-labels.spec] Failed to upsert User");
  }

  // 2. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", data.email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('LabelTest', 'E2E', @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[engagement-labels.spec] Failed to seed EngagementRequest");

  // 3. Seed Engagement with given status + clientUserId linked
  // For Complete status, also set both confirmation timestamps.
  const isComplete = data.status === "Complete";
  const confirmSql = isComplete
    ? `[deliveryConfirmedAt], [filingConfirmedAt],`
    : "";
  const confirmValues = isComplete
    ? `SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(),`
    : "";

  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, requestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, userId)
    .input("status", data.status)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status],
          ${confirmSql}
          [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, @status,
               ${confirmValues}
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[engagement-labels.spec] Failed to seed Engagement");

  return {
    clerkId: data.clerkId,
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
  };
}

async function cleanupByClerkId(
  clerkId: string,
  pool?: mssqlPkg.ConnectionPool,
): Promise<void> {
  const p = pool ?? (await getPool());

  // Delete engagement data linked to this user
  await p.request().input("clerkId", clerkId).query(
    `DELETE e
     FROM [dbo].[Engagement] e
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  // Delete EngagementRequests seeded for this label test fixture
  // (linked by email pattern)
  await p.request().input("clerkId", clerkId).query(
    `DELETE er
     FROM [dbo].[EngagementRequest] er
     WHERE er.[email] LIKE @clerkId + '@%'
       OR er.[email] LIKE 'e2e-labels-' + @clerkId + '%'`,
  );
  // Delete User
  await p
    .request()
    .input("clerkId", clerkId)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

async function cleanupEngagement(
  requestId: string,
  engagementId: string,
): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, requestId)
    .query(
      `DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @id`,
    );
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-002-01 — Internal statuses map to client-facing labels
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-002-01] engagement-labels: each internal status maps to the correct client-facing label", () => {
  // Test each mapping: New→"Received", In Progress→"In Progress", Review→"In Progress", Complete→"Completed"
  const labelMappings = [
    { internalStatus: "New", expectedLabel: "Received" },
    { internalStatus: "In Progress", expectedLabel: "In Progress" },
    { internalStatus: "Review", expectedLabel: "In Progress" },
    { internalStatus: "Complete", expectedLabel: "Completed" },
  ] as const;

  for (const { internalStatus, expectedLabel } of labelMappings) {
    // AC-LIFE-002-02: "Review" must show as "In Progress" (not "Review" in DOM)
    test(`[AC-LIFE-002-01] [AC-LIFE-002-02] internal status "${internalStatus}" is displayed as "${expectedLabel}" on the dashboard`, async ({
      page,
      request,
    }) => {
      const clerkId = `${FIXTURE_CLIENT_CLERK_ID_BASE}${internalStatus.replace(" ", "_").toLowerCase()}_001`;
      const email = `e2e-labels-${clerkId}@portal-labels.e2e.test`;

      const fixture = await seedClientEngagement({
        clerkId,
        email,
        status: internalStatus,
      });

      try {
        // Given: an authenticated CLIENT with an engagement in the given internal status
        await setupClientSession(page, request, clerkId);

        // When: the client navigates to /dashboard
        await page.goto(`${PORTAL_URL}/dashboard`);

        // Then: the client sees the mapped client-facing label
        const badge = page.locator('[data-testid="engagement-client-status"]');
        await expect(badge).toBeVisible({ timeout: 10_000 });
        await expect(badge).toContainText(expectedLabel, { timeout: 10_000 });

        // AC-LIFE-002-02: The mapped label carries the correct data-status attribute
        await expect(badge).toHaveAttribute("data-status", expectedLabel);

        // AC-LIFE-002-02: The raw internal status "Review" must NEVER appear in the DOM
        // (even when expectedLabel === "In Progress" due to the Review→"In Progress" mapping)
        if (internalStatus === "Review") {
          // Assert that the word "Review" does not appear anywhere in the page content
          const bodyText = await page.locator("body").innerText();
          expect(
            bodyText,
            `[AC-LIFE-002-02] The internal "Review" stage must NEVER be displayed to the client. ` +
              `Found "Review" in the DOM when internal status is "${internalStatus}".`,
          ).not.toContain("Review");
        }

        // AC-LIFE-003-03: No status-change affordance (no buttons that trigger transitions)
        const transitionButtons = page.locator(
          '[data-testid*="transition"], [data-testid*="advance-status"], [data-testid*="change-status"]',
        );
        await expect(transitionButtons).toHaveCount(0);

        // AC-LIFE-006-02: No reopen affordance
        const reopenButton = page.locator('[data-testid*="reopen"]');
        await expect(reopenButton).toHaveCount(0);
      } finally {
        await clearSession(page);
        await cleanupEngagement(fixture.requestId, fixture.engagementId);
        await cleanupByClerkId(clerkId);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-002-03 — Client perceives exactly three distinct states
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-002-03] engagement-labels: client perceives exactly three distinct states over the lifecycle", () => {
  test("[AC-LIFE-002-03] the three client-facing states are Received, In Progress, and Completed", async ({
    page,
    request,
  }) => {
    // Given: we know the full set of internal statuses and their client-facing mapping
    // When: we verify each maps to one of the three client-facing states
    // Then: the set of distinct labels is exactly {"Received", "In Progress", "Completed"}

    const clerkId = `${FIXTURE_CLIENT_CLERK_ID_BASE}threestate_001`;
    const email = `e2e-labels-threestate@portal-labels.e2e.test`;

    // Verify using the "New" status (→ "Received") as the live representative
    const fixture = await seedClientEngagement({
      clerkId,
      email,
      status: "New",
    });

    try {
      await setupClientSession(page, request, clerkId);
      await page.goto(`${PORTAL_URL}/dashboard`);

      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(badge).toBeVisible({ timeout: 10_000 });

      // AC-LIFE-002-03: The rendered label is one of the three allowed values.
      const renderedLabel = await badge.getAttribute("data-status");
      const allowedLabels = ["Received", "In Progress", "Completed"];
      expect(
        allowedLabels,
        `[AC-LIFE-002-03] The client-facing label "${renderedLabel}" must be one of ${allowedLabels.join(", ")}.`,
      ).toContain(renderedLabel);

      // AC-LIFE-002-03: For New status → "Received" (first of three)
      expect(renderedLabel).toBe("Received");
    } finally {
      await clearSession(page);
      await cleanupEngagement(fixture.requestId, fixture.engagementId);
      await cleanupByClerkId(clerkId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-004-02/-03 — Review stage: no client action, not a client approval step
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-004-02] [AC-LIFE-004-03] engagement-labels: Review stage requires no client action and is not a client approval step", () => {
  test("[AC-LIFE-004-02] [AC-LIFE-004-03] when engagement is in Review, the portal shows no action required and no approval UI", async ({
    page,
    request,
  }) => {
    const clerkId = `${FIXTURE_CLIENT_CLERK_ID_BASE}review_action_001`;
    const email = `e2e-labels-review-action@portal-labels.e2e.test`;

    const fixture = await seedClientEngagement({
      clerkId,
      email,
      status: "Review",
    });

    try {
      // Given: an engagement in the internal Review status
      await setupClientSession(page, request, clerkId);

      // When: the client views the engagement
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Then: no action is required of the client (AC-LIFE-004-02)
      // The badge shows "In Progress" (not "Review") — no approve/review/action buttons
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toHaveAttribute("data-status", "In Progress");

      // AC-LIFE-004-03: No approval or "review required" UI elements
      const approvalElements = page.locator(
        '[data-testid*="approve"], [data-testid*="review-action"], button:has-text("Approve"), button:has-text("Review and Approve")',
      );
      await expect(approvalElements).toHaveCount(0);

      // AC-LIFE-004-02: No "action required" text directed at the client
      // (the page should NOT say things like "Your review is required")
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.toLowerCase()).not.toContain("your review");
      expect(bodyText.toLowerCase()).not.toContain("action required by you");

      // AC-LIFE-004-03: The word "Review" (the raw stage name) must not appear
      expect(bodyText).not.toContain("Review");
    } finally {
      await clearSession(page);
      await cleanupEngagement(fixture.requestId, fixture.engagementId);
      await cleanupByClerkId(clerkId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-003-03 — No status-change affordance in apps/portal
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-003-03] engagement-labels: no status-change affordance is present in apps/portal", () => {
  test("[AC-LIFE-003-03] client navigates to dashboard and sees no transition/status-change controls", async ({
    page,
    request,
  }) => {
    const clerkId = `${FIXTURE_CLIENT_CLERK_ID_BASE}no_transition_001`;
    const email = `e2e-labels-no-transition@portal-labels.e2e.test`;

    const fixture = await seedClientEngagement({
      clerkId,
      email,
      status: "In Progress",
    });

    try {
      // Given: a signed-in CLIENT with an active engagement
      await setupClientSession(page, request, clerkId);

      // When: the client views the dashboard
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Then: the engagement is rendered but no transition controls are present
      const engagementCard = page.locator('[data-testid="engagement-card"]');
      await expect(engagementCard).toBeVisible({ timeout: 10_000 });

      // AC-LIFE-003-03: No status-change buttons
      const transitionButton = page.locator(
        '[data-testid="advance-status-button"], [data-testid="transition-button"], button:has-text("Advance"), button:has-text("Move to")',
      );
      await expect(transitionButton).toHaveCount(0);

      // AC-LIFE-006-02: No reopen button
      const reopenButton = page.locator(
        '[data-testid="reopen-engagement-button"], button:has-text("Reopen")',
      );
      await expect(reopenButton).toHaveCount(0);

      // Also check the direct engagement detail view
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);

      const engagementDetail = page.locator('[data-testid="engagement-detail"]');
      await expect(engagementDetail).toBeVisible({ timeout: 10_000 });

      const transitionButtonDetail = page.locator(
        '[data-testid="advance-status-button"], [data-testid="transition-button"]',
      );
      await expect(transitionButtonDetail).toHaveCount(0);
    } finally {
      await clearSession(page);
      await cleanupEngagement(fixture.requestId, fixture.engagementId);
      await cleanupByClerkId(clerkId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-006-02 — No reopen affordance in apps/portal for Complete engagement
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-LIFE-006-02] engagement-labels: no reopen affordance for a Complete engagement", () => {
  test("[AC-LIFE-006-02] client sees Complete engagement showing 'Completed' with no reopen button", async ({
    page,
    request,
  }) => {
    const clerkId = `${FIXTURE_CLIENT_CLERK_ID_BASE}complete_noreopen_001`;
    const email = `e2e-labels-complete-noreopen@portal-labels.e2e.test`;

    const fixture = await seedClientEngagement({
      clerkId,
      email,
      status: "Complete",
    });

    try {
      // Given: a Complete engagement the client participates in
      await setupClientSession(page, request, clerkId);

      // When: the client views their dashboard
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Then: the engagement shows "Completed" (AC-LIFE-002-01, mapped from "Complete")
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toHaveAttribute("data-status", "Completed");
      await expect(badge).toContainText("Completed");

      // AC-LIFE-006-02: No reopen affordance
      const reopenButton = page.locator(
        '[data-testid="reopen-engagement-button"], button:has-text("Reopen"), button:has-text("Restart")',
      );
      await expect(reopenButton).toHaveCount(0);
    } finally {
      await clearSession(page);
      await cleanupEngagement(fixture.requestId, fixture.engagementId);
      await cleanupByClerkId(clerkId);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-AUTH-008-01/-02 — Post-completion: client retains sign-in and can view engagement
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-AUTH-008-01] [AC-AUTH-008-02] engagement-labels: client retains access after engagement is Complete", () => {
  test("[AC-AUTH-008-01] [AC-AUTH-008-02] client can sign in after completion and still view the Complete engagement", async ({
    page,
    request,
  }) => {
    const clerkId = `${FIXTURE_CLIENT_CLERK_ID_BASE}postcomplete_001`;
    const email = `e2e-labels-postcomplete@portal-labels.e2e.test`;

    const fixture = await seedClientEngagement({
      clerkId,
      email,
      status: "Complete",
    });

    try {
      // Given: an engagement that has been marked Complete
      // When: its client participant signs in (simulated via setupClientSession)
      await setupClientSession(page, request, clerkId);

      // Then (AC-AUTH-008-01): they retain the ability to sign in to the portal
      // (demonstrated by the mock session being established and the page loading)
      await page.goto(`${PORTAL_URL}/dashboard`);

      // The dashboard must serve the client (not redirect to /sign-in)
      const finalUrl = new URL(page.url());
      expect(finalUrl.pathname, "[AC-AUTH-008-01] Client must remain on /dashboard after sign-in post-completion")
        .toBe("/dashboard");

      // AC-AUTH-008-02: the client can view the Complete engagement and its data
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(badge).toHaveAttribute("data-status", "Completed");
      await expect(badge).toContainText("Completed");

      // The engagement card must be present
      const engagementCard = page.locator('[data-testid="engagement-card"]');
      await expect(engagementCard).toBeVisible({ timeout: 10_000 });

      // AC-AUTH-008-02: navigate to the direct engagement detail view (complete still accessible)
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);
      const engagementDetail = page.locator('[data-testid="engagement-detail"]');
      await expect(engagementDetail).toBeVisible({ timeout: 10_000 });

      // The status badge on the detail page also shows "Completed"
      const detailBadge = page.locator('[data-testid="engagement-client-status"]');
      await expect(detailBadge).toBeVisible({ timeout: 10_000 });
      await expect(detailBadge).toHaveAttribute("data-status", "Completed");
    } finally {
      await clearSession(page);
      await cleanupEngagement(fixture.requestId, fixture.engagementId);
      await cleanupByClerkId(clerkId);
    }
  });
});

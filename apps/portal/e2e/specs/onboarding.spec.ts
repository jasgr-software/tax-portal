/**
 * apps/portal/e2e/specs/onboarding.spec.ts
 *
 * Tier-6 e2e — Client onboarding sequence: sequence rendered, sign→unlock happy path.
 *
 * Acceptance criteria covered (EPIC-005):
 *   AC-ONBD-001-01 — onboarding shows exactly three steps in fixed order (tier 6)
 *   AC-ONBD-001-03 — client sees their current position and remaining steps (tier 6)
 *   AC-ONBD-001-02 — locked steps rendered as locked in the UI (tier-3 enforcement proven in TASK-005-001/-005)
 *   AC-ONBD-002-01/-02 — questionnaire/upload locked UI affordance (tier-3 enforcement in TASK-005-001/-005)
 *   AC-ONBD-002-03 — signing the letter unlocks steps 2/3 (tier 6 — 3× zero-flake required)
 *   AC-ONBD-002-04 — signature evidence recorded (observable as step 1 done=true post-sign)
 *
 * Gherkin binding (prose-bound until Cucumber tooling lands — CLAUDE.md § Executable gherkin tooling):
 *   Scenario: Onboarding presents three ordered steps
 *   Scenario: Client sees their position and what remains
 *   Scenario: Signing the letter unlocks the remaining steps
 *
 * Stack: portal container at http://localhost:3000 (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock,
 *        ALLOW_MOCK_ESIGN=true) — e2e drives the mock e-sign through the ESignatureProvider PORT.
 *
 * Fixture:
 *   // DECISION (TASK-005-007): We seed a User row carrying the deterministic clerkUserId
 *   // "user_client_e2e_onbd_001" and an Engagement row with clientUserId = User.id.
 *   // This ensures sec.pol_Engagement FILTER returns the row under a CLIENT principal session.
 *   // We do NOT relax the RLS policy; the admin pool is the seed path only.
 *   // The request-pool read (getMyEngagement via withRequestContext) is exercised normally.
 *   // Cleanup: try/finally deletes the seeded rows in reverse FK order.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'onboarding'
 *
 * ADR-012: tier-6 e2e.
 * ADR-005: RLS policy not relaxed — admin pool used for seed/teardown only.
 * ADR-023/024: e-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock).
 * ADR-019: audit event recorded at sign time (observable via done=true in the read model).
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// DECISION (TASK-005-007): Use a deterministic, e2e-only clerkUserId so we can
// seed a User row with a known clerkId and set up CLIENT mock-session ownership.
// The suffix "-onbd-" distinguishes this fixture from the cross-app suite and
// prior e2e suites to prevent cross-test collision on the unique clerkId column.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_onbd_001";

// ─── DB helpers (admin pool, RLS-exempt seed/teardown path) ────────────────────

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
      "[onboarding.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown (ADR-007).",
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

// ─── Fixture: seed a User + EngagementRequest + Engagement for the test client ──

interface SeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
}

/**
 * Seeds a User row with the fixture clerkUserId and an Engagement row owned by that user.
 * The engagement has letterSignedAt=NULL (unsigned, gate closed) by default.
 *
 * DECISION (TASK-005-007): We seed directly via admin pool rather than driving the
 * full accept→signup chain, because:
 * (a) The mock-session fixture uses a deterministic clerkUserId; there is no real
 *     User row in the DB for it (mock auth creates session only, no DB User row).
 * (b) sec.pol_Engagement FILTER joins on User.clerkId = SESSION_CONTEXT('clerk_user_id').
 *     A NULL clientUserId engagement returns ZERO rows under any CLIENT principal.
 * (c) Seeding directly is the minimal honest path and is what the admin pool is for.
 *
 * Cleanup: call cleanupFixture() in afterEach/finally.
 */
async function seedClientEngagement(): Promise<SeedResult> {
  const pool = await getPool();

  // 1. Upsert User row (idempotent — ON DUPLICATE KEY via MERGE or try/delete-first)
  //    We use MERGE to handle the unique constraint on clerkId across test retries.
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-onbd-001@onboarding.e2e.test")
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
    // MERGE returned no OUTPUT (the row already existed) — look it up
    const lookupResult = await pool
      .request()
      .input("clerkId", FIXTURE_CLERK_USER_ID)
      .query<{ id: string }>(
        `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
      );
    userId = lookupResult.recordset[0]?.id;
    if (!userId) {
      throw new Error("[onboarding.spec] Failed to upsert/find User fixture row");
    }
  }

  // 2. Seed EngagementRequest (required as FK on Engagement)
  const requestResult = await pool
    .request()
    .input("firstName", "E2E")
    .input("lastName", "Onboarding")
    .input("email", `e2e-onbd-req-${Date.now()}@onboarding.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) {
    throw new Error("[onboarding.spec] Failed to seed EngagementRequest fixture row");
  }

  // 3. Seed Engagement with clientUserId → this User
  //    letterSignedAt=NULL → step 1 accessible, steps 2/3 locked
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
    throw new Error("[onboarding.spec] Failed to seed Engagement fixture row");
  }

  return { userId, requestId, engagementId };
}

/**
 * Clean up seeded rows in reverse FK order.
 * Called in try/finally to ensure cleanup even on test failure.
 */
async function cleanupFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // 1. Engagement (FK → EngagementRequest)
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`);

  // 2. EngagementRequest
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`);

  // NOTE: We do NOT delete the User row between tests — it's reused across
  // test runs via the MERGE upsert, and its clerkId is deterministic.
  // We delete it in afterAll to avoid cross-suite collisions.
}

/**
 * Delete the fixture User row. Call in afterAll.
 */
async function cleanupFixtureUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── afterAll: close pool ──────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupFixtureUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-001-01 — Onboarding presents three ordered steps
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-001-01] onboarding shows exactly three ordered steps", () => {
  /**
   * Gherkin (EPIC-005 § Acceptance scenarios — verbatim):
   * Given a client whose engagement is in onboarding
   * When the client opens their engagement's onboarding
   * Then they see exactly three steps in order: sign the engagement letter, complete the questionnaire, upload documents
   */

  let seeded: SeedResult | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedClientEngagement();
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-ONBD-001-01] onboarding page shows exactly 3 steps in the fixed order", async ({ page }) => {
    // Given: a client whose engagement is in onboarding (CLIENT session + seeded engagement)
    // When: the client opens their engagement's onboarding
    await page.goto(`${PORTAL_URL}/onboarding`);

    // Then: they see exactly three steps
    const stepsList = page.locator('[data-testid="onboarding-steps"]');
    await expect(stepsList).toBeVisible();

    const steps = stepsList.locator("[data-step]");
    await expect(steps).toHaveCount(3);

    // Then: the steps are in fixed order: engagement-letter, intake-questionnaire, document-upload
    const stepKeys = await steps.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-step")),
    );
    expect(stepKeys).toEqual([
      "engagement-letter",
      "intake-questionnaire",
      "document-upload",
    ]);

    // Then: step 1 (engagement-letter) is accessible (letter not yet signed)
    const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
    await expect(letterStep).toHaveAttribute("data-accessible", "true");

    // Then: steps 2/3 are locked (letter not yet signed — AC-ONBD-002-01/-02 UI affordance)
    const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
    const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');
    await expect(questionnaireStep).toHaveAttribute("data-accessible", "false");
    await expect(uploadStep).toHaveAttribute("data-accessible", "false");

    // Lock badges visible for locked steps
    await expect(page.locator('[data-testid="lock-badge-intake-questionnaire"]')).toBeVisible();
    await expect(page.locator('[data-testid="lock-badge-document-upload"]')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-001-03 — Client sees their position and what remains
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-001-03] onboarding shows current position and remaining steps", () => {
  /**
   * Gherkin (EPIC-005 § Acceptance scenarios — verbatim):
   * Given a client partway through onboarding
   * When they view the onboarding sequence
   * Then they can see which step they are on and which steps still remain
   */

  let seeded: SeedResult | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedClientEngagement();
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-ONBD-001-03] position indicator shows current step and remaining count", async ({ page }) => {
    // Given: a client partway through onboarding (step 1: engagement-letter)
    // When: they view the onboarding sequence
    await page.goto(`${PORTAL_URL}/onboarding`);

    // Then: the position indicator is visible
    const positionEl = page.locator('[data-testid="onboarding-position"]');
    await expect(positionEl).toBeVisible();

    // Then: the current step indicator shows the engagement-letter step
    await expect(positionEl).toHaveAttribute("data-current-step", "engagement-letter");

    // Then: the remaining count is present (2 steps remain)
    const remaining = await positionEl.getAttribute("data-remaining");
    expect(Number(remaining)).toBeGreaterThan(0);

    // Then: the position text says "Step 1 of 3"
    await expect(positionEl).toContainText("Step 1 of 3");

    // Then: the remaining text is visible
    await expect(positionEl).toContainText("remaining");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-002-01/-02 — UI affordance: steps 2/3 locked before signing
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-002-01/-02] steps 2/3 render as locked before the letter is signed", () => {
  /**
   * Gherkin:
   *   (AC-ONBD-002-01) Given an engagement whose letter has not been e-signed
   *   When the questionnaire step's accessibility is evaluated
   *   Then the questionnaire step is not accessible to the client
   *
   *   (AC-ONBD-002-02) Given an engagement whose letter has not been e-signed
   *   When the document-upload step's accessibility is evaluated
   *   Then the document-upload step is not accessible to the client
   *
   * Note: the SERVER-SIDE enforcement (refusal on API calls) is proven at tier-3
   * in TASK-005-001/-005. This test covers the UI presentation affordance (lock
   * badge + lock message visible when accessible=false).
   */

  let seeded: SeedResult | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedClientEngagement();
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-ONBD-002-01/-02] questionnaire and document-upload steps are locked in the UI before signing", async ({ page }) => {
    // Given: an engagement whose letter has not been e-signed (unseeded letterSignedAt)
    // When: the client views the onboarding sequence
    await page.goto(`${PORTAL_URL}/onboarding`);

    // Then: questionnaire step is NOT accessible (data-accessible="false")
    const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
    await expect(questionnaireStep).toHaveAttribute("data-accessible", "false");
    await expect(page.locator('[data-testid="lock-badge-intake-questionnaire"]')).toBeVisible();
    await expect(page.locator('[data-testid="lock-message-intake-questionnaire"]')).toBeVisible();

    // Then: document-upload step is NOT accessible (data-accessible="false")
    const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');
    await expect(uploadStep).toHaveAttribute("data-accessible", "false");
    await expect(page.locator('[data-testid="lock-badge-document-upload"]')).toBeVisible();
    await expect(page.locator('[data-testid="lock-message-document-upload"]')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-002-03 — Signing the letter unlocks steps 2/3 (3× zero-flake required)
// AC-ONBD-002-04 — Signed letter recorded (observable: step 1 data-done="true")
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-002-03] signing the engagement letter unlocks steps 2/3", () => {
  /**
   * Gherkin (EPIC-005 § Acceptance scenarios — verbatim):
   * Given an engagement whose letter has just been e-signed by the client
   * When onboarding is re-evaluated
   * Then the questionnaire and document-upload steps become accessible
   *
   * Also covers (observable post-sign):
   * AC-ONBD-002-04: The signed engagement letter is recorded against it
   *   (observable: engagement-letter step has data-done="true" after signing)
   *
   * E-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true).
   * The mock binding returns signed:true deterministically — no external dependency,
   * no rate-limit risk. Any flake here is a real defect (BUG-003-001 lesson).
   *
   * Gate authoring evidence (Introduces-gate: advisory):
   *   Named code path: signEngagementLetterAction → recordLetterSignatureAsClient (request pool)
   *   → revalidatePath('/onboarding') → getMyOnboardingAction resolves updated model
   *   → OnboardingSequence renders steps with accessible:true.
   *   Counterfactual: if revalidatePath('/onboarding') were removed from signEngagementLetterAction,
   *   the page would not re-render after signing and steps 2/3 would remain locked in the UI —
   *   this test would fail the accessible:true assertions after clicking the sign button.
   *
   * Run 3× for zero-flake gate (ENGINE.md § Bug Fixes/e2e — 3× sequential zero-flake).
   */

  let seeded: SeedResult | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedClientEngagement();
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-ONBD-002-03] clicking 'Sign Engagement Letter' unlocks steps 2/3", async ({ page }) => {
    // Given: an engagement whose letter has not been signed (seeded with letterSignedAt=NULL)
    await page.goto(`${PORTAL_URL}/onboarding`);

    // Verify precondition: step 1 accessible, steps 2/3 locked
    await expect(
      page.locator('[data-testid="onboarding-step-engagement-letter"]'),
    ).toHaveAttribute("data-accessible", "true");
    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-accessible", "false");
    await expect(
      page.locator('[data-testid="onboarding-step-document-upload"]'),
    ).toHaveAttribute("data-accessible", "false");

    // The sign button should be visible
    const signButton = page.locator('[data-testid="sign-letter-button"]');
    await expect(signButton).toBeVisible();

    // When: the client clicks the sign button (drives signEngagementLetterAction via the PORT)
    await signButton.click();

    // Then: wait for the page to re-render with the signed state
    // (revalidatePath('/onboarding') in signEngagementLetterAction causes re-render)
    await expect(page.locator('[data-testid="letter-signed-confirmation"]')).toBeVisible({
      timeout: 15_000,
    });

    // Then: step 1 is now marked as done (AC-ONBD-002-04: signature recorded)
    await expect(
      page.locator('[data-testid="onboarding-step-engagement-letter"]'),
    ).toHaveAttribute("data-done", "true");

    // Then: steps 2/3 are now accessible (gate unlocked — AC-ONBD-002-03)
    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });
    await expect(
      page.locator('[data-testid="onboarding-step-document-upload"]'),
    ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });

    // Then: lock badges are no longer visible on steps 2/3
    await expect(
      page.locator('[data-testid="lock-badge-intake-questionnaire"]'),
    ).not.toBeVisible();
    await expect(
      page.locator('[data-testid="lock-badge-document-upload"]'),
    ).not.toBeVisible();
  });
});

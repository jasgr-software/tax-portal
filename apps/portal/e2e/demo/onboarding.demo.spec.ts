/**
 * apps/portal/e2e/demo/onboarding.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-005 Onboarding spine (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives a post-signup client's
 * three-step onboarding happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock, ALLOW_MOCK_ESIGN=true) and writes an
 * AC-tagged screenshot gallery to docs/demos/EPIC-005/. NON-GATING.
 *
 * Persona: tom-prospective-client (post-signup client, post-acceptance)
 *          (.planning/personas/tom-prospective-client.md)
 * Flows:   flow-onboarding     (.planning/flows/flow-onboarding.md)
 *          flow-first-sign-in  (.planning/flows/flow-first-sign-in.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-005 portal surface — screenshots 03–07):
 *   03-AC-ONBD-001-01-three-steps-locked-2-3.png
 *       — onboarding shows exactly three ordered steps; steps 2+3 visibly locked
 *         (AC-ONBD-001-01, AC-ONBD-001-02 UI affordance)
 *   04-AC-ONBD-001-03-position-indicator.png
 *       — position indicator shows "Step 1 of 3" and remaining-steps count
 *         (AC-ONBD-001-03)
 *   05-AC-IDNT-007-03-letter-content-shown.png
 *       — engagement-letter step shows the accountant's (current) template content
 *         in the letter body before signing (AC-IDNT-007-03)
 *   06-AC-ONBD-002-03-sign-button-visible.png
 *       — sign-letter button visible on the engagement-letter step (pre-sign moment)
 *         (AC-ONBD-002-03)
 *   07-AC-ONBD-002-03-04-steps-unlocked-after-sign.png
 *       — after signing, steps 2+3 become accessible (lock badges removed);
 *         step 1 marked done (AC-ONBD-002-03, AC-ONBD-002-04)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-005-008): We seed a User row with deterministic clerkUserId
 *   // "user_client_e2e_demo_005" and an Engagement with clientUserId = User.id.
 *   // This ensures sec.pol_Engagement FILTER returns the row under a CLIENT principal
 *   // session (getMyEngagement() / withRequestContext). We do NOT relax RLS; the admin
 *   // pool is the seed/teardown path only.
 *   //
 *   // The "-demo-005" suffix distinguishes this fixture from:
 *   //   - onboarding.spec.ts:       "user_client_e2e_onbd_001"
 *   //   - onboarding-cross-app.spec.ts: "user_client_e2e_cross_001"
 *   // to avoid unique-constraint collisions when suites run in sequence.
 *   // See TASK-005-007 DECISION comments for the onboarding-spec fixture design rationale.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 * ADR-023/024: e-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock).
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-005 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-005");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// DECISION (TASK-005-008): Use a deterministic, demo-only clerkUserId so we can
// seed a User row with a known clerkId and set up CLIENT mock-session ownership.
// The "-demo-005" suffix distinguishes this fixture from the onboarding spec's
// "user_client_e2e_onbd_001" and the cross-app spec's "user_client_e2e_cross_001"
// to prevent unique-constraint collisions across suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_005";

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
      "[onboarding.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown (ADR-007).",
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

// ─── Fixture: seed a User + EngagementRequest + Engagement ────────────────────

interface SeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
}

/**
 * Seeds a User row with the fixture clerkUserId and an Engagement row owned by that user.
 * The engagement has letterSignedAt=NULL (unsigned, gate closed) by default.
 *
 * DECISION (TASK-005-008): We seed directly via admin pool rather than driving the
 * full accept→signup chain, because:
 * (a) The mock-session fixture uses a deterministic clerkUserId; there is no real
 *     User row in the DB for it (mock auth creates session only, no DB User row).
 * (b) sec.pol_Engagement FILTER joins on User.clerkId = SESSION_CONTEXT('clerk_user_id').
 *     A NULL clientUserId engagement returns ZERO rows under any CLIENT principal.
 * (c) Seeding directly is the minimal honest path and is what the admin pool is for.
 *
 * This is the same pattern as onboarding.spec.ts (TASK-005-007), adapted for the
 * demo fixture. Cleanup: call cleanupFixture() in try/finally.
 */
async function seedClientEngagement(): Promise<SeedResult> {
  const pool = await getPool();

  // 1. Upsert User row (idempotent via MERGE on clerkId)
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-demo-005@onboarding.demo.e2e.test")
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
    // MERGE returned no OUTPUT (row already existed) — look it up
    const lookupResult = await pool
      .request()
      .input("clerkId", FIXTURE_CLERK_USER_ID)
      .query<{ id: string }>(
        `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
      );
    userId = lookupResult.recordset[0]?.id;
    if (!userId) {
      throw new Error("[onboarding.demo.spec] Failed to upsert/find User fixture row");
    }
  }

  // 2. Seed EngagementRequest (required as FK on Engagement)
  const requestResult = await pool
    .request()
    .input("firstName", "DemoClient")
    .input("lastName", "Onboarding")
    .input("email", `e2e-demo-req-${Date.now()}@onboarding.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) {
    throw new Error("[onboarding.demo.spec] Failed to seed EngagementRequest fixture row");
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
    throw new Error("[onboarding.demo.spec] Failed to seed Engagement fixture row");
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
  // test runs via the MERGE upsert. Deleted in afterAll.
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

// ─── afterAll: clean up demo user and close pool ───────────────────────────────

test.afterAll(async () => {
  await cleanupFixtureUser();
  await closePool();
});

// ─── Screen 03: Three ordered steps with 2+3 locked (AC-ONBD-001-01, UI affordance) ─

test(
  "[AC-ONBD-001-01] @demo 03 — post-signup client: onboarding shows exactly three steps, steps 2+3 visibly locked",
  async ({ page, request }) => {
    // Screen 03: CLIENT with a seeded engagement opens /onboarding.
    // They see exactly three ordered steps (engagement-letter, questionnaire, document-upload).
    // Steps 2 and 3 carry lock badges (letterSignedAt=NULL → gate not yet satisfied).
    // Proves AC-ONBD-001-01 (three ordered steps) + AC-ONBD-001-02 UI affordance (locked).
    //
    // Screenshot strategy: full-page screenshot of the onboarding page showing all three
    // steps with their lock badges visible (page-level overview of the full step list).

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedClientEngagement();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/onboarding`);

      // The onboarding steps list must be visible — AC-ONBD-001-01
      const stepsList = page.locator('[data-testid="onboarding-steps"]');
      await expect(
        stepsList,
        "onboarding-steps list must be visible (AC-ONBD-001-01)",
      ).toBeVisible({ timeout: 15_000 });

      // There must be exactly three steps
      const steps = stepsList.locator("[data-step]");
      await expect(steps, "Must have exactly 3 steps (AC-ONBD-001-01)").toHaveCount(3);

      // Step 1 (engagement-letter) is accessible — gate not yet locked
      const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
      await expect(
        letterStep,
        "engagement-letter step must be accessible (data-accessible=true)",
      ).toHaveAttribute("data-accessible", "true");

      // Steps 2+3 carry lock badges — visibly locked (AC-ONBD-001-02 UI affordance)
      await expect(
        page.locator('[data-testid="lock-badge-intake-questionnaire"]'),
        "lock-badge-intake-questionnaire must be visible (AC-ONBD-001-02 UI affordance)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.locator('[data-testid="lock-badge-document-upload"]'),
        "lock-badge-document-upload must be visible (AC-ONBD-001-02 UI affordance)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 03: full-page view — three ordered steps, steps 2+3 locked
      // (overview of the complete onboarding sequence on the page)
      await page.screenshot({
        path: shot("03-AC-ONBD-001-01-three-steps-locked-2-3.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

// ─── Screen 04: Position indicator (AC-ONBD-001-03) ──────────────────────────

test(
  "[AC-ONBD-001-03] @demo 04 — post-signup client: position indicator shows Step 1 of 3 and remaining count",
  async ({ page, request }) => {
    // Screen 04: CLIENT views the onboarding sequence at the start.
    // The position indicator shows "Step 1 of 3" and the remaining-steps count.
    // Proves AC-ONBD-001-03: client sees their current position and what remains.
    //
    // Screenshot strategy: element-scoped screenshot of the position indicator component
    // (not full-page) — isolates the "Step 1 of 3 / N steps remaining" UI element as
    // evidence of AC-ONBD-001-03, making this shot visually distinct from the full-page
    // step-list overview in screenshot 03.

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedClientEngagement();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/onboarding`);

      // The position indicator must be visible — AC-ONBD-001-03
      const positionEl = page.locator('[data-testid="onboarding-position"]');
      await expect(
        positionEl,
        "onboarding-position element must be visible (AC-ONBD-001-03)",
      ).toBeVisible({ timeout: 15_000 });

      // Must show current step = engagement-letter
      await expect(
        positionEl,
        "data-current-step must be 'engagement-letter' (AC-ONBD-001-03)",
      ).toHaveAttribute("data-current-step", "engagement-letter");

      // Must contain "Step 1 of 3" text
      await expect(
        positionEl,
        "'Step 1 of 3' text must be present in the position indicator (AC-ONBD-001-03)",
      ).toContainText("Step 1 of 3");

      // Must contain "remaining" text
      await expect(
        positionEl,
        "'remaining' text must be present (AC-ONBD-001-03)",
      ).toContainText("remaining");

      // Scroll the position indicator into view and take an element-scoped screenshot.
      // This is visually distinct from the full-page step-list in screenshot 03 —
      // it zooms into the "Step 1 of 3 / N remaining" text element specifically.
      await positionEl.scrollIntoViewIfNeeded();
      await positionEl.screenshot({
        path: shot("04-AC-ONBD-001-03-position-indicator.png"),
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

// ─── Screen 05: Letter content shown = accountant's template (AC-IDNT-007-03) ─

test(
  "[AC-IDNT-007-03] @demo 05 — post-signup client: letter step shows the accountant's current template content",
  async ({ page, request }) => {
    // Screen 05: CLIENT views the engagement-letter step in onboarding.
    // The letter content area is visible and contains template content
    // (whatever the accountant has set — system default or edited).
    // Proves AC-IDNT-007-03: the letter presented is the accountant's template.
    //
    // DECISION (TASK-005-008): We assert the letter-content element is visible and
    // non-empty, rather than asserting a specific string — because the demo runs
    // against whatever template is currently in the DB (which the admin demo test
    // may have modified). Asserting structural presence is sufficient to evidence
    // AC-IDNT-007-03 visually; the cross-app spec already asserts the exact content.
    //
    // Screenshot strategy: element-scoped screenshot of the letter-content element —
    // shows the actual template text the client sees, distinct from the full-page
    // overview (screenshot 03) and the position indicator zoom (screenshot 04).

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedClientEngagement();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/onboarding`);

      // The onboarding page must load
      const stepsList = page.locator('[data-testid="onboarding-steps"]');
      await expect(stepsList).toBeVisible({ timeout: 15_000 });

      // The engagement-letter step must be accessible
      const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
      await expect(
        letterStep,
        "engagement-letter step must be accessible (data-accessible=true)",
      ).toHaveAttribute("data-accessible", "true");

      // The letter content area must be visible — AC-IDNT-007-03
      const letterContent = page.locator('[data-testid="letter-content"]');
      await expect(
        letterContent,
        "letter-content element must be visible (AC-IDNT-007-03)",
      ).toBeVisible({ timeout: 10_000 });

      // The letter content must be non-empty (accountant's template is present)
      const contentText = await letterContent.textContent();
      expect(
        (contentText ?? "").trim().length,
        "letter-content must be non-empty — accountant's template must appear (AC-IDNT-007-03)",
      ).toBeGreaterThan(0);

      // Scroll the letter content into view and take an element-scoped screenshot.
      // This isolates the template text the client reads — visually distinct from the
      // full-page overview (screenshot 03) and the position indicator (screenshot 04).
      await letterContent.scrollIntoViewIfNeeded();
      await letterContent.screenshot({
        path: shot("05-AC-IDNT-007-03-letter-content-shown.png"),
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

// ─── Screens 06 + 07: Sign button → unlock (AC-ONBD-002-03, AC-ONBD-002-04) ──

test(
  "[AC-ONBD-002-03][AC-ONBD-002-04] @demo 06+07 — post-signup client: signs the letter; steps 2+3 unlock",
  async ({ page, request }) => {
    // Screen 06: Sign-letter button is visible on the engagement-letter step (pre-sign).
    //            Proves AC-ONBD-002-03: the affordance to sign exists.
    // Screen 07: After clicking Sign, steps 2+3 become accessible (lock badges gone);
    //            step 1 is marked done (data-done="true").
    //            Proves AC-ONBD-002-03 (steps unlock after signing) +
    //                   AC-ONBD-002-04 (signature recorded — observable as step 1 done).
    //
    // E-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true).
    // The mock binding returns signed:true deterministically — no external dependency.
    // The mock seam is set on the portal container service in docker-compose.yml.
    // We do NOT import MockESignatureProvider directly; the sign action calls through the PORT.

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedClientEngagement();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/onboarding`);

      // The onboarding page must load
      const stepsList = page.locator('[data-testid="onboarding-steps"]');
      await expect(stepsList).toBeVisible({ timeout: 15_000 });

      // Step 1 accessible, steps 2+3 locked (pre-sign precondition)
      await expect(
        page.locator('[data-testid="onboarding-step-engagement-letter"]'),
      ).toHaveAttribute("data-accessible", "true");
      await expect(
        page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
      ).toHaveAttribute("data-accessible", "false");
      await expect(
        page.locator('[data-testid="onboarding-step-document-upload"]'),
      ).toHaveAttribute("data-accessible", "false");

      // The sign-letter button must be visible — AC-ONBD-002-03 affordance
      const signButton = page.locator('[data-testid="sign-letter-button"]');
      await expect(
        signButton,
        "sign-letter-button must be visible before signing (AC-ONBD-002-03)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 06: element-scoped screenshot of the sign-letter button area.
      // Scrolls the button into view and captures the sign affordance + surrounding
      // engagement-letter step context — visually distinct from the full-page overview
      // (03), the position indicator zoom (04), and the letter content zoom (05).
      await signButton.scrollIntoViewIfNeeded();
      await signButton.screenshot({
        path: shot("06-AC-ONBD-002-03-sign-button-visible.png"),
      });

      // When: the client clicks the sign button (drives signEngagementLetterAction via PORT)
      await signButton.click();

      // Then: the signed confirmation must appear — AC-ONBD-002-04 (signature recorded)
      await expect(
        page.locator('[data-testid="letter-signed-confirmation"]'),
        "letter-signed-confirmation must be visible after clicking sign (AC-ONBD-002-04)",
      ).toBeVisible({ timeout: 15_000 });

      // Then: step 1 is marked done (signature recorded — AC-ONBD-002-04)
      await expect(
        page.locator('[data-testid="onboarding-step-engagement-letter"]'),
        "engagement-letter step must have data-done=true after signing (AC-ONBD-002-04)",
      ).toHaveAttribute("data-done", "true");

      // Then: steps 2+3 are now accessible (gate unlocked — AC-ONBD-002-03)
      await expect(
        page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
        "questionnaire step must be accessible after signing (AC-ONBD-002-03)",
      ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });
      await expect(
        page.locator('[data-testid="onboarding-step-document-upload"]'),
        "document-upload step must be accessible after signing (AC-ONBD-002-03)",
      ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });

      // Then: lock badges are gone from steps 2+3 — AC-ONBD-002-03 UI affordance
      await expect(
        page.locator('[data-testid="lock-badge-intake-questionnaire"]'),
        "lock-badge-intake-questionnaire must not be visible after signing",
      ).not.toBeVisible();
      await expect(
        page.locator('[data-testid="lock-badge-document-upload"]'),
        "lock-badge-document-upload must not be visible after signing",
      ).not.toBeVisible();

      // Screenshot 07: post-sign state — step 1 done, steps 2+3 accessible (unlocked)
      await page.screenshot({
        path: shot("07-AC-ONBD-002-03-04-steps-unlocked-after-sign.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

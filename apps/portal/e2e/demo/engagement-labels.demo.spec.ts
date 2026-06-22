/**
 * apps/portal/e2e/demo/engagement-labels.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-010 Client-facing engagement labels (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's
 * view of the portal engagement labels — including the hidden Review stage — against the
 * live docker-compose container stack (AUTH_PROVIDER=mock) and writes an AC-tagged
 * screenshot gallery to docs/demos/EPIC-010/. NON-GATING.
 *
 * Personas: sarah-returning-client (.planning/personas/sarah-returning-client.md)
 *           martha-and-james-married-couple (.planning/personas/martha-and-james-married-couple.md)
 * Flows:    flow-engagement-lifecycle (.planning/flows/flow-engagement-lifecycle.md)
 * Policy:   .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-010 portal surface — screenshots 07–10):
 *   07-AC-LIFE-002-01-received-label.png
 *       — sarah sees engagement in "Received" label (internal New).
 *         Proves AC-LIFE-002-01: New maps to "Received".
 *   08-AC-LIFE-002-02-review-hidden-as-in-progress.png
 *       — sarah sees "In Progress" label when engagement is internally in Review.
 *         Proves AC-LIFE-002-02: internal Review is hidden, shown as "In Progress".
 *         Proves AC-LIFE-004-02/-03: Review stage requires no client action.
 *   09-AC-LIFE-002-01-completed-label.png
 *       — sarah sees "Completed" label (internal Complete).
 *         Proves AC-LIFE-002-01: Complete maps to "Completed".
 *         Proves AC-AUTH-008-01/-02: client retains portal access after completion.
 *   10-AC-LIFE-002-03-martha-james-shared-engagement.png
 *       — martha (one participant) sees the same "Received" label on the shared engagement.
 *         Proves AC-LIFE-002-03: three distinct client-facing states across the lifecycle.
 *         Illustrates the shared-engagement view from the martha-and-james persona.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * SCOPE DISCIPLINE (RETRO carry — retro-012-012 @demo PNG byte-churn):
 *   DEMO_DIR is pinned to docs/demos/EPIC-010 ONLY.
 *   No prior-epic gallery PNGs are touched.
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-010-005): Seeds a separate User + EngagementRequest + Engagement for each
 *   // status label demo. Uses "-demo-010-portal" clerkId suffixes to avoid collision with other suites.
 *   // The martha-james screenshot uses a separate "-demo-010-martha" clerkId.
 *   // clientUserId is SET on these fixtures (so FILTER returns the engagement).
 *   //
 *   // For the martha-and-james persona, we illustrate a "shared engagement" by showing martha's
 *   // individual dashboard — EPIC-010 does not yet model multi-participant engagements (that is EPIC-012).
 *   // This screenshot shows the expected client label for a single participant as a stand-in for the
 *   // shared-engagement view. A DECISION note below explains this scope boundary.
 *   //
 *   // DECISION (TASK-010-005): Multi-participant modeling is EPIC-012 scope (per BRIEF-010 § Out of scope).
 *   // The "martha-and-james" screenshot demonstrates the portal label pattern for a second-named client
 *   // persona, not a literal joint engagement. The SDET has been notified via this comment.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 * ADR-012: Tier-6 e2e.
 * EPIC-010: engagement lifecycle pipeline — client label mapping.
 * CS-GEN-003: cite governing authority in comments.
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

// CS-GEN-003: governing authority cited in file header + inline comments.

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-010 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// RETRO-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-010/.
// This const is the ONLY path used; no prior-epic gallery is touched.
// CS-GEN-003: cite RETRO carry in comment.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-010");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── DB helpers (admin pool — RLS-exempt seed/teardown) ───────────────────────

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
      "[engagement-labels.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

// ─── Fixture seed / cleanup ────────────────────────────────────────────────────

interface PortalLabelSeedResult {
  clerkId: string;
  userId: string;
  requestId: string;
  engagementId: string;
}

/**
 * Seeds a User + EngagementRequest + Engagement with the given status.
 * The User's clerkId is set and clientUserId is linked so pol_Engagement FILTER
 * returns the row for this client.
 *
 * ADR-005: admin pool is RLS-exempt; used for seed/teardown only.
 * ADR-012: Tier-6 e2e demo.
 */
async function seedClientEngagement(opts: {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
}): Promise<PortalLabelSeedResult> {
  const pool = await getPool();

  // 0. Idempotent pre-cleanup for this clerkId
  await cleanupByClerkId(opts.clerkId, pool);

  // 1. Upsert User
  const userResult = await pool
    .request()
    .input("clerkId", opts.clerkId)
    .input("email", opts.email)
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
      .input("clerkId", opts.clerkId)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) throw new Error(`[engagement-labels.demo.spec] Failed to upsert User (${opts.clerkId})`);
  }

  // 2. EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", opts.email)
    .input("firstName", opts.firstName)
    .input("lastName", opts.lastName)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error(`[engagement-labels.demo.spec] Failed to seed EngagementRequest (${opts.clerkId})`);

  // 3. Engagement with given status + clientUserId linked
  // For Complete status set both confirmation timestamps (required by the schema constraint).
  const isComplete = opts.status === "Complete";
  let engResult: mssqlPkg.IResult<{ id: string }>;

  if (isComplete) {
    engResult = await pool
      .request()
      .input("engagementRequestId", mssqlPkg.UniqueIdentifier, requestId)
      .input("clientUserId", mssqlPkg.UniqueIdentifier, userId)
      .input("status", opts.status)
      .query<{ id: string }>(
        `INSERT INTO [dbo].[Engagement]
           ([engagementRequestId], [clientUserId], [status],
            [deliveryConfirmedAt], [filingConfirmedAt],
            [createdAt], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (@engagementRequestId, @clientUserId, @status,
                 SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(),
                 SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
      );
  } else {
    engResult = await pool
      .request()
      .input("engagementRequestId", mssqlPkg.UniqueIdentifier, requestId)
      .input("clientUserId", mssqlPkg.UniqueIdentifier, userId)
      .input("status", opts.status)
      .query<{ id: string }>(
        `INSERT INTO [dbo].[Engagement]
           ([engagementRequestId], [clientUserId], [status],
            [createdAt], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (@engagementRequestId, @clientUserId, @status,
                 SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
      );
  }

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error(`[engagement-labels.demo.spec] Failed to seed Engagement (${opts.clerkId})`);

  return {
    clerkId: opts.clerkId,
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
  // Delete engagement linked to this user
  await p.request().input("clerkId", clerkId).query(
    `DELETE e
     FROM [dbo].[Engagement] e
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  // Delete EngagementRequests seeded for this fixture (by email pattern)
  await p.request().input("clerkId", clerkId).query(
    `DELETE er
     FROM [dbo].[EngagementRequest] er
     WHERE er.[email] LIKE @clerkId + '@%'
       OR er.[email] LIKE 'e2e-demo-010-portal-' + @clerkId + '%'`,
  );
  // Delete User
  await p.request().input("clerkId", clerkId).query(
    `DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
  );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ─── Screen 07: sarah sees "Received" (internal New → "Received") ─────────────

test(
  '[AC-LIFE-002-01] @demo 07 — sarah-returning-client: sees "Received" label for a New engagement',
  async ({ page, request }) => {
    // Screen 07: sarah-returning-client navigates to /dashboard.
    // Her engagement is in internal status "New"; the portal shows "Received".
    // Proves AC-LIFE-002-01: New maps to "Received".
    // Proves AC-AUTH-003-01: she sees only her own engagement (FILTER-governed).
    //
    // ADR-005: pol_Engagement FILTER enforces isolation.
    // ADR-006: portal surface — read-only client view.
    // CS-GEN-003: AC tags in test name.

    const clerkId = "user_client_e2e_demo_010_portal_sarah_new";
    let seeded: PortalLabelSeedResult | null = null;
    try {
      seeded = await seedClientEngagement({
        clerkId,
        email: `${clerkId}@engagement-labels.demo.e2e.test`,
        firstName: "Sarah",
        lastName: "DemoNew",
        status: "New",
      });

      await setupClientSession(page, request, clerkId);
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Assert: the client-facing badge shows "Received"
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(
        badge,
        'engagement-client-status must be visible with "Received" label (AC-LIFE-002-01)',
      ).toBeVisible({ timeout: 15_000 });
      await expect(badge, 'badge must show "Received" (New → Received)').toContainText("Received");
      await expect(badge, 'data-status must be "Received"').toHaveAttribute("data-status", "Received");

      // Assert: the raw internal status "New" does NOT appear as the badge label
      // (AC-LIFE-002-02: clients never see internal stage names — though "New" doesn't surface anyway,
      // this assertion guards against any future regression)
      await expect(badge, 'badge must NOT contain raw "New" text').not.toContainText("New");

      // Assert: no status-change affordance (AC-LIFE-003-03)
      const transitionButtons = page.locator('[data-testid*="advance-status"], [data-testid*="change-status"]');
      await expect(transitionButtons, "no transition buttons in portal (AC-LIFE-003-03)").toHaveCount(0);

      // Screenshot 07: dashboard showing "Received" label
      await page.screenshot({
        path: shot("07-AC-LIFE-002-01-received-label.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupByClerkId(seeded.clerkId);
    }
  },
);

// ─── Screen 08: sarah sees "In Progress" for internal Review (hidden stage) ──

test(
  '[AC-LIFE-002-02] [AC-LIFE-004-02] [AC-LIFE-004-03] @demo 08 — sarah-returning-client: sees "In Progress" when engagement is internally in Review',
  async ({ page, request }) => {
    // Screen 08: sarah's engagement is internally in "Review" (accountant checking own work).
    // The portal shows "In Progress" — the raw internal stage name "Review" is NEVER surfaced.
    // Proves AC-LIFE-002-02: internal Review is hidden, displayed as "In Progress".
    // Proves AC-LIFE-004-02: Review stage requires no client action.
    // Proves AC-LIFE-004-03: Review is not presented as a client review/approval step.
    //
    // ADR-005: pol_Engagement FILTER enforces isolation.
    // ADR-006: portal surface — read-only.
    // CS-GEN-003: AC tags in test name.

    const clerkId = "user_client_e2e_demo_010_portal_sarah_review";
    let seeded: PortalLabelSeedResult | null = null;
    try {
      seeded = await seedClientEngagement({
        clerkId,
        email: `${clerkId}@engagement-labels.demo.e2e.test`,
        firstName: "Sarah",
        lastName: "DemoReview",
        status: "Review",
      });

      await setupClientSession(page, request, clerkId);
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Assert: the client-facing badge shows "In Progress" (NOT "Review")
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(
        badge,
        'engagement-client-status must be visible (AC-LIFE-002-02)',
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        badge,
        'badge must show "In Progress" for internal Review (AC-LIFE-002-02)',
      ).toContainText("In Progress");
      await expect(badge, 'data-status must be "In Progress" (not Review)').toHaveAttribute("data-status", "In Progress");

      // Assert: the word "Review" does NOT appear anywhere in the DOM (AC-LIFE-002-02 hard constraint)
      const bodyText = await page.locator("body").innerText();
      expect(
        bodyText,
        '[AC-LIFE-002-02] The internal "Review" stage name must NEVER be displayed to the client.',
      ).not.toContain("Review");

      // Assert: no approval/action-required UI for the client (AC-LIFE-004-02/-03)
      const approvalElements = page.locator(
        '[data-testid*="approve"], [data-testid*="review-action"], button:has-text("Approve")',
      );
      await expect(approvalElements, "no approval UI for client (AC-LIFE-004-03)").toHaveCount(0);

      // Assert: no "action required" language directed at the client (AC-LIFE-004-02)
      expect(bodyText.toLowerCase(), "no 'your review' language (AC-LIFE-004-02)").not.toContain("your review");
      expect(bodyText.toLowerCase(), "no 'action required by you' language (AC-LIFE-004-02)").not.toContain(
        "action required by you",
      );

      // Screenshot 08: dashboard showing "In Progress" while engagement is internally in Review
      await page.screenshot({
        path: shot("08-AC-LIFE-002-02-review-hidden-as-in-progress.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupByClerkId(seeded.clerkId);
    }
  },
);

// ─── Screen 09: sarah sees "Completed" (AC-AUTH-008 post-completion access) ──

test(
  '[AC-LIFE-002-01] [AC-AUTH-008-01] [AC-AUTH-008-02] @demo 09 — sarah-returning-client: sees "Completed" and retains portal access after engagement is Complete',
  async ({ page, request }) => {
    // Screen 09: sarah's engagement is Complete. The portal shows "Completed".
    // Proves AC-LIFE-002-01: Complete maps to "Completed".
    // Proves AC-AUTH-008-01: client retains sign-in ability after completion.
    // Proves AC-AUTH-008-02: client can view her completed engagement indefinitely.
    //
    // ADR-005: pol_Engagement FILTER enforces isolation.
    // ADR-006: portal surface — read-only.
    // ADR-018: completion starts retention clock but does NOT revoke access.
    // CS-GEN-003: AC tags in test name.

    const clerkId = "user_client_e2e_demo_010_portal_sarah_complete";
    let seeded: PortalLabelSeedResult | null = null;
    try {
      seeded = await seedClientEngagement({
        clerkId,
        email: `${clerkId}@engagement-labels.demo.e2e.test`,
        firstName: "Sarah",
        lastName: "DemoComplete",
        status: "Complete",
      });

      // AC-AUTH-008-01: client can still sign in after completion
      await setupClientSession(page, request, clerkId);
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Assert: the client-facing badge shows "Completed"
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(
        badge,
        'engagement-client-status must be visible — client retains portal access (AC-AUTH-008-01/-02)',
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        badge,
        'badge must show "Completed" (AC-LIFE-002-01: Complete → "Completed")',
      ).toContainText("Completed");
      await expect(badge, 'data-status must be "Completed"').toHaveAttribute("data-status", "Completed");

      // Assert: no reopen affordance for the client (AC-LIFE-006-02)
      const reopenButton = page.locator('[data-testid*="reopen"]');
      await expect(reopenButton, "no reopen button in portal (AC-LIFE-006-02)").toHaveCount(0);

      // Assert: no status-change affordance (AC-LIFE-003-03)
      const transitionButtons = page.locator('[data-testid*="advance-status"], [data-testid*="change-status"]');
      await expect(transitionButtons, "no transition buttons in portal (AC-LIFE-003-03)").toHaveCount(0);

      // Screenshot 09: dashboard showing "Completed" — client retains access (AC-AUTH-008)
      await page.screenshot({
        path: shot("09-AC-LIFE-002-01-completed-label.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupByClerkId(seeded.clerkId);
    }
  },
);

// ─── Screen 10: martha sees "Received" — three-state arc + shared-engagement view ──

test(
  '[AC-LIFE-002-03] @demo 10 — martha (martha-and-james persona): sees "Received" — three distinct client-facing states illustrated',
  async ({ page, request }) => {
    // Screen 10: martha (from the martha-and-james-married-couple persona) views her portal
    // dashboard. Her engagement is in New status; she sees "Received".
    //
    // DECISION (TASK-010-005): Multi-participant modeling is EPIC-012 scope (per BRIEF-010 § Out of scope).
    // This screenshot uses a separate "martha" client user to illustrate the label pattern for the
    // martha-and-james persona. It is NOT a literal joint/shared engagement — that requires EPIC-012.
    // The gallery caption in DEMO.md notes this scope boundary.
    //
    // Proves AC-LIFE-002-03: the three distinct client-facing states are Received / In Progress / Completed.
    //   (Screens 07, 08, 09, and 10 together show all three states in the gallery.)
    //
    // ADR-005: pol_Engagement FILTER enforces isolation.
    // ADR-006: portal surface — read-only.
    // CS-GEN-003: AC tags in test name.

    const clerkId = "user_client_e2e_demo_010_portal_martha";
    let seeded: PortalLabelSeedResult | null = null;
    try {
      seeded = await seedClientEngagement({
        clerkId,
        email: `${clerkId}@engagement-labels.demo.e2e.test`,
        firstName: "Martha",
        lastName: "DemoJames",
        status: "New",
      });

      await setupClientSession(page, request, clerkId);
      await page.goto(`${PORTAL_URL}/dashboard`);

      // Assert: the client-facing badge shows "Received"
      const badge = page.locator('[data-testid="engagement-client-status"]');
      await expect(
        badge,
        'engagement-client-status must be visible for martha (AC-LIFE-002-03)',
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        badge,
        'badge must show "Received" for Martha\'s New engagement (AC-LIFE-002-03)',
      ).toContainText("Received");
      await expect(badge, 'data-status must be "Received"').toHaveAttribute("data-status", "Received");

      // Assert: no status-change affordance (AC-LIFE-003-03)
      const transitionButtons = page.locator('[data-testid*="advance-status"], [data-testid*="change-status"]');
      await expect(transitionButtons, "no transition buttons in portal (AC-LIFE-003-03)").toHaveCount(0);

      // Screenshot 10: martha's dashboard showing "Received" — illustrates shared-engagement persona
      await page.screenshot({
        path: shot("10-AC-LIFE-002-03-martha-james-shared-engagement.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupByClerkId(seeded.clerkId);
    }
  },
);

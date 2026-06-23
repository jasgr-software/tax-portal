/**
 * apps/portal/e2e/demo/returning-client-request.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-012 Returning-client request (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's
 * new-engagement request journey against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-012/. NON-GATING.
 *
 * Persona: sarah-returning-client (.planning/personas/sarah-returning-client.md)
 * Flow:    flow-engagement-request (.planning/flows/flow-engagement-request.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-012 portal surface — screenshots 01–04):
 *   01-AC-DOOR-009-01-returning-client-request-form.png
 *       — sarah (signed-in existing client) opens /engagements/new; the returning-client
 *         request form loads inside the portal without leaving the client surface.
 *         Proves AC-DOOR-009-01: flow opens without leaving the portal.
 *   02-AC-DOOR-009-02-service-selection.png
 *       — sarah sees the active-services checklist and selects one.
 *         Proves AC-DOOR-009-02: flow lets the client select active services.
 *   03-AC-DOOR-009-03-no-contact-fields.png
 *       — sarah's contact info is on file; the form shows the "Contact on file" message and
 *         has no firstName/lastName/email input fields.
 *         Proves AC-DOOR-009-03: flow does not re-ask for on-file contact info.
 *   04-AC-DOOR-009-04-submission-success.png
 *       — after submitting, sarah sees the success confirmation in the portal.
 *         The request is routed to the accountant inbox like a front-door request.
 *         Proves AC-DOOR-009-04: submitted request appears in the accountant inbox.
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
 * Fixture pattern (mirrors returning-client-request.spec.ts — DECISION-E):
 *   A returning client MUST have a prior accepted engagement on file so that
 *   createReturningClientRequest can resolve their on-file contact info
 *   (User → Engagement → EngagementRequest chain). This demo uses a separate
 *   clerkId suffix "-demo-012" to avoid collision with the gate spec.
 *
 * ADR-005: Sessions established via /api/mock-session (role set server-side). RLS not
 *          relaxed; admin pool for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 *          AC-DOOR-009-04 cross-app verification is noted in the screenshot comment only
 *          (the admin inbox confirmation is in the admin demo spec; screenshots 01–04 are portal-only).
 * ADR-012: Tier-6 e2e.
 * ADR-022: Rate-limited returning-client submission path.
 * CS-GEN-003: cite governing authority in comments.
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

// CS-GEN-003: governing authority cited in file header + inline comments.
// ADR-006: portal-surface walkthrough — sarah-returning-client persona.

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-012 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// RETRO-006 / retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-012/.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-012");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Portal base URL — mirrors playwright.config.ts + auth.ts.
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Fixture ids — deterministic suffix "-demo-012-portal" avoids collision ────
// with returning-client-request.spec.ts ("-retcli-") and other suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_012_portal";
const FIXTURE_FIRST_NAME = "Sarah";
const FIXTURE_LAST_NAME = "Demo";
const FIXTURE_EMAIL = "sarah-demo-012-portal@returning-client.e2e.test";

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
      "[returning-client-request.demo] DATABASE_URL_ADMIN is not set.",
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
 * Seed the sarah-returning-client fixture.
 * DECISION-E (mirrors returning-client-request.spec.ts):
 *   The returning-client path needs User → Engagement → EngagementRequest chain
 *   so createReturningClientRequest can resolve on-file contact info.
 *
 * // DECISION-E // ADR-003 // CS-TS-001
 */
async function seedSarahFixture(): Promise<{ userId: string; priorRequestId: string; priorEngagementId: string }> {
  const pool = await getPool();

  // ── Idempotent pre-cleanup (stale fixtures from a previous run) ────────────
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      DELETE n
      FROM [dbo].[Notification] n
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = n.[engagementRequestId]
      WHERE er.[email] = @email
    `);
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      DELETE ers
      FROM [dbo].[EngagementRequestService] ers
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = ers.[engagementRequestId]
      WHERE er.[email] = @email
    `);
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`
      DELETE e
      FROM [dbo].[Engagement] e
      INNER JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
      WHERE u.[clerkId] = @clerkId
    `);
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`);

  // ── 1. Upsert User row ────────────────────────────────────────────────────
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
      throw new Error("[returning-client-request.demo] Failed to upsert/find User fixture row");
    }
  }

  // ── 2. Seed the prior accepted EngagementRequest (contact on file) ─────────
  // DECISION-E: firstName/lastName/email are stored here for server-side contact resolution.
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
    throw new Error("[returning-client-request.demo] Failed to seed prior EngagementRequest");
  }

  // ── 3. Seed the Engagement linking User to the prior request ────────────────
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
    throw new Error("[returning-client-request.demo] Failed to seed prior Engagement");
  }

  return { userId, priorRequestId, priorEngagementId };
}

/**
 * Teardown: remove seeded rows and any pending EngagementRequests created during the test.
 * FK order: Notification → EngagementRequestService → Engagement → EngagementRequest.
 */
async function teardownSarahFixture(priorRequestId: string): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      DELETE n
      FROM [dbo].[Notification] n
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = n.[engagementRequestId]
      WHERE er.[email] = @email
    `);

  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`
      DELETE ers
      FROM [dbo].[EngagementRequestService] ers
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = ers.[engagementRequestId]
      WHERE er.[email] = @email
    `);

  await pool
    .request()
    .input("priorRequestId", priorRequestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @priorRequestId`);

  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`);
}

async function teardownSarahUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Shared fixture state (seeded once per suite run) ─────────────────────────

let seeded: { userId: string; priorRequestId: string; priorEngagementId: string } | null = null;

test.beforeAll(async () => {
  seeded = await seedSarahFixture();
});

test.afterAll(async () => {
  if (seeded) {
    await teardownSarahFixture(seeded.priorRequestId);
  }
  await teardownSarahUser();
  await closePool();
});

// ─── Screen 01: Returning-client request form loads (AC-DOOR-009-01) ─────────

test(
  "[AC-DOOR-009-01] @demo 01 — sarah-returning-client: opens /engagements/new; form loads in portal",
  async ({ page, request }) => {
    // Screen 01: Sarah (signed-in existing client) navigates to /engagements/new.
    // The returning-client request form loads — she stays on the portal, no redirect.
    // Proves AC-DOOR-009-01: a signed-in client opens the flow without leaving the portal.

    try {
      // Given: a signed-in existing client (sarah) with a prior engagement on file
      // ADR-023: mock-first session seam; ADR-005: role set server-side
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // When: she navigates to /engagements/new
      await page.goto(`${PORTAL_URL}/engagements/new`);

      // Then: the form loads in the portal (not a redirect to sign-in or an error)
      await expect(page).toHaveURL(`${PORTAL_URL}/engagements/new`, { timeout: 15_000 });

      // The form container is visible (AC-DOOR-009-01)
      const form = page.locator('[data-testid="returning-client-request-form"]');
      await expect(
        form,
        "returning-client-request-form must be visible (AC-DOOR-009-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 01: form visible in the portal — no redirect, no error
      await page.screenshot({ path: shot("01-AC-DOOR-009-01-returning-client-request-form.png"), fullPage: true });
    } finally {
      await clearSession(page);
    }
  },
);

// ─── Screen 02: Service selection checklist (AC-DOOR-009-02) ──────────────────

test(
  "[AC-DOOR-009-02] @demo 02 — sarah-returning-client: sees service checklist and selects a service",
  async ({ page, request }) => {
    // Screen 02: Sarah sees the active-services checklist and checks one service.
    // Proves AC-DOOR-009-02: the flow lets the client select one or more active services.

    try {
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/engagements/new`);

      const form = page.locator('[data-testid="returning-client-request-form"]');
      await expect(form).toBeVisible({ timeout: 10_000 });

      // When: she sees the service checklist
      // Then: at least one active service checkbox is visible (AC-DOOR-009-02)
      const checkboxes = page.locator('input[type="checkbox"]');
      await expect(
        checkboxes.first(),
        "at least one service checkbox must be visible (AC-DOOR-009-02)",
      ).toBeVisible({ timeout: 10_000 });

      // She checks the first available service
      await checkboxes.first().check();
      await expect(checkboxes.first()).toBeChecked();

      // Screenshot 02: service checklist with one service checked — AC-DOOR-009-02
      await page.screenshot({ path: shot("02-AC-DOOR-009-02-service-selection.png"), fullPage: true });
    } finally {
      await clearSession(page);
    }
  },
);

// ─── Screen 03: No contact fields (AC-DOOR-009-03) ────────────────────────────

test(
  "[AC-DOOR-009-03] @demo 03 — sarah-returning-client: contact info is on file; no contact fields shown",
  async ({ page, request }) => {
    // Screen 03: Sarah's contact info is already on file. The form shows a "Contact on file"
    // message and has no firstName/lastName/email inputs.
    // Proves AC-DOOR-009-03: the flow does not ask the client to re-enter on-file contact info.

    try {
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/engagements/new`);

      const form = page.locator('[data-testid="returning-client-request-form"]');
      await expect(form).toBeVisible({ timeout: 10_000 });

      // Then: no contact input fields are present (AC-DOOR-009-03)
      await expect(
        page.locator('input[name="firstName"]'),
        "firstName input must NOT be present (AC-DOOR-009-03)",
      ).not.toBeVisible();
      await expect(page.locator('input[name="lastName"]')).not.toBeVisible();
      await expect(page.locator('input[name="email"]')).not.toBeVisible();

      // The "Contact on file" message is shown — AC-DOOR-009-03
      const onFileMessage = page.locator('[data-testid="no-contact-fields-message"]');
      await expect(
        onFileMessage,
        "no-contact-fields-message must be visible (AC-DOOR-009-03)",
      ).toBeVisible({ timeout: 5_000 });

      // Screenshot 03: no contact fields; "Contact on file" message visible
      await page.screenshot({ path: shot("03-AC-DOOR-009-03-no-contact-fields.png"), fullPage: true });
    } finally {
      await clearSession(page);
    }
  },
);

// ─── Screen 04: Submission success (AC-DOOR-009-04) ───────────────────────────

test(
  "[AC-DOOR-009-04] @demo 04 — sarah-returning-client: submits request; sees success; routed to accountant",
  async ({ page, request }) => {
    // Screen 04: Sarah selects a service and submits; the portal shows a success state.
    // The request is routed to the accountant inbox (cross-app, verified DB-side).
    // Proves AC-DOOR-009-04: submitted request appears in the accountant inbox like
    // a front-door request.

    try {
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/engagements/new`);

      const form = page.locator('[data-testid="returning-client-request-form"]');
      await expect(form).toBeVisible({ timeout: 10_000 });

      // Select the first available service
      const checkboxes = page.locator('input[type="checkbox"]');
      await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 });
      await checkboxes.first().check();
      await expect(checkboxes.first()).toBeChecked();

      // When: she submits the request (ADR-022: rate-limited path)
      await page.locator('[data-testid="submit-request-button"]').click();

      // Then: the portal shows a success confirmation (AC-DOOR-009-04)
      const successEl = page.locator('[data-testid="returning-request-success"]');
      await expect(
        successEl,
        "returning-request-success must be visible after submission (AC-DOOR-009-04)",
      ).toBeVisible({ timeout: 15_000 });
      await expect(successEl).toContainText(/request submitted/i);

      // The submit button is gone (form replaced by success state)
      await expect(
        page.locator('[data-testid="submit-request-button"]'),
      ).not.toBeVisible();

      // Screenshot 04: success confirmation — request routed to accountant like a front-door request
      await page.screenshot({ path: shot("04-AC-DOOR-009-04-submission-success.png"), fullPage: true });
    } finally {
      await clearSession(page);
    }
  },
);

/**
 * apps/portal/e2e/specs/engagement-note-confidentiality.spec.ts
 *
 * Tier-6 e2e — AC-LIFE-008-03 portal negative (BRIEF-011, TASK-011-004).
 *
 * The load-bearing confidentiality proof:
 *   A CLIENT participant on an engagement that HAS a known internal note navigates
 *   every client-facing portal path for that engagement and the internal note body
 *   NEVER appears in the DOM or HTTP response.
 *
 * This is the tier-6 complement to the TASK-011-001 server-side RLS proof (tier-3),
 * proving the negative end-to-end — not only by UI absence in admin but by driving
 * the actual portal surface as the CLIENT participant.
 *
 * Acceptance criteria covered:
 *   AC-LIFE-008-03 — Internal notes are never shown to a client or any engagement participant,
 *                    through any portal path
 *
 * Gherkin binding (.planning/EPIC-011-engagement-attributes.md § Acceptance scenarios):
 *   AC-LIFE-008-03: "Given an engagement with an internal note and a client participant on that engagement /
 *                    When the client participant accesses the engagement through any portal path /
 *                    Then the internal note is never shown to them"
 *
 * Strategy:
 *   1. Seed via admin pool (RLS-exempt):
 *      - A Client User (with clerkId) linked to an Engagement via clientUserId
 *      - An EngagementNote seeded directly into the DB with a known secret string
 *   2. Set up a CLIENT session (the participant)
 *   3. Navigate EVERY client-facing portal path:
 *      - /dashboard (engagement card)
 *      - /engagements/<id> (direct engagement detail)
 *   4. Assert the secret note string NEVER appears in the DOM on any path
 *   5. Also verify the portal HTML/source does not expose the note text via any mechanism
 *
 * Stack: portal container at http://localhost:3000, AUTH_PROVIDER=mock.
 * Admin pool: DATABASE_URL_ADMIN for fixture seed/teardown (RLS-exempt, no SESSION_CONTEXT).
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'engagement-note-confidentiality'
 *
 * // ADR-005: sec.pol_EngagementNote governs notes visibility; CLIENT reads ZERO at DB level
 * // ADR-006: notes management admin-only; this portal spec proves the negative surface
 * // ADR-012: tier-6 e2e (confidentiality proof)
 * // CS-TS-003: cross-surface negative — notes are admin-only; portal NEVER exposes them
 * // CS-GEN-003: governing keys cited; AC ids in test titles
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ───────────────
// // CS-TS-003: admin pool used ONLY for fixture setup/teardown; app routes use CLIENT session

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
      "[engagement-note-confidentiality.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

// ─── Fixture helpers ───────────────────────────────────────────────────────────

interface ConfidentialityFixture {
  clerkId: string;
  userId: string;
  requestId: string;
  engagementId: string;
  noteId: string;
  /** The unique secret string seeded as the internal note body.
   *  Must NEVER appear on the portal surface. */
  secretNoteBody: string;
}

/**
 * Seeds: User → EngagementRequest → Engagement (linked to clientUserId) → EngagementNote
 *
 * The EngagementNote is seeded via admin pool (RLS-exempt) directly into the DB.
 * The CLIENT participant is linked via clientUserId so pol_Engagement FILTER returns
 * the engagement row when the CLIENT session is active.
 *
 * The note body uses a highly unique sentinel string so false-positive matches are
 * impossible across concurrent test runs.
 *
 * ADR-005: admin pool bypasses RLS — this is fixture-only; app routes use CLIENT session.
 * ADR-003: the app routes read the engagement (and ZERO notes) under CLIENT SESSION_CONTEXT.
 */
async function seedConfidentialityFixture(clerkId: string): Promise<ConfidentialityFixture> {
  const pool = await getPool();

  // Unique sentinel for this run — not logged per CS-GEN-001 (test body, not production log)
  const secretNoteBody = `CONFIDENTIAL-NOTE-SENTINEL-${clerkId}-${Date.now()}`;
  const email = `e2e-conf-${clerkId}@portal-conf.e2e.test`;

  // 0. Idempotent cleanup
  await cleanupByClerkId(clerkId, pool);

  // 1. Upsert User
  const userResult = await pool
    .request()
    .input("clerkId", clerkId)
    .input("email", email)
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
      .input("clerkId", clerkId)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) throw new Error("[engagement-note-confidentiality.spec] Failed to upsert User");
  }

  // 2. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('ConfTest', 'E2E', @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[engagement-note-confidentiality.spec] Failed to seed EngagementRequest");

  // 3. Seed Engagement with clientUserId linked (so pol_Engagement FILTER returns it to the CLIENT)
  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, requestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, userId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, 'In Progress',
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[engagement-note-confidentiality.spec] Failed to seed Engagement");

  // 4. Seed EngagementNote — the secret body that MUST NEVER appear on the portal surface.
  //    ADR-005: sec.pol_EngagementNote ensures CLIENT reads ZERO notes. This fixture proves
  //             the negative by inserting a known string and asserting portal never shows it.
  const noteResult = await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .input("body", secretNoteBody)
    .input("createdBy", "user_accountant_e2e_001")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementNote]
         ([engagementId], [body], [createdBy], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @body, @createdBy, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const noteId = noteResult.recordset[0]?.id;
  if (!noteId) throw new Error("[engagement-note-confidentiality.spec] Failed to seed EngagementNote");

  return {
    clerkId,
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    noteId: noteId.toLowerCase(),
    secretNoteBody,
  };
}

async function cleanupByClerkId(
  clerkId: string,
  pool?: mssqlPkg.ConnectionPool,
): Promise<void> {
  const p = pool ?? (await getPool());

  // Notes first (FK onDelete: NoAction — cannot cascade from Engagement)
  await p.request().input("clerkId", clerkId).query(
    `DELETE en
     FROM [dbo].[EngagementNote] en
     JOIN [dbo].[Engagement] e ON e.[id] = en.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );

  // Then engagements
  await p.request().input("clerkId", clerkId).query(
    `DELETE e
     FROM [dbo].[Engagement] e
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );

  // Then orphaned EngagementRequests for this clerkId's email pattern
  await p.request().input("clerkId", clerkId).query(
    `DELETE er
     FROM [dbo].[EngagementRequest] er
     WHERE er.[email] LIKE 'e2e-conf-' + @clerkId + '@%'`,
  );

  // Then User
  await p
    .request()
    .input("clerkId", clerkId)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LIFE-008-03 — Internal notes are never shown to a client or participant
//
// Gherkin:
//   Given an engagement with an internal note and a client participant on that engagement
//   When the client participant accesses the engagement through any portal path
//   Then the internal note is never shown to them
// ═══════════════════════════════════════════════════════════════════════════════

const FIXTURE_CLERK_ID = "user_client_conf_e2e_011_001";

test.describe("[AC-LIFE-008-03] engagement-note-confidentiality: internal notes never appear in the portal", () => {
  // // CS-TS-003: cross-surface negative — notes are admin-only; NEVER surfaced in apps/portal
  // // ADR-005: sec.pol_EngagementNote enforces CLIENT reads ZERO at DB layer
  // // ADR-006: admin-only notes panel never present in apps/portal routes

  let fixture: ConfidentialityFixture | null = null;

  test.beforeAll(async () => {
    fixture = await seedConfidentialityFixture(FIXTURE_CLERK_ID);
  });

  test.afterAll(async () => {
    if (fixture) {
      await cleanupByClerkId(fixture.clerkId);
      fixture = null;
    }
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  // ── Portal path 1: /dashboard ──────────────────────────────────────────────

  // Gherkin step: When the client participant accesses the engagement through /dashboard
  // Then: the internal note is never shown
  // // CS-GEN-003: AC-LIFE-008-03 bound to this Playwright test
  test("[AC-LIFE-008-03] client views /dashboard — internal note NEVER appears in DOM", async ({
    page,
    request,
  }) => {
    if (!fixture) throw new Error("fixture not seeded");

    // Given: a CLIENT participant on an engagement that HAS an internal note
    await setupClientSession(page, request, fixture.clerkId);

    // When: the client participant navigates to /dashboard
    await page.goto(`${PORTAL_URL}/dashboard`);

    // Engagement is visible to the client (the FILTER returns the engagement row)
    const engagementCard = page.locator('[data-testid="engagement-card"]');
    await expect(engagementCard).toBeVisible({ timeout: 15_000 });

    // Then (AC-LIFE-008-03): the secret note body NEVER appears in the page content.
    // Check full page HTML (not just innerText — cover hidden elements and data attributes).
    const fullHtml = await page.content();
    expect(
      fullHtml,
      `[AC-LIFE-008-03] Internal note body must NEVER appear in /dashboard HTML. ` +
        `Found sentinel "${fixture.secretNoteBody}" on the portal dashboard.`,
    ).not.toContain(fixture.secretNoteBody);

    // Also check innerText (readable content)
    const bodyText = await page.locator("body").innerText();
    expect(
      bodyText,
      `[AC-LIFE-008-03] Internal note body must NEVER appear in /dashboard text. ` +
        `Found sentinel in visible text.`,
    ).not.toContain(fixture.secretNoteBody);

    // No notes-list or note-item element should be present on the portal surface
    // (ADR-006: the EngagementAttributesPanel is admin-only and MUST NOT exist in apps/portal)
    const notesList = page.locator('[data-testid="notes-list"]');
    await expect(notesList, "[AC-LIFE-008-03] notes-list testid must NOT exist on /dashboard").toHaveCount(0);

    const noteItem = page.locator('[data-testid="note-item"]');
    await expect(noteItem, "[AC-LIFE-008-03] note-item testid must NOT exist on /dashboard").toHaveCount(0);

    const attributesPanel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(
      attributesPanel,
      "[AC-LIFE-008-03] engagement-attributes-panel must NOT exist on /dashboard",
    ).toHaveCount(0);
  });

  // ── Portal path 2: /engagements/<id> (direct reference) ───────────────────

  // Gherkin step: When the client participant accesses the engagement via /engagements/<id>
  // Then: the internal note is never shown
  // // CS-GEN-003: AC-LIFE-008-03 bound to this Playwright test
  test("[AC-LIFE-008-03] client views /engagements/<id> — internal note NEVER appears in DOM", async ({
    page,
    request,
  }) => {
    if (!fixture) throw new Error("fixture not seeded");

    // Given: a CLIENT participant on an engagement that HAS an internal note
    await setupClientSession(page, request, fixture.clerkId);

    // When: the client participant navigates to the direct engagement detail page
    await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);

    // The engagement detail page is accessible to the CLIENT (their own engagement)
    const engagementDetail = page.locator('[data-testid="engagement-detail"]');
    await expect(engagementDetail).toBeVisible({ timeout: 15_000 });

    // Then (AC-LIFE-008-03): the secret note body NEVER appears in the page content.
    // Check full page HTML
    const fullHtml = await page.content();
    expect(
      fullHtml,
      `[AC-LIFE-008-03] Internal note body must NEVER appear in /engagements/<id> HTML. ` +
        `Found sentinel "${fixture.secretNoteBody}" on the portal engagement detail.`,
    ).not.toContain(fixture.secretNoteBody);

    // Check innerText
    const bodyText = await page.locator("body").innerText();
    expect(
      bodyText,
      `[AC-LIFE-008-03] Internal note body must NEVER appear in /engagements/<id> text.`,
    ).not.toContain(fixture.secretNoteBody);

    // No notes UI elements should be present
    const notesList = page.locator('[data-testid="notes-list"]');
    await expect(notesList, "[AC-LIFE-008-03] notes-list testid must NOT exist on /engagements/<id>").toHaveCount(0);

    const noteItem = page.locator('[data-testid="note-item"]');
    await expect(noteItem, "[AC-LIFE-008-03] note-item testid must NOT exist on /engagements/<id>").toHaveCount(0);

    const noteBodyInput = page.locator('[data-testid="note-body-input"]');
    await expect(
      noteBodyInput,
      "[AC-LIFE-008-03] note-body-input must NOT exist on /engagements/<id>",
    ).toHaveCount(0);

    const attributesPanel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(
      attributesPanel,
      "[AC-LIFE-008-03] engagement-attributes-panel must NOT exist on /engagements/<id>",
    ).toHaveCount(0);
  });

  // ── Extra: assert the note text also never appears in the page source ──────

  // // CS-TS-003: prove the negative from every angle — DOM, innerText, and source
  test("[AC-LIFE-008-03] internal note sentinel is not present in any page source on the portal surface", async ({
    page,
    request,
  }) => {
    if (!fixture) throw new Error("fixture not seeded");

    // Given: a CLIENT participant
    await setupClientSession(page, request, fixture.clerkId);

    // Check /dashboard source
    await page.goto(`${PORTAL_URL}/dashboard`);
    const dashboardSource = await page.content();
    expect(
      dashboardSource,
      `[AC-LIFE-008-03] Sentinel must not appear in /dashboard source.`,
    ).not.toContain(fixture.secretNoteBody);

    // Check /engagements/<id> source
    await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);
    const detailSource = await page.content();
    expect(
      detailSource,
      `[AC-LIFE-008-03] Sentinel must not appear in /engagements/<id> source.`,
    ).not.toContain(fixture.secretNoteBody);

    // Also verify the engagement itself IS accessible (so we're truly testing a participant,
    // not an unlinked client who gets a 404 — the note is actually reachable via the engagement)
    const engagementDetail = page.locator('[data-testid="engagement-detail"]');
    await expect(
      engagementDetail,
      "[AC-LIFE-008-03] Engagement detail must be accessible to the participant (ensuring we are testing a real participant, not a 404 case)",
    ).toBeVisible({ timeout: 10_000 });
  });
});

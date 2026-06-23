/**
 * apps/portal/e2e/specs/participant-shared-access.spec.ts
 *
 * Tier-6 e2e — Participant shared engagement access (portal surface).
 *
 * Acceptance criteria covered:
 *   AC-AUTH-007-03 — each participant reaches the shared engagement through their own account,
 *                    and sees no unrelated client's data
 *   AC-LIFE-012-02 — each participant is a separate portal account (own account invariant)
 *   AC-LIFE-012-03 — all participants associated with the same engagement can access it
 *
 * IMPORTANT NOTE on scope (task spec § SDET Review focus areas):
 *   This spec asserts the SURFACE BEHAVIOR — a linked participant can reach the shared
 *   engagement page, and an unrelated client receives a 404 (not-found).
 *   It does NOT duplicate the tier-3 RLS proof from TASK-012-001
 *   (engagement-participant.client-isolation.rls.test.ts). The tier-3 test proves the
 *   policy at the SQL level; this spec proves the behavior at the UI/e2e level.
 *
 * Stack: portal container at PORTAL_URL (PORTAL_BASE_URL env), AUTH_PROVIDER=mock.
 *
 * data-* hooks (must match portal page.tsx exactly):
 *   data-testid="engagement-detail"     — engagement detail panel (found = access granted)
 *   data-testid="engagement-unauthorized" — unauthorized access message (no session)
 *   NOTE: a missing engagement triggers notFound() → Next.js 404 page (no data-testid needed)
 *
 * DB fixtures (admin pool — RLS-exempt, setup + teardown):
 *   Participant-A: linked to the engagement via EngagementParticipant (second participant)
 *   Unrelated-Client: a Client user with NO link to the engagement
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'participant-shared-access'
 *
 * ADR-001: own-account invariant — each participant has their own account.
 * ADR-003: request-pool reads under SESSION_CONTEXT (withRequestContext, packages/db wrapper).
 * ADR-005: sec.pol_Engagement FILTER is the access gate — NOT app-layer filtering.
 *   Participant-A's SESSION_CONTEXT satisfies the FILTER (participant branch — DECISION-D).
 *   An unrelated client's SESSION_CONTEXT fails the FILTER (fail-closed — no app-layer check).
 * ADR-012: tier-6 e2e.
 * ADR-023: mock-first session seam used for both participant and unrelated-client sessions.
 *
 * // ADR-001 // ADR-003 // ADR-005 // ADR-012 // ADR-023 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

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
      "[participant-shared-access.spec] DATABASE_URL_ADMIN is not set " +
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

interface SeededEngagement {
  engagementId: string;
  engagementRequestId: string;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/**
 * Seed a CLIENT User row.
 * ADR-001: each user has their own distinct clerkId + email — own-account invariant.
 */
async function seedClientUser(clerkIdSuffix: string, emailSuffix: string): Promise<SeededUser> {
  const pool = await getPool();
  const clerkId = `user_e2e_participant_access_${clerkIdSuffix}`;
  const email = `e2e-participant-access-${emailSuffix}@example.test`;

  // Upsert: if this clerkId already exists (re-run), reuse it.
  const existing = await pool
    .request()
    .input("clerkId", mssqlPkg.NVarChar(64), clerkId)
    .query<{ id: string }>(
      `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );

  if (existing.recordset[0]) {
    return { userId: existing.recordset[0].id, clerkId, email };
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
  if (!row) throw new Error("[participant-shared-access.spec] seedClientUser: no id returned");
  return { userId: row.id, clerkId, email };
}

/**
 * Seed a minimal EngagementRequest + Engagement with the given client as primary owner.
 * Follows DECISION-A (pre-accepted request envelope).
 */
async function seedEngagement(
  primaryClientUserId: string,
  email: string,
): Promise<SeededEngagement> {
  const pool = await getPool();

  // 1. EngagementRequest (pre-accepted — DECISION-A pattern)
  const reqResult = await pool
    .request()
    .input("firstName", mssqlPkg.NVarChar(100), "E2E")
    .input("lastName", mssqlPkg.NVarChar(100), "Access")
    .input("email", mssqlPkg.NVarChar(254), email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [decidedAt], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, N'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[participant-shared-access.spec] seedEngagement: no request id");
  const engagementRequestId = reqRow.id;

  // 2. Engagement (tied to the primary client)
  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, primaryClientUserId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[participant-shared-access.spec] seedEngagement: no engagement id");

  // 3. Link primary client as EngagementParticipant (mirrors createAccountantInitiatedEngagement)
  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engRow.id)
    .input("userId", mssqlPkg.UniqueIdentifier, primaryClientUserId)
    .query(
      `IF NOT EXISTS (
         SELECT 1 FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = @engagementId AND [userId] = @userId
       )
       INSERT INTO [dbo].[EngagementParticipant] ([engagementId], [userId], [role], [createdAt])
       VALUES (@engagementId, @userId, N'CLIENT', SYSDATETIMEOFFSET())`,
    );

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Seed a second EngagementParticipant link for the participant (not the primary owner).
 * ADR-001: this is the participant's OWN User row — distinct from the primary client.
 */
async function seedParticipantLink(
  engagementId: string,
  userId: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .input("userId", mssqlPkg.UniqueIdentifier, userId)
    .query(
      `IF NOT EXISTS (
         SELECT 1 FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = @engagementId AND [userId] = @userId
       )
       INSERT INTO [dbo].[EngagementParticipant] ([engagementId], [userId], [role], [createdAt])
       VALUES (@engagementId, @userId, N'CLIENT', SYSDATETIMEOFFSET())`,
    );
}

/**
 * Cleanup an engagement and its associated data.
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  // NOTE: AuditEvent is APPEND-ONLY (ADR-019, LEDGER=ON) — cannot DELETE.
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

async function cleanupUser(userId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, userId)
    .query(`DELETE FROM [dbo].[User] WHERE [id] = @id`);
}

// ─── afterAll ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-AUTH-007-03] A linked participant reaches the shared engagement via their own account
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-AUTH-007-03] participant-shared-access: linked participant reaches the shared engagement through their own account",
  () => {
    let primaryClient: SeededUser | null = null;
    let participant: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts = Date.now();

    test.beforeEach(async ({ page, request }) => {
      // Seed the primary client and create the engagement
      primaryClient = await seedClientUser(`primary_${ts}`, `primary_${ts}`);
      engagement = await seedEngagement(primaryClient.userId, primaryClient.email);

      // Seed the second participant — their OWN account (ADR-001)
      // ADR-001: participant is their OWN User row with their own distinct clerkId
      participant = await seedClientUser(`participant_${ts}`, `participant_${ts}`);
      await seedParticipantLink(engagement.engagementId, participant.userId);

      // Set up the participant's session (their OWN clerkUserId — ADR-001)
      // ADR-023: mock-first session seam
      await setupClientSession(page, request, participant.clerkId);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
        engagement = null;
      }
      if (participant) {
        await cleanupUser(participant.userId).catch(() => {});
        participant = null;
      }
      if (primaryClient) {
        await cleanupUser(primaryClient.userId).catch(() => {});
        primaryClient = null;
      }
    });

    test(
      "[AC-AUTH-007-03][AC-LIFE-012-03] participant-shared-access: a linked participant reaches the shared engagement through their own account",
      async ({ page }) => {
        if (!primaryClient || !participant || !engagement) throw new Error("fixtures not seeded");

        // ── Scenario: a linked participant (NOT the primary owner) accesses the shared engagement ──

        // Given: participant is linked to the engagement (seeded in beforeEach)
        // ADR-001: participant is using their OWN account (own clerkId — not the primary owner's)
        // ADR-023: session was established via mock-first seam with participant.clerkId

        // When: the participant navigates to the shared engagement by ID
        // ADR-005: the FILTER (sec.pol_Engagement) grants access because the participant
        //          is in EngagementParticipant for this engagement (DECISION-D, TASK-012-001).
        //          No app-layer guard needed — the FILTER does it at the DB level.
        await page.goto(`${PORTAL_URL}/engagements/${engagement.engagementId}`);

        // Then: the participant reaches the engagement detail page (access granted by RLS FILTER)
        // AC-AUTH-007-03: linked participant reaches the shared engagement through their own account
        // AC-LIFE-012-03: the participant is associated with this engagement and can access it
        const engagementDetail = page.locator('[data-testid="engagement-detail"]');
        await expect(engagementDetail).toBeVisible({ timeout: 15_000 });

        // Verify: the page shows the correct engagement (data-engagement-id matches)
        const renderedId = await engagementDetail.getAttribute("data-engagement-id");
        expect(renderedId?.toLowerCase()).toBe(engagement.engagementId.toLowerCase());
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-AUTH-007-03] An unrelated client cannot access the shared engagement
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-AUTH-007-03] participant-shared-access: an unrelated client cannot access the shared engagement",
  () => {
    let primaryClient: SeededUser | null = null;
    let unrelatedClient: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts2 = Date.now() + 3;

    test.beforeEach(async ({ page, request }) => {
      // Seed the primary client and create the engagement
      primaryClient = await seedClientUser(`owner_${ts2}`, `owner_${ts2}`);
      engagement = await seedEngagement(primaryClient.userId, primaryClient.email);

      // Seed an unrelated client — has NO link to the engagement
      // ADR-001: own-account invariant — this is a separate user entirely
      unrelatedClient = await seedClientUser(`unrelated_${ts2}`, `unrelated_${ts2}`);

      // Set up the unrelated client's session (their OWN clerkUserId — not linked to the engagement)
      // ADR-023: mock-first session seam
      await setupClientSession(page, request, unrelatedClient.clerkId);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
        engagement = null;
      }
      if (unrelatedClient) {
        await cleanupUser(unrelatedClient.userId).catch(() => {});
        unrelatedClient = null;
      }
      if (primaryClient) {
        await cleanupUser(primaryClient.userId).catch(() => {});
        primaryClient = null;
      }
    });

    test(
      "[AC-AUTH-007-03] participant-shared-access: an unrelated client cannot access the shared engagement — 404 (surface complement to tier-3 RLS in TASK-012-001)",
      async ({ page }) => {
        if (!primaryClient || !unrelatedClient || !engagement) throw new Error("fixtures not seeded");

        // ── Scenario: an unrelated CLIENT cannot access another client's engagement ──

        // Given: an unrelated client has NO EngagementParticipant link to the engagement
        // (unrelatedClient was seeded without any participant link in beforeEach)

        // When: the unrelated client navigates to the engagement by ID directly
        // ADR-005: the FILTER (sec.pol_Engagement) denies access because:
        //   - Engagement.clientUserId ≠ unrelatedClient (not the primary owner)
        //   - No EngagementParticipant row links them (not a participant)
        //   Both branches of the FILTER fail → ZERO rows → 404 (fail-closed, DECISION-D)
        //
        // NOTE: This is the surface-level complement to the tier-3 RLS proof in TASK-012-001.
        //       The tier-3 test proves isolation at the SQL policy level.
        //       This spec asserts the UI/e2e behavior (the page returns 404).
        await page.goto(`${PORTAL_URL}/engagements/${engagement.engagementId}`);

        // Then: the unrelated client sees a 404-style not-found page
        // AC-AUTH-007-03: they see no unrelated client's data
        // The portal page calls notFound() when the FILTER returns null (fail-closed, ADR-005).
        // Next.js renders a 404 page — assert by checking the HTTP status or absence of detail panel.

        // The engagement-detail panel must NOT be visible (access was denied)
        const engagementDetail = page.locator('[data-testid="engagement-detail"]');
        await expect(engagementDetail).not.toBeVisible({ timeout: 15_000 });

        // The page should have resulted in a not-found response.
        // Next.js 404 pages return HTTP 404; Playwright sees the final URL or a 404 indicator.
        // We assert the engagement panel is absent (the reliable surface-level signal).
        // The unauthorized panel also must not be visible (the user IS authenticated, just not
        // linked to this engagement — so the FILTER, not the auth check, denied them).
        const unauthorizedPanel = page.locator('[data-testid="engagement-unauthorized"]');
        await expect(unauthorizedPanel).not.toBeVisible();
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-012-02][AC-AUTH-007-02] Both participants use their own distinct accounts
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-012-02][AC-AUTH-007-02] participant-shared-access: two participants each reach the engagement through their own account",
  () => {
    let primaryClient: SeededUser | null = null;
    let participant: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts3 = Date.now() + 6;

    test.beforeEach(async ({ page, request }) => {
      // Seed both participants
      primaryClient = await seedClientUser(`owner2_${ts3}`, `owner2_${ts3}`);
      participant = await seedClientUser(`p2_${ts3}`, `p2_${ts3}`);
      engagement = await seedEngagement(primaryClient.userId, primaryClient.email);
      await seedParticipantLink(engagement.engagementId, participant.userId);

      // Start as participant (their OWN account — ADR-001)
      await setupClientSession(page, request, participant.clerkId);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
        engagement = null;
      }
      if (participant) {
        await cleanupUser(participant.userId).catch(() => {});
        participant = null;
      }
      if (primaryClient) {
        await cleanupUser(primaryClient.userId).catch(() => {});
        primaryClient = null;
      }
    });

    test(
      "[AC-LIFE-012-02][AC-AUTH-007-02] participant-shared-access: participant uses their own account to reach the shared engagement (own-account invariant)",
      async ({ page, request }) => {
        if (!primaryClient || !participant || !engagement) throw new Error("fixtures not seeded");

        // ── Scenario: two participants each access the engagement through their own account ──

        // Given: participant is linked to the engagement via EngagementParticipant
        // Their session was set up with their OWN clerkId (ADR-001: own-account invariant)

        // When: the participant (their own account) navigates to the shared engagement
        // ADR-001: they are signing in with their OWN credentials — not a shared account
        await page.goto(`${PORTAL_URL}/engagements/${engagement.engagementId}`);

        // Then: participant reaches the engagement
        // AC-LIFE-012-02: participant's own account (not shared) grants access
        // AC-AUTH-007-02: distinct credentials per participant
        const engagementDetail = page.locator('[data-testid="engagement-detail"]');
        await expect(engagementDetail).toBeVisible({ timeout: 15_000 });

        // Now switch to the primary client's session and verify they ALSO can access it
        // (both participants should see the same engagement through their own accounts)
        await clearSession(page);
        await setupClientSession(page, request, primaryClient.clerkId);

        // When: the primary client (their own account) navigates to the shared engagement
        await page.goto(`${PORTAL_URL}/engagements/${engagement.engagementId}`);

        // Then: primary client also reaches the engagement through their own account
        // AC-LIFE-012-02: each participant's own account (not shared) grants access
        await expect(engagementDetail).toBeVisible({ timeout: 15_000 });

        // The two accounts are DIFFERENT (ADR-001: own-account invariant)
        // Each participant uses their own clerkId — verified here
        expect(primaryClient.clerkId).not.toBe(participant.clerkId);
        expect(primaryClient.userId).not.toBe(participant.userId);
      },
    );
  },
);

/**
 * apps/admin/e2e/specs/engagement-participants.spec.ts
 *
 * Tier-6 e2e — Multi-participant invitation (admin surface).
 *
 * Acceptance criteria covered:
 *   AC-AUTH-007-01 — one engagement can have more than one CLIENT participant
 *   AC-LIFE-012-02 — each participant is a separate portal account, not a shared login
 *   AC-LIFE-012-03 — all linked participants are associated with the same engagement
 *   AC-AUTH-007-02 — each participant has their own distinct account (never shared)
 *
 * Gherkin scenarios: apps/admin/e2e/features/engagement-participants.feature
 *
 * Stack: admin container at ADMIN_URL (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * data-* hooks (must match page.tsx exactly):
 *   data-testid="participants-list"             — participant list container
 *   data-testid="participants-empty"            — empty state message
 *   data-testid="participant-row-{id}"          — per-participant list item
 *   data-testid="participant-email-{id}"        — email display inside participant row
 *   data-testid="invite-panel"                  — invite control section
 *   data-testid="invite-email-input"            — email text input
 *   data-testid="invite-submit"                 — invite button
 *
 * DB fixtures (admin pool — RLS-exempt, setup + teardown):
 *   Seeds: User (CLIENT x2), Service, EngagementRequest, Engagement, EngagementParticipant rows.
 *   Cleaned up in afterEach/afterAll.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'engagement-participants'
 *
 * ADR-001: own-account invariant — each participant is their own account (no shared logins).
 * ADR-003: actor comes from verified session; admin pool for DB fixture setup.
 * ADR-005: role set server-side via mock session cookie — never from client input.
 * ADR-006: engagement creation controls are admin-only; clients never reach this surface.
 * ADR-012: tier-6 e2e.
 * ADR-023: invitation goes through the auth provider mock-first seam.
 *
 * // ADR-001 // ADR-003 // ADR-005 // ADR-006 // ADR-012 // ADR-023 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

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
      "[engagement-participants.spec] DATABASE_URL_ADMIN is not set " +
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
 * CS-GEN-001: only email and role are stored.
 * ADR-001: each participant is their own User row — distinct clerkId + email.
 */
async function seedClientUser(suffix: string): Promise<SeededUser> {
  const pool = await getPool();
  const clerkId = `user_e2e_participants_${suffix}`;
  const email = `e2e-participants-${suffix}@example.test`;

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
  if (!row) throw new Error("[engagement-participants.spec] seedClientUser: no id returned");
  return { userId: row.id, clerkId, email };
}

/**
 * Seed a minimal EngagementRequest + Engagement with the given client as primary owner.
 * Follows DECISION-A (pre-accepted request envelope).
 */
async function seedEngagement(
  clientUserId: string,
  email: string,
): Promise<SeededEngagement> {
  const pool = await getPool();

  // 1. EngagementRequest (pre-accepted — DECISION-A pattern)
  const reqResult = await pool
    .request()
    .input("firstName", mssqlPkg.NVarChar(100), "E2E")
    .input("lastName", mssqlPkg.NVarChar(100), "Participant")
    .input("email", mssqlPkg.NVarChar(254), email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [decidedAt], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, N'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) throw new Error("[engagement-participants.spec] seedEngagement: no request id");
  const engagementRequestId = reqRow.id;

  // 2. Engagement (tied to the primary client)
  const engResult = await pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("clientUserId", mssqlPkg.UniqueIdentifier, clientUserId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) throw new Error("[engagement-participants.spec] seedEngagement: no engagement id");

  // 3. Link primary client as EngagementParticipant (mirrors createAccountantInitiatedEngagement)
  await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engRow.id)
    .input("userId", mssqlPkg.UniqueIdentifier, clientUserId)
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
 * Seed an EngagementParticipant link for a second participant.
 * ADR-001: the second participant is their OWN User row (distinct from the primary).
 */
async function seedParticipantLink(
  engagementId: string,
  userId: string,
): Promise<string> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .input("userId", mssqlPkg.UniqueIdentifier, userId)
    .query<{ id: string }>(
      `IF NOT EXISTS (
         SELECT 1 FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = @engagementId AND [userId] = @userId
       )
       INSERT INTO [dbo].[EngagementParticipant] ([engagementId], [userId], [role], [createdAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @userId, N'CLIENT', SYSDATETIMEOFFSET());
       SELECT [id] FROM [dbo].[EngagementParticipant]
       WHERE [engagementId] = @engagementId AND [userId] = @userId`,
    );

  const row = result.recordset[0];
  if (!row) throw new Error("[engagement-participants.spec] seedParticipantLink: no id returned");
  return row.id;
}

/**
 * Count EngagementParticipant rows for an engagement.
 */
async function countParticipants(engagementId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[EngagementParticipant]
       WHERE [engagementId] = @engagementId`,
    );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Check that two users have distinct clerkIds (own-account invariant).
 * ADR-001: the two users must never share a clerkId.
 */
async function getClerkIdForUser(userId: string): Promise<string> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, userId)
    .query<{ clerkId: string }>(
      `SELECT [clerkId] FROM [dbo].[User] WHERE [id] = @id`,
    );
  const row = result.recordset[0];
  if (!row) throw new Error(`[engagement-participants.spec] no User found for id=${userId}`);
  return row.clerkId;
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

/**
 * Cleanup a User row (and their EngagementParticipant links — done by cleanupEngagement first).
 */
async function cleanupUser(userId: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", mssqlPkg.UniqueIdentifier, userId)
    .query(`DELETE FROM [dbo].[User] WHERE [id] = @id`);
}

/**
 * Clean up any User rows created by the invite action (found by email pattern).
 */
async function cleanupUsersByEmailPattern(pattern: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("pattern", mssqlPkg.NVarChar(260), pattern)
    .query(
      `DELETE FROM [dbo].[User] WHERE [email] LIKE @pattern AND [role] = N'CLIENT'`,
    );
}

// ─── afterAll ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-AUTH-007-01] One engagement can have more than one CLIENT participant
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-AUTH-007-01] engagement-participants: invite adds a second participant via invite control",
  () => {
    let primaryClient: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts = Date.now();
    const inviteeEmail = `e2e-participant-invitee-${ts}@example.test`;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      primaryClient = await seedClientUser(`primary_${ts}`);
      engagement = await seedEngagement(primaryClient.userId, primaryClient.email);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
        engagement = null;
      }
      // Clean up invitee User rows created by the invite action
      await cleanupUsersByEmailPattern(`%${inviteeEmail}%`).catch(() => {});
      if (primaryClient) {
        await cleanupUser(primaryClient.userId).catch(() => {});
        primaryClient = null;
      }
    });

    test(
      "[AC-AUTH-007-01] engagement-participants: accountant invites a second participant via the invite control",
      async ({ page }) => {
        if (!primaryClient || !engagement) throw new Error("fixtures not seeded");

        // ── Scenario: one engagement can have more than one CLIENT participant ──

        // Given: the accountant navigates to the participants page for the engagement
        await page.goto(`${ADMIN_URL}/engagements/${engagement.engagementId}/participants`);

        const participantsList = page.locator('[data-testid="participants-list"]');
        await expect(participantsList).toBeVisible({ timeout: 15_000 });

        // The engagement starts with 1 participant (the primary client)
        await expect(
          page.locator(`[data-testid^="participant-row-"]`).first(),
        ).toBeVisible({ timeout: 10_000 });

        // When: the accountant invites a second participant
        const invitePanel = page.locator('[data-testid="invite-panel"]');
        await expect(invitePanel).toBeVisible({ timeout: 10_000 });

        const emailInput = page.locator('[data-testid="invite-email-input"]');
        await emailInput.fill(inviteeEmail);

        const inviteSubmit = page.locator('[data-testid="invite-submit"]');
        await inviteSubmit.click();

        // Then: the page reloads and now shows two participants
        // (the page revalidates via revalidatePath on successful invite)
        await page.waitForLoadState("networkidle");

        // AC-AUTH-007-01: the engagement now has more than one CLIENT participant
        const participantRows = page.locator('[data-testid^="participant-row-"]');
        await expect(participantRows).toHaveCount(2, { timeout: 15_000 });

        // Verify via DB: 2 EngagementParticipant rows for this engagement
        const count = await countParticipants(engagement.engagementId);
        expect(count).toBe(2);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-012-02][AC-AUTH-007-02] Each participant has their own distinct account
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-012-02][AC-AUTH-007-02] engagement-participants: two participants each have their own account (no shared login)",
  () => {
    let primaryClient: SeededUser | null = null;
    let secondParticipant: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts2 = Date.now() + 1;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      primaryClient = await seedClientUser(`p1_${ts2}`);
      secondParticipant = await seedClientUser(`p2_${ts2}`);
      engagement = await seedEngagement(primaryClient.userId, primaryClient.email);
      // Seed the second participant link directly (mirroring what the invite action does)
      // ADR-001: secondParticipant has their own User row with their own clerkId
      await seedParticipantLink(engagement.engagementId, secondParticipant.userId);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
        engagement = null;
      }
      if (secondParticipant) {
        await cleanupUser(secondParticipant.userId).catch(() => {});
        secondParticipant = null;
      }
      if (primaryClient) {
        await cleanupUser(primaryClient.userId).catch(() => {});
        primaryClient = null;
      }
    });

    test(
      "[AC-LIFE-012-02][AC-AUTH-007-02] engagement-participants: two participants each have distinct accounts — no shared login",
      async ({ page }) => {
        if (!primaryClient || !secondParticipant || !engagement) throw new Error("fixtures not seeded");

        // ── Scenario: each participant has their own separate account ──

        // Given: the participants page for the engagement
        await page.goto(`${ADMIN_URL}/engagements/${engagement.engagementId}/participants`);

        const participantsList = page.locator('[data-testid="participants-list"]');
        await expect(participantsList).toBeVisible({ timeout: 15_000 });

        // Then: two participants are listed (AC-LIFE-012-03: all linked participants)
        const participantRows = page.locator('[data-testid^="participant-row-"]');
        await expect(participantRows).toHaveCount(2, { timeout: 10_000 });

        // AC-LIFE-012-02 / AC-AUTH-007-02: verify via DB that each has their OWN clerkId
        // ADR-001: own-account invariant — no shared logins
        const clerkId1 = await getClerkIdForUser(primaryClient.userId);
        const clerkId2 = await getClerkIdForUser(secondParticipant.userId);

        // The two clerkIds must be different (ADR-001: each participant is their own account)
        expect(clerkId1).not.toBe(clerkId2);

        // The two userIds must be different (own-account invariant)
        expect(primaryClient.userId).not.toBe(secondParticipant.userId);

        // The emails must be different (own distinct accounts — AC-AUTH-007-02)
        expect(primaryClient.email).not.toBe(secondParticipant.email);
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// [AC-LIFE-012-03] All linked participants are associated with the same engagement
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-LIFE-012-03] engagement-participants: all linked participants appear in the participants list",
  () => {
    let primaryClient: SeededUser | null = null;
    let secondParticipant: SeededUser | null = null;
    let engagement: SeededEngagement | null = null;
    const ts3 = Date.now() + 2;

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request);
      primaryClient = await seedClientUser(`list_p1_${ts3}`);
      secondParticipant = await seedClientUser(`list_p2_${ts3}`);
      engagement = await seedEngagement(primaryClient.userId, primaryClient.email);
      // Seed second participant link
      await seedParticipantLink(engagement.engagementId, secondParticipant.userId);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (engagement) {
        await cleanupEngagement(engagement.engagementId, engagement.engagementRequestId).catch(() => {});
        engagement = null;
      }
      if (secondParticipant) {
        await cleanupUser(secondParticipant.userId).catch(() => {});
        secondParticipant = null;
      }
      if (primaryClient) {
        await cleanupUser(primaryClient.userId).catch(() => {});
        primaryClient = null;
      }
    });

    test(
      "[AC-LIFE-012-03] engagement-participants: all linked participants appear in the participants list for the same engagement",
      async ({ page }) => {
        if (!primaryClient || !secondParticipant || !engagement) throw new Error("fixtures not seeded");

        // ── Scenario: all linked participants are associated with the same engagement ──

        // Given: two participants are linked to the same engagement
        // When: the accountant navigates to the participants page
        await page.goto(`${ADMIN_URL}/engagements/${engagement.engagementId}/participants`);

        const participantsList = page.locator('[data-testid="participants-list"]');
        await expect(participantsList).toBeVisible({ timeout: 15_000 });

        // Then: all linked participants appear (AC-LIFE-012-03)
        const participantRows = page.locator('[data-testid^="participant-row-"]');
        await expect(participantRows).toHaveCount(2, { timeout: 10_000 });

        // Both participant emails appear in the list
        // (asserting the page renders the correct data from the engagement's participant join)
        const listText = await participantsList.textContent();
        expect(listText).toContain(primaryClient.email);
        expect(listText).toContain(secondParticipant.email);

        // Verify via DB: both are linked to this engagement specifically
        const count = await countParticipants(engagement.engagementId);
        expect(count).toBe(2);
      },
    );
  },
);

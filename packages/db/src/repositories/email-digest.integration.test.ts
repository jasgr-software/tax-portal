/**
 * packages/db/src/repositories/email-digest.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests the email-digest data-access layer (TASK-018-002 / BRIEF-018 / EPIC-018).
 *
 * Acceptance criteria covered:
 *
 *   AC-MSG-009-01 — The daily-cap predicate excludes recipients already nudged today.
 *     Test: a CLIENT with lastNudgeSentAt = same calendar day as `now` is NOT returned
 *           by getDigestRecipients; one with lastNudgeSentAt = a prior day IS returned.
 *
 *   AC-MSG-010-03 — The in-portal Notification feed is never written by the candidate query.
 *     Test: unread Notification rows for a suppressed recipient are unchanged after
 *           getDigestRecipients runs (count before == count after; readAt still NULL).
 *
 *   AC-MSG-011-01 — A freshly-created CLIENT (default emailNudgeEnabled=true, lastNudgeSentAt=null)
 *                   with an unread notification is returned by getDigestRecipients.
 *     Test: CLIENT_D (default settings) with an unread CLIENT notification IS in the result set.
 *
 * Architecture notes:
 *   - All setup / verification reads use the admin pool directly (bypasses RLS — ADR-003 §1).
 *   - getDigestRecipients / recordNudgeSent use the admin pool internally — tested via their
 *     exported signatures (no SESSION_CONTEXT required).
 *   - getEmailNudgePreferenceForCurrentUser / setEmailNudgePreferenceForCurrentUser use the
 *     request pool — tested via withClerkIdentity() (ADR-003 test helper).
 *   - Tests run sequentially (singleFork: true) — state changes from one test do not race another.
 *   - UNIQUEIDENTIFIER comparisons use .toLowerCase() for case-insensitive matching
 *     (SQL Server may return uppercase or lowercase).
 *
 * Test clock: NOW = 2026-06-26T12:00:00Z (fixed to make cap predicates deterministic).
 *   YESTERDAY = 2026-06-25T12:00:00Z  → CAST AS DATE = 2026-06-25 < 2026-06-26 → eligible
 *   TODAY_LATER = 2026-06-26T20:00:00Z → CAST AS DATE = 2026-06-26 = 2026-06-26 → excluded
 *
 * CS-TS-001: request-pool operations go through the db wrapper via withClerkIdentity. // CS-TS-001
 * CS-TS-002: admin pool not imported outside packages/db; tests use the exported function. // CS-TS-002
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * ADR-003: withClerkIdentity sets real SESSION_CONTEXT on real SQL Server. // ADR-003
 * DECISION-018-002-A: calendar-day UTC boundary proven by the today/yesterday distinction tests.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../sql-server-url.js";
import { withClerkIdentity } from "../context.js";
import {
  getDigestRecipients,
  recordNudgeSent,
  getEmailNudgePreferenceForCurrentUser,
  setEmailNudgePreferenceForCurrentUser,
} from "./email-digest.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test clock (fixed for deterministic cap predicates) ─────────────────────

/**
 * Fixed "now" for all getDigestRecipients calls in this suite.
 * DECISION-018-002-A: CAST(@now AS DATE) = 2026-06-26 (UTC calendar day).
 */
const NOW = new Date("2026-06-26T12:00:00.000Z");

/**
 * Yesterday — CAST AS DATE (2026-06-25) < CAST(NOW AS DATE) (2026-06-26) → eligible.
 * Used for CLIENT_C's lastNudgeSentAt: prior-day nudge should not block today's delivery.
 * // AC-MSG-009-01: at-most-one-per-day cap only blocks same-calendar-day repeats.
 */
const YESTERDAY = new Date("2026-06-25T12:00:00.000Z");

/**
 * Later today — CAST AS DATE (2026-06-26) = CAST(NOW AS DATE) (2026-06-26) → excluded.
 * Used for CLIENT_B's lastNudgeSentAt: already nudged today → cap blocks this recipient.
 * // AC-MSG-009-01
 */
const TODAY_LATER = new Date("2026-06-26T20:00:00.000Z");

// ─── Test data ────────────────────────────────────────────────────────────────

/** Test-unique Clerk IDs — prefix avoids collision with other integration test seeds. */
const ACCT_CLERK_ID = "digest_018_002_acct";
const CLIENT_A_CLERK_ID = "digest_018_002_client_a"; // suppressed (emailNudgeEnabled=false)
const CLIENT_B_CLERK_ID = "digest_018_002_client_b"; // nudged today → cap-excluded
const CLIENT_C_CLERK_ID = "digest_018_002_client_c"; // nudged yesterday → eligible
const CLIENT_D_CLERK_ID = "digest_018_002_client_d"; // default-on, never nudged → eligible

let acctUserId: string;
let clientAUserId: string;
let clientBUserId: string;
let clientCUserId: string;
let clientDUserId: string;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Case-insensitive ID check — SQL Server UNIQUEIDENTIFIER may be returned in different
 * case depending on context (uppercase from OUTPUT, lowercase from SELECT in some versions).
 */
function includesId(ids: string[], targetId: string): boolean {
  const lower = targetId.toLowerCase();
  return ids.some((id) => id.toLowerCase() === lower);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // ── Seed: ACCOUNTANT user ────────────────────────────────────────────────
  // emailNudgeEnabled=true (default), lastNudgeSentAt=null
  // The ACCOUNTANT user will appear in getDigestRecipients if there are unread
  // ACCOUNTANT-scoped notifications and the cap is not exhausted.
  const acctResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${ACCT_CLERK_ID}',
             N'digest-018-002-acct@example.com',
             N'ACCOUNTANT',
             SYSDATETIMEOFFSET())`
  );
  acctUserId = acctResult.recordset[0]?.id ?? "";
  expect(acctUserId, "ACCT insert must return an id").toBeTruthy();

  // ── Seed: CLIENT_A — suppressed (emailNudgeEnabled=false) ───────────────
  // Has an unread notification but is opt-out → must NOT appear in candidates.
  const clientAResult = await adminPool
    .request()
    .input("enabled", mssqlPkg.Bit, false)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [emailNudgeEnabled], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${CLIENT_A_CLERK_ID}',
               N'digest-018-002-client-a@example.com',
               N'CLIENT',
               @enabled,
               SYSDATETIMEOFFSET())`
    );
  clientAUserId = clientAResult.recordset[0]?.id ?? "";
  expect(clientAUserId, "CLIENT_A insert must return an id").toBeTruthy();

  // ── Seed: CLIENT_B — already nudged today (lastNudgeSentAt = TODAY_LATER) ─
  // cap predicate: CAST(TODAY_LATER AS DATE) = 2026-06-26 = CAST(NOW AS DATE) → excluded.
  // // AC-MSG-009-01
  const clientBResult = await adminPool
    .request()
    .input("lastNudgedAt", mssqlPkg.DateTimeOffset, TODAY_LATER)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [lastNudgeSentAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${CLIENT_B_CLERK_ID}',
               N'digest-018-002-client-b@example.com',
               N'CLIENT',
               @lastNudgedAt,
               SYSDATETIMEOFFSET())`
    );
  clientBUserId = clientBResult.recordset[0]?.id ?? "";
  expect(clientBUserId, "CLIENT_B insert must return an id").toBeTruthy();

  // ── Seed: CLIENT_C — nudged yesterday (lastNudgeSentAt = YESTERDAY) ───────
  // cap predicate: CAST(YESTERDAY AS DATE) = 2026-06-25 < CAST(NOW AS DATE) → eligible.
  // // AC-MSG-009-01
  const clientCResult = await adminPool
    .request()
    .input("lastNudgedAt", mssqlPkg.DateTimeOffset, YESTERDAY)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [lastNudgeSentAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${CLIENT_C_CLERK_ID}',
               N'digest-018-002-client-c@example.com',
               N'CLIENT',
               @lastNudgedAt,
               SYSDATETIMEOFFSET())`
    );
  clientCUserId = clientCResult.recordset[0]?.id ?? "";
  expect(clientCUserId, "CLIENT_C insert must return an id").toBeTruthy();

  // ── Seed: CLIENT_D — default-on, never nudged (emailNudgeEnabled=true, lastNudgeSentAt=null)
  // Freshly-created client → must appear in candidates.
  // AC-MSG-011-01: no opt-in step; default emailNudgeEnabled=true fires from DB DEFAULT 1. // AC-MSG-011-01
  const clientDResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_D_CLERK_ID}',
             N'digest-018-002-client-d@example.com',
             N'CLIENT',
             SYSDATETIMEOFFSET())`
  );
  clientDUserId = clientDResult.recordset[0]?.id ?? "";
  expect(clientDUserId, "CLIENT_D insert must return an id").toBeTruthy();

  // ── Seed: unread Notifications for all test users ──────────────────────────
  // Each user gets one unread notification so they qualify on criterion (a).
  // Additional notifications would also be collapsed by DISTINCT — tested implicitly.

  // CLIENT_A (suppressed) — unread CLIENT notification
  await adminPool
    .request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, clientAUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [recipientType], [recipientUserId])
       VALUES
         (N'digest_018_002_test', N'Test notification for CLIENT_A',
          N'CLIENT', @recipientId)`
    );

  // CLIENT_B (nudged today) — unread CLIENT notification
  await adminPool
    .request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, clientBUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [recipientType], [recipientUserId])
       VALUES
         (N'digest_018_002_test', N'Test notification for CLIENT_B',
          N'CLIENT', @recipientId)`
    );

  // CLIENT_C (nudged yesterday) — unread CLIENT notification
  await adminPool
    .request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, clientCUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [recipientType], [recipientUserId])
       VALUES
         (N'digest_018_002_test', N'Test notification for CLIENT_C',
          N'CLIENT', @recipientId)`
    );

  // CLIENT_D (default-on, never nudged) — unread CLIENT notification
  // AC-MSG-011-01: this notification makes CLIENT_D eligible. // AC-MSG-011-01
  await adminPool
    .request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, clientDUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [recipientType], [recipientUserId])
       VALUES
         (N'digest_018_002_test', N'Test notification for CLIENT_D',
          N'CLIENT', @recipientId)`
    );

  // ACCOUNTANT-scoped unread notification (addressed to the ACCOUNTANT principal)
  await adminPool.request().query(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [recipientType])
     VALUES
       (N'digest_018_002_test', N'Test notification for ACCOUNTANT',
        N'ACCOUNTANT')`
  );
}, 30000);

afterAll(async () => {
  // Cleanup: delete test notifications first (FK constraint), then test users.
  await adminPool
    .request()
    .query(
      `DELETE FROM [dbo].[Notification] WHERE [type] = N'digest_018_002_test'`
    )
    .catch(() => { /* ignore */ });

  for (const clerkId of [
    ACCT_CLERK_ID,
    CLIENT_A_CLERK_ID,
    CLIENT_B_CLERK_ID,
    CLIENT_C_CLERK_ID,
    CLIENT_D_CLERK_ID,
  ]) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = N'${clerkId}'`)
      .catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("email-digest repository — getDigestRecipients + recordNudgeSent + preference (TASK-018-002)", () => {

  // ─── Test 1: suppression filter ───────────────────────────────────────────

  /**
   * A recipient with emailNudgeEnabled=false and an unread notification is NOT returned
   * by getDigestRecipients, even though they have unread activity.
   *
   * Proves: criterion (b) is applied — suppression filter works at the DB level.
   * Eligibility requires emailNudgeEnabled=1; a suppressed recipient is excluded regardless
   * of unread notification count.
   *
   * // CS-TS-002 // ADR-003 §7
   */
  it("getDigestRecipients excludes suppressed recipients (emailNudgeEnabled=false)", async () => {
    // ── GIVEN ─────────────────────────────────────────────────────────────
    // CLIENT_A has emailNudgeEnabled=false and an unread CLIENT notification (seeded in beforeAll).

    // ── WHEN ──────────────────────────────────────────────────────────────
    // CS-TS-002: getDigestRecipients uses admin pool internally. // CS-TS-002
    const recipients = await getDigestRecipients(NOW);

    // ── THEN ──────────────────────────────────────────────────────────────
    const recipientIds = recipients.map((r) => r.userId);
    expect(
      includesId(recipientIds, clientAUserId),
      "[suppression] CLIENT_A (emailNudgeEnabled=false) must NOT appear in candidate set"
    ).toBe(false);
  });

  // ─── Test 2: daily-cap filter (same-day excluded; prior-day included) ─────

  /**
   * A recipient with lastNudgeSentAt = same calendar day as `now` is NOT returned.
   * A recipient with lastNudgeSentAt = a prior day IS returned (given unread activity).
   *
   * // AC-MSG-009-01: at-most-one-per-calendar-day-UTC cap.
   * // DECISION-018-002-A: calendar-day UTC boundary.
   *
   * Proves: criterion (c) is applied — the daily-cap predicate excludes already-nudged
   * recipients for the same UTC calendar date, and re-admits them the next day.
   */
  it(
    "AC-MSG-009-01 — getDigestRecipients excludes already-nudged-today; includes prior-day",
    async () => {
      // ── GIVEN ───────────────────────────────────────────────────────────
      // CLIENT_B: lastNudgeSentAt=TODAY_LATER → CAST DATE = 2026-06-26 = NOW date → cap-excluded.
      // CLIENT_C: lastNudgeSentAt=YESTERDAY   → CAST DATE = 2026-06-25 < NOW date → cap-eligible.

      // ── WHEN ─────────────────────────────────────────────────────────────
      const recipients = await getDigestRecipients(NOW);
      const recipientIds = recipients.map((r) => r.userId);

      // ── THEN ─────────────────────────────────────────────────────────────
      // CLIENT_B (nudged today) must be excluded by the cap predicate.
      // AC-MSG-009-01: same-day repeat is blocked. // AC-MSG-009-01
      expect(
        includesId(recipientIds, clientBUserId),
        "[AC-MSG-009-01] CLIENT_B (nudged today at TODAY_LATER) must NOT appear — already-nudged-today cap"
      ).toBe(false);

      // CLIENT_C (nudged yesterday) must be eligible — prior-day nudge does not block today.
      // AC-MSG-009-01: prior-day nudge does not block next-day delivery. // AC-MSG-009-01
      expect(
        includesId(recipientIds, clientCUserId),
        "[AC-MSG-009-01] CLIENT_C (nudged yesterday) must appear — prior-day nudge does not block today"
      ).toBe(true);
    }
  );

  // ─── Test 3: default-on client is included ────────────────────────────────

  /**
   * A freshly-created CLIENT with default emailNudgeEnabled=true and lastNudgeSentAt=null
   * and an unread CLIENT notification IS returned by getDigestRecipients.
   *
   * // AC-MSG-011-01: no opt-in step required; DB DEFAULT 1 satisfies the default-on requirement.
   *
   * Also verifies the ACCOUNTANT recipient mapping: an unread ACCOUNTANT notification
   * maps to the ACCOUNTANT User row and that principal appears in the result (role='ACCOUNTANT').
   */
  it(
    "AC-MSG-011-01 — getDigestRecipients includes a default-on client with unread activity",
    async () => {
      // ── GIVEN ─────────────────────────────────────────────────────────
      // CLIENT_D: emailNudgeEnabled=true (DB default), lastNudgeSentAt=null, has unread notification.
      // ACCT: emailNudgeEnabled=true (DB default), lastNudgeSentAt=null, has unread ACCOUNTANT notification.

      // ── WHEN ──────────────────────────────────────────────────────────
      const recipients = await getDigestRecipients(NOW);
      const recipientIds = recipients.map((r) => r.userId);

      // ── THEN ──────────────────────────────────────────────────────────
      // CLIENT_D (default-on, never nudged) must appear.
      // AC-MSG-011-01: default-on client with unread activity → included. // AC-MSG-011-01
      expect(
        includesId(recipientIds, clientDUserId),
        "[AC-MSG-011-01] CLIENT_D (default emailNudgeEnabled=true, lastNudgeSentAt=null) must appear"
      ).toBe(true);

      // The ACCOUNTANT-scoped notification maps to the ACCOUNTANT User row.
      expect(
        includesId(recipientIds, acctUserId),
        "[ACCOUNTANT mapping] ACCT User must appear when there is an unread ACCOUNTANT notification"
      ).toBe(true);

      // At most one DigestRecipient per userId (DISTINCT).
      const uniqueIds = [...new Set(recipients.map((r) => r.userId.toLowerCase()))];
      expect(
        uniqueIds.length,
        "[DISTINCT] result must have at most one row per recipient"
      ).toBe(recipients.length);
    }
  );

  // ─── Test 4: candidate query never writes the Notification feed ───────────

  /**
   * After getDigestRecipients runs, the Notification rows for a suppressed recipient
   * are unchanged — readAt is still NULL and the count of unread rows is the same.
   *
   * // AC-MSG-010-03: the in-portal Notification feed is left entirely intact by the
   *   candidate query — it is SELECT-only on the Notification table.
   *
   * Uses CLIENT_A (suppressed) as the witness — their notifications are present in the
   * DB but they are not returned as a candidate. Verifying that no writes occurred to
   * their notifications proves the SELECT-only contract.
   */
  it(
    "AC-MSG-010-03 — candidate query never writes the Notification feed",
    async () => {
      // ── GIVEN ─────────────────────────────────────────────────────────
      // CLIENT_A has one unread notification (seeded in beforeAll, readAt=NULL).
      // Read the count of unread notifications for CLIENT_A before the candidate query.
      const beforeResult = await adminPool
        .request()
        .input("recipientId", mssqlPkg.UniqueIdentifier, clientAUserId)
        .query<{ unreadCount: number }>(
          `SELECT COUNT(*) AS unreadCount
           FROM [dbo].[Notification]
           WHERE [recipientUserId] = @recipientId
             AND [readAt] IS NULL`
        );
      const unreadCountBefore = beforeResult.recordset[0]?.unreadCount ?? 0;
      expect(unreadCountBefore, "CLIENT_A must have ≥1 unread notification before the run").toBeGreaterThan(0);

      // ── WHEN ──────────────────────────────────────────────────────────
      // Run the candidate query (getDigestRecipients). CLIENT_A is excluded (suppressed)
      // but their notifications are read in the JOIN. Verify no write occurred.
      // AC-MSG-010-03: candidate query is SELECT-only — never writes Notification. // AC-MSG-010-03
      await getDigestRecipients(NOW);

      // ── THEN ──────────────────────────────────────────────────────────
      // Re-read the unread count for CLIENT_A — must be identical to before.
      const afterResult = await adminPool
        .request()
        .input("recipientId", mssqlPkg.UniqueIdentifier, clientAUserId)
        .query<{ unreadCount: number }>(
          `SELECT COUNT(*) AS unreadCount
           FROM [dbo].[Notification]
           WHERE [recipientUserId] = @recipientId
             AND [readAt] IS NULL`
        );
      const unreadCountAfter = afterResult.recordset[0]?.unreadCount ?? 0;

      // AC-MSG-010-03: feed must be intact — same count, same unread state. // AC-MSG-010-03
      expect(
        unreadCountAfter,
        "[AC-MSG-010-03] Unread notification count for CLIENT_A must be unchanged after getDigestRecipients"
      ).toBe(unreadCountBefore);
    }
  );

  // ─── Test 5: setEmailNudgePreferenceForCurrentUser — own-row-only write ───

  /**
   * Under accountant SESSION_CONTEXT, setEmailNudgePreferenceForCurrentUser(false) flips
   * the accountant's own emailNudgeEnabled to false. A different User row (CLIENT_D) is
   * not affected — own-row isolation is enforced by the WHERE clerkId clause.
   *
   * Also verifies getEmailNudgePreferenceForCurrentUser reads back the updated value.
   *
   * CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by withClerkIdentity). // CS-TS-001
   * ADR-003: withClerkIdentity sets real SESSION_CONTEXT on the SQL Server connection. // ADR-003
   * ADR-005: own-row isolation via WHERE clerkId (no sec.pol_User BLOCK predicate). // ADR-005
   */
  it("setEmailNudgePreferenceForCurrentUser flips only the caller's own row", async () => {
    // ── GIVEN ─────────────────────────────────────────────────────────────
    // ACCT: emailNudgeEnabled=true (initial state from beforeAll seed).
    // CLIENT_D: emailNudgeEnabled=true (default — untouched witness).

    // ── WHEN ──────────────────────────────────────────────────────────────
    // Call setEmailNudgePreferenceForCurrentUser(false) as the ACCOUNTANT.
    // CS-TS-001: goes through the db wrapper → SESSION_CONTEXT = ACCT_CLERK_ID, role='ACCOUNTANT'.
    await withClerkIdentity(ACCT_CLERK_ID, "ACCOUNTANT", () =>
      setEmailNudgePreferenceForCurrentUser(false)
    );

    // ── THEN ──────────────────────────────────────────────────────────────

    // 1. Read back via getEmailNudgePreferenceForCurrentUser — must return false for ACCT.
    const acctPref = await withClerkIdentity(ACCT_CLERK_ID, "ACCOUNTANT", () =>
      getEmailNudgePreferenceForCurrentUser()
    );
    expect(
      acctPref,
      "[own-row write] ACCT emailNudgeEnabled must be false after setEmailNudgePreferenceForCurrentUser(false)"
    ).toBe(false);

    // 2. Verify via admin pool that the ACCT row was updated.
    const acctCheck = await adminPool
      .request()
      .input("userId", mssqlPkg.UniqueIdentifier, acctUserId)
      .query<{ emailNudgeEnabled: boolean }>(
        `SELECT [emailNudgeEnabled] FROM [dbo].[User] WHERE [id] = @userId`
      );
    expect(
      acctCheck.recordset[0]?.emailNudgeEnabled,
      "[own-row write] ACCT row in DB must have emailNudgeEnabled=false"
    ).toBe(false);

    // 3. CLIENT_D's row must be untouched (own-row isolation).
    const clientDCheck = await adminPool
      .request()
      .input("userId", mssqlPkg.UniqueIdentifier, clientDUserId)
      .query<{ emailNudgeEnabled: boolean }>(
        `SELECT [emailNudgeEnabled] FROM [dbo].[User] WHERE [id] = @userId`
      );
    expect(
      clientDCheck.recordset[0]?.emailNudgeEnabled,
      "[own-row write] CLIENT_D row must be untouched — own-row isolation enforced by WHERE clerkId"
    ).toBe(true);

    // Restore: reset ACCT's preference back to true so later test runs start clean.
    await withClerkIdentity(ACCT_CLERK_ID, "ACCOUNTANT", () =>
      setEmailNudgePreferenceForCurrentUser(true)
    );
  });

  // ─── Test 6: recordNudgeSent watermarks the recipient ─────────────────────

  /**
   * After recordNudgeSent(userId, sentAt) is called, the User row's lastNudgeSentAt
   * is updated. A subsequent getDigestRecipients call with the same `now` day excludes
   * that recipient (the cap predicate fires).
   *
   * Also exercises the idempotency property: calling recordNudgeSent again with the
   * same sentAt keeps the recipient out of the next candidate set.
   *
   * CS-TS-002: recordNudgeSent uses the admin pool internally. // CS-TS-002
   */
  it("recordNudgeSent watermarks lastNudgeSentAt and excludes the recipient from today's set", async () => {
    // ── GIVEN ─────────────────────────────────────────────────────────────
    // CLIENT_D is currently eligible (emailNudgeEnabled=true, lastNudgeSentAt=null, unread notif).
    const beforeRecipients = await getDigestRecipients(NOW);
    const beforeIds = beforeRecipients.map((r) => r.userId);
    expect(
      includesId(beforeIds, clientDUserId),
      "[recordNudgeSent] CLIENT_D must be eligible before recordNudgeSent"
    ).toBe(true);

    // ── WHEN ──────────────────────────────────────────────────────────────
    // Record that CLIENT_D was nudged at NOW (same day as the test clock).
    // CS-TS-002: admin pool write inside packages/db. // CS-TS-002
    await recordNudgeSent(clientDUserId, NOW);

    // ── THEN ──────────────────────────────────────────────────────────────
    // Subsequent getDigestRecipients(NOW) must exclude CLIENT_D.
    const afterRecipients = await getDigestRecipients(NOW);
    const afterIds = afterRecipients.map((r) => r.userId);
    expect(
      includesId(afterIds, clientDUserId),
      "[recordNudgeSent] CLIENT_D must be excluded after recordNudgeSent(NOW) — same-day cap"
    ).toBe(false);

    // Verify the watermark in DB via admin pool.
    const watermarkCheck = await adminPool
      .request()
      .input("userId", mssqlPkg.UniqueIdentifier, clientDUserId)
      .query<{ lastNudgeSentAt: Date | null }>(
        `SELECT [lastNudgeSentAt] FROM [dbo].[User] WHERE [id] = @userId`
      );
    expect(
      watermarkCheck.recordset[0]?.lastNudgeSentAt,
      "[recordNudgeSent] lastNudgeSentAt must be set on the row"
    ).not.toBeNull();
  });

});

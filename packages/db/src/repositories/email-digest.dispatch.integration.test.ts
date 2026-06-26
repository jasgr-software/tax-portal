/**
 * packages/db/src/repositories/email-digest.dispatch.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * THE THREE HARD TIER-3 GATES (AC-MSG-008-02, AC-MSG-009-01/-02/-03, AC-MSG-010-02/-03/-04)
 *
 * Tests dispatchDailyDigest: the composer + dispatcher that maps unread Notification
 * activity → at most one generic email per recipient per day, through the EmailProvider
 * port, honoring suppression (BRIEF-018 / EPIC-018 / TASK-018-003).
 *
 * ─── GATE 1: Content-free body, PROVEN BOTH WAYS (AC-MSG-008-02) ─────────────
 *   Seed: a client name, document name, message-thread body, engagement detail, and
 *   event description into the recipient's unread notifications.
 *   Run: dispatchDailyDigest.
 *   Assert (BOTH directions):
 *     (A) The email subject+body CONTAIN the nudge copy + sign-in URL.
 *     (B) NONE of the seeded sensitive strings appear in the subject or body.
 *   A one-sided assertion (only checking nudge present) is a rejection.
 *
 * ─── GATE 2: Daily cap (AC-MSG-009-01/-02/-03) ───────────────────────────────
 *   Seed: N>1 notification events for one recipient in a day.
 *   Run: dispatch for day 1 → assert exactly one email (count == 1).
 *   Run: dispatch for day 2 → assert exactly one more email (total == 2).
 *   Cap enforced on lastNudgeSentAt, not by event timing.
 *
 * ─── GATE 3: Suppression, proven THREE WAYS (AC-MSG-010-02/-03/-04) ──────────
 *   (1) Suppressed accountant (emailNudgeEnabled=false) → zero emails.
 *   (2) Her listNotifications under her SESSION_CONTEXT returns ALL her notifications.
 *   (3) A default-on client still gets their nudge in the same run.
 *
 * ─── Test Isolation Design ────────────────────────────────────────────────────
 *   dispatchDailyDigest is a batch operation that processes ALL eligible recipients.
 *   To prevent one gate's dispatch from watermarking another gate's test users, all
 *   test users are seeded with lastNudgeSentAt = SENTINEL_DATE (year 2200 — after all
 *   test dispatch dates, so they are ineligible). Each test resets ONLY its specific
 *   target user(s) to NULL immediately before dispatching, then beforeEach restores
 *   all users to SENTINEL_DATE for clean isolation.
 *   // DECISION-018-003-E: SENTINEL_DATE isolation pattern for batch-dispatch test isolation.
 *
 * Architecture notes:
 *   - All setup / verification reads use the admin pool directly (bypasses RLS — ADR-003 §1).
 *   - dispatchDailyDigest uses admin pool internally for getDigestRecipients/recordNudgeSent.
 *   - Tests use TestEmailCapture (implements EmailProvider via the barrel export) for
 *     deterministic count+body inspection without requiring subpath imports. // DECISION-018-003-D
 *   - listNotifications in Gate 3 uses request pool via withClerkIdentity() (ADR-003).
 *   - Tests run sequentially (singleFork: true) — no cross-test DB state race.
 *   - UNIQUEIDENTIFIER comparisons use .toLowerCase() for case-insensitive matching.
 *
 * // ADR-003: SESSION_CONTEXT propagation via withClerkIdentity. // ADR-003
 * // ADR-006: CLIENT → portal sign-in; ACCOUNTANT → admin sign-in. // ADR-006
 * // ADR-012: tier-3 test requires real SQL Server. // ADR-012
 * // ADR-025: dispatchDailyDigest uses getEmailProvider() unless _emailProvider injected. // ADR-025
 * // REQ-MSG-008: content-free nudge. // REQ-MSG-008
 * // REQ-MSG-009: at most one per day. // REQ-MSG-009
 * // REQ-MSG-010: suppression. // REQ-MSG-010
 * // AC-MSG-008-02: content-free body proven both ways. // AC-MSG-008-02
 * // AC-MSG-009-01/-02/-03: daily cap. // AC-MSG-009-01
 * // AC-MSG-010-02/-03/-04: suppression three ways. // AC-MSG-010-02
 * // CS-TS-001: request pool via withClerkIdentity. // CS-TS-001
 * // CS-TS-002: admin pool in packages/db only. // CS-TS-002
 * // CS-GEN-001: no recipient email/identity in logs or result. // CS-GEN-001
 * // CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * // CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../sql-server-url.js";
import { withClerkIdentity } from "../context.js";
import {
  dispatchDailyDigest,
  getDigestRecipients,
} from "./email-digest.js";
import { listNotifications } from "./notification.js";

// ── TestEmailCapture ──────────────────────────────────────────────────────────

/**
 * Minimal EmailProvider implementation for tier-3 integration testing.
 *
 * DECISION-018-003-D: We inject this directly via `_emailProvider` opts instead
 * of relying on `EMAIL_PROVIDER=mock` env + module singleton manipulation, because
 * the module-level `getSentEmailsForTesting` helper lives behind a package subpath
 * that is not yet exported from `@tax-portal/email`. This implementation satisfies
 * the `EmailProvider` interface (from the barrel) and provides a local inspection
 * surface (the `captured` array). ADR-025 compliance is maintained — the interface
 * used is the same `EmailProvider` port, not an ESP SDK.
 * // DECISION-018-003-D // ADR-025
 */
import type { EmailProvider, EmailMessage, SentEmail } from "@tax-portal/email";

class TestEmailCapture implements EmailProvider {
  readonly fromAddress = "test-digest@tax-portal.dev";
  readonly captured: EmailMessage[] = [];
  private _idCounter = 0;

  async send(message: EmailMessage): Promise<SentEmail> {
    // CS-GEN-001: do not log message.to or message.text — potential PII. // CS-GEN-001
    this.captured.push({ ...message });
    return { id: `test-capture-${++this._idCounter}` };
  }

  /** Reset the capture store between tests or dispatch phases. */
  reset(): void {
    this.captured.length = 0;
    this._idCounter = 0;
  }
}

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof mssqlPkg.ConnectionPool>;
const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const { ConnectionPool } = mssqlPkg;

// ─── Test isolation sentinel ──────────────────────────────────────────────────

/**
 * DECISION-018-003-E: Sentinel watermark date for test isolation.
 *
 * All test users are seeded with lastNudgeSentAt = SENTINEL_DATE (year 2200).
 * CAST(2200-01-01) is NOT less than any test dispatch `now` date (all ≤ 2100),
 * so sentineled users are excluded from dispatch by the daily-cap predicate.
 *
 * Each test MUST reset its specific user(s) to NULL immediately before dispatching,
 * and beforeEach restores all users to SENTINEL_DATE for clean re-entry.
 * // DECISION-018-003-E // AC-MSG-009-01 // DECISION-018-002-A
 */
const SENTINEL_DATE = new Date("2200-01-01T00:00:00.000Z");

// ─── Test dispatch dates (each gate uses a unique day) ───────────────────────

/** Gate1 (content-free): now = 2100-01-01 */
const DAY_G1   = new Date("2100-01-01T10:00:00.000Z");
/** Gate2 day 1 (daily-cap): now = 2100-01-02 */
const DAY_G2_1 = new Date("2100-01-02T10:00:00.000Z");
/** Gate2 day 2 (daily-cap): now = 2100-01-03 — different calendar day from DAY_G2_1 */
const DAY_G2_2 = new Date("2100-01-03T10:00:00.000Z");
/** Gate3 (suppression): now = 2100-01-04 */
const DAY_G3   = new Date("2100-01-04T10:00:00.000Z");
/** Fail-test (DECISION-018-003-A): now = 2100-01-05 */
const DAY_FAIL = new Date("2100-01-05T10:00:00.000Z");
/** ADR-025 seam test: far-future date → no real recipients eligible */
const DAY_FAR  = new Date("2099-01-01T00:00:00.000Z");

// ─── Test data prefixes ───────────────────────────────────────────────────────

/** Prefix avoids collision with TASK-018-002 test data. */
const CLERK_PREFIX = "digest_018_003";

const G1_CLIENT_CLERK = `${CLERK_PREFIX}_g1_client`;
const G2_CLIENT_CLERK = `${CLERK_PREFIX}_g2_client`;
const G3_ACCT_CLERK   = `${CLERK_PREFIX}_g3_acct`;
const G3_CLIENT_CLERK = `${CLERK_PREFIX}_g3_client`;

let g1ClientUserId:   string;
let g2ClientUserId:   string;
let g3AcctUserId:     string;
let g3ClientUserId:   string;

// ─── Sensitive values for content-free two-sided proof ────────────────────────

/**
 * Seeded sensitive strings that MUST NOT appear in the nudge email.
 *
 * Each is seeded into a Notification title/body for Gate1's recipient.
 * Proves AC-MSG-008-02: the dispatcher NEVER interpolates Notification content.
 *
 * // AC-MSG-008-02 // ADR-025 §3 // REQ-MSG-008
 */
const SENSITIVE = {
  clientName:        "Testclient Sensitive-7A9F",
  documentName:      "W-2 Form 2024 ConfidentialDoc-9B",
  messageBody:       "Please upload W-2 ASAP - messageBody-3C",
  engagementDetail:  "Q4 Tax Return Engagement 2024 Detail-5D",
  eventDescription:  "New doc uploaded by Testclient Sensitive-7A9F event-6E",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function includesId(ids: string[], targetId: string): boolean {
  const lower = targetId.toLowerCase();
  return ids.some((id) => id.toLowerCase() === lower);
}

/**
 * Enable a user for the next dispatch by clearing their watermark to NULL.
 * Only call this immediately before the dispatch that should include this user.
 * // DECISION-018-003-E
 */
async function enableUser(userId: string): Promise<void> {
  await adminPool.request()
    .input("userId", mssqlPkg.UniqueIdentifier, userId)
    .query(`UPDATE [dbo].[User] SET [lastNudgeSentAt] = NULL WHERE [id] = @userId`);
}

/**
 * Restore a user to the sentinel state (ineligible for future dispatches).
 * // DECISION-018-003-E
 */
async function sentinelUser(userId: string): Promise<void> {
  await adminPool.request()
    .input("userId", mssqlPkg.UniqueIdentifier, userId)
    .input("sentinel", mssqlPkg.DateTimeOffset, SENTINEL_DATE)
    .query(`UPDATE [dbo].[User] SET [lastNudgeSentAt] = @sentinel WHERE [id] = @userId`);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for tier-3 integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // ── Pre-cleanup: zero out any stale test-date watermarks ─────────────
  // DECISION-018-003-E: previous test runs (before _userIdFilter was added) may have
  // watermarked non-test users with dates in the 2100 range. Clear those now so that
  // the user-email-preference.integration.test.ts additive-migration check (which
  // reads the oldest User row) doesn't see a stale lastNudgeSentAt.
  // Safe bounds: [2099-01-01, 2199-12-31] — real users are never in 2100; SENTINEL_DATE
  // (2200-01-01) is explicitly excluded so sentinel isolation is not disturbed.
  // // DECISION-018-003-E
  await adminPool.request().query(
    `UPDATE [dbo].[User]
     SET [lastNudgeSentAt] = NULL
     WHERE [lastNudgeSentAt] >= '2099-01-01'
       AND [lastNudgeSentAt]  < '2200-01-01'`
  );

  // ── Gate 1 (AC-MSG-008-02): content-free two-sided proof ─────────────────
  // CLIENT user seeded with SENTINEL_DATE (ineligible until test enables them).
  const g1Result = await adminPool.request()
    .input("sentinel", mssqlPkg.DateTimeOffset, SENTINEL_DATE)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [lastNudgeSentAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${G1_CLIENT_CLERK}',
               N'digest-018-003-g1-client@example.com',
               N'CLIENT',
               @sentinel,
               SYSDATETIMEOFFSET())`
    );
  g1ClientUserId = g1Result.recordset[0]?.id ?? "";
  expect(g1ClientUserId, "Gate1 CLIENT insert must return an id").toBeTruthy();

  // Seed notifications with EVERY sensitive category for Gate1 recipient.
  // The two-sided proof asserts that NONE of these values appear in the outgoing email.
  // // AC-MSG-008-02 // ADR-025 §3
  await adminPool.request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, g1ClientUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId])
       VALUES
         (N'${CLERK_PREFIX}_g1_test',
          N'${SENSITIVE.clientName} - ${SENSITIVE.documentName}',
          N'${SENSITIVE.messageBody}',
          N'CLIENT', @recipientId)`
    );
  await adminPool.request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, g1ClientUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId])
       VALUES
         (N'${CLERK_PREFIX}_g1_test',
          N'${SENSITIVE.engagementDetail}',
          N'${SENSITIVE.eventDescription}',
          N'CLIENT', @recipientId)`
    );

  // ── Gate 2 (AC-MSG-009-01/-02/-03): daily-cap proof ──────────────────────
  // CLIENT user with SENTINEL_DATE. Seeded with N=3 unread notifications.
  const g2Result = await adminPool.request()
    .input("sentinel", mssqlPkg.DateTimeOffset, SENTINEL_DATE)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [lastNudgeSentAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${G2_CLIENT_CLERK}',
               N'digest-018-003-g2-client@example.com',
               N'CLIENT',
               @sentinel,
               SYSDATETIMEOFFSET())`
    );
  g2ClientUserId = g2Result.recordset[0]?.id ?? "";
  expect(g2ClientUserId, "Gate2 CLIENT insert must return an id").toBeTruthy();

  // Seed N=3 unread CLIENT notifications to prove "not one per event".
  // // AC-MSG-009-02 // AC-MSG-009-03
  for (let i = 1; i <= 3; i++) {
    await adminPool.request()
      .input("recipientId", mssqlPkg.UniqueIdentifier, g2ClientUserId)
      .query(
        `INSERT INTO [dbo].[Notification]
           ([type], [title], [recipientType], [recipientUserId])
         VALUES
           (N'${CLERK_PREFIX}_g2_test', N'Gate2 event ${i}',
            N'CLIENT', @recipientId)`
      );
  }

  // ── Gate 3 (AC-MSG-010-02/-03/-04): suppression three-ways ───────────────

  // ACCOUNTANT — suppressed (emailNudgeEnabled=false).
  // lastNudgeSentAt IS NULL because suppression is the exclusion mechanism, not the cap.
  const g3AcctResult = await adminPool.request()
    .input("enabled", mssqlPkg.Bit, false)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [emailNudgeEnabled], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${G3_ACCT_CLERK}',
               N'digest-018-003-g3-acct@example.com',
               N'ACCOUNTANT',
               @enabled,
               SYSDATETIMEOFFSET())`
    );
  g3AcctUserId = g3AcctResult.recordset[0]?.id ?? "";
  expect(g3AcctUserId, "Gate3 ACCT insert must return an id").toBeTruthy();

  // Seed 2 unread ACCOUNTANT notifications for the suppressed accountant.
  // These must still be visible via listNotifications (AC-MSG-010-03).
  // // AC-MSG-010-03
  for (let i = 1; i <= 2; i++) {
    await adminPool.request().query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [recipientType])
       VALUES
         (N'${CLERK_PREFIX}_g3_acct_test',
          N'Gate3 accountant notification ${i}',
          N'ACCOUNTANT')`
    );
  }

  // CLIENT — seeded with SENTINEL_DATE. Has 1 unread notification.
  // Must receive their nudge while the accountant is suppressed.
  // // AC-MSG-010-04
  const g3ClientResult = await adminPool.request()
    .input("sentinel", mssqlPkg.DateTimeOffset, SENTINEL_DATE)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [lastNudgeSentAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'${G3_CLIENT_CLERK}',
               N'digest-018-003-g3-client@example.com',
               N'CLIENT',
               @sentinel,
               SYSDATETIMEOFFSET())`
    );
  g3ClientUserId = g3ClientResult.recordset[0]?.id ?? "";
  expect(g3ClientUserId, "Gate3 CLIENT insert must return an id").toBeTruthy();

  // Seed 1 unread CLIENT notification for the default-on client.
  await adminPool.request()
    .input("recipientId", mssqlPkg.UniqueIdentifier, g3ClientUserId)
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [recipientType], [recipientUserId])
       VALUES
         (N'${CLERK_PREFIX}_g3_client_test', N'Gate3 client notification',
          N'CLIENT', @recipientId)`
    );
}, 30000);

/**
 * DECISION-018-003-E: Restore all gate users to SENTINEL_DATE before each test.
 * This ensures that when a test calls `enableUser(userId)` for only its target user,
 * no other test users are accidentally eligible for that test's dispatch call.
 * // DECISION-018-003-E
 */
beforeEach(async () => {
  if (!adminPool || !g1ClientUserId) return; // Not yet initialized (beforeAll not done)
  for (const userId of [g1ClientUserId, g2ClientUserId, g3ClientUserId]) {
    await sentinelUser(userId);
  }
  // Gate3 ACCT is excluded via emailNudgeEnabled=false (suppression), not the cap.
  // Her lastNudgeSentAt is irrelevant to test isolation, but we reset it for cleanliness.
  if (g3AcctUserId) {
    await adminPool.request()
      .input("userId", mssqlPkg.UniqueIdentifier, g3AcctUserId)
      .query(`UPDATE [dbo].[User] SET [lastNudgeSentAt] = NULL WHERE [id] = @userId`);
  }
});

afterAll(async () => {
  // Cleanup: delete test notifications first (FK constraint), then test users.
  for (const type of [
    `${CLERK_PREFIX}_g1_test`,
    `${CLERK_PREFIX}_g2_test`,
    `${CLERK_PREFIX}_g3_acct_test`,
    `${CLERK_PREFIX}_g3_client_test`,
    `${CLERK_PREFIX}_fail_test`,
  ]) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[Notification] WHERE [type] = N'${type}'`)
      .catch(() => { /* ignore */ });
  }

  for (const clerkId of [
    G1_CLIENT_CLERK, G2_CLIENT_CLERK, G3_ACCT_CLERK, G3_CLIENT_CLERK,
    `${CLERK_PREFIX}_fail_test`,
  ]) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = N'${clerkId}'`)
      .catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

// ─── GATE 1: Content-free body, proven BOTH ways (AC-MSG-008-02) ─────────────

describe(
  "GATE 1 — AC-MSG-008-02: content-free email body (two-sided: nudge present AND sensitive absent)",
  () => {
    it(
      "AC-MSG-008-02 — dispatched subject+body contain the nudge copy + sign-in URL, " +
      "AND contain NONE of the seeded sensitive values",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // Gate1 CLIENT's notifications carry client name, document name, message body,
        // engagement detail, and event description. None must appear in the nudge.
        // // AC-MSG-008-02 // ADR-025 §3 // REQ-MSG-008

        // Enable ONLY Gate1 CLIENT for this dispatch (DECISION-018-003-E).
        await enableUser(g1ClientUserId);

        const capture = new TestEmailCapture();

        // ── WHEN ──────────────────────────────────────────────────────────
        // DECISION-018-003-E: scope dispatch to Gate1 CLIENT only to prevent
        // watermarking stale users from other test files. // DECISION-018-003-E
        const result = await dispatchDailyDigest({
          now: DAY_G1,
          _emailProvider: capture,
          _userIdFilter: new Set([g1ClientUserId.toLowerCase()]),
        });

        // sentCount must be ≥ 1 (Gate1 CLIENT is enabled). // AC-MSG-009-01
        expect(result.sentCount).toBeGreaterThanOrEqual(1);

        // ── THEN ──────────────────────────────────────────────────────────
        // Find the email addressed to Gate1 CLIENT.
        const gate1Email = capture.captured.find(
          (m) => m.to === "digest-018-003-g1-client@example.com"
        );

        expect(gate1Email, "[AC-MSG-008-02] Gate1 CLIENT must have received a nudge email").toBeDefined();
        if (!gate1Email) return; // type-narrowing

        // SIDE A — nudge copy IS present in subject and body.
        // // AC-MSG-008-01 // AC-MSG-008-03
        expect(
          gate1Email.subject.toLowerCase(),
          "[AC-MSG-008-02][Side A] Subject must contain 'activity' (nudge statement)"
        ).toContain("activity");

        expect(
          gate1Email.text,
          "[AC-MSG-008-02][Side A] Body must contain the sign-in URL"
        ).toContain("/sign-in");

        // SIDE B — NONE of the seeded sensitive values appear in the email.
        // This is the "two-sided" proof: nudge present AND sensitive absent.
        // // AC-MSG-008-02 // ADR-025 §3
        const allSensitiveValues = Object.values(SENSITIVE);
        for (const sensitiveValue of allSensitiveValues) {
          expect(
            gate1Email.subject,
            `[AC-MSG-008-02][Side B] Subject must NOT contain: "${sensitiveValue}"`
          ).not.toContain(sensitiveValue);

          expect(
            gate1Email.text,
            `[AC-MSG-008-02][Side B] Body must NOT contain: "${sensitiveValue}"`
          ).not.toContain(sensitiveValue);
        }

        // Document the proof categories explicitly for the SDET.
        expect(gate1Email.text, "[AC-MSG-008-02][Side B] client name absent").not.toContain(SENSITIVE.clientName);
        expect(gate1Email.text, "[AC-MSG-008-02][Side B] document name absent").not.toContain(SENSITIVE.documentName);
        expect(gate1Email.text, "[AC-MSG-008-02][Side B] message body absent").not.toContain(SENSITIVE.messageBody);
        expect(gate1Email.text, "[AC-MSG-008-02][Side B] engagement detail absent").not.toContain(SENSITIVE.engagementDetail);
        expect(gate1Email.text, "[AC-MSG-008-02][Side B] event description absent").not.toContain(SENSITIVE.eventDescription);
      }
    );
  }
);

// ─── GATE 2: Daily cap (AC-MSG-009-01/-02/-03) ───────────────────────────────

describe(
  "GATE 2 — AC-MSG-009-01/-02/-03: at most one email per day per recipient",
  () => {
    it(
      "AC-MSG-009-01 / AC-MSG-009-02 / AC-MSG-009-03 — " +
      "N=3 events on day 1 → exactly one email; day 2 events → exactly one more",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // Gate2 CLIENT has 3 unread notifications (N=3 events).
        // beforeEach restored them to SENTINEL_DATE; enable ONLY Gate2 CLIENT now.
        // // AC-MSG-009-01 // AC-MSG-009-02 // AC-MSG-009-03

        await enableUser(g2ClientUserId);

        // Pre-check: Gate2 CLIENT is now a candidate for DAY_G2_1.
        const candidatesBeforeDay1 = await getDigestRecipients(DAY_G2_1);
        expect(
          includesId(candidatesBeforeDay1.map((r) => r.userId), g2ClientUserId),
          "[AC-MSG-009-01] Gate2 CLIENT must be eligible for DAY_G2_1 after enableUser"
        ).toBe(true);

        // ── WHEN (day 1) ──────────────────────────────────────────────────
        const capture = new TestEmailCapture();

        // DECISION-018-003-E: scope to Gate2 CLIENT only. // DECISION-018-003-E
        const g2Filter = new Set([g2ClientUserId.toLowerCase()]);

        const day1Result = await dispatchDailyDigest({
          now: DAY_G2_1,
          _emailProvider: capture,
          _userIdFilter: g2Filter,
        });

        // ── THEN (day 1) ──────────────────────────────────────────────────
        const gate2Day1Emails = capture.captured.filter(
          (m) => m.to === "digest-018-003-g2-client@example.com"
        );

        // AC-MSG-009-01/-02/-03: EXACTLY ONE email, not one per event.
        expect(
          gate2Day1Emails.length,
          "[AC-MSG-009-01/-02/-03] Day 1: Gate2 CLIENT must receive EXACTLY ONE email despite N=3 events"
        ).toBe(1);

        expect(day1Result.sentCount, "[AC-MSG-009-01] sentCount ≥ 1 after day1").toBeGreaterThanOrEqual(1);

        // Verify the cap was applied: recipient is now excluded for DAY_G2_1.
        const candidatesAfterDay1 = await getDigestRecipients(DAY_G2_1);
        expect(
          includesId(candidatesAfterDay1.map((r) => r.userId), g2ClientUserId),
          "[AC-MSG-009-01] Gate2 CLIENT must be cap-excluded after day 1 dispatch"
        ).toBe(false);

        // ── WHEN (day 2) ──────────────────────────────────────────────────
        // DAY_G2_2 is a different calendar day from DAY_G2_1.
        // The cap resets: lastNudgeSentAt=DAY_G2_1 < DAY_G2_2 → eligible again.
        // Unread notifications from day 1 are still unread (dispatcher never writes Notification).
        // // AC-MSG-010-03 // DECISION-018-003-A

        const candidatesForDay2 = await getDigestRecipients(DAY_G2_2);
        expect(
          includesId(candidatesForDay2.map((r) => r.userId), g2ClientUserId),
          "[AC-MSG-009-01] Gate2 CLIENT must be eligible again for DAY_G2_2 (cap resets by calendar day)"
        ).toBe(true);

        // Run day 2 dispatch — accumulate in same capture (total will be day1 + day2).
        // DECISION-018-003-E: scope to Gate2 CLIENT only. // DECISION-018-003-E
        const day2Result = await dispatchDailyDigest({
          now: DAY_G2_2,
          _emailProvider: capture,
          _userIdFilter: g2Filter,
        });

        // ── THEN (day 2) ──────────────────────────────────────────────────
        const gate2AllEmails = capture.captured.filter(
          (m) => m.to === "digest-018-003-g2-client@example.com"
        );

        // AC-MSG-009-01: EXACTLY TWO emails total (one per day, not per event).
        // // AC-MSG-009-01
        expect(
          gate2AllEmails.length,
          "[AC-MSG-009-01] Total: Gate2 CLIENT must receive EXACTLY TWO emails (one per day)"
        ).toBe(2);

        expect(day2Result.sentCount, "[AC-MSG-009-01] sentCount ≥ 1 after day2").toBeGreaterThanOrEqual(1);

        // Verify cap for DAY_G2_2 — no third email on the same day.
        const candidatesAfterDay2 = await getDigestRecipients(DAY_G2_2);
        expect(
          includesId(candidatesAfterDay2.map((r) => r.userId), g2ClientUserId),
          "[AC-MSG-009-01] Gate2 CLIENT must be cap-excluded after day 2 dispatch"
        ).toBe(false);
      }
    );
  }
);

// ─── GATE 3: Suppression, proven THREE WAYS (AC-MSG-010-02/-03/-04) ──────────

describe(
  "GATE 3 — AC-MSG-010-02/-03/-04: suppression proven three ways",
  () => {
    it(
      "AC-MSG-010-02/-03/-04 — suppressed accountant receives zero emails; " +
      "her feed is intact; default-on client still receives nudge",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // Gate3 ACCT: emailNudgeEnabled=false (suppressed) — excluded via suppression filter.
        //   lastNudgeSentAt is NULL (suppression is the exclusion mechanism, not the cap).
        // Gate3 CLIENT: sentineled by beforeEach → enabled here only.
        //
        // // AC-MSG-010-02: suppressed → zero emails.
        // // AC-MSG-010-03: feed intact after dispatch.
        // // AC-MSG-010-04: default-on client still gets nudge.

        // Enable ONLY Gate3 CLIENT for this dispatch.
        await enableUser(g3ClientUserId);

        // Verify the suppressed accountant is NOT a candidate.
        // (emailNudgeEnabled=false excludes them regardless of cap state.)
        const candidates = await getDigestRecipients(DAY_G3);
        expect(
          includesId(candidates.map((r) => r.userId), g3AcctUserId),
          "[AC-MSG-010-02] Gate3 ACCOUNTANT (suppressed) must NOT be a candidate"
        ).toBe(false);

        // Count the accountant's unread notifications before dispatch.
        const unreadBefore = await adminPool.request().query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt
           FROM [dbo].[Notification]
           WHERE [type] = N'${CLERK_PREFIX}_g3_acct_test'
             AND [readAt] IS NULL`
        );
        const unreadCountBefore = unreadBefore.recordset[0]?.cnt ?? 0;
        expect(
          unreadCountBefore,
          "[AC-MSG-010-03] Gate3 ACCOUNTANT must have ≥1 unread notification before dispatch"
        ).toBeGreaterThan(0);

        // ── WHEN ──────────────────────────────────────────────────────────
        const capture = new TestEmailCapture();

        // DECISION-018-003-E: scope to Gate3 CLIENT + Gate3 ACCT only
        // (ACCT is suppressed so she won't get an email, but including her
        // in the filter proves the suppression proof rather than elision).
        // // DECISION-018-003-E
        await dispatchDailyDigest({
          now: DAY_G3,
          _emailProvider: capture,
          _userIdFilter: new Set([
            g3ClientUserId.toLowerCase(),
            g3AcctUserId.toLowerCase(),
          ]),
        });

        // ── THEN: Proof 1 — suppressed accountant receives zero emails ────
        // // AC-MSG-010-02
        const acctEmails = capture.captured.filter(
          (m) => m.to === "digest-018-003-g3-acct@example.com"
        );
        expect(
          acctEmails.length,
          "[AC-MSG-010-02] Gate3 ACCOUNTANT (emailNudgeEnabled=false) must receive ZERO emails"
        ).toBe(0);

        // ── THEN: Proof 2 — accountant's in-portal feed is still intact ───
        // listNotifications under the accountant's SESSION_CONTEXT must return all her
        // notifications — the dispatcher NEVER writes the Notification table.
        // // AC-MSG-010-03
        // CS-TS-001: request pool via withClerkIdentity (SESSION_CONTEXT set). // CS-TS-001
        const acctFeed = await withClerkIdentity(G3_ACCT_CLERK, "ACCOUNTANT", () =>
          listNotifications()
        );

        // The notifications seeded in beforeAll for the accountant must still be present.
        const acctTestNotifs = acctFeed.filter(
          (n) => n.type === `${CLERK_PREFIX}_g3_acct_test`
        );

        expect(
          acctTestNotifs.length,
          `[AC-MSG-010-03] listNotifications must return all ${unreadCountBefore} notifications for suppressed accountant`
        ).toBe(unreadCountBefore);

        // All returned notifications must still be unread (dispatcher never touched them).
        const allUnread = acctTestNotifs.every((n) => n.readAt === null);
        expect(
          allUnread,
          "[AC-MSG-010-03] Suppressed accountant's notifications must all still be unread after dispatch"
        ).toBe(true);

        // ── THEN: Proof 3 — default-on client receives their nudge ────────
        // The client (sentineled → enabled → eligible) must get their nudge in the same run.
        // // AC-MSG-010-04
        const clientEmails = capture.captured.filter(
          (m) => m.to === "digest-018-003-g3-client@example.com"
        );
        expect(
          clientEmails.length,
          "[AC-MSG-010-04] Gate3 CLIENT (emailNudgeEnabled=true default) must receive EXACTLY ONE nudge"
        ).toBe(1);

        // Verify the client nudge is content-free (nudge present + sign-in URL).
        const clientNudge = clientEmails[0];
        if (clientNudge) {
          expect(
            clientNudge.subject.toLowerCase(),
            "[AC-MSG-010-04] Client nudge subject must contain 'activity'"
          ).toContain("activity");
          expect(
            clientNudge.text,
            "[AC-MSG-010-04] Client nudge body must contain the sign-in URL"
          ).toContain("/sign-in");
        }
      }
    );
  }
);

// ─── Dispatcher ADR-025 seam verification ────────────────────────────────────

describe("dispatchDailyDigest — ADR-025 send-only-via-port seam", () => {
  it("returns sentCount only — no recipient identity in the result (CS-GEN-001)", async () => {
    // dispatchDailyDigest returns DigestDispatchResult = { sentCount: number }.
    // No email address, userId, or body is present in the result object.
    // // CS-GEN-001 // ADR-025 §4

    const capture = new TestEmailCapture();
    // Use an empty filter so NO users are dispatched — proves the result shape.
    const result = await dispatchDailyDigest({
      now: DAY_FAR,
      _emailProvider: capture,
      _userIdFilter: new Set<string>(),
    });

    expect(typeof result.sentCount).toBe("number");
    const keys = Object.keys(result);
    expect(keys).toEqual(["sentCount"]);
  });

  it("dispatchDailyDigest with empty filter returns { sentCount: 0 }", async () => {
    // Empty _userIdFilter → no recipients dispatched → sentCount = 0.
    // Proves the dispatcher handles an empty candidate set gracefully.
    const capture = new TestEmailCapture();
    const result = await dispatchDailyDigest({
      now: DAY_FAR,
      _emailProvider: capture,
      _userIdFilter: new Set<string>(),
    });

    expect(result.sentCount).toBe(0);
    expect(capture.captured.length).toBe(0);
  });
});

// ─── recordNudgeSent send-failure posture (DECISION-018-003-A) ───────────────

describe("dispatchDailyDigest — DECISION-018-003-A: send-failure posture", () => {
  it(
    "DECISION-018-003-A — a send failure does not call recordNudgeSent; " +
    "the recipient is retried on the next run",
    async () => {
      // ── GIVEN ─────────────────────────────────────────────────────────
      // Create a fresh client user with an unread notification.
      // Inject a provider that throws for every send.
      const FAILING_CLERK = `${CLERK_PREFIX}_fail_test`;
      let failUserId: string;

      // Clean up any stale row from a prior run.
      await adminPool.request().query(
        `DELETE FROM [dbo].[Notification] WHERE [type] = N'${CLERK_PREFIX}_fail_test'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[User] WHERE [clerkId] = N'${FAILING_CLERK}'`
      ).catch(() => { /* ignore */ });

      const failUserResult = await adminPool.request().query<{ id: string }>(
        `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (N'${FAILING_CLERK}',
                 N'digest-018-003-fail@example.com',
                 N'CLIENT',
                 SYSDATETIMEOFFSET())`
      );
      failUserId = failUserResult.recordset[0]?.id ?? "";
      expect(failUserId, "fail-test user insert must succeed").toBeTruthy();

      await adminPool.request()
        .input("recipientId", mssqlPkg.UniqueIdentifier, failUserId)
        .query(
          `INSERT INTO [dbo].[Notification]
             ([type], [title], [recipientType], [recipientUserId])
           VALUES
             (N'${CLERK_PREFIX}_fail_test', N'Fail test notification',
              N'CLIENT', @recipientId)`
        );

      // ── WHEN ──────────────────────────────────────────────────────────
      // Inject a provider that throws for every send (simulates transient SMTP failure).
      const failingProvider: EmailProvider = {
        fromAddress: "test@example.com",
        async send(_msg: EmailMessage): Promise<SentEmail> {
          throw new Error("Simulated SMTP failure (DECISION-018-003-A test)");
        },
      };

      // Pre-check: fail-test user is eligible (lastNudgeSentAt IS NULL).
      const candidatesBefore = await getDigestRecipients(DAY_FAIL);
      expect(
        includesId(candidatesBefore.map((r) => r.userId), failUserId),
        "[DECISION-018-003-A] fail-test recipient must be eligible before dispatch"
      ).toBe(true);

      // Run dispatch with failing provider.
      // The error is caught; dispatch continues and returns without crashing.
      const result = await dispatchDailyDigest({
        now: DAY_FAIL,
        _emailProvider: failingProvider,
      });

      // ── THEN ──────────────────────────────────────────────────────────
      // DECISION-018-003-A: failed send → recordNudgeSent NOT called → lastNudgeSentAt stays NULL.

      const watermarkCheck = await adminPool.request()
        .input("userId", mssqlPkg.UniqueIdentifier, failUserId)
        .query<{ lastNudgeSentAt: Date | null }>(
          `SELECT [lastNudgeSentAt] FROM [dbo].[User] WHERE [id] = @userId`
        );

      expect(
        watermarkCheck.recordset[0]?.lastNudgeSentAt,
        "[DECISION-018-003-A] lastNudgeSentAt must be NULL after send failure (not watermarked)"
      ).toBeNull();

      // Recipient must still be eligible for retry on the same day.
      const candidatesAfterFail = await getDigestRecipients(DAY_FAIL);
      expect(
        includesId(candidatesAfterFail.map((r) => r.userId), failUserId),
        "[DECISION-018-003-A] fail-test recipient must remain eligible after send failure (retry next run)"
      ).toBe(true);

      // sentCount must not include the failed send.
      expect(result.sentCount).toBe(0);

      // Cleanup.
      await adminPool.request().query(
        `DELETE FROM [dbo].[Notification] WHERE [type] = N'${CLERK_PREFIX}_fail_test'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[User] WHERE [clerkId] = N'${FAILING_CLERK}'`
      ).catch(() => { /* ignore */ });
    }
  );
});

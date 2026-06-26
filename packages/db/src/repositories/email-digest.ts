/**
 * packages/db/src/repositories/email-digest.ts
 *
 * Data-access layer for the email digest fallback (BRIEF-018 / EPIC-018 / TASK-018-002).
 *
 * Four functions:
 *   getDigestRecipients      — admin pool (CS-TS-002): eligible recipients for a nudge window.
 *   recordNudgeSent          — admin pool (CS-TS-002): watermarks a successfully-sent nudge.
 *   getEmailNudgePreferenceForCurrentUser  — request pool (CS-TS-001): reads caller's own opt-in.
 *   setEmailNudgePreferenceForCurrentUser  — request pool (CS-TS-001): writes caller's own opt-in.
 *
 * Architecture:
 *   - getDigestRecipients / recordNudgeSent:
 *       admin pool (getAdminPool + mssql.Request) — same pattern as emitNotification.
 *       No SESSION_CONTEXT needed for admin-pool operations (ADR-003 §7).
 *       The candidate query is SELECT-only on Notification — never writes it (AC-MSG-010-03).
 *   - getEmailNudgePreferenceForCurrentUser / setEmailNudgePreferenceForCurrentUser:
 *       request pool (db wrapper) — SESSION_CONTEXT set before every query (ADR-003 §2).
 *       currentRequestContext() supplies the clerkId to scope reads/writes to the caller's own row.
 *       No RLS security policy exists on the User table, so the WHERE clerkId = @clerkUserId
 *       clause is the mandatory own-row isolation mechanism (not belt-and-suspenders here).
 *
 * // DECISION-018-002-A: calendar-day boundary in UTC.
 *   The cap predicate uses CAST(lastNudgeSentAt AS DATE) < CAST(@now AS DATE), which compares
 *   calendar dates in UTC (SQL Server DATETIMEOFFSET columns store UTC offset; CAST-to-DATE
 *   strips the time component, giving the calendar date in whatever offset is stored — for our
 *   UTC-stored timestamps this is the UTC calendar date). A rolling-24h variant was considered
 *   but calendar-day UTC is simpler, deterministic, and aligns with how an accountant reasons
 *   about "daily" digests ("I already got today's digest").
 *
 * CS-TS-001: request-pool reads/writes go through the db wrapper (SESSION_CONTEXT). // CS-TS-001
 * CS-TS-002: admin-pool operations use getAdminPool() inside packages/db only. // CS-TS-002
 * CS-TS-003: DigestRecipient shape is uniform for both portal (CLIENT) + admin (ACCOUNTANT). // CS-TS-003
 * CS-GEN-001: no recipient email / identity / activity detail in any log line. // CS-GEN-001
 * CS-GEN-002: additive — new module; no existing export removed or narrowed. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * ADR-003: SESSION_CONTEXT identity propagation via db wrapper / withClerkIdentity. // ADR-003
 * ADR-005: User table has no sec.pol_User BLOCK predicate; own-row isolation is enforced
 *          by the explicit WHERE clerkId = @clerkUserId clause in request-pool writes. // ADR-005
 * AC-MSG-010-03: candidate query never writes Notification. // AC-MSG-010-03
 * AC-MSG-011-01: default-on — emailNudgeEnabled defaults to true at the DB level. // AC-MSG-011-01
 */

import { db } from "../client.js";
import { currentRequestContext } from "../context.js";
import { getAdminPool } from "../admin-connection.js";
import mssqlPkg from "mssql";
import type { EmailProvider } from "@tax-portal/email";
import {
  composeDigestNudge,
  getEmailProvider,
} from "@tax-portal/email"; // ADR-025: send only via the EmailProvider port. // ADR-025

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A principal eligible to receive a digest nudge.
 *
 * CS-TS-003: uniform shape used by both portal (CLIENT) and admin (ACCOUNTANT) surfaces.
 *   Consumers on both surfaces import this type from @tax-portal/db without needing
 *   surface-specific variants. // CS-TS-003
 *
 * AC-MSG-011-01: role='CLIENT' rows always have emailNudgeEnabled=true by default. // AC-MSG-011-01
 */
export interface DigestRecipient {
  /** User.id (UNIQUEIDENTIFIER as string) */
  userId: string;
  /** User.email — used by the dispatcher to address the email */
  email: string;
  /** 'ACCOUNTANT' | 'CLIENT' — discriminator for both portal + admin surfaces */
  role: "ACCOUNTANT" | "CLIENT";
}

// ─── getDigestRecipients (admin pool — batch read) ────────────────────────────

/**
 * Returns all principals eligible for a nudge for the window containing `now`.
 *
 * Eligibility criteria (all three must hold):
 *   (a) ≥1 unread in-portal Notification (readAt IS NULL) addressed to the principal
 *   (b) emailNudgeEnabled = true on their User row
 *   (c) not yet nudged in the current calendar-day-UTC window:
 *       lastNudgeSentAt IS NULL OR CAST(lastNudgeSentAt AS DATE) < CAST(@now AS DATE)
 *
 * Recipient mapping:
 *   CLIENT: Notification.recipientType='CLIENT' → joined to User via Notification.recipientUserId
 *   ACCOUNTANT: Notification.recipientType='ACCOUNTANT' → joined to User.role='ACCOUNTANT'
 *     (recipientUserId IS NULL for ACCOUNTANT rows — one ACCOUNTANT principal per portal)
 *
 * Returns at most one DigestRecipient per eligible principal (DISTINCT by userId).
 *
 * // DECISION-018-002-A: calendar-day boundary in UTC (see module-level comment). // DECISION-018-002-A
 *
 * This function is SELECT-only on the Notification table — it never writes a Notification row.
 * AC-MSG-010-03: the in-portal feed is left entirely intact. // AC-MSG-010-03
 *
 * CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
 * CS-GEN-001: no recipient email / activity logged. // CS-GEN-001
 * ADR-003 §7: admin pool write — no SESSION_CONTEXT needed. // ADR-003
 */
export async function getDigestRecipients(now: Date): Promise<DigestRecipient[]> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("now", mssqlPkg.DateTimeOffset, now);

  // DECISION-018-002-A: CAST(@now AS DATE) gives the UTC calendar day.
  // The JOIN handles both recipient types in a single pass:
  //   CLIENT branch:     n.recipientType='CLIENT'     → n.recipientUserId = u.id
  //   ACCOUNTANT branch: n.recipientType='ACCOUNTANT' → u.role='ACCOUNTANT'
  //                      (recipientUserId IS NULL for ACCOUNTANT-scoped rows)
  // SELECT DISTINCT by userId ensures at most one row per recipient even when the
  // principal has multiple unread notifications.
  // AC-MSG-010-03: no INSERT/UPDATE/DELETE on Notification — SELECT only. // AC-MSG-010-03
  const result = await req.query<{ userId: string; email: string; role: string }>(
    `SELECT DISTINCT u.[id] AS userId, u.[email], u.[role]
     FROM [dbo].[Notification] n
     INNER JOIN [dbo].[User] u ON (
         (n.[recipientType] = N'CLIENT'     AND n.[recipientUserId] = u.[id])
         OR
         (n.[recipientType] = N'ACCOUNTANT' AND u.[role] = N'ACCOUNTANT')
     )
     WHERE
         n.[readAt] IS NULL
         AND u.[emailNudgeEnabled] = 1
         AND (
             u.[lastNudgeSentAt] IS NULL
             OR CAST(u.[lastNudgeSentAt] AS DATE) < CAST(@now AS DATE)
         )`
  );

  // CS-GEN-001: no email / userId / role logged here — caller is responsible. // CS-GEN-001
  return result.recordset.map((row) => ({
    userId: row.userId,
    email: row.email,
    role: row.role as "ACCOUNTANT" | "CLIENT",
  }));
}

// ─── recordNudgeSent (admin pool — watermark write) ───────────────────────────

/**
 * Watermarks a sent nudge by setting lastNudgeSentAt = sentAt on the recipient's User row.
 *
 * Called by the dispatcher (TASK-018-003) after a successful send. Idempotent for the day:
 * re-running with a same-day sentAt (same UTC calendar date) keeps the recipient out of the
 * next getDigestRecipients candidate set (cap predicate: CAST(lastNudgeSentAt AS DATE) <
 * CAST(@now AS DATE) → equal → excluded).
 *
 * CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
 * CS-GEN-001: userId only in the WHERE clause — no email or activity detail logged. // CS-GEN-001
 * ADR-003 §7: admin pool write — no SESSION_CONTEXT needed. // ADR-003
 */
export async function recordNudgeSent(userId: string, sentAt: Date): Promise<void> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("userId", mssqlPkg.UniqueIdentifier, userId);
  req.input("sentAt", mssqlPkg.DateTimeOffset, sentAt);

  await req.query(
    `UPDATE [dbo].[User]
     SET    [lastNudgeSentAt] = @sentAt
     WHERE  [id] = @userId`
  );
}

// ─── getEmailNudgePreferenceForCurrentUser (request pool) ─────────────────────

/**
 * Reads emailNudgeEnabled for the caller's own User row.
 *
 * Uses the request pool so SESSION_CONTEXT is set before the query (ADR-003 §2).
 * The clerkId filter scopes the read to the caller's own row. This is not
 * belt-and-suspenders — the User table has no sec.pol_User FILTER predicate,
 * so without the WHERE clause an ACCOUNTANT principal would see all rows.
 *
 * AC-MSG-011-01: returns true by default if the User row is absent (defensive — should
 *   not occur in production, but guards against race conditions during sign-up). // AC-MSG-011-01
 *
 * Must be called within a withRequestContext() / withClerkIdentity() scope.
 *
 * CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
 * ADR-003: SESSION_CONTEXT propagated via withRequestContext / withClerkIdentity. // ADR-003
 */
export async function getEmailNudgePreferenceForCurrentUser(): Promise<boolean> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  const ctx = currentRequestContext();
  if (!ctx) {
    throw new Error(
      "[email-digest] No request context active. " +
        "Wrap the call in withRequestContext() or withClerkIdentity(). ADR-003 §6."
    );
  }

  const user = await (db as unknown as {
    user: {
      findFirst: (args: {
        where: { clerkId: string };
        select: { emailNudgeEnabled: boolean };
      }) => Promise<{ emailNudgeEnabled: boolean } | null>;
    };
  }).user.findFirst({
    where: { clerkId: ctx.clerkUserId },
    select: { emailNudgeEnabled: true },
  });

  // AC-MSG-011-01: default-on if row absent (defensive). // AC-MSG-011-01
  return user?.emailNudgeEnabled ?? true;
}

// ─── setEmailNudgePreferenceForCurrentUser (request pool) ─────────────────────

/**
 * Writes emailNudgeEnabled = enabled for the caller's own User row.
 *
 * Scoped to the caller's own row only via WHERE clerkId = @clerkUserId.
 * The User table has no sec.pol_User BLOCK predicate — the WHERE clause is the
 * mandatory own-row isolation mechanism (not belt-and-suspenders; ADR-005).
 *
 * The role guard (accountant-only access) lives in the server action (TASK-018-004,
 * CS-TS-004). This function is the data primitive — it is role-agnostic so that
 * both accountant and client paths can share the same write seam (CS-TS-003).
 *
 * Must be called within a withRequestContext() / withClerkIdentity() scope.
 *
 * CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
 * CS-TS-003: shared primitive for both surfaces. // CS-TS-003
 * ADR-003: SESSION_CONTEXT propagated via withRequestContext / withClerkIdentity. // ADR-003
 * ADR-005: own-row isolation enforced by explicit WHERE clerkId clause (no pol_User BLOCK). // ADR-005
 */
// ─── dispatchDailyDigest (admin-pool batch dispatcher) ────────────────────────

/**
 * Result returned by dispatchDailyDigest.
 *
 * Carries only a count — no recipient identity (CS-GEN-001 / ADR-025 §4).
 *
 * // CS-GEN-001: no recipient email / identity in the result beyond a count. // CS-GEN-001
 * // ADR-025 §4: no body/PII logging. // ADR-025
 */
export interface DigestDispatchResult {
  /** Number of nudge emails successfully sent in this run. */
  sentCount: number;
}

/**
 * Dispatch the daily digest nudge to all eligible recipients.
 *
 * Flow:
 *   1. now = opts?.now ?? new Date()
 *   2. recipients = getDigestRecipients(now) — admin pool; returns at most one
 *      DigestRecipient per eligible principal (DISTINCT; cap + suppression applied).
 *   3. For each recipient:
 *      a. Pick signInUrl by role (ADR-006):
 *           CLIENT     → PORTAL_APP_URL + '/sign-in'
 *           ACCOUNTANT → ADMIN_APP_URL  + '/sign-in'
 *      b. composeDigestNudge({ role, signInUrl }) — pure; returns { subject, text }.
 *      c. getEmailProvider().send({ to: email, subject, text }) — ADR-025 seam.
 *      d. On success: recordNudgeSent(userId, now) — watermarks the daily-cap.
 *      e. On send failure: log a category-only message (no PII) and continue to the
 *         next recipient WITHOUT calling recordNudgeSent so the recipient retries next run.
 *   4. Return { sentCount } — count of successfully sent nudges.
 *
 * // DECISION-018-003-A: Send-failure posture.
 *   A failed send for one recipient must not corrupt the cap for others. If
 *   send() throws, we skip recordNudgeSent for that recipient so the next run
 *   retries. This mirrors the existing call-site discipline in apps/admin (see
 *   apps/admin/src/app/requests/actions.ts). Errors are logged without PII.
 *   // DECISION-018-003-A
 *
 * // DECISION-018-003-B: ADR-006 sign-in URL selection.
 *   CLIENT   → process.env.PORTAL_APP_URL + '/sign-in'
 *   ACCOUNTANT → process.env.ADMIN_APP_URL + '/sign-in'
 *   If the env var is absent, we fall back to the respective localhost default
 *   (port 3000 / 3001 per the port assignments in CLAUDE.md). This is safe for
 *   dev/test; production deployments MUST set both env vars.
 *   // DECISION-018-003-B
 *
 * // ADR-006: CLIENT → portal surface; ACCOUNTANT → admin surface.       // ADR-006
 * // ADR-025: send only through the EmailProvider port; no ESP SDK.       // ADR-025
 * // ADR-023: no real ESP key wired; SMTP → Mailhog for dev/e2e.         // ADR-023
 * // ADR-017: no PII in transport layer.                                  // ADR-017
 * // REQ-MSG-008: content-free nudge.                                     // REQ-MSG-008
 * // REQ-MSG-009: at most one per day.                                    // REQ-MSG-009
 * // REQ-MSG-010: suppression filter applied by getDigestRecipients.      // REQ-MSG-010
 * // AC-MSG-008-02: content-free body guaranteed by composeDigestNudge.   // AC-MSG-008-02
 * // AC-MSG-009-01/-02/-03: one email per day; cap enforced by watermark. // AC-MSG-009-01
 * // AC-MSG-010-02: suppressed recipients not returned by getDigestRecipients. // AC-MSG-010-02
 * // AC-MSG-010-03: Notification table never written here.                // AC-MSG-010-03
 * // CS-TS-002: admin pool via getAdminPool() inside packages/db only.    // CS-TS-002
 * // CS-GEN-001: no recipient email / activity / body logged.             // CS-GEN-001
 * // CS-GEN-002: additive export — no existing export removed.            // CS-GEN-002
 * // CS-GEN-003: governing keys cited throughout.                         // CS-GEN-003
 *
 * @param opts.now Override the dispatch clock (optional; defaults to `new Date()`).
 * @param opts._emailProvider
 *   @internal TEST-ONLY seam — **honored only when `NODE_ENV === 'test'`** (TASK-018-008 #4).
 *   Inject a capturable EmailProvider for tier-3 dispatch tests without module-level mutation.
 *   Provably inert in production: if `NODE_ENV !== 'test'` this field is silently ignored and
 *   `getEmailProvider()` is always called. Never pass in production; the guard is the NODE_ENV
 *   check, not caller discipline. // CS-GEN-001 // ADR-025
 * @param opts._userIdFilter
 *   @internal TEST-ONLY seam — **honored only when `NODE_ENV === 'test'`** (TASK-018-008 #4).
 *   Scope dispatch to a known set of user IDs to prevent cross-test watermark contamination in
 *   shared-DB tier-3 integration tests. Provably inert in production: if `NODE_ENV !== 'test'`
 *   this field is silently ignored and all eligible recipients are dispatched. Never pass in
 *   production; the guard is the NODE_ENV check, not caller discipline. // CS-GEN-001 // ADR-025
 */
export async function dispatchDailyDigest(
  opts?: { now?: Date; _emailProvider?: EmailProvider; _userIdFilter?: Set<string> }
): Promise<DigestDispatchResult> {
  // DECISION-018-003-B: sign-in URL defaults (CLAUDE.md port assignments). // DECISION-018-003-B
  const portalBase =
    process.env["PORTAL_APP_URL"] ?? "http://localhost:3000";
  const adminBase =
    process.env["ADMIN_APP_URL"] ?? "http://localhost:3001";

  const now = opts?.now ?? new Date();

  // CS-TS-002: getDigestRecipients uses admin pool internally. // CS-TS-002
  const allRecipients = await getDigestRecipients(now);

  // TASK-018-008 #4: Test-seam gate — seams are provably inert in production.
  // Honoring _userIdFilter or _emailProvider ONLY when NODE_ENV === 'test' prevents a
  // production caller from silently narrowing recipients or redirecting all mail.
  // // CS-GEN-001 // ADR-025 // ADR-017
  const useTestSeam = process.env["NODE_ENV"] === "test";

  // DECISION-018-003-E: _userIdFilter — test-only recipient scoping (INERT in production).
  //   In tests, the dispatcher runs against a shared DB that may contain stale
  //   test users from other test files. Passing `_userIdFilter` limits dispatch
  //   to the caller's own test users, preventing cross-test watermark contamination.
  //   Production code NEVER passes _userIdFilter → all eligible recipients are dispatched.
  //   // DECISION-018-003-E
  const recipients =
    useTestSeam && opts?._userIdFilter
      ? allRecipients.filter((r) =>
          opts._userIdFilter!.has(r.userId.toLowerCase())
        )
      : allRecipients;

  // DECISION-018-003-D: EmailProvider injection for tier-3 integration tests (INERT in production).
  //   The `_emailProvider` opts field allows test callers to inject a capturable
  //   mock (e.g. a TestEmailCapture that implements EmailProvider) without requiring
  //   subpath exports from @tax-portal/email or module-level singleton manipulation.
  //   Production always uses getEmailProvider() → the env-selected binding.
  //   ADR-025 compliance is maintained: the interface used is ALWAYS the EmailProvider port.
  //   The underscore prefix signals "test-only" to callers; the parameter is never
  //   documented in the public API (not on the type exported from index.ts).
  //   // DECISION-018-003-D // ADR-025
  //
  // ADR-025: send only via the EmailProvider port — never call an ESP SDK directly.
  // // ADR-025
  const emailProvider =
    useTestSeam && opts?._emailProvider ? opts._emailProvider : getEmailProvider();

  let sentCount = 0;

  for (const recipient of recipients) {
    // DECISION-018-003-B: ADR-006 sign-in URL by role. // ADR-006 // DECISION-018-003-B
    const signInUrl =
      recipient.role === "CLIENT"
        ? `${portalBase}/sign-in`
        : `${adminBase}/sign-in`;

    // composeDigestNudge is a pure content-free function — no Notification field used.
    // // AC-MSG-008-02 // ADR-025 §3 // REQ-MSG-008
    const { subject, text } = composeDigestNudge({
      role: recipient.role,
      signInUrl,
    });

    try {
      // ADR-025: send only through the port — no ESP SDK at this call site. // ADR-025
      // ADR-023: SMTP → Mailhog in dev/e2e; no real Resend key wired.       // ADR-023
      // CS-GEN-001: do NOT log recipient.email, subject, or body here.      // CS-GEN-001
      await emailProvider.send({
        to: recipient.email,
        subject,
        text,
      });

      // DECISION-018-003-A: Record the watermark only after a successful send.
      // A failed send skips this so the recipient retries next run.
      // // AC-MSG-009-01 // DECISION-018-003-A
      await recordNudgeSent(recipient.userId, now);

      sentCount += 1;
    } catch (err) {
      // DECISION-018-003-A: log category-only — no PII in any log argument.
      // SMTP rejections embed the recipient email in err.message
      // (e.g. "550 5.1.1 <user@example.com> User not found") — logging err.message
      // would be PII egress to logs, violating CS-GEN-001 / ADR-025 §4 / ADR-017.
      // Log only a stable category string + the error class name (never .message,
      // never the recipient address, never any notification field).
      // // CS-GEN-001 // ADR-025 §4 // ADR-017 // DECISION-018-003-A // TASK-018-008 #5
      console.error(
        "[email-digest] one recipient send failed (detail suppressed per ADR-025 §4)",
        (err as Error | null)?.constructor?.name ?? "unknown"
      );
      // recordNudgeSent is intentionally skipped — the recipient will be retried next run.
      // // DECISION-018-003-A
    }
  }

  // CS-GEN-001: return only the count — no recipient identity in the result. // CS-GEN-001
  return { sentCount };
}

export async function setEmailNudgePreferenceForCurrentUser(enabled: boolean): Promise<void> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  const ctx = currentRequestContext();
  if (!ctx) {
    throw new Error(
      "[email-digest] No request context active. " +
        "Wrap the call in withRequestContext() or withClerkIdentity(). ADR-003 §6."
    );
  }

  // DECISION-018-002-B: use update (not updateMany) because clerkId is @unique — Prisma
  //   accepts it as a unique identifier in the where clause. updateMany is not needed here.
  //   The explicit where: { clerkId } is the own-row isolation mechanism (ADR-005 above).
  await (db as unknown as {
    user: {
      update: (args: {
        where: { clerkId: string };
        data: { emailNudgeEnabled: boolean; updatedAt: Date };
      }) => Promise<{ id: string }>;
    };
  }).user.update({
    where: { clerkId: ctx.clerkUserId },
    data: { emailNudgeEnabled: enabled, updatedAt: new Date() },
  });
}

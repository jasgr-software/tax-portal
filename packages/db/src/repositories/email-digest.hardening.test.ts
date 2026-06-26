/**
 * packages/db/src/repositories/email-digest.hardening.test.ts
 *
 * UNIT TESTS — no SQL Server required (all DB dependencies mocked).
 *
 * Regression tests for dispatchDailyDigest:
 *
 *   #5 — CS-GEN-001 / ADR-025 §4 / ADR-017 no-PII logging fix:
 *     A send failure must NOT log err.message (SMTP rejections embed the recipient
 *     email, e.g. "550 5.1.1 <user@example.com>…"). The catch block logs only a
 *     stable category string + the error class name. Regression test spies on
 *     console.error and asserts no recipient email or PII appears in any arg.
 *
 *   #2 — AC-MSG-009-01 double-send regression:
 *     When emailProvider.send() succeeds but recordNudgeSent() (the UPDATE watermark
 *     write) throws, the send must still be credited (sentCount incremented), and
 *     the watermark failure must be logged with a distinct message — NOT mixed with
 *     the send-failure log. The recipient may be re-eligible on the next run, but
 *     must NOT receive a second email within the current run.
 *
 *   #emailProvider-DI — plain DI parameter (no NODE_ENV gate):
 *     The `emailProvider` opt is ALWAYS honored when provided (no environment check).
 *     getEmailProvider() is the default only when `emailProvider` is absent.
 *
 * Methodology: unit, mocked-dependency. Vitest vi.hoisted() + vi.mock() pattern.
 *
 * // CS-GEN-001: no PII in log args — the hard constraint these tests enforce. // CS-GEN-001
 * // ADR-025 §4: no body/PII logging in the catch block. // ADR-025
 * // ADR-017: no PII in transport/log layer. // ADR-017
 * // AC-MSG-009-01: at most one email per recipient per day. // AC-MSG-009-01
 * // CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailProvider, EmailMessage, SentEmail } from "@tax-portal/email";

// ─── Hoisted mock factories (vi.hoisted runs before vi.mock factories) ────────

/**
 * Container for the recipients returned by the mocked getDigestRecipients query.
 * Tests set `recipientsContainer.value` before calling dispatchDailyDigest.
 *
 * Mutable container pattern: the vi.mock factory captures the REFERENCE at mock
 * creation time; tests mutate .value to control per-test query responses.
 *
 * `queryState` controls per-test query failure simulation:
 *   - `callCount`: tracks how many times StubRequest.query has been called this test.
 *   - `throwAfter`: if set to N, the (N+1)th query call throws a simulated DB error.
 *     Used by the double-send regression test to make the UPDATE (recordNudgeSent) throw.
 *     Reset to null in beforeEach so default tests are unaffected.
 */
const { recipientsContainer, mockGetAdminPool, mockGetEmailProvider, mockComposeDigestNudge, queryState } =
  vi.hoisted(() => ({
    recipientsContainer: {
      value: [] as Array<{ userId: string; email: string; role: string }>,
    },
    mockGetAdminPool: vi.fn(),
    mockGetEmailProvider: vi.fn(),
    mockComposeDigestNudge: vi.fn(),
    queryState: { callCount: 0, throwAfter: null as number | null },
  }));

// ─── Module mocks ─────────────────────────────────────────────────────────────

/**
 * Mock mssql so getDigestRecipients / recordNudgeSent don't require a real DB.
 *
 * StubRequest constructor pattern: mirrors the pattern in
 * apps/admin/src/app/requests/actions.test.ts. The `query` implementation reads
 * from `recipientsContainer.value` at call time, not at mock-definition time,
 * so tests can configure different recipients per test.
 *
 * `queryState.throwAfter` supports the double-send regression test (#2):
 *   When set to N, the (N+1)th query call throws a simulated DB error, which lets
 *   the test simulate recordNudgeSent() failing after send() succeeded.
 *
 * // CS-TS-002: mssql is an internal implementation detail of packages/db. // CS-TS-002
 */
vi.mock("mssql", () => {
  function StubRequest(
    this: { input: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> },
    _pool: unknown,
  ) {
    this.input = vi.fn().mockReturnThis();
    this.query = vi.fn().mockImplementation(() => {
      queryState.callCount++;
      if (queryState.throwAfter !== null && queryState.callCount > queryState.throwAfter) {
        return Promise.reject(new Error("Simulated DB write failure (hardening test #2)"));
      }
      return Promise.resolve({ recordset: recipientsContainer.value });
    });
  }
  return {
    default: {
      DateTimeOffset: "DateTimeOffset",
      UniqueIdentifier: "UniqueIdentifier",
      Bit: "Bit",
      Request: StubRequest,
    },
  };
});

/** Mock admin connection pool — getDigestRecipients / recordNudgeSent never open a real connection. */
vi.mock("../admin-connection.js", () => ({
  getAdminPool: mockGetAdminPool,
}));

/**
 * Mock @tax-portal/email so getEmailProvider() is fully controlled per test.
 * composeDigestNudge is a pure function; we return a fixed content-free nudge.
 */
vi.mock("@tax-portal/email", () => ({
  getEmailProvider: mockGetEmailProvider,
  composeDigestNudge: mockComposeDigestNudge,
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { dispatchDailyDigest } from "./email-digest.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

/** Default no-op provider returned by mockGetEmailProvider unless overridden per test. */
function makeNoopProvider(): EmailProvider {
  return {
    fromAddress: "noop@unit-test.example.com",
    send: vi.fn().mockResolvedValue({ id: "noop-1" } satisfies SentEmail),
  };
}

// ─── Test-level setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default recipients: empty (tests override as needed).
  recipientsContainer.value = [];
  // Reset query state: no failures by default.
  queryState.callCount = 0;
  queryState.throwAfter = null;
  // Default pool: return a stub pool object (not used directly by StubRequest).
  mockGetAdminPool.mockResolvedValue({});
  // Default email provider: a no-op that records calls.
  mockGetEmailProvider.mockReturnValue(makeNoopProvider());
  // Default compose: content-free nudge, same shape as the real function.
  mockComposeDigestNudge.mockReturnValue({
    subject: "You have unread activity",
    text: "Sign in at http://localhost:3000/sign-in to view.",
  });
});

afterEach(() => {
  // Restore any env stubs set by individual tests.
  vi.unstubAllEnvs();
});

// ─── #5: No-PII logging regression ───────────────────────────────────────────

describe(
  "dispatchDailyDigest — #5: no-PII logging regression (CS-GEN-001 / ADR-025 §4 / ADR-017)",
  () => {
    it(
      "[#5][CS-GEN-001] a send failure must log NO recipient email or PII " +
        "in any console.error argument (SMTP rejection msg contains email)",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // A recipient whose email address appears inside the simulated SMTP
        // rejection error message — exactly what a real SMTP relay returns.
        // If the catch block logs err.message, this email reaches the logs (PII egress).
        const RECIPIENT_EMAIL = "pii-victim-hardening@unit-test.example.com";
        recipientsContainer.value = [
          { userId: "victim-user-unit-id", email: RECIPIENT_EMAIL, role: "CLIENT" },
        ];

        // Provider that throws a simulated SMTP rejection embedding the email (PII).
        // This mirrors real SMTP relay behavior (e.g. "550 5.1.1 <user@…>…").
        const smtpLikeError = new Error(
          `550 5.1.1 <${RECIPIENT_EMAIL}> Mailbox does not exist or access denied`,
        );
        const failingProvider: EmailProvider = {
          fromAddress: "from@example.com",
          async send(_msg: EmailMessage): Promise<SentEmail> {
            throw smtpLikeError;
          },
        };

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        try {
          // ── WHEN ──────────────────────────────────────────────────────────
          await dispatchDailyDigest({
            now: new Date("2100-06-01T00:00:00.000Z"),
            emailProvider: failingProvider,
          });

          // ── THEN ──────────────────────────────────────────────────────────
          // The catch block MUST have fired (send() threw).
          expect(
            consoleSpy,
            "[#5] console.error must be called at least once when send() throws",
          ).toHaveBeenCalled();

          // Verify NO call arg contains the recipient email.
          // CS-GEN-001: no PII (recipient email, address, identity) in any log argument.
          // ADR-025 §4: no message body or recipient identity in catch-block logging.
          // ADR-017: no PII in the transport/log layer.
          for (const call of consoleSpy.mock.calls) {
            for (const arg of call) {
              const argStr =
                typeof arg === "string" ? arg : String(arg ?? "");
              expect(
                argStr,
                `[#5][CS-GEN-001] console.error arg must NOT contain recipient email "${RECIPIENT_EMAIL}" — ` +
                  `PII egress via err.message is prohibited (ADR-025 §4 / ADR-017)`,
              ).not.toContain(RECIPIENT_EMAIL);
            }
          }

          // Also assert: the logged message uses the stable category string.
          const firstCallArgs = consoleSpy.mock.calls[0] ?? [];
          const firstArg = firstCallArgs[0] ?? "";
          expect(
            firstArg,
            "[#5] catch-block log must use the stable category string",
          ).toContain("[email-digest] one recipient send failed");
          expect(
            firstArg,
            "[#5] category log must reference ADR-025 §4",
          ).toContain("ADR-025 §4");

          // The second arg is the error class name (not err.message).
          const secondArg = firstCallArgs[1] ?? "";
          expect(
            String(secondArg),
            "[#5] second arg must NOT contain the SMTP rejection body",
          ).not.toContain("Mailbox does not exist");
          expect(
            String(secondArg),
            "[#5] second arg must NOT contain the recipient email address",
          ).not.toContain(RECIPIENT_EMAIL);
        } finally {
          consoleSpy.mockRestore();
        }
      },
    );
  },
);

// ─── #2: Double-send regression (AC-MSG-009-01) ──────────────────────────────

describe(
  "dispatchDailyDigest — #2: double-send regression (AC-MSG-009-01 / DECISION-018-003-A)",
  () => {
    it(
      "[#2][AC-MSG-009-01] send succeeds but recordNudgeSent throws: " +
        "sentCount is incremented (send credited), watermark failure logged distinctly, " +
        "and the send-failure log is NOT triggered",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // One recipient. emailProvider.send() succeeds. recordNudgeSent() (the
        // UPDATE watermark write, i.e. the 2nd SQL query) throws.
        // The old single-catch pattern would NOT increment sentCount and would leave
        // the recipient eligible for a same-day double-send. The fixed two-phase
        // try/catch MUST increment sentCount even when the watermark write fails.
        recipientsContainer.value = [
          { userId: "double-send-test-user", email: "double-send@unit-test.example.com", role: "CLIENT" },
        ];

        // Provider that succeeds — the watermark write (SQL UPDATE) is what fails.
        const successProvider: EmailProvider = {
          fromAddress: "from@example.com",
          send: vi.fn().mockResolvedValue({ id: "sent-ok-1" } satisfies SentEmail),
        };

        // Make the second query call (recordNudgeSent's UPDATE) throw.
        // The first call is getDigestRecipients's SELECT → returns recipients.
        // The second call is recordNudgeSent's UPDATE → throws.
        queryState.throwAfter = 1; // throw after the 1st call (i.e., on the 2nd call)

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        // ── WHEN ──────────────────────────────────────────────────────────
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-10T00:00:00.000Z"),
          emailProvider: successProvider,
        });

        // ── THEN ──────────────────────────────────────────────────────────

        // [AC-MSG-009-01] The send succeeded → sentCount must be incremented.
        // The old code would NOT increment sentCount because both send and recordNudgeSent
        // were in the same try block — if recordNudgeSent threw, the catch reset sentCount.
        expect(
          result.sentCount,
          "[#2][AC-MSG-009-01] sentCount must be 1 — the send succeeded even if watermark write failed",
        ).toBe(1);

        // The email was sent — verify send() was called.
        expect(
          (successProvider.send as ReturnType<typeof vi.fn>),
          "[#2] emailProvider.send() must have been called once",
        ).toHaveBeenCalledTimes(1);

        // The watermark failure must be logged with a DISTINCT message (not the send-failure message).
        const allCalls = consoleSpy.mock.calls;
        expect(
          allCalls.length,
          "[#2] exactly one console.error call expected (the watermark failure)",
        ).toBe(1);

        const firstCallFirstArg = String(allCalls[0]?.[0] ?? "");

        // The log must use the WATERMARK-FAILURE category string (distinct from send failure).
        expect(
          firstCallFirstArg,
          "[#2] watermark-failure log must mention 'watermark write failed after successful send'",
        ).toContain("watermark write failed after successful send");

        // The log must NOT use the SEND-FAILURE string (the send succeeded).
        expect(
          firstCallFirstArg,
          "[#2] watermark-failure log must NOT contain the send-failure category string",
        ).not.toContain("one recipient send failed");

        consoleSpy.mockRestore();
      },
    );
  },
);

// ─── #emailProvider-DI: plain DI parameter, always honored ───────────────────

describe(
  "dispatchDailyDigest — emailProvider is always honored when provided (no NODE_ENV gate)",
  () => {
    it(
      "emailProvider opt is used when provided — getEmailProvider() is NOT called",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        recipientsContainer.value = [
          { userId: "di-test-user", email: "di@unit-test.example.com", role: "CLIENT" },
        ];

        // The provider returned by getEmailProvider() — must NOT be called.
        const defaultProvider: EmailProvider = {
          fromAddress: "default@example.com",
          send: vi.fn().mockResolvedValue({ id: "default-1" } satisfies SentEmail),
        };
        mockGetEmailProvider.mockReturnValue(defaultProvider);

        // Injected provider — must BE called.
        const injectedProvider: EmailProvider = {
          fromAddress: "injected@example.com",
          send: vi.fn().mockResolvedValue({ id: "injected-1" } satisfies SentEmail),
        };

        // ── WHEN ──────────────────────────────────────────────────────────
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-20T00:00:00.000Z"),
          emailProvider: injectedProvider,
        });

        // ── THEN ──────────────────────────────────────────────────────────
        // Injected provider MUST be called.
        expect(
          (injectedProvider.send as ReturnType<typeof vi.fn>),
          "emailProvider.send() MUST be called when emailProvider is provided",
        ).toHaveBeenCalledTimes(1);

        // Default provider (getEmailProvider()) must NOT be called.
        expect(
          (defaultProvider.send as ReturnType<typeof vi.fn>),
          "getEmailProvider() result must NOT be called when emailProvider is injected",
        ).not.toHaveBeenCalled();

        expect(result.sentCount, "sentCount must be 1").toBe(1);
      },
    );

    it(
      "when emailProvider is absent, getEmailProvider() default is used",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        recipientsContainer.value = [
          { userId: "default-di-user", email: "default-di@unit-test.example.com", role: "CLIENT" },
        ];

        const defaultProvider: EmailProvider = {
          fromAddress: "default@example.com",
          send: vi.fn().mockResolvedValue({ id: "default-2" } satisfies SentEmail),
        };
        mockGetEmailProvider.mockReturnValue(defaultProvider);

        // ── WHEN ── (no emailProvider in opts)
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-21T00:00:00.000Z"),
        });

        // ── THEN ──────────────────────────────────────────────────────────
        expect(
          (defaultProvider.send as ReturnType<typeof vi.fn>),
          "getEmailProvider() result MUST be used when emailProvider is not provided",
        ).toHaveBeenCalledTimes(1);

        expect(result.sentCount, "sentCount must be 1").toBe(1);
      },
    );
  },
);

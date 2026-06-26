/**
 * packages/db/src/repositories/email-digest.hardening.test.ts
 *
 * UNIT TESTS — no SQL Server required (all DB dependencies mocked).
 *
 * Regression tests for TASK-018-008 gated-path hardening:
 *
 *   #5 — CS-GEN-001 / ADR-025 §4 / ADR-017 no-PII logging fix:
 *     A send failure must NOT log err.message (SMTP rejections embed the recipient
 *     email, e.g. "550 5.1.1 <user@example.com>…"). The catch block logs only a
 *     stable category string + the error class name. Regression test spies on
 *     console.error and asserts no recipient email or PII appears in any arg.
 *
 *   #4 — Production-safety seam gating:
 *     _emailProvider and _userIdFilter opts are honored ONLY when NODE_ENV === 'test'.
 *     When NODE_ENV !== 'test', both seams are provably inert: getEmailProvider() is
 *     always called (never the injected _emailProvider) and all eligible recipients
 *     are dispatched (never narrowed by _userIdFilter). Regression tests use
 *     vi.stubEnv('NODE_ENV', 'production') to prove the inert path.
 *
 * Methodology: unit, mocked-dependency. Vitest vi.hoisted() + vi.mock() pattern.
 *
 * // CS-GEN-001: no PII in log args — the hard constraint these tests enforce. // CS-GEN-001
 * // ADR-025 §4: no body/PII logging in the catch block. // ADR-025
 * // ADR-017: no PII in transport/log layer. // ADR-017
 * // CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * // TASK-018-008: hardening fixes #5 and #4. // TASK-018-008
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
 */
const { recipientsContainer, mockGetAdminPool, mockGetEmailProvider, mockComposeDigestNudge } =
  vi.hoisted(() => ({
    recipientsContainer: {
      value: [] as Array<{ userId: string; email: string; role: string }>,
    },
    mockGetAdminPool: vi.fn(),
    mockGetEmailProvider: vi.fn(),
    mockComposeDigestNudge: vi.fn(),
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
 * recordNudgeSent's UPDATE query ignores the return value, so returning
 * { recordset: recipientsContainer.value } for ALL queries is safe.
 *
 * // CS-TS-002: mssql is an internal implementation detail of packages/db. // CS-TS-002
 */
vi.mock("mssql", () => {
  function StubRequest(
    this: { input: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> },
    _pool: unknown,
  ) {
    this.input = vi.fn().mockReturnThis();
    // Reads recipientsContainer.value at call time — configurable per test.
    this.query = vi.fn().mockImplementation(() =>
      Promise.resolve({ recordset: recipientsContainer.value }),
    );
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
  // Restore any NODE_ENV stubs set by individual tests.
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

        // With NODE_ENV='test' (vitest default), the seam IS active — injected provider is used.
        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        try {
          // ── WHEN ──────────────────────────────────────────────────────────
          await dispatchDailyDigest({
            now: new Date("2100-06-01T00:00:00.000Z"),
            _emailProvider: failingProvider,
            _userIdFilter: new Set(["victim-user-unit-id"]),
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

// ─── #4: Seam gating — provably inert when NODE_ENV !== 'test' ───────────────

describe(
  "dispatchDailyDigest — #4: test seams inert when NODE_ENV !== 'test' (TASK-018-008)",
  () => {
    it(
      "[#4] _emailProvider opt is ignored when NODE_ENV is not 'test' — " +
        "getEmailProvider() is always called instead",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // Override NODE_ENV to 'production' — seams must be inert.
        vi.stubEnv("NODE_ENV", "production");

        recipientsContainer.value = [
          { userId: "seam-test-user-prod", email: "seam@unit-test.example.com", role: "CLIENT" },
        ];

        // The provider returned by getEmailProvider() (the real path in production).
        const realProvider: EmailProvider = {
          fromAddress: "real@example.com",
          send: vi.fn().mockResolvedValue({ id: "real-send-1" } satisfies SentEmail),
        };
        mockGetEmailProvider.mockReturnValue(realProvider);

        // Alternative provider passed as the _emailProvider opt — must be IGNORED.
        const altProvider: EmailProvider = {
          fromAddress: "alt@example.com",
          send: vi.fn().mockResolvedValue({ id: "alt-send-1" } satisfies SentEmail),
        };

        // ── WHEN ──────────────────────────────────────────────────────────
        // Call with _emailProvider injected — seam must be inactive in production.
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-02T00:00:00.000Z"),
          _emailProvider: altProvider,
        });

        // ── THEN ──────────────────────────────────────────────────────────
        // altProvider.send must NOT have been called — seam inactive.
        expect(
          (altProvider.send as ReturnType<typeof vi.fn>),
          "[#4] injected _emailProvider.send must NOT be called when NODE_ENV !== 'test' — " +
            "seam must be inert in production",
        ).not.toHaveBeenCalled();

        // realProvider.send (from getEmailProvider()) MUST have been called.
        expect(
          (realProvider.send as ReturnType<typeof vi.fn>),
          "[#4] getEmailProvider() result must be called — production path must use real provider",
        ).toHaveBeenCalledTimes(1);

        // sentCount reflects the real dispatch (not zero from a filtered-out empty set).
        expect(
          result.sentCount,
          "[#4] sentCount must be 1 — recipient was dispatched via real provider",
        ).toBe(1);
      },
    );

    it(
      "[#4] _userIdFilter opt is ignored when NODE_ENV is not 'test' — " +
        "all eligible recipients are dispatched regardless of the filter",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // Override NODE_ENV to 'production' — seams must be inert.
        vi.stubEnv("NODE_ENV", "production");

        const recipients = [
          { userId: "user-seam-prod-1", email: "user1@unit-test.example.com", role: "CLIENT" },
          { userId: "user-seam-prod-2", email: "user2@unit-test.example.com", role: "CLIENT" },
        ];
        recipientsContainer.value = [...recipients];

        const realProvider: EmailProvider = {
          fromAddress: "real@example.com",
          send: vi.fn().mockResolvedValue({ id: "real-send-2" } satisfies SentEmail),
        };
        mockGetEmailProvider.mockReturnValue(realProvider);

        // Empty filter: in test mode this would exclude ALL recipients (sentCount = 0).
        // In production mode the filter is ignored — all recipients must be dispatched.
        const emptyFilter = new Set<string>();

        // ── WHEN ──────────────────────────────────────────────────────────
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-03T00:00:00.000Z"),
          _userIdFilter: emptyFilter,
        });

        // ── THEN ──────────────────────────────────────────────────────────
        // Both recipients must have been dispatched (filter was ignored).
        expect(
          (realProvider.send as ReturnType<typeof vi.fn>),
          "[#4] _userIdFilter ignored in production — BOTH recipients must be dispatched",
        ).toHaveBeenCalledTimes(2);

        expect(
          result.sentCount,
          "[#4] sentCount must be 2 — all eligible recipients dispatched when seam inactive",
        ).toBe(2);
      },
    );

    it(
      "[#4] control: _emailProvider IS honored when NODE_ENV is 'test' (seam active)",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // NODE_ENV defaults to 'test' in Vitest — seam must be active.
        // (No vi.stubEnv here — using the real Vitest NODE_ENV.)
        expect(process.env["NODE_ENV"]).toBe("test"); // self-documenting guard

        recipientsContainer.value = [
          { userId: "seam-control-user", email: "control@unit-test.example.com", role: "CLIENT" },
        ];

        // The "real" provider returned by getEmailProvider() — must NOT be called.
        const realProvider: EmailProvider = {
          fromAddress: "real@example.com",
          send: vi.fn().mockResolvedValue({ id: "real-send-ctrl" } satisfies SentEmail),
        };
        mockGetEmailProvider.mockReturnValue(realProvider);

        // Injected provider — must BE called because NODE_ENV is 'test'.
        const injectedProvider: EmailProvider = {
          fromAddress: "injected@example.com",
          send: vi.fn().mockResolvedValue({ id: "injected-send-1" } satisfies SentEmail),
        };

        // ── WHEN ──────────────────────────────────────────────────────────
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-04T00:00:00.000Z"),
          _emailProvider: injectedProvider,
        });

        // ── THEN ──────────────────────────────────────────────────────────
        // injectedProvider.send must have been called — seam active in test.
        expect(
          (injectedProvider.send as ReturnType<typeof vi.fn>),
          "[#4 control] injected _emailProvider.send MUST be called when NODE_ENV === 'test'",
        ).toHaveBeenCalledTimes(1);

        // realProvider.send must NOT have been called (seam bypasses getEmailProvider()).
        expect(
          (realProvider.send as ReturnType<typeof vi.fn>),
          "[#4 control] getEmailProvider() result must NOT be called when seam is active",
        ).not.toHaveBeenCalled();

        expect(result.sentCount, "[#4 control] sentCount must be 1").toBe(1);
      },
    );

    it(
      "[#4] control: _userIdFilter IS honored when NODE_ENV is 'test' (seam active)",
      async () => {
        // ── GIVEN ─────────────────────────────────────────────────────────
        // NODE_ENV is 'test' — seam active; empty filter should exclude all.
        expect(process.env["NODE_ENV"]).toBe("test");

        recipientsContainer.value = [
          { userId: "user-ctrl-1", email: "ctrl1@unit-test.example.com", role: "CLIENT" },
          { userId: "user-ctrl-2", email: "ctrl2@unit-test.example.com", role: "CLIENT" },
        ];

        const realProvider: EmailProvider = {
          fromAddress: "real@example.com",
          send: vi.fn().mockResolvedValue({ id: "real-send-ctrl2" } satisfies SentEmail),
        };
        mockGetEmailProvider.mockReturnValue(realProvider);

        const emptyFilter = new Set<string>();

        // ── WHEN ──────────────────────────────────────────────────────────
        const result = await dispatchDailyDigest({
          now: new Date("2100-06-05T00:00:00.000Z"),
          _userIdFilter: emptyFilter,
        });

        // ── THEN ──────────────────────────────────────────────────────────
        // Empty filter active in test mode — zero sends.
        expect(
          (realProvider.send as ReturnType<typeof vi.fn>),
          "[#4 control] _userIdFilter IS honored in test — empty set means zero sends",
        ).not.toHaveBeenCalled();

        expect(
          result.sentCount,
          "[#4 control] sentCount must be 0 when filter excludes all recipients",
        ).toBe(0);
      },
    );
  },
);

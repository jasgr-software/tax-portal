/**
 * packages/email/src/select.ts — Env-driven email binding selector
 *
 * Selects exactly ONE active EmailProvider binding based on the EMAIL_PROVIDER
 * environment variable. Exactly one binding is active per process.
 *
 * EMAIL_PROVIDER values:
 *   "smtp"   (default) — SmtpEmailProvider: local dev + e2e (Mailhog on :1025)
 *   "mock"             — MockEmailProvider: unit tests (in-memory capture)
 *   "resend"           — ResendEmailProvider: deferred production drop-in
 *                        (throws if RESEND_API_KEY is absent)
 *
 * Apps consume `getEmailProvider()` and depend on the EmailProvider port —
 * never on a concrete binding class. This is the seam that makes the later
 * "swap SMTP → Resend" a single-line env change (or drop-in when the ADR lands).
 *
 * Security: fail-closed.
 *   - An unknown EMAIL_PROVIDER value throws at startup rather than falling back.
 *   - EMAIL_PROVIDER=resend without RESEND_API_KEY throws at selection time
 *     (the ResendEmailProvider constructor throws EmailBindingNotAvailableError).
 *
 * Singleton: the provider instance is created once and cached for the process
 * lifetime (Next.js long-lived Node.js process).
 *
 * OQ-002: this seam mirrors the auth/storage precedents (ADR-001/ADR-008).
 * The IO proceeds on the proposed default; the architecture agent may replace
 * the Resend stub when ratifying the email-transport ADR.
 */

import type { EmailProvider } from "./port.js";
import { MockEmailProvider } from "./bindings/mock.js";
import { SmtpEmailProvider } from "./bindings/smtp.js";
import { ResendEmailProvider } from "./bindings/resend.js";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _provider: EmailProvider | null = null;

/**
 * Returns the active EmailProvider singleton for this process.
 * Reads EMAIL_PROVIDER once and caches the result.
 *
 * @returns The active EmailProvider (smtp, mock, or resend).
 */
export function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;
  _provider = createEmailProvider();
  return _provider;
}

/**
 * Create a new EmailProvider instance based on the current EMAIL_PROVIDER env.
 * Called once per process (singleton above). Exported for testing (reset via
 * resetEmailProviderForTesting).
 */
export function createEmailProvider(): EmailProvider {
  const rawProvider = process.env["EMAIL_PROVIDER"];
  // Default to "smtp" for local dev + e2e (Mailhog). "mock" for unit tests.
  const provider = (rawProvider ?? "smtp").toLowerCase();

  switch (provider) {
    case "smtp":
      return new SmtpEmailProvider();
    case "mock":
      return new MockEmailProvider();
    case "resend":
      // ResendEmailProvider constructor throws EmailBindingNotAvailableError
      // if RESEND_API_KEY is absent — fail-closed at selection time.
      return new ResendEmailProvider();
    default:
      // Unknown binding: throw instead of silently falling back.
      // A typo'd EMAIL_PROVIDER value should be caught at startup.
      throw new Error(
        `[packages/email] Unknown EMAIL_PROVIDER="${rawProvider}". ` +
          `Valid values: "smtp" (local/e2e default), "mock" (unit tests), "resend" (production). ` +
          `Fix the EMAIL_PROVIDER env var and restart the process.`,
      );
  }
}

/**
 * Reset the cached provider (for testing only).
 * Call this in test teardown when you need to re-read EMAIL_PROVIDER.
 *
 * @internal — test use only. Do not call in production code.
 */
export function resetEmailProviderForTesting(): void {
  _provider = null;
}

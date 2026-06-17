/**
 * packages/email/src/bindings/resend.ts — Resend email binding (deferred production drop-in)
 *
 * ADR analogue to ClerkAuthProvider (packages/auth/src/bindings/clerk.ts):
 * the class compiles and satisfies the EmailProvider port, but throws
 * `EmailBindingNotAvailableError` if selected without `RESEND_API_KEY`.
 *
 * OQ-002: the concrete production email provider is an architectural decision
 * raised upstream. Resend is the IO's proposed default; the architecture agent
 * may replace this stub with a different provider when ratifying the
 * email-transport ADR. This stub keeps the seam clean in the interim.
 *
 * When TASK-003-XXX (or the architecture ADR) wires the real Resend SDK, this
 * file is replaced with the real implementation — no call-site change required
 * (callers import only from `@tax-portal/email` barrel or via `getEmailProvider()`).
 *
 * Security: EMAIL_PROVIDER=resend without RESEND_API_KEY throws at selection time
 * (fail-closed), not silently falling back to SMTP or mock.
 */

import type { EmailMessage, EmailProvider, SentEmail } from "../port.js";

// ─── ResendEmailProvider ──────────────────────────────────────────────────────

/**
 * ResendEmailProvider — deferred production binding.
 *
 * Throws `EmailBindingNotAvailableError` when `RESEND_API_KEY` is absent.
 * The selector (`src/select.ts`) guards this at selection time — so you get a
 * clear startup error rather than a runtime failure on first send.
 *
 * CURRENT STATUS: Stub. Replace with real Resend SDK integration when the
 * email-transport ADR is ratified (see OQ-002).
 */
export class ResendEmailProvider implements EmailProvider {
  readonly fromAddress: string;

  constructor(fromAddress?: string) {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      throw new EmailBindingNotAvailableError();
    }
    this.fromAddress =
      fromAddress ??
      process.env["EMAIL_FROM"] ??
      "noreply@tax-portal.dev";
    // Store apiKey reference for future implementation.
    // DECISION (TASK-003-002): prefix with _ to signal intentionally-unused field
    // until the real Resend SDK call lands.
    void apiKey; // suppress lint: used at construction to validate presence
  }

  async send(_message: EmailMessage): Promise<SentEmail> {
    // DECISION (TASK-003-002): real Resend implementation deferred.
    // When the email-transport ADR lands, replace this with:
    //   const resend = new Resend(process.env["RESEND_API_KEY"]);
    //   const { data, error } = await resend.emails.send({ from, to, subject, text, html });
    //   if (error) throw new Error(`[ResendEmailProvider] Resend API error: ${error.message}`);
    //   return { id: data.id };
    throw new EmailBindingNotAvailableError();
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the Resend binding is selected without `RESEND_API_KEY` configured,
 * or when the stub's `send()` is called before the real SDK is wired.
 *
 * Mirrors `ClerkBindingNotAvailableError` in packages/auth.
 *
 * If you see this error in tests or local dev, set EMAIL_PROVIDER=smtp (or mock)
 * and ensure SMTP_HOST / SMTP_PORT point at the Mailhog catcher.
 * In production, set RESEND_API_KEY (and EMAIL_FROM) in the environment.
 */
export class EmailBindingNotAvailableError extends Error {
  constructor() {
    super(
      `[ResendEmailProvider] Resend binding is not fully wired yet. ` +
        `Set EMAIL_PROVIDER=smtp for local dev and e2e, EMAIL_PROVIDER=mock for unit tests. ` +
        `To activate the Resend binding, set RESEND_API_KEY in the environment. ` +
        `The Resend binding is the deferred production target — do not call it before ` +
        `the real Resend SDK integration lands (see OQ-002).`,
    );
    this.name = "EmailBindingNotAvailableError";
  }
}

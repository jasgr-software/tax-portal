/**
 * packages/email/src/port.ts — Email Provider Port Interface
 *
 * Defines the contract all email bindings (mock, SMTP, Resend) must satisfy.
 * Apps import from this port — never from a concrete binding.
 *
 * REQ-NFR-008: reliable transactional email delivery.
 * OQ-002: provider-abstracted seam mirroring the auth/storage precedents
 *         (ADR-001, ADR-008). No single provider is mandated; local/e2e uses
 *         the SMTP binding pointed at the Mailhog catcher in docker-compose.
 *
 * // DECISION (TASK-003-002): Standalone `packages/email` chosen (not a sub-path
 * // of an existing package) for parity with `packages/auth` structure — each
 * // cross-cutting transport has its own package so the seam boundary is clear
 * // and the barrel discipline (no test-reset exports) can be enforced per package.
 */

// ─── Security helpers ─────────────────────────────────────────────────────────

/**
 * Sanitise a single header field value by stripping CRLF characters.
 *
 * OWASP email header injection: an attacker who controls `to` or `subject`
 * could inject additional headers (e.g. `Bcc:`, `From:`) by embedding CR/LF.
 * This function strips those characters before the value reaches the mailer.
 *
 * Applied to: `to`, `subject`, and `from` (the three header-injectable fields).
 *
 * DECISION (TASK-003-002): Strip (not reject) for graceful handling; caller
 * receives the sanitised value. If the caller needs to detect injection, it can
 * compare the sanitised value against the original.
 */
export function stripHeaderInjection(value: string): string {
  // Remove any CR (\r) and LF (\n) characters.
  // eslint-disable-next-line no-control-regex
  const sanitised = value.replace(/[\r\n]/g, "");
  if (sanitised !== value) {
    throw new EmailHeaderInjectionError(value);
  }
  return sanitised;
}

/**
 * Thrown when a header field value contains CRLF characters (email header injection attempt).
 * OWASP: https://owasp.org/www-community/attacks/Email_Header_Injection
 */
export class EmailHeaderInjectionError extends Error {
  constructor(field: string) {
    // Do not include the raw value in the message — it may contain CR/LF that
    // corrupts log lines or leaks attacker-controlled data.
    super(
      `[packages/email] Email header injection attempt detected: field value contains CR/LF characters. ` +
        `Value length: ${field.length}. Refusing to send.`,
    );
    this.name = "EmailHeaderInjectionError";
  }
}

// ─── Email Message ────────────────────────────────────────────────────────────

/**
 * The message payload passed to `EmailProvider.send()`.
 *
 * Minimal by design — sufficient for the acceptance invitation and decline-reason
 * emails (EPIC-003 scope). Templating and HTML are optional; `text` is required.
 *
 * OQ-002 note: richer templating (HTML layout, per-flow templates) is left to
 * the architecture agent's email-transport ADR. This port stays minimal.
 */
export interface EmailMessage {
  /** Recipient email address. CRLF-stripped before send. */
  to: string;
  /** Email subject line. CRLF-stripped before send. */
  subject: string;
  /** Plain-text body (required). */
  text: string;
  /** Optional HTML body. Not sanitised here — caller is responsible. */
  html?: string;
}

// ─── Sent Email ───────────────────────────────────────────────────────────────

/**
 * Minimal result returned by `EmailProvider.send()`.
 * `id` is an opaque message ID supplied by the binding (message-ID for SMTP,
 * Resend message ID for the Resend binding, or a UUID for the mock).
 */
export interface SentEmail {
  /** Opaque message identifier from the underlying provider. */
  id: string;
}

// ─── EmailProvider Port ───────────────────────────────────────────────────────

/**
 * EmailProvider — the single interface all email bindings must implement.
 *
 * All three bindings (MockEmailProvider, SmtpEmailProvider, ResendEmailProvider)
 * satisfy this interface. `src/select.ts` picks the active binding via EMAIL_PROVIDER.
 *
 * Security contract:
 * - Implementations MUST apply `stripHeaderInjection()` to `to`, `subject`, and any
 *   `from` field before passing them to the underlying transport.
 * - Implementations MUST fail-closed when the underlying transport is misconfigured
 *   (throw rather than silently swallowing errors).
 * - Implementations MUST NOT log full message bodies (potential PII).
 */
export interface EmailProvider {
  /**
   * Send a transactional email.
   *
   * @param message - The message to send. `to` and `subject` are header-injectable
   *   fields; bindings apply `stripHeaderInjection()` before transport.
   * @returns A `SentEmail` with the provider-assigned message ID.
   * @throws `EmailHeaderInjectionError` if `to` or `subject` contains CR/LF.
   * @throws Provider-specific errors if the underlying transport fails.
   */
  send(message: EmailMessage): Promise<SentEmail>;

  /**
   * The `from` address used for outbound email (read from EMAIL_FROM env or binding default).
   * Exposed so callers can log it without knowing the binding in use.
   */
  readonly fromAddress: string;
}

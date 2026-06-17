/**
 * packages/email/src/bindings/smtp.ts — SMTP email binding (nodemailer)
 *
 * The local/e2e binding. Points at the Mailhog SMTP catcher already present in
 * docker-compose.yml (SMTP_HOST default `localhost`, SMTP_PORT default `1025` —
 * the Mailhog SMTP port exposed on the host).
 *
 * REQ-NFR-008: outbound transactional email for local dev + e2e.
 * OQ-002: SMTP binding to the local Mailhog catcher is the dev/e2e default; the
 *         production provider (Resend) is a deferred drop-in.
 *
 * Security:
 * - `stripHeaderInjection()` applied to `to`, `subject`, and `from` before send.
 * - No credentials stored in code. SMTP_HOST / SMTP_PORT come from env (safe defaults).
 * - Fail-closed: if `createTransport()` or `sendMail()` throws, the error surfaces.
 */

import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailProvider, SentEmail } from "../port.js";
import { stripHeaderInjection } from "../port.js";

// ─── Transport singleton ──────────────────────────────────────────────────────

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  const host = process.env["SMTP_HOST"] ?? "localhost";
  const port = parseInt(process.env["SMTP_PORT"] ?? "1025", 10);

  // No auth for Mailhog (it accepts all connections without credentials).
  // For a production SMTP relay that requires auth, the production drop-in
  // (ResendEmailProvider or a future authenticated SMTP binding) handles it.
  // This binding is intentionally auth-free — Mailhog only.
  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // Mailhog does not use TLS
    auth: undefined,
    // Fail fast: if the connection cannot be established, surface the error
    // immediately rather than queuing and silently dropping messages.
    tls: {
      rejectUnauthorized: false, // Mailhog has a self-signed cert in some configs
    },
  });

  return _transporter;
}

/**
 * Reset the cached transporter (for testing only — allows env changes to take effect).
 *
 * @internal — test use only. NOT exported from the barrel.
 * Import directly from this binding file in tests.
 */
export function resetSmtpTransporterForTesting(): void {
  _transporter = null;
}

// ─── SmtpEmailProvider ────────────────────────────────────────────────────────

/**
 * SmtpEmailProvider — nodemailer SMTP binding.
 *
 * Local dev and e2e default. Configured via:
 *   EMAIL_FROM   — sender address (required; falls back to a dev default)
 *   SMTP_HOST    — SMTP server host (default: "localhost")
 *   SMTP_PORT    — SMTP server port (default: 1025 — Mailhog)
 *
 * Security: applies `stripHeaderInjection()` to `to`, `subject`, and `from`.
 *
 * Fail-closed: any transport error propagates to the caller. The caller is
 * responsible for deciding whether to retry or surface the error to the user.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly fromAddress: string;

  constructor(fromAddress?: string) {
    this.fromAddress =
      fromAddress ??
      process.env["EMAIL_FROM"] ??
      "noreply@tax-portal.dev";
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    // Security: strip CRLF from header-injectable fields before transport.
    const to = stripHeaderInjection(message.to);
    const subject = stripHeaderInjection(message.subject);
    const from = stripHeaderInjection(this.fromAddress);

    const transporter = getTransporter();

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });

    // nodemailer returns a messageId on success. Use it as the SentEmail id.
    // The messageId may be undefined in some edge-case transporter configs —
    // fall back to a timestamp-based ID rather than throwing.
    const id =
      (info as { messageId?: string }).messageId ??
      `smtp-${Date.now()}`;

    return { id };
  }
}

/**
 * apps/portal/e2e/fixtures/mailhog.ts — Mailhog HTTP API helper for e2e email assertions
 *
 * Mirrors apps/admin/e2e/fixtures/mailhog.ts (CS-TS-003: shared pattern for both surfaces).
 *
 * BRIEF-018 / TASK-018-005: Email assertions for the nudge→sign-in journey and the
 * client-default-on journey. Proves real delivered mail via Mailhog against SMTP.
 *
 * Mailhog API:
 *   GET  /api/v2/messages               — list messages (JSON; items[].Content.Headers/Body)
 *   GET  /api/v1/messages               — v1 endpoint (same, slightly different shape)
 *   DELETE /api/v1/messages             — delete all messages (clear between tests)
 *
 * Port mapping:
 *   Default docker-compose: host 18025 → container 8025 (see docker-compose.yml)
 *   Override via MAILHOG_HTTP_URL env var (e.g. http://localhost:18025)
 *
 * ADR-012 / REQ-MSG-008: Proves email actually leaves the app and enters the SMTP catcher.
 * ADR-023: SMTP → Mailhog for dev/e2e; no real ESP key wired.
 * CS-TS-003: This fixture mirrors apps/admin/e2e/fixtures/mailhog.ts exactly.
 *
 * Usage:
 *   import { clearMailhog, waitForEmail, getSubject, getBody, type MailhogMessage }
 *     from '../fixtures/mailhog.js';
 *
 *   await clearMailhog();
 *   // ... trigger email send ...
 *   const msg = await waitForEmail({ to: 'client@example.com' });
 *   expect(getSubject(msg)).toContain('new activity');
 *
 * // ADR-012 // ADR-023 // REQ-MSG-008 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

// ─── Configuration ─────────────────────────────────────────────────────────────

// Default: Mailhog HTTP API on host port 18025 (docker-compose MAILHOG_HTTP_PORT=18025 → :8025)
// Override MAILHOG_HTTP_URL for non-default port mappings.
const MAILHOG_HTTP_PORT_ENV = process.env["MAILHOG_HTTP_PORT"] ?? "18025";
const MAILHOG_HTTP_URL =
  process.env["MAILHOG_HTTP_URL"] ?? `http://localhost:${MAILHOG_HTTP_PORT_ENV}`;

// ─── Mailhog message shape (v2 API) ───────────────────────────────────────────

export interface MailhogAddress {
  Relays: null | string[];
  Mailbox: string;
  Domain: string;
  Params: string;
}

export interface MailhogContent {
  Headers: Record<string, string[]>;
  Body: string;
  Size: number;
  MIME: unknown;
}

export interface MailhogMessage {
  ID: string;
  From: MailhogAddress;
  To: MailhogAddress[];
  Content: MailhogContent;
  Created: string;
  MIME: unknown;
  Raw: { From: string; To: string[]; Data: string; Helo: string };
}

export interface MailhogV2Response {
  total: number;
  count: number;
  start: number;
  items: MailhogMessage[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch all messages currently in Mailhog.
 * Returns them newest-first (Mailhog default).
 */
export async function fetchMessages(): Promise<MailhogMessage[]> {
  const res = await fetch(`${MAILHOG_HTTP_URL}/api/v2/messages?limit=50`);
  if (!res.ok) {
    throw new Error(
      `[mailhog fixture] GET /api/v2/messages returned ${res.status} ${res.statusText}. ` +
        `Is Mailhog running at ${MAILHOG_HTTP_URL}?`,
    );
  }
  const body = (await res.json()) as MailhogV2Response;
  return body.items;
}

/**
 * Clear all messages from Mailhog.
 * Call this before each e2e test that asserts email delivery to avoid cross-test bleed.
 *
 * AC-MSG-008-01 / AC-MSG-011-02: clears so the assertion is on the specific message
 * sent by the current test run, not a leftover from a prior run.
 *
 * // AC-MSG-008-01 // AC-MSG-011-02 // CS-TS-003
 */
export async function clearMailhog(): Promise<void> {
  const res = await fetch(`${MAILHOG_HTTP_URL}/api/v1/messages`, {
    method: "DELETE",
  });
  if (!res.ok) {
    // Mailhog may return 200 even when there are no messages; 4xx is a problem.
    // Log a warning but don't throw — clearing is defensive cleanup, not a hard requirement.
    console.warn(
      `[mailhog fixture] DELETE /api/v1/messages returned ${res.status} — ` +
        `cross-test bleed may occur if messages were not cleared.`,
    );
  }
}

// ─── Message lookup ─────────────────────────────────────────────────────────────

export interface WaitForEmailOptions {
  /** Recipient email address to match (case-insensitive) */
  to: string;
  /** Subject substring to match (case-insensitive, optional) */
  subjectContains?: string;
  /** Body substring to match (case-insensitive, optional) */
  bodyContains?: string;
  /** Poll interval in ms (default 500) */
  intervalMs?: number;
  /** Max wait in ms (default 10000) */
  timeoutMs?: number;
}

/**
 * Poll Mailhog until a message matching the given criteria arrives.
 * Throws if no message arrives within the timeout.
 *
 * AC-MSG-008-01: Nudge email to the client's registered email address.
 * AC-MSG-011-02: Proves email actually left the app and was captured by Mailhog.
 *
 * ADR-023: EMAIL_PROVIDER=smtp → Mailhog SMTP → Mailhog HTTP API. // ADR-023
 * REQ-MSG-008: proves the nudge was delivered to the SMTP catcher. // REQ-MSG-008
 *
 * @param opts - Filter criteria for the message to wait for
 * @returns The matching MailhogMessage
 * @throws Error if no message arrives within timeoutMs
 *
 * // AC-MSG-008-01 // AC-MSG-011-02 // ADR-023 // REQ-MSG-008 // CS-TS-003
 */
export async function waitForEmail(opts: WaitForEmailOptions): Promise<MailhogMessage> {
  const {
    to,
    subjectContains,
    bodyContains,
    intervalMs = 500,
    timeoutMs = 10_000,
  } = opts;

  const toNorm = to.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messages = await fetchMessages();

    for (const msg of messages) {
      // Match recipient (To field — Mailbox@Domain)
      const recipientMatch = msg.To.some((addr) => {
        const full = `${addr.Mailbox}@${addr.Domain}`.toLowerCase();
        return full === toNorm;
      });
      if (!recipientMatch) continue;

      // Match subject substring if provided
      if (subjectContains) {
        const subjectHeader = msg.Content.Headers["Subject"]?.[0] ?? "";
        if (!subjectHeader.toLowerCase().includes(subjectContains.toLowerCase())) {
          continue;
        }
      }

      // Match body substring if provided — decode QP first so line-wrap boundaries don't break the match
      if (bodyContains) {
        const decodedBody = getBody(msg);
        if (!decodedBody.toLowerCase().includes(bodyContains.toLowerCase())) {
          continue;
        }
      }

      return msg;
    }

    // No match yet — wait before polling again
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `[mailhog fixture] Timed out after ${timeoutMs}ms waiting for email to "${to}"` +
      (subjectContains ? ` with subject containing "${subjectContains}"` : "") +
      (bodyContains ? ` with body containing "${bodyContains}"` : "") +
      `. ` +
      `Is the admin container sending email via SMTP to Mailhog? ` +
      `(EMAIL_PROVIDER=smtp, SMTP_HOST=mailhog, Mailhog at ${MAILHOG_HTTP_URL})`,
  );
}

/**
 * Get the plain-text subject from a Mailhog message.
 * Returns empty string if the Subject header is missing.
 */
export function getSubject(msg: MailhogMessage): string {
  return msg.Content.Headers["Subject"]?.[0] ?? "";
}

/**
 * Decode a Quoted-Printable encoded string to plain text.
 *
 * Nodemailer uses Content-Transfer-Encoding: quoted-printable for UTF-8 text emails.
 * The raw Content.Body in Mailhog is QP-encoded:
 *   - Soft line breaks: "=\r\n" or "=\n" (QP continuation, remove these)
 *   - Encoded bytes: "=XX" hex (replace with the decoded char)
 *
 * Without decoding, body substring checks that cross a 76-char QP line boundary fail.
 *
 * // CS-TS-003: mirrors the decodeQuotedPrintable in apps/admin/e2e/fixtures/mailhog.ts
 */
function decodeQuotedPrintable(s: string): string {
  // 1. Remove soft line breaks (QP line continuation — NOT content)
  const withoutSoftBreaks = s.replace(/=\r\n/g, "").replace(/=\n/g, "");
  // 2. Decode =XX hex escapes
  return withoutSoftBreaks.replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * Get the decoded plain-text body from a Mailhog message.
 * Decodes Quoted-Printable encoding (Nodemailer's default for UTF-8 text emails).
 *
 * // CS-TS-003: mirrors getBody in apps/admin/e2e/fixtures/mailhog.ts
 */
export function getBody(msg: MailhogMessage): string {
  const encoding = (msg.Content.Headers["Content-Transfer-Encoding"]?.[0] ?? "").toLowerCase();
  if (encoding === "quoted-printable") {
    return decodeQuotedPrintable(msg.Content.Body);
  }
  return msg.Content.Body;
}

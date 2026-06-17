/**
 * packages/email/src/bindings/mock.ts — Mock/test-double email binding
 *
 * Captures sent messages in an in-memory store so unit tests can assert on
 * what was "sent" without a real SMTP server.
 *
 * // DECISION (TASK-003-002): `resetMockEmailProviderForTesting()` is defined here
 * // but intentionally NOT exported from the barrel (`src/index.ts`). Per the OE5
 * // review finding (EPIC-004): test-only reset helpers must not appear on the
 * // public barrel. Tests that need the reset import directly from this binding file.
 *
 * Usage in tests:
 *   import { MockEmailProvider, resetMockEmailProviderForTesting } from
 *     "@tax-portal/email/src/bindings/mock.js";
 *   // or (dist path):
 *   import { resetMockEmailProviderForTesting } from
 *     "../../packages/email/src/bindings/mock.js";
 *
 * REQ-NFR-008 / OQ-002.
 */

import type { EmailMessage, EmailProvider, SentEmail } from "../port.js";
import { stripHeaderInjection } from "../port.js";

// ─── In-memory message store ──────────────────────────────────────────────────

/**
 * Global in-memory store for captured emails.
 * One store per process; reset between test suites via `resetMockEmailProviderForTesting()`.
 */
const _sentMessages: SentEmail[] = [];
const _sentPayloads: EmailMessage[] = [];

/**
 * Reset the in-memory captured email store.
 *
 * @internal — test use only. Do NOT call in production code.
 * NOT exported from the barrel (OE5 — test resets must not be on the public barrel).
 * Import directly from this binding file in tests.
 */
export function resetMockEmailProviderForTesting(): void {
  _sentMessages.length = 0;
  _sentPayloads.length = 0;
}

/**
 * Return all sent email payloads (for test assertions).
 * Returns a snapshot (array copy); mutations to the returned array do not
 * affect the store.
 *
 * NOT exported from the barrel.
 * @internal — test use only.
 */
export function getSentEmailsForTesting(): EmailMessage[] {
  return [..._sentPayloads];
}

// ─── Counter ──────────────────────────────────────────────────────────────────

let _idCounter = 0;

// ─── MockEmailProvider ────────────────────────────────────────────────────────

/**
 * MockEmailProvider — in-memory email binding for unit tests.
 *
 * Captures every `send()` call into the module-level in-memory store.
 * Never opens a network connection. Safe for unit tests and CI without a
 * running SMTP server.
 *
 * Security: applies `stripHeaderInjection()` to `to` and `subject` so header-
 * injection tests pass against the mock binding, not just the real SMTP binding.
 */
export class MockEmailProvider implements EmailProvider {
  readonly fromAddress: string;

  constructor(fromAddress?: string) {
    this.fromAddress =
      fromAddress ?? process.env["EMAIL_FROM"] ?? "noreply@test.example.com";
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    // Apply header injection protection — same as the real bindings.
    const sanitisedTo = stripHeaderInjection(message.to);
    const sanitisedSubject = stripHeaderInjection(message.subject);
    const sanitisedFrom = stripHeaderInjection(this.fromAddress);

    const id = `mock-msg-${++_idCounter}-${Date.now()}`;

    // Capture the sanitised payload (do not log body — potential PII).
    const captured: EmailMessage = {
      to: sanitisedTo,
      subject: sanitisedSubject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    };
    _sentPayloads.push(captured);
    _sentMessages.push({ id });

    // Suppress unused-variable lint on sanitisedFrom (used for side-effect validation).
    void sanitisedFrom;

    return { id };
  }
}

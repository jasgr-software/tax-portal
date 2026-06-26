/**
 * packages/email/src/index.ts — Barrel export for @tax-portal/email
 *
 * Exports:
 *   - Provider port types (EmailMessage, SentEmail, EmailProvider)
 *   - Security helpers (stripHeaderInjection, EmailHeaderInjectionError)
 *   - Binding selector (getEmailProvider)
 *   - Binding classes (for direct instantiation in tests / wiring)
 *   - Error class (EmailBindingNotAvailableError)
 *
 * NOT exported (test-only internals per OE5 — review finding):
 *   - resetMockEmailProviderForTesting   → import from ./bindings/mock.js
 *   - getSentEmailsForTesting            → import from ./bindings/mock.js
 *   - resetSmtpTransporterForTesting     → import from ./bindings/smtp.js
 *   - resetEmailProviderForTesting       → import from ./select.js
 *
 * REQ-NFR-008 / OQ-002.
 */

// ─── Provider Port ────────────────────────────────────────────────────────────
export type { EmailMessage, SentEmail, EmailProvider } from "./port.js";
export {
  stripHeaderInjection,
  EmailHeaderInjectionError,
} from "./port.js";

// ─── Binding Selector ─────────────────────────────────────────────────────────
export { getEmailProvider } from "./select.js";
// Test-only: createEmailProvider and resetEmailProviderForTesting are intentionally
// NOT re-exported here. Import directly from "./select.js" in tests only.
// (OE5 — review finding: test resets must not be in the public barrel.)

// ─── Binding Classes (for testing + direct instantiation) ────────────────────
export { MockEmailProvider } from "./bindings/mock.js";
// resetMockEmailProviderForTesting and getSentEmailsForTesting are intentionally
// NOT exported here. Import directly from "./bindings/mock.js" in tests.
// (OE5 — review finding: test resets must not be in the public barrel.)

export { SmtpEmailProvider } from "./bindings/smtp.js";
// resetSmtpTransporterForTesting is intentionally NOT exported here.

export {
  ResendEmailProvider,
  EmailBindingNotAvailableError,
} from "./bindings/resend.js";

// ─── Digest Nudge Composer (TASK-018-003 / BRIEF-018) ─────────────────────────
// composeDigestNudge: pure function — content-free daily-digest nudge email.
// AC-MSG-008-01/-02/-03: output contains only "new activity" + sign-in URL.
// ADR-025: content-minimization contract — no Notification field, no PII.
// CS-GEN-001: no activity detail or recipient identity in the output.
// CS-GEN-002: additive barrel export — no existing export removed or narrowed.
// CS-GEN-003: governing keys cited.
export type { DigestNudgeInput, DigestNudgeEmail } from "./digest.js";
export { composeDigestNudge } from "./digest.js";

/**
 * packages/email/src/digest.ts — Content-free digest nudge composer
 *
 * Composes the daily-digest nudge email that tells a recipient there is new
 * activity in their portal and gives them a sign-in URL — nothing more.
 *
 * Security contract (ADR-025 / REQ-MSG-008):
 *   The body MUST contain only a generic "you have new activity" statement and
 *   the signInUrl. It MUST NOT contain:
 *     - Any Notification field (type, title, body, linkedItemType, linkedItemId, …)
 *     - Any client name, engagement detail, document name, message content
 *     - Any event-specific description
 *     - The recipient's own name or email address
 *       (ADR-025 permits name, but excluding it keeps the two-sided proof clean)
 *
 * `role` was removed from the input (see review finding 3):
 *   The dispatcher (TASK-018-003) already selects the sign-in URL before calling
 *   this function, so `role` is not needed here. The output text is identical for
 *   both roles — fully generic, no surface-specific copy.
 *
 * Pure function: zero side-effects, no I/O, no env reads. Unit-testable in isolation.
 *
 * // REQ-MSG-008  — email is a content-free fallback nudge                 // REQ-MSG-008
 * // AC-MSG-008-01 — conveys only that there is new activity + sign-in URL // AC-MSG-008-01
 * // AC-MSG-008-02 — contains no activity detail of any kind               // AC-MSG-008-02
 * // AC-MSG-008-03 — sign-in URL leads the recipient back to the portal    // AC-MSG-008-03
 * // ADR-025       — content-minimization contract; no PII in body         // ADR-025
 * // ADR-017       — no PII in transport layer                             // ADR-017
 * // CS-GEN-001    — no recipient activity/identity in any log             // CS-GEN-001
 * // CS-GEN-003    — governing keys cited throughout                       // CS-GEN-003
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Input to the digest nudge composer.
 *
 * `signInUrl` — the URL the recipient should visit to sign in to their portal.
 *   Chosen by the dispatcher: CLIENT → PORTAL_APP_URL + '/sign-in';
 *   ACCOUNTANT → ADMIN_APP_URL + '/sign-in'. (ADR-006)
 *
 * `role` was removed: the dispatcher selects the sign-in URL before calling this
 * function, so the composer does not need the role — all output is role-agnostic.
 */
export interface DigestNudgeInput {
  signInUrl: string;
}

/**
 * The composed nudge email — subject and plain-text body.
 *
 * Both fields carry ONLY the generic activity statement + sign-in URL.
 * No Notification field, no activity detail, no PII beyond the URL.
 *
 * // AC-MSG-008-01 // AC-MSG-008-02 // ADR-025 §3
 */
export interface DigestNudgeEmail {
  subject: string;
  text: string;
}

// ─── Composer ─────────────────────────────────────────────────────────────────

/**
 * Compose a content-free daily-digest nudge email.
 *
 * Returns a plain-text email whose subject and body contain ONLY:
 *   - A generic statement that new activity is waiting in the recipient's portal.
 *   - The `signInUrl` as the single affordance to act on that statement.
 *
 * Guarantees:
 *   - No interpolation of any `Notification` field.
 *   - No client name, engagement detail, document name, message content.
 *   - No event description or event count.
 *   - No recipient name or email address.
 *   - The same generic copy is used for both ACCOUNTANT and CLIENT roles.
 *
 * @param input - `{ signInUrl }` — the sign-in URL for the body.
 * @returns `{ subject, text }` — the composed nudge email.
 *
 * // AC-MSG-008-01: conveys only "new activity" + sign-in means.         // AC-MSG-008-01
 * // AC-MSG-008-02: no activity detail — proven by unit test (two-sided). // AC-MSG-008-02
 * // AC-MSG-008-03: signInUrl leads the recipient to the portal.          // AC-MSG-008-03
 * // ADR-025 §3: content-free; no Notification field used here.           // ADR-025
 * // REQ-MSG-008                                                           // REQ-MSG-008
 * // CS-GEN-001: no PII, no activity detail in output.                    // CS-GEN-001
 * // CS-GEN-003: governing keys cited.                                     // CS-GEN-003
 */
export function composeDigestNudge(input: DigestNudgeInput): DigestNudgeEmail {
  // DECISION-018-003-COMPOSER: The body is fully generic — no role-specific copy.
  // `role` was removed from the input: ADR-006 URL selection lives in the dispatcher;
  // the composer receives only the pre-selected signInUrl. The content is identical
  // for ACCOUNTANT and CLIENT — any role-specific wording would risk leaking surface
  // information and would complicate the two-sided proof.
  //
  // "your portal" is the only portal reference — no brand name, no surface name.
  // // ADR-025 // REQ-MSG-008 // AC-MSG-008-02 // CS-GEN-001

  const subject = "You have new activity in your portal";

  // Plain-text body: two-sentence nudge + blank line + sign-in URL.
  // Nothing beyond these three elements may appear here.
  // // AC-MSG-008-01 // AC-MSG-008-02 // ADR-025 §3
  const text = [
    "You have new activity waiting for you in your portal.",
    "",
    `Sign in to see what's new: ${input.signInUrl}`,
  ].join("\n");

  return { subject, text };
}

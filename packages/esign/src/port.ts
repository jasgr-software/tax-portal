/**
 * packages/esign/src/port.ts — ESignatureProvider port interface
 *
 * Defines the contract all e-signature bindings (mock + Docuseal) must satisfy.
 * Apps import from this port — never from a concrete binding.
 *
 * ADR-024: Production target is self-hosted Docuseal behind this seam.
 * ADR-023: Every external integration lives behind a port + bindings + fail-closed selector.
 * REQ-ONBD-002: The engagement letter must be e-signed before onboarding may proceed.
 *
 * The onboarding code depends on the ESignatureProvider port, never on a concrete
 * binding class. This is the seam that makes the later "swap mock → real Docuseal"
 * a single-line env change once the enablement slice lands.
 */

// ─── Request Shape ────────────────────────────────────────────────────────────

/**
 * A signature request returned from createSignatureRequest.
 *
 * engagementId: the engagement this request belongs to.
 * ref: the provider-side handle (opaque to the app) — used to poll/verify completion.
 *      Under the mock binding this is a deterministic derived string.
 *      Under the real Docuseal binding this will be the Docuseal submission ID.
 */
export interface SignatureRequest {
  engagementId: string;
  ref: string;
}

// ─── Completion Shape ─────────────────────────────────────────────────────────

/**
 * The result of verifyCompletion.
 *
 * signed: true  — the letter has been signed.
 *   signedAt:  ISO 8601 UTC timestamp of the signing event.
 *   evidence:  serialized signed-letter proof recorded on Engagement.letterSignatureEvidence
 *              (TASK-005-005 / AC-ONBD-002-04). The mock binding produces a deterministic
 *              JSON blob: { provider: 'mock', engagementId, ref, signedAt }.
 *
 * signed: false — the letter has NOT been signed yet (or the ref is unknown).
 *
 * NOTE (ADR-023 §6): the mock binding's evidence proves wiring, not legal signature validity.
 * The real Docuseal binding will return evidence containing Docuseal's verified completion
 * payload. A green mock-bound suite must never be read as evidence the real signature holds.
 */
export type SignatureCompletion =
  | { signed: true; signedAt: string; evidence: string }
  | { signed: false };

// ─── Provider Port Interface ──────────────────────────────────────────────────

/**
 * ESignatureProvider — the single interface all e-sign bindings must implement.
 *
 * Each method is called in server context (Next.js Server Actions).
 * No client-side calls; the completion signal is provider-verified (ADR-024 §3).
 *
 * Both bindings (MockESignatureProvider and DocusealESignatureProvider) must
 * satisfy this interface. `src/select.ts` picks the active binding by ESIGN_PROVIDER.
 */
export interface ESignatureProvider {
  /**
   * Create a signature request for the given engagement letter and signer.
   *
   * Returns a SignatureRequest carrying the provider-side handle (ref) the app
   * stores and later passes to verifyCompletion.
   *
   * REQ-ONBD-002: the engagement letter must be presented for signing before
   * the onboarding gate opens.
   *
   * ADR-024 §6: the letter content is authored by the accountant (letter template);
   * the provider renders and captures a signature over whatever content is supplied.
   */
  createSignatureRequest(input: {
    engagementId: string;
    letterContent: string;
    signer: { clerkUserId: string; email?: string };
  }): Promise<SignatureRequest>;

  /**
   * Verify/recognize completion of a previously-created signature request.
   *
   * Returns SignatureCompletion — signed:true with evidence when complete,
   * signed:false when still pending or unknown.
   *
   * ADR-024 §3: under the real Docuseal binding this calls the provider's API
   * (or trusts a cached completion) to check status — never a client-side claim.
   * Under the mock binding this returns a deterministic signed:true outcome.
   *
   * REQ-ONBD-002 / AC-ONBD-002-04: on signed:true the evidence blob is stored
   * on Engagement.letterSignatureEvidence (wired in TASK-005-005).
   */
  verifyCompletion(ref: string): Promise<SignatureCompletion>;
}

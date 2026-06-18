/**
 * packages/esign/src/bindings/mock.ts — Mock/test-double e-signature binding
 *
 * The e2e/local-dev default. Selected when ESIGN_PROVIDER=mock AND ALLOW_MOCK_ESIGN=true.
 *
 * ADR-023 §6 (behavior-faithful, NOT security-faithful):
 *   This mock is deterministic and faithful to the port's behavior contract —
 *   same shapes, same signed:true outcome the real provider yields at the seam.
 *   It proves wiring, NOT that a legally meaningful e-signature was captured.
 *   A green mock-bound suite MUST NOT be read as evidence the real integration is safe.
 *   The real Docuseal binding (a deferred enablement slice — ADR-024 §5) is the
 *   release-gating provider that proves the actual signature.
 *
 * ADR-024 §5 / ADR-023 §2:
 *   The onboarding spine ships against this mock; AC-ONBD-002-* are verified against
 *   it. The real Docuseal enablement is a separately-tracked slice that re-validates
 *   those AC against the live, self-hosted provider.
 *
 * Behavior:
 *   createSignatureRequest  — returns a deterministic ref derived from engagementId.
 *   verifyCompletion        — always returns signed:true with a deterministic evidence blob.
 *   No external calls; no side effects.
 */

import type { ESignatureProvider, SignatureCompletion, SignatureRequest } from "../port.js";

// ─── MockESignatureProvider ───────────────────────────────────────────────────

/**
 * MockESignatureProvider — the e2e/local-dev e-signature binding.
 *
 * Deterministic: given the same engagementId, always returns the same ref.
 * Always returns signed:true from verifyCompletion — it models "letter was signed."
 *
 * The evidence blob is the deterministic JSON the downstream sign action
 * records on Engagement.letterSignatureEvidence (TASK-005-005 / AC-ONBD-002-04).
 *
 * IMPORTANT: This binding proves wiring (the seam is connected). It does NOT
 * prove that a real legally-valid e-signature was captured (ADR-023 §6).
 * Comments in this file must not claim otherwise.
 */
export class MockESignatureProvider implements ESignatureProvider {
  /**
   * Create a signature request.
   *
   * Returns a deterministic ref derived from the engagementId so tests can
   * assert on the ref value without relying on timestamps or random IDs.
   *
   * No external calls.
   */
  async createSignatureRequest(input: {
    engagementId: string;
    letterContent: string;
    signer: { clerkUserId: string; email?: string };
  }): Promise<SignatureRequest> {
    // DECISION (TASK-005-002): the mock ref is deterministic — derived from
    // engagementId alone — so the downstream sign action can store and look it
    // up without needing a real provider. Format: "mock-ref-<engagementId>".
    // The letterContent and signer are accepted but not used; the mock records
    // the interface shape only.
    void input.letterContent; // accepted but unused in mock — satisfies the port
    void input.signer; // accepted but unused in mock — satisfies the port
    return {
      engagementId: input.engagementId,
      ref: `mock-ref-${input.engagementId}`,
    };
  }

  /**
   * Verify completion of a previously-created signature request.
   *
   * Always returns signed:true with a deterministic evidence blob.
   * The ref is expected to be "mock-ref-<engagementId>" (set by createSignatureRequest).
   *
   * Evidence shape: JSON.stringify({ provider: 'mock', engagementId, ref, signedAt })
   * — the deterministic blob the sign action stores on Engagement.letterSignatureEvidence.
   *
   * NOTE: signed:true here proves the seam path works, NOT that a real signature
   * was captured. ADR-023 §6 is explicit: the mock is behavior-faithful, not
   * security-faithful.
   */
  async verifyCompletion(ref: string): Promise<SignatureCompletion> {
    // Derive engagementId from the deterministic ref so the evidence blob is consistent.
    // Format produced by createSignatureRequest: "mock-ref-<engagementId>"
    const engagementId = ref.startsWith("mock-ref-") ? ref.slice("mock-ref-".length) : ref;
    const signedAt = new Date().toISOString();

    const evidence = JSON.stringify({
      provider: "mock",
      engagementId,
      ref,
      signedAt,
    });

    return {
      signed: true,
      signedAt,
      evidence,
    };
  }
}

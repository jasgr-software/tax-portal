/**
 * packages/esign/src/bindings/docuseal.ts — Docuseal e-signature binding (deferred stub)
 *
 * ADR-024 §5 (mock-first sequencing): The real Docuseal binding — verified+idempotent
 * webhook handling, reconciliation fallback, and encrypted signed-doc storage — is a
 * DEFERRED ENABLEMENT SLICE. This file is the deferred stub that holds the binding's
 * place in the selector so ESIGN_PROVIDER=docuseal (the real-default) completes selection
 * without error. The stub throws EsignBindingNotAvailableError at call-time.
 *
 * Selection completes; the stub is unreachable in production (no onboarding code calls
 * signing in this slice). When the enablement slice lands, this file is REPLACED with
 * the real Docuseal API integration — no call-site change required (callers import only
 * via the port or getESignatureProvider()).
 *
 * Mirrors packages/email/src/bindings/resend.ts (ResendEmailProvider deferred stub).
 */

import type { ESignatureProvider, SignatureCompletion, SignatureRequest } from "../port.js";

// ─── DocusealESignatureProvider ───────────────────────────────────────────────

/**
 * DocusealESignatureProvider — deferred production binding.
 *
 * CURRENT STATUS: Stub. Throws EsignBindingNotAvailableError when any method is called.
 * Selection completes; only call-time throws.
 *
 * When the real Docuseal enablement slice lands, replace this stub with the real
 * Docuseal API integration (authenticated webhook handling, idempotent completion,
 * reconciliation fallback, signed-doc storage per ADR-024 §3/§4).
 *
 * ADR-024 §5: running a mock e-sign in production is a fail-closed pre-deploy gate.
 * The real Docuseal binding is a release-gating item for any onboarding exercised
 * in production.
 */
export class DocusealESignatureProvider implements ESignatureProvider {
  async createSignatureRequest(_input: {
    engagementId: string;
    letterContent: string;
    signer: { clerkUserId: string; email?: string };
  }): Promise<SignatureRequest> {
    // DECISION (TASK-005-002): stub throws at call-time. The real implementation
    // will call the Docuseal API to create a submission for the letter content,
    // return the submission ID as the ref, and record it against the engagement.
    throw new EsignBindingNotAvailableError();
  }

  async verifyCompletion(_ref: string): Promise<SignatureCompletion> {
    // DECISION (TASK-005-002): stub throws at call-time. The real implementation
    // will call the Docuseal API to check submission status (or trust a cached
    // webhook completion), verify the callback authenticity, and return signed:true
    // with the signed document evidence per ADR-024 §3.
    throw new EsignBindingNotAvailableError();
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the Docuseal binding is called before the real enablement slice lands.
 *
 * Mirrors EmailBindingNotAvailableError in packages/email.
 *
 * If you see this error in tests or local dev, set ESIGN_PROVIDER=mock and
 * ALLOW_MOCK_ESIGN=true (e.g. in docker-compose.yml for the portal service).
 *
 * In production, the real Docuseal binding must be wired before any onboarding
 * exercise (ADR-024 §5 — release-gating item).
 */
export class EsignBindingNotAvailableError extends Error {
  constructor() {
    super(
      `[DocusealESignatureProvider] Docuseal binding is not fully wired yet. ` +
        `Set ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN=true for local dev and e2e. ` +
        `The Docuseal binding is the deferred production target — do not call it before ` +
        `the real Docuseal enablement slice lands (see ADR-024 §5).`,
    );
    this.name = "EsignBindingNotAvailableError";
  }
}

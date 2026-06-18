/**
 * packages/esign/src/index.ts — Barrel export for @tax-portal/esign
 *
 * Exports:
 *   - Provider port types (ESignatureProvider, SignatureRequest, SignatureCompletion)
 *   - Binding selector (getESignatureProvider)
 *   - Test reset (resetESignProviderForTesting)
 *
 * INTENTIONALLY NOT EXPORTED:
 *   - MockESignatureProvider — binding class must not be in the public barrel.
 *   - DocusealESignatureProvider — binding class must not be in the public barrel.
 *   - EsignBindingNotAvailableError — internal binding error; not part of the public API.
 *   - createESignatureProvider — internal factory; import from "./select.js" in tests only.
 *
 * Apps import from @tax-portal/esign — never from a concrete binding file.
 * Onboarding code must depend on the port, never on a binding class (ADR-023 §1).
 * The SDET checks this: the barrel must not leak binding classes.
 *
 * ADR-023: provider-seam & mock-first strategy.
 * ADR-024: e-sign via self-hosted Docuseal behind this seam.
 */

// ─── Provider Port ────────────────────────────────────────────────────────────
export type { ESignatureProvider, SignatureRequest, SignatureCompletion } from "./port.js";

// ─── Binding Selector ─────────────────────────────────────────────────────────
export { getESignatureProvider } from "./select.js";

// ─── Test Reset ───────────────────────────────────────────────────────────────
// Exported for test use only. Do NOT use in production code.
// Tests must call this in afterEach to clear the singleton between tests.
// (OE5 pattern from packages/auth: test resets are in the public barrel for esign
//  because there is no separate "/testing" export path in this simpler package.)
export { resetESignProviderForTesting } from "./select.js";

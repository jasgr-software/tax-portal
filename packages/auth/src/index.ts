/**
 * packages/auth/src/index.ts — Barrel export for @tax-portal/auth
 *
 * Exports:
 *   - Provider port types (Role, Identity, Invitation, AuthProvider, SessionValidity)
 *   - Redirect helper (redirect matrix, public-allow-list matcher)
 *   - Binding selector (getAuthProvider)
 *   - Per-app middleware helpers (applyPortalAuth, applyAdminAuth)
 *   - Mock session API (createMockSessionCookie, buildMockSessionSetCookieHeader)
 *   - Binding classes (for direct instantiation in tests)
 *
 * Apps import from @tax-portal/auth — never from a concrete binding file.
 * ADR-001 / ADR-010 / ADR-005.
 */

// ─── Provider Port ────────────────────────────────────────────────────────────
export { ROLES } from "./port.js";
export type { Role, Identity, Invitation, AuthProvider, SessionValidity } from "./port.js";

// ─── Redirect Helper ──────────────────────────────────────────────────────────
export {
  PORTAL_PUBLIC_PATHS,
  INFRA_PATHS,
  isPortalPublicPath,
  isInfraPath,
  getPortalAppUrl,
  getAdminAppUrl,
  portalRedirectDecision,
  adminRedirectDecision,
} from "./redirect.js";
export type { ServeDecision, RedirectDecision, MiddlewareDecision } from "./redirect.js";

// ─── Binding Selector ─────────────────────────────────────────────────────────
export {
  getAuthProvider,
  createAuthProvider,
  resetAuthProviderForTesting,
} from "./select.js";

// ─── Per-App Middleware Helpers ───────────────────────────────────────────────
export { applyPortalAuth, applyAdminAuth } from "./require-role.js";

// ─── Mock Session API (for test fixtures + /api/mock-session route handlers) ──
export {
  createMockSessionCookie,
  buildMockSessionSetCookieHeader,
  MOCK_SESSION_COOKIE_NAME,
} from "./mock-session-api.js";
export type { MockSessionOptions, MockSessionCookie } from "./mock-session-api.js";

// ─── Bindings (for testing + direct instantiation) ────────────────────────────
export {
  MockAuthProvider,
  signMockSession,
  signMockSessionAsync,
  verifyMockSession,
  verifyMockSessionAsync,
  FIXTURE_INVITATION,
} from "./bindings/mock.js";
export { ClerkAuthProvider, ClerkBindingNotAvailableError } from "./bindings/clerk.js";
export type { MockSessionPayload } from "./bindings/mock.js";
export type { ClerkSessionClaims } from "./bindings/clerk.js";

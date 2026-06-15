/**
 * packages/auth/src/bindings/clerk.ts — Clerk auth binding (production target)
 *
 * ADR-001: One Clerk application, two sign-in surfaces. Both apps/portal and apps/admin
 * point at the same Clerk app (same publishable + secret key). Role is stored in
 * publicMetadata.role and read server-side from the session JWT — never client-asserted.
 *
 * ADR-005: Role is the trust boundary. The Clerk binding reads the role from
 * session.claims.publicMetadata.role (server-side JWT verification) — never from
 * a request header or body the browser can set.
 *
 * IMPORTANT (re-scope 2026-06-15): The Clerk binding is the PRODUCTION TARGET but
 * must NOT be contacted by the gate. No real Clerk keys are required to build, run,
 * or validate TASK-004-002. The ClerkAuthProvider class compiles and satisfies the
 * AuthProvider port, but the MOCK binding is the e2e/local-dev default
 * (AUTH_PROVIDER=mock). The Clerk binding is wired in production (AUTH_PROVIDER=clerk).
 *
 * 2FA note: 2FA enforcement is deferred per the 2026-06-15 re-scope. The Clerk session
 * JWT may carry MFA status in future (session.claims.twofactorEnabled or similar);
 * the port leaves room for this. Build no 2FA gate here.
 *
 * Deps: @clerk/nextjs (peer dep — present in apps but not in this package to avoid
 * bundling issues; the real Clerk call happens via dynamic import in the production
 * build, not at package-auth build time). The stub implementation below satisfies
 * the port interface and throws a clear error if called outside production context.
 *
 * When TASK-004-003 wires the real Clerk session (clerkMiddleware etc.), this binding
 * will be replaced with real @clerk/nextjs/server calls. For now: the binding compiles,
 * satisfies the port, and is import-safe (no Clerk SDK import at build time).
 */

import type {
  AuthProvider,
  Identity,
  Invitation,
  Role,
  SessionValidity,
} from "../port.js";

// ─── Clerk Session Claims Shape ───────────────────────────────────────────────

/**
 * Expected shape of Clerk's session claims for this application.
 * ADR-001: publicMetadata.role is the role claim, set via Clerk backend API,
 * read server-side from the session JWT.
 *
 * This type mirrors what `auth().sessionClaims` returns from @clerk/nextjs/server.
 */
export interface ClerkSessionClaims {
  publicMetadata?: {
    role?: "ACCOUNTANT" | "CLIENT";
  };
  sub?: string; // Clerk user ID
}

// ─── ClerkAuthProvider ────────────────────────────────────────────────────────

/**
 * ClerkAuthProvider — production auth binding.
 *
 * PRODUCTION USE: When AUTH_PROVIDER=clerk (or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * is set in an environment that has TASK-004-003 wired), this binding is active.
 *
 * CURRENT STATUS (TASK-004-002): This class compiles and satisfies the AuthProvider
 * port but throws ClerkBindingNotAvailableError at runtime if called without the
 * real Clerk integration (TASK-004-003). This is intentional — the gate runs on
 * the mock binding; this binding must not be contacted by CI.
 *
 * ADR-005: getSessionRole / getIdentity read from the Clerk session JWT verified
 * server-side. The role is NEVER read from a client-supplied request header.
 */
export class ClerkAuthProvider implements AuthProvider {
  /**
   * Clerk's default session timeout: 7 days (can be overridden in the Clerk dashboard).
   * ADR-001: session expiry applies to both apps because they share one Clerk session.
   */
  readonly sessionTimeoutMs = 7 * 24 * 60 * 60 * 1000; // 7 days

  async getSessionRole(_request: Request): Promise<Role | null> {
    // DECISION (TASK-004-002): The real implementation calls
    //   import('@clerk/nextjs/server').then(m => m.auth())
    // to get session.claims.publicMetadata.role server-side (ADR-001).
    // This is wired in TASK-004-003 once @clerk/nextjs is added to the apps.
    // For now: throw to make misuse obvious.
    throw new ClerkBindingNotAvailableError("getSessionRole");
  }

  async getIdentity(_request: Request): Promise<Identity | null> {
    // DECISION (TASK-004-002): The real implementation reads
    //   const { userId, sessionClaims } = auth()
    // from @clerk/nextjs/server, then returns
    //   { clerkUserId: userId, role: sessionClaims?.publicMetadata?.role }
    // This wiring lands in TASK-004-003.
    throw new ClerkBindingNotAvailableError("getIdentity");
  }

  async checkSession(_request: Request): Promise<SessionValidity> {
    throw new ClerkBindingNotAvailableError("checkSession");
  }

  async createInvitation(email: string, role: Role): Promise<Invitation> {
    // DECISION (TASK-004-002): The real implementation calls
    //   POST /v1/invitations via the Clerk backend client (ClerkClient.invitations.createInvitation)
    // with { emailAddress: email, publicMetadata: { role }, redirectUrl: PORTAL_SIGNUP_URL }.
    // This wiring lands in TASK-004-003.
    throw new ClerkBindingNotAvailableError(
      `createInvitation(${email}, ${role})`,
    );
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the Clerk binding is called outside a real production environment
 * (i.e., before TASK-004-003 wires the real @clerk/nextjs integration).
 *
 * If you see this error in tests or local dev, AUTH_PROVIDER is set to 'clerk'
 * but the real Clerk SDK is not configured. Switch to AUTH_PROVIDER=mock.
 */
export class ClerkBindingNotAvailableError extends Error {
  constructor(method: string) {
    super(
      `[ClerkAuthProvider.${method}] Clerk binding is not fully wired yet (TASK-004-003). ` +
        `Set AUTH_PROVIDER=mock for local dev and e2e. ` +
        `The Clerk binding is the production target — do not call it before TASK-004-003 lands.`,
    );
    this.name = "ClerkBindingNotAvailableError";
  }
}

/**
 * packages/auth/src/port.ts — Provider Port Interface
 *
 * Defines the contract both auth bindings (mock + Clerk) must satisfy.
 * Apps import from this port — never from a concrete binding.
 *
 * ADR-001: Production target is Clerk (one application, two sign-in surfaces;
 *          publicMetadata.role is the role claim; server-side read only).
 * ADR-005: Role is the trust boundary — server-evaluated, never client-asserted.
 * ADR-010: Per-app middleware enforces the redirect matrix using this port.
 *
 * 2FA note (re-scope 2026-06-15): 2FA enforcement is deferred. The port
 * leaves room for a future `requireMfa()` / `mfaStatus` on Identity without
 * requiring it. Build no 2FA gate here.
 */

// ─── Role Type ────────────────────────────────────────────────────────────────

/**
 * Single source of truth for the application's role enumeration.
 *
 * AC-AUTH-001-01: the system has exactly two assignable roles — ACCOUNTANT and CLIENT.
 * Adding or removing a value here is a breaking change that will red the invariant test.
 *
 * ADR-001: roles are stored in Clerk publicMetadata.role (server-side only).
 * ADR-005: never client-asserted; always read from the verified session.
 *
 * DECISION (TASK-004-004): export as `as const` tuple so the invariant test can assert
 * against a runtime value (not a compile-time-only type). `Role` is derived from this
 * tuple so the two can never drift. packages/db mirrors the string literals independently
 * — TASK-004-007 wires them together; a `// DECISION:` note in that task handles drift.
 */
export const ROLES = ["ACCOUNTANT", "CLIENT"] as const;

/**
 * Application roles.
 * Mirrors RequestContext.role in packages/db/src/context.ts so TASK-004-007
 * can wire withRequestContext(identity, role, …) without conversion.
 *
 * ADR-001: stored in Clerk publicMetadata.role (server-side only).
 * ADR-005: never client-asserted; always read from the verified session.
 */
export type Role = (typeof ROLES)[number];

// ─── Identity ─────────────────────────────────────────────────────────────────

/**
 * Verified identity extracted from the session.
 *
 * clerkUserId: the Clerk user ID — used as the key in packages/db RequestContext.
 *              Under the mock binding this is a deterministic test ID.
 * role: the server-evaluated role.
 *
 * Shape is intentionally compatible with packages/db RequestContext
 * (clerkUserId + role) so TASK-004-007 can call
 *   withRequestContext(identity.clerkUserId, identity.role, fn)
 * without mapping.
 *
 * NOTE: 2FA fields (e.g. mfaVerified: boolean) can be added here when that
 * slice lands — leaving space by keeping this interface minimal.
 */
export interface Identity {
  clerkUserId: string;
  role: Role;
}

// ─── Invitation ───────────────────────────────────────────────────────────────

/**
 * Represents an issued invitation (used by the accept-flow and by the mock binding's
 * fixture invitation). The role on the invitation is set server-side by the issuing
 * admin action — never client-supplied.
 */
export interface Invitation {
  /** The invited email address */
  email: string;
  /** The role the invited user will receive (always server-set) */
  role: Role;
  /** Opaque ticket — platform-specific (Clerk ticket ID or mock fixture token) */
  ticket: string;
}

// ─── Session Validity ─────────────────────────────────────────────────────────

/** Outcome of a session validity check */
export type SessionValidity =
  | { valid: true; identity: Identity }
  | { valid: false; reason: "unauthenticated" | "expired" | "role-missing" };

// ─── Provider Port Interface ──────────────────────────────────────────────────

/**
 * AuthProvider — the single interface all auth bindings must implement.
 *
 * Each method is called in server context (Next.js middleware, Server Components,
 * Server Actions). No client-side calls; never trust request body/headers for role.
 *
 * Both bindings (MockAuthProvider and ClerkAuthProvider) satisfy this interface.
 * `src/select.ts` picks the active binding by AUTH_PROVIDER env var.
 */
export interface AuthProvider {
  /**
   * Read the session from the current request context and return the role.
   * Returns null if not authenticated or if the session carries no role.
   *
   * ADR-005: the role is read from the VERIFIED SESSION (Clerk's JWT or the
   * mock test session) — never from a client-supplied header or cookie value
   * the browser can set arbitrarily.
   *
   * AC-AUTH-001-03: this function is the server-side role-read foundation.
   */
  getSessionRole(request: Request): Promise<Role | null>;

  /**
   * Return the full verified identity, or null if not authenticated.
   * Combines userId + role into a single call.
   *
   * AC-AUTH-001-03: role derives from the verified session, never client input.
   */
  getIdentity(request: Request): Promise<Identity | null>;

  /**
   * Check session validity including expiry and role presence.
   * Used by middleware to distinguish "unauthenticated" from "expired" for
   * appropriate redirect semantics.
   */
  checkSession(request: Request): Promise<SessionValidity>;

  /**
   * Create an invitation for a new user with the given email and role.
   * Returns the Invitation (ticket + role) the caller uses to send an invite email.
   *
   * ADR-001: Invitation flow — accountant creates invitation server-side; ticket
   * is a Clerk invitation ID (production) or a mock fixture token (test/dev).
   */
  createInvitation(email: string, role: Role): Promise<Invitation>;

  /**
   * Default session timeout in milliseconds.
   * Clerk: matches the Clerk application's session lifetime setting.
   * Mock: SHORT (e.g. 24 h) for predictable test behavior.
   */
  readonly sessionTimeoutMs: number;
}

/**
 * apps/portal/src/app/(public)/sign-in/actions.ts — Sign-in server action
 *
 * AC-AUTH-005-02: A CLIENT can complete sign-in WITHOUT a second factor.
 *                 No 2FA gate, enrollment, or MFA prompt is present here.
 *
 * ADR-005: Role is server-set from the verified session (signed mock cookie).
 *          Never read from request body/header/query.
 *
 * ADR-001: In the Clerk production binding, sign-in calls Clerk's sign-in API
 *          and validates credentials. Under AUTH_PROVIDER=mock, we accept any
 *          non-empty credentials and establish a CLIENT session server-side.
 *
 * ADR-022: The sign-in surface is rate-limited per source IP and endpoint to
 *          guard against credential stuffing / brute force. Returns a
 *          rate-limited result (no session established) when the budget is
 *          exhausted. Independent of 2FA — guards the password sign-in that
 *          ships now.
 *
 * DECISION (TASK-004-005): Under AUTH_PROVIDER=mock, sign-in is "credential-free"
 * from a real-provider perspective — any email/password that is non-empty will
 * succeed, because the fixture invitations don't persist real credentials. The
 * test suite uses the fixture invitation email. In the Clerk binding, Clerk handles
 * credential validation. The mock binding's job is to prove the session/role
 * establishment path is correct without touching a real auth provider.
 *
 * DECISION (TASK-004-005): We use a deterministic clerkUserId from the email so
 * sign-up and sign-in produce compatible session cookies in tests (same userId).
 *
 * No 2FA step anywhere in this file — 2FA is deferred to a future slice.
 */

"use server";

import { cookies, headers } from "next/headers";
import {
  MOCK_SESSION_COOKIE_NAME,
  createMockSessionCookie,
  getRateLimiter,
  buildRateLimitKey,
} from "@tax-portal/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignInResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
  /**
   * retryAfterMs: present when success=false and the failure is due to rate
   * limiting (ADR-022). Callers surface this as the Retry-After hint.
   * Absence means a credential/validation error, not a rate-limit error.
   */
  retryAfterMs?: number;
}

// ─── IP Resolution ────────────────────────────────────────────────────────────

/**
 * Resolve the source IP server-side from the incoming request headers.
 *
 * DECISION (TASK-004-009, ADR-005 trusted-proxy assumption):
 *   Next.js server actions do not expose a raw socket remoteAddress. We read
 *   the source IP from the X-Forwarded-For header, which is the de-facto
 *   standard populated by reverse proxies (Nginx, Caddy, Azure Front Door,
 *   Cloudflare, etc.).
 *
 *   TRUSTED-PROXY ASSUMPTION: X-Forwarded-For is trusted ONLY when the
 *   request arrives through a known reverse proxy that controls this header.
 *   In bare Docker / direct-Node deployments (local dev, single-host), the
 *   leftmost value is whatever the client sends — potentially spoofable.
 *   For local dev / testing, we fall back to a sentinel ("127.0.0.1") when
 *   the header is absent, and accept the spoof-risk as acceptable for a
 *   development-only path. In production behind a WAF/proxy (the intended
 *   deployment shape per ADR-007/ADR-013), the proxy strips/rewrites the
 *   header, making spoofing infeasible.
 *
 *   If this becomes a concern before a proxy is in place, the migration path
 *   is: replace this function with a platform-specific remoteAddress read
 *   (e.g., from a custom Next.js request header injected by the host) behind
 *   the same call site — no other sign-in code changes.
 *
 * ADR-005: The key is (IP, endpoint) — not a client-asserted identity field
 *   like email. Flooding one email does not lock out others; only requests
 *   from the same source IP toward the same endpoint share a budget.
 */
async function resolveSourceIp(): Promise<string> {
  const headerStore = await headers();
  // X-Forwarded-For may contain a comma-separated list; take the leftmost (original client)
  const xForwardedFor = headerStore.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  // Fall back to the X-Real-IP header (set by some proxies in place of XFF)
  const xRealIp = headerStore.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  // No proxy header present — local dev / bare Node deployment
  return "127.0.0.1";
}

// ─── Rate-Limit Key ───────────────────────────────────────────────────────────

/** Stable endpoint identifier for the portal sign-in surface (ADR-022 §1). */
const SIGN_IN_ENDPOINT = "portal:sign-in" as const;

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Server Action: validate sign-in credentials and establish a CLIENT session.
 *
 * AC-AUTH-005-02: No second-factor prompt — sign-in completes single-factor.
 * ADR-005: CLIENT role is set SERVER-SIDE from the session cookie (not client input).
 * ADR-022: Rate-limited per (sourceIp, "portal:sign-in") before any credential check.
 *
 * Under AUTH_PROVIDER=mock: accepts any non-empty email/password and establishes
 * a CLIENT session. The mock binding does not persist real credentials.
 *
 * Under AUTH_PROVIDER=clerk (production): this server action would delegate to
 * Clerk's sign-in API; the session token is a Clerk JWT, not a mock cookie.
 */
export async function signInAsClient(formData: FormData): Promise<SignInResult> {
  // ── ADR-022: Rate-limit check BEFORE credential validation ──────────────────
  // The limiter guards the entry point regardless of email/password validity.
  // A throttled request never reaches the credential check — no session is
  // established and no information about account existence is leaked.
  const sourceIp = await resolveSourceIp();
  const rateLimitKey = buildRateLimitKey(sourceIp, SIGN_IN_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey);

  if (!rateLimitResult.allowed) {
    // Return 429-equivalent: no session, deterministic rate-limited shape.
    // DECISION (TASK-004-009): Server actions cannot set HTTP 429 status codes
    // directly (they return a value, not a Response). The rate-limited shape
    // here is the deterministic equivalent: { success:false, error:<message>,
    // retryAfterMs:<ms> }. The UI layer interprets retryAfterMs to show the
    // Retry-After hint. This is consistent with ADR-022 §1's "429 with a retry
    // hint" intent adapted to the server-action transport layer.
    const result: SignInResult = {
      success: false,
      error: "Too many sign-in attempts. Please wait before trying again.",
    };
    if (rateLimitResult.retryAfterMs !== undefined) {
      result.retryAfterMs = rateLimitResult.retryAfterMs;
    }
    return result;
  }

  // ── Credential validation ───────────────────────────────────────────────────

  const email = ((formData.get("email") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";

  // Input guard — require non-empty email and password
  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  // Validate email format (basic)
  if (!email.includes("@")) {
    return { success: false, error: "Please enter a valid email address." };
  }

  // Under AUTH_PROVIDER=mock, any valid non-empty credentials succeed.
  // In the Clerk binding, credential validation happens server-side in Clerk.
  // DECISION (TASK-004-005): The mock binding is intentionally credential-agnostic
  // because the e2e tests use the fixture invitation email + fixture ticket flow.
  // The role is always CLIENT for sign-in on the portal (CLIENT-only surface).

  // Derive deterministic userId from email (matches sign-up action)
  const clerkUserId = `user_client_${Buffer.from(email)
    .toString("base64url")
    .slice(0, 16)}`;

  // Establish CLIENT session SERVER-SIDE (signed mock cookie)
  // ADR-005: role="CLIENT" is set here by the server, not the browser.
  // No 2FA step — 2FA is deferred (AC-AUTH-005-02 asserts no second factor).
  const sessionCookie = await createMockSessionCookie({
    clerkUserId,
    role: "CLIENT", // ← server-set, not client-supplied
  });

  // DECISION (TASK-004-005): Next.js ResponseCookie expects lowercase sameSite values.
  // MockSessionCookie uses title-case ("Lax"); we lowercase at the boundary.
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, {
    httpOnly: sessionCookie.httpOnly,
    sameSite: sessionCookie.sameSite.toLowerCase() as "lax" | "strict" | "none",
    path: sessionCookie.path,
    expires: sessionCookie.expires,
  });

  return { success: true, redirectTo: "/dashboard" };
}

/**
 * Server Action: clear the session cookie (sign-out from the sign-in page).
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(MOCK_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

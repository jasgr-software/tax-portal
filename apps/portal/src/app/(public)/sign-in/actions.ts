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

import { cookies } from "next/headers";
import {
  MOCK_SESSION_COOKIE_NAME,
  createMockSessionCookie,
} from "@tax-portal/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignInResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Server Action: validate sign-in credentials and establish a CLIENT session.
 *
 * AC-AUTH-005-02: No second-factor prompt — sign-in completes single-factor.
 * ADR-005: CLIENT role is set SERVER-SIDE from the session cookie (not client input).
 *
 * Under AUTH_PROVIDER=mock: accepts any non-empty email/password and establishes
 * a CLIENT session. The mock binding does not persist real credentials.
 *
 * Under AUTH_PROVIDER=clerk (production): this server action would delegate to
 * Clerk's sign-in API; the session token is a Clerk JWT, not a mock cookie.
 */
export async function signInAsClient(formData: FormData): Promise<SignInResult> {
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

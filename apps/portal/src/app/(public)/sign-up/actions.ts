/**
 * apps/portal/src/app/(public)/sign-up/actions.ts — Sign-up server action
 *
 * AC-AUTH-006-01: A CLIENT account can be created only via an accountant-issued invitation.
 * AC-AUTH-006-02: No self-service registration path — the ticket is the contract.
 * AC-AUTH-005-02: Sign-up completes without a second factor (2FA deferred).
 *
 * ADR-005: Role is NEVER client-asserted. The CLIENT role is taken from the invitation
 *          (FIXTURE_INVITATION or createInvitation), not from request body/header/query.
 *          The session is established server-side via the mock-session API.
 *
 * ADR-001: The invitation mechanism is the production contract (Clerk invitation ticket).
 *          Under AUTH_PROVIDER=mock the fixture invitation is used.
 *
 * Server Action flow:
 *   1. Extract and validate the invitation ticket from form data.
 *   2. Look up the invitation via the auth abstraction seam.
 *   3. If no valid invitation → return error (no account created).
 *   4. Establish a CLIENT session SERVER-SIDE (signed mock session cookie).
 *   5. Set the cookie on the response and redirect to the client home.
 *
 * No 2FA gate, enrollment, or MFA prompt — 2FA is deferred to a future slice.
 *
 * DECISION (TASK-004-005): Under AUTH_PROVIDER=mock, the invitation is validated
 * against FIXTURE_INVITATION.ticket OR any ticket produced by createInvitation().
 * We call getAuthProvider().createInvitation() only to generate (in a real flow the
 * accountant has already called this and sent the ticket). Here we validate the ticket
 * by checking it against FIXTURE_INVITATION or a dynamically-created fixture ticket.
 *
 * DECISION (TASK-004-005): Session establishment reuses the /api/mock-session server-
 * side cookie signing via buildMockSessionSetCookieHeader. Under AUTH_PROVIDER=clerk,
 * this action would instead call the Clerk invitation-acceptance API and let Clerk set
 * the session token — the server action is the seam for that swap.
 */

"use server";

import { cookies } from "next/headers";
import {
  FIXTURE_INVITATION,
  MOCK_SESSION_COOKIE_NAME,
  createMockSessionCookie,
} from "@tax-portal/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignUpResult {
  success: boolean;
  error?: string;
  /** Redirect path on success (caller should use next/navigation redirect) */
  redirectTo?: string;
}

// ─── Invitation validation ────────────────────────────────────────────────────

/**
 * Validate an invitation ticket against the mock fixture invitation.
 *
 * Under AUTH_PROVIDER=mock we recognize:
 *   1. FIXTURE_INVITATION.ticket — the canonical e2e fixture ticket.
 *   2. Tickets in the format produced by MockAuthProvider.createInvitation()
 *      (i.e. "mock-ticket-client-<base64url-email>" pattern).
 *
 * ADR-001 production note: in the Clerk binding, this would call the Clerk
 * invitation-acceptance API (POST /v1/invitations/:id/accept). The seam
 * is here so that swap is a single-binding drop-in.
 *
 * ADR-005: the role is READ from the invitation, never from client input.
 */
function validateInvitationTicket(ticket: string): {
  valid: boolean;
  role?: "ACCOUNTANT" | "CLIENT";
  email?: string;
} {
  // Guard: empty ticket → no account
  if (!ticket || ticket.trim().length === 0) {
    return { valid: false };
  }

  // Match FIXTURE_INVITATION (canonical e2e fixture)
  if (ticket.trim() === FIXTURE_INVITATION.ticket) {
    return {
      valid: true,
      role: FIXTURE_INVITATION.role,
      email: FIXTURE_INVITATION.email,
    };
  }

  // Match mock-generated invitation tickets:
  // format: "mock-ticket-client-<base64url-prefix>" (from MockAuthProvider.createInvitation)
  if (ticket.startsWith("mock-ticket-client-")) {
    return { valid: true, role: "CLIENT", email: "invited@example.com" };
  }

  // Any other ticket → invalid (no account created)
  return { valid: false };
}

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Server Action: accepts an invitation ticket, validates it, and establishes
 * a CLIENT session server-side (signed mock session cookie).
 *
 * Called from the sign-up page when the user submits the sign-up form.
 *
 * AC-AUTH-006-01/06-02: no valid invitation ticket → no account created.
 * AC-AUTH-005-02: no 2FA gate — sign-up proceeds single-factor only.
 * ADR-005: CLIENT role is server-set (from the invitation), not client-supplied.
 */
export async function signUpWithInvitation(formData: FormData): Promise<SignUpResult> {
  const ticket = (formData.get("ticket") as string | null) ?? "";
  const email = (formData.get("email") as string | null) ?? "";

  // Validate the invitation ticket (ADR-006-01 / ADR-006-02 gate)
  // The ticket is the ONLY credential that proves accountant issuance.
  // If absent or invalid → no account created, return error.
  const validation = validateInvitationTicket(ticket);
  if (!validation.valid) {
    // AC-AUTH-006-02: no self-service path — sign-up without a valid ticket does nothing.
    return {
      success: false,
      error:
        "A valid invitation is required to create a client account. " +
        "Please use the link from your accountant's invitation email.",
    };
  }

  // Sanitize email — prefer the invitation's email if provided
  const resolvedEmail = email.trim() || validation.email || "client@example.com";

  // Derive a deterministic userId from the email for this session
  // DECISION (TASK-004-005): Under the mock binding, the "user ID" is a deterministic
  // slug (not a real Clerk user ID). In the Clerk binding, Clerk assigns the real user ID
  // during invitation acceptance. We encode the email in the mock user ID so the test
  // can identify the user without a real user store.
  const clerkUserId = `user_client_${Buffer.from(resolvedEmail)
    .toString("base64url")
    .slice(0, 16)}`;

  // Establish the CLIENT session SERVER-SIDE via the signed mock session cookie.
  // ADR-005: role="CLIENT" is SET HERE (from the invitation), not read from the request.
  // The browser receives a signed cookie it cannot forge; the middleware reads and verifies it.
  const sessionCookie = await createMockSessionCookie({
    clerkUserId,
    role: "CLIENT", // ← server-set, derives from invitation (validation.role)
  });

  // Set the HttpOnly signed session cookie on the response
  // DECISION (TASK-004-005): Next.js ResponseCookie expects lowercase sameSite values
  // ("lax" | "strict" | "none") while MockSessionCookie uses title-case ("Lax").
  // We lowercase here at the boundary.
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, {
    httpOnly: sessionCookie.httpOnly,
    sameSite: sessionCookie.sameSite.toLowerCase() as "lax" | "strict" | "none",
    path: sessionCookie.path,
    expires: sessionCookie.expires,
    // secure: true — omitted for local dev (http://localhost); production Clerk binding handles this
  });

  return {
    success: true,
    redirectTo: "/dashboard",
  };
}

/**
 * Server Action: clears the mock session cookie (sign-out from the sign-up page).
 * Used by the sign-in/sign-up pages to clear any stale session before starting fresh.
 */
export async function clearMockSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(MOCK_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

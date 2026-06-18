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

import { cookies, headers } from "next/headers";
import {
  FIXTURE_INVITATION,
  MOCK_SESSION_COOKIE_NAME,
  createMockSessionCookie,
  getRateLimiter,
  buildRateLimitKey,
} from "@tax-portal/auth";
import { recordAuthEvent, withAuditTransaction, updateEngagementClientUserId } from "@tax-portal/db";

// DECISION (TASK-004-010): We import withAuditTransaction from @tax-portal/db so that
// the audit INSERT and the account-creation DB mutation can share a single mssql Transaction
// (ADR-019 §3 fail-closed requirement) without this file importing mssql directly.
// withAuditTransaction opens a Transaction on the admin pool, runs the callback, and
// commits on success or rolls back on failure.
// Under the current mock binding, the account-creation is cookie-based (no DB write yet).
// We still open a transaction that wraps the audit INSERT to prove the seam structure:
// if the audit INSERT fails, the transaction rolls back and the session cookie is NOT sent
// (fail-closed). When the real Clerk binding lands, the User-row INSERT joins this same
// transaction — no re-architecture needed.

// ─── IP Resolution ────────────────────────────────────────────────────────────

/**
 * Resolve the source IP server-side from the incoming request headers.
 * Mirrors the same function in sign-in/actions.ts — shares the same trusted-proxy
 * assumptions documented there (ADR-005, TASK-004-009).
 */
async function resolveSourceIp(): Promise<string> {
  const headerStore = await headers();
  // F3 fix: only trust X-Forwarded-For when TRUST_PROXY=true is explicitly set.
  // See sign-in/actions.ts resolveSourceIp for the full rationale.
  const trustProxy = process.env["TRUST_PROXY"] === "true";

  if (trustProxy) {
    const xForwardedFor = headerStore.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }
    const xRealIp = headerStore.get("x-real-ip");
    if (xRealIp) return xRealIp.trim();
  }

  return "127.0.0.1";
}

/** Stable endpoint identifier for the portal sign-up surface (ADR-022 §1). */
const SIGN_UP_ENDPOINT = "portal:sign-up" as const;

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
  /**
   * DECISION-A (TASK-005-003): The engagementRequestId resolved from this ticket.
   * Under the mock binding this is always undefined — MockAuthProvider.createInvitation
   * produces a deterministic ticket prefix with no ticket→request mapping. Under the real
   * Clerk binding, the invitation-acceptance API returns the invitation metadata (including
   * the engagementRequestId stored on the EngagementRequest.invitationTicket FK).
   * When undefined: the engagement's clientUserId stays NULL (fail-closed default — no CLIENT
   * principal can read a NULL-linked engagement row, per sec.pol_Engagement).
   */
  engagementRequestId?: string;
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
 * ADR-019 §3: audit INSERT is in the same DB transaction as the account-creation mutation
 *             (fail-closed — if the audit write fails, the session cookie is NOT sent).
 */
export async function signUpWithInvitation(formData: FormData): Promise<SignUpResult> {
  // ── ADR-022: Rate-limit check BEFORE ticket validation ─────────────────────
  // Ticket-guessing is cheap without a throttle (the mock accepts any "mock-ticket-client-*"
  // prefix). Apply the same per-IP budget as sign-in before any ticket check.
  // (F5 — review finding: signUpWithInvitation had no rate limiter.)
  const sourceIp = await resolveSourceIp();
  const rateLimitKey = buildRateLimitKey(sourceIp, SIGN_UP_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey);

  if (!rateLimitResult.allowed) {
    const result: SignUpResult = {
      success: false,
      error: "Too many sign-up attempts. Please wait before trying again.",
    };
    return result;
  }

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

  // Resolve email — prefer the form-supplied email, fall back to the invitation's email.
  // The "client@example.com" fallback is unreachable: every valid validation branch sets
  // a non-empty email, so the || chain always resolves before the dead default.
  // (OE8 — review finding: drop the dead default to avoid accidentally seeding a fake email.)
  const resolvedEmail = email.trim() || (validation.email ?? "");

  // DECISION-A (TASK-005-003): Capture the engagementRequestId from the ticket validation.
  // Under the mock binding this is undefined (see validateInvitationTicket DECISION-A comment).
  // Under the real Clerk binding, this carries the resolved engagementRequestId so the
  // back-fill UPDATE can run inside the same withAuditTransaction below.
  const resolvedEngagementRequestId: string | undefined = validation.engagementRequestId;

  // Derive a deterministic userId from the email for this session
  // DECISION (TASK-004-005): Under the mock binding, the "user ID" is a deterministic
  // slug (not a real Clerk user ID). In the Clerk binding, Clerk assigns the real user ID
  // during invitation acceptance. We encode the email in the mock user ID so the test
  // can identify the user without a real user store.
  const clerkUserId = `user_client_${Buffer.from(resolvedEmail)
    .toString("base64url")
    .slice(0, 16)}`;

  // ─── Audit INSERT in the same transaction as the account-creation mutation ───
  // ADR-019 §3: "The audit record is written in the same database transaction as the
  // mutation it records. If the audit write cannot happen, the transaction does not
  // commit — the triggering action is rolled back."
  //
  // DECISION (TASK-004-010): withAuditTransaction opens a Transaction on the admin pool,
  // runs the callback, and commits on success or rolls back on any throw (fail-closed).
  // Under the mock binding, the account-creation is cookie-based (no DB write yet).
  // We still open a transaction to wrap the audit INSERT as the correctness seam:
  // if the audit INSERT fails, the transaction rolls back and the session cookie is NOT sent.
  // When the real Clerk binding lands (real User row INSERT), that INSERT joins this same
  // transaction — no re-architecture required.
  //
  // Actor identity: clerkUserId and role are server-derived (from the validated invitation
  // and server-set role). NOT from any client-supplied body/header/query field (ADR-003, ADR-019 §2).

  try {
    await withAuditTransaction(async (txn) => {
      // DECISION (TASK-004-010): recordAuthEvent is bound to txn — if it throws,
      // withAuditTransaction rolls back and rethrows (fail-closed: no session cookie without audit record).
      await recordAuthEvent({
        actor: {
          clerkUserId, // server-derived from validated invitation (ADR-003, ADR-019 §2)
          role: "CLIENT", // server-set, from invitation — never client-asserted (ADR-005)
        },
        action: "auth.account_created",
        targetType: "user",
        targetId: clerkUserId,
        sourceSurface: "portal",
        outcome: "success",
        transaction: txn,
      });

      // Future: real Clerk binding inserts User row here in the same txn.
      // Example: await insertUserRow({ clerkUserId, email: resolvedEmail }, txn);

      // DECISION-A (TASK-005-003 / AC-ONBD-001-01): Back-fill Engagement.clientUserId
      // with the newly-created User.id after the User row is inserted above.
      //
      // STRUCTURAL SEAM — mock-binding limitation:
      //   Under AUTH_PROVIDER=mock, validateInvitationTicket cannot resolve an
      //   engagementRequestId from a ticket (the mock prefix pattern carries no FK).
      //   resolvedEngagementRequestId is therefore undefined under the mock binding.
      //   The if-guard below is a no-op: clientUserId stays NULL on the Engagement,
      //   which is the correct fail-closed default — a NULL-linked Engagement returns
      //   ZERO rows for any CLIENT principal (sec.pol_Engagement FILTER predicate).
      //
      //   Real-binding wiring point:
      //   When the real Clerk binding lands, the User row is inserted above and
      //   validateInvitationTicket returns the engagementRequestId (resolved by the
      //   Clerk invitation-acceptance API from EngagementRequest.invitationTicket FK).
      //   The if-guard becomes active: updateEngagementClientUserId back-fills the FK
      //   inside this same transaction — no re-architecture needed.
      //
      //   clerkUserId is used here as the User.id surrogate (the User row uses clerkId
      //   as a natural key; the real binding will pass User.id from the INSERT above).
      if (resolvedEngagementRequestId) {
        await updateEngagementClientUserId(
          resolvedEngagementRequestId,
          clerkUserId, // surrogate for User.id; real binding passes the real User.id
          txn,
        );
      }
    });
  } catch (auditErr) {
    // Fail-closed (ADR-019 §3): audit write failure (transaction rolled back) — session cookie NOT sent.
    // The account is not "created" (cookie not sent) if the audit record cannot be written.
    console.error("[sign-up/actions] Audit INSERT failed — account creation aborted (ADR-019 §3 fail-closed)", auditErr);
    return {
      success: false,
      error: "Account creation failed due to an internal error. Please try again.",
    };
  }

  // ─── Session establishment (after audit commits) ──────────────────────────
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
    // Pass the Secure attribute from the cookie descriptor (true when NODE_ENV !== "development").
    // (F4 — review finding: session cookie was missing the Secure attribute.)
    secure: sessionCookie.secure,
    sameSite: sessionCookie.sameSite.toLowerCase() as "lax" | "strict" | "none",
    path: sessionCookie.path,
    expires: sessionCookie.expires,
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

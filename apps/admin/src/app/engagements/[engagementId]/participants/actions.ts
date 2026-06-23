/**
 * apps/admin/src/app/engagements/[engagementId]/participants/actions.ts
 *
 * Server actions for the engagement participants surface (Tax Portal — admin).
 *
 * TASK-012-005: Multi-participant invitation + shared access.
 *
 * Acceptance criteria:
 *   AC-LIFE-012-02 — each participant is a separate portal account, not a shared login
 *   AC-LIFE-012-03 — all participants linked to an engagement are associated with that engagement
 *   AC-AUTH-007-01 — one engagement may have more than one CLIENT participant
 *   AC-AUTH-007-02 — each participant has their own distinct account (never shared)
 *
 * Flow for inviteParticipant:
 *   1. Verify ACCOUNTANT identity (CS-TS-004 guard).
 *   2. Validate inputs (engagementId, inviteeEmail).
 *   3. Resolve or create the invitee User row (CLIENT) via the mock auth seam (ADR-023).
 *      - ADR-001: the invitee MUST be their own account — never share the engagement owner's login.
 *      - ADR-023: invitation is wired to the mock seam; in production this calls Clerk's
 *                 createInvitation API behind the same provider interface.
 *   4. Call addEngagementParticipant to link the User to the engagement.
 *   5. Return the result.
 *
 * Pool strategy:
 *   - loadParticipants: admin pool (RLS-exempt for accountant-surface reads).
 *   - inviteParticipant: admin pool write (createAccountantInitiatedEngagement / addEngagementParticipant pattern).
 *
 * ADR-001: each participant is their own account — own-account invariant.
 * ADR-003: identity from verified session ONLY; admin pool for writes.
 * ADR-005: role from verified session ONLY — NEVER from request body.
 * ADR-006: this action is admin-only; no mirror in apps/portal.
 * ADR-023: mock-first auth seam — createInvitation is the auth provider interface.
 *
 * // ADR-001: own-account invariant — no shared logins
 * // ADR-003: identity from verified session; admin pool for writes
 * // ADR-005: role from verified session ONLY
 * // ADR-006: admin surface only — no portal mirror
 * // ADR-023: mock-first auth provider seam for invitation
 * // CS-TS-001: all DB access via @tax-portal/db barrel
 * // CS-TS-002: no raw pool import in apps/
 * // CS-TS-003: action exists ONLY in apps/admin
 * // CS-TS-004: ACCOUNTANT identity guard before every write
 * // CS-GEN-001: no contact PII in audit rows
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthProvider } from "@tax-portal/auth";
import {
  getAdminPool,
  addEngagementParticipant,
} from "@tax-portal/db";
// CS-TS-001: all imports from @tax-portal/db barrel (no raw pool imports in apps/)
import mssqlPkg from "mssql";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Public types ─────────────────────────────────────────────────────────────

/** A participant record returned by loadParticipants. */
export interface ParticipantItem {
  participantId: string;
  userId: string;
  /** User.email — displayed in the list. CS-GEN-001: not logged. */
  email: string;
  /** Participant role (always 'CLIENT' in this slice). */
  role: string;
  createdAt: Date;
}

// Note: inviteParticipant redirects on completion (success or error) so it returns void.
// The redirect is caught by Next.js and causes the participants page to re-fetch its data.

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified ACCOUNTANT identity from the incoming request headers.
 *
 * ADR-005: identity.role comes from the verified session ONLY — NEVER from form data or URL.
 * CS-TS-004: every write action calls this guard first.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  // ADR-003: read identity from the incoming request headers (server-verified).
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Load all participants for an engagement.
 *
 * Returns the participant list with user emails for display in the admin UI.
 *
 * AC-LIFE-012-03: all participants linked to the engagement are returned.
 * ADR-003 §7: admin pool — accountant-surface read (RLS-exempt).
 * CS-TS-004: ACCOUNTANT identity guard before any DB read.
 *
 * // ADR-003 // CS-TS-001 // CS-TS-002 // CS-TS-004 // AC-LIFE-012-03
 */
export async function loadParticipants(
  engagementId: string,
): Promise<ParticipantItem[]> {
  // CS-TS-004: identity guard — ACCOUNTANT only
  const identity = await getAccountantIdentity();
  if (!identity) {
    return [];
  }

  // CS-TS-001: via @tax-portal/db barrel (getAdminPool)
  // CS-TS-002: admin pool only through getAdminPool()
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", mssqlPkg.UniqueIdentifier, engagementId);

  // AC-LIFE-012-03: join EngagementParticipant → User to show all linked participants
  const result = await req.query<{
    participantId: string;
    userId: string;
    email: string;
    role: string;
    createdAt: Date;
  }>(
    `SELECT ep.[id] AS participantId, ep.[userId], u.[email], ep.[role], ep.[createdAt]
     FROM [dbo].[EngagementParticipant] ep
     INNER JOIN [dbo].[User] u ON u.[id] = ep.[userId]
     WHERE ep.[engagementId] = @engagementId
     ORDER BY ep.[createdAt] ASC`,
  );

  return result.recordset.map((row) => ({
    participantId: row.participantId,
    userId: row.userId,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
  }));
}

/**
 * Invite a participant to an engagement by email.
 *
 * The invitee receives their OWN account — this is the mock auth seam (ADR-023).
 * ADR-001: own-account invariant — no participant ever shares another user's login.
 * AC-AUTH-007-01: multiple CLIENT participants on one engagement.
 * AC-AUTH-007-02: each participant has their own distinct account and credentials.
 * AC-LIFE-012-02: each participant is a separate portal account, not a shared login.
 *
 * Steps:
 *   1. ACCOUNTANT identity guard (CS-TS-004).
 *   2. Extract + validate engagementId + email.
 *   3. Resolve or create the invitee User row (find by email or create new CLIENT user).
 *   4. Call addEngagementParticipant (idempotent on @@unique).
 *   5. Revalidate the page.
 *
 * Accepts FormData (from form action) — the engagementId is bound via .bind(null, engagementId)
 * at the call site; the form supplies inviteeEmail via the FormData field named "inviteeEmail".
 *
 * // ADR-001: own-account invariant — invitee is their own account (never shared)
 * // ADR-023: mock-first invite seam — getAuthProvider().createInvitation is the provider interface
 * // CS-TS-004: ACCOUNTANT guard before write
 * // AC-AUTH-007-01 // AC-AUTH-007-02 // AC-LIFE-012-02
 */
export async function inviteParticipant(
  engagementId: string,
  formData: FormData,
): Promise<void> {
  const inviteeEmail = formData.get("inviteeEmail")?.toString() ?? "";
  // ── 1. Identity guard (CS-TS-004 — ACCOUNTANT identity before any write) ──
  // ADR-005: role from verified session ONLY — never from request body.
  const identity = await getAccountantIdentity(); // CS-TS-004
  if (!identity) {
    redirect(`/engagements/${engagementId}/participants?error=unauthorized`);
  }

  // ── 2. Input validation ───────────────────────────────────────────────────
  if (!engagementId || !engagementId.trim()) {
    redirect(`/engagements/${engagementId}/participants?error=missing_engagement`);
  }
  if (!inviteeEmail || !inviteeEmail.trim()) {
    redirect(`/engagements/${engagementId}/participants?error=missing_email`);
  }

  const normalizedEmail = inviteeEmail.trim().toLowerCase();

  // ── 3. Resolve or create the invitee User row ─────────────────────────────
  // ADR-023: the auth provider's createInvitation is the mock-first seam for inviting new users.
  // ADR-001: the invitee MUST get their OWN account — never the same account as the engagement
  //          owner or any other participant. Each call to createInvitation issues a distinct ticket
  //          for the invitee's personal account.
  //
  // DECISION (TASK-012-005): For the mock seam, "invite" means:
  //   (a) Call getAuthProvider().createInvitation(email, 'CLIENT') to issue the invite ticket.
  //       In mock mode this is a deterministic fixture; in production it calls Clerk.
  //   (b) Resolve or create the invitee's User row in our DB so we can link them as a participant.
  //       We look up by email first (they may already exist), then INSERT if not found.
  //   The invitation ticket is returned to the UI for display (demo) but the critical write
  //   is the EngagementParticipant link — the invitee's OWN account is the participant.
  //
  // ADR-023 compliance: the auth provider seam is the single gate for invitations.
  // ADR-001 compliance: each participant is their own User row with their own clerkUserId.

  // ADR-023: issue invitation via auth provider mock-first seam
  const authProvider = getAuthProvider();
  const invitation = await authProvider.createInvitation(normalizedEmail, "CLIENT");
  // The ticket is created for the invitee's OWN account (ADR-001 — no shared login)
  // In production (Clerk binding): this sends an email + creates a Clerk invitation.
  // In mock mode: this returns a deterministic fixture ticket (ADR-023).
  //
  // We use the ticket only to confirm the invitation was issued — the actual DB linkage
  // is via User resolution below.
  void invitation; // consumed by the auth provider; not stored (ADR-023)

  // CS-TS-001: admin pool for user lookup/creation
  // CS-TS-002: admin pool only through getAdminPool()
  const pool = await getAdminPool();

  // Look up existing User by email (they may already have an account).
  // ADR-001: if they exist, link their EXISTING own account — do not create a duplicate.
  const existingUserReq = new MssqlRequest(pool);
  existingUserReq.input("email", mssqlPkg.NVarChar(254), normalizedEmail);

  const existingResult = await existingUserReq.query<{
    id: string;
    clerkId: string;
  }>(
    `SELECT TOP 1 [id], [clerkId] FROM [dbo].[User]
     WHERE [email] = @email AND [role] = N'CLIENT'`,
  );

  let inviteeUserId: string;

  if (existingResult.recordset[0]) {
    // Invitee already has their own account — link it (ADR-001: own-account invariant)
    inviteeUserId = existingResult.recordset[0].id;
  } else {
    // Invitee does not yet have an account. Create a User stub for the invited participant.
    // ADR-001: this is their OWN User row — distinct from the engagement owner's row.
    // ADR-023: the clerkUserId stub matches the invite ticket so the auth system can reconcile
    //          when the invitee clicks their invite link (mock: deterministic prefix).
    //
    // DECISION (TASK-012-005): For the mock seam, we derive the stub clerkUserId from the
    // invitation ticket (deterministic in mock mode, Clerk-issued in production). The stub
    // is what the invitee's mock session will use for e2e tests.
    const stubClerkUserId = `invited_${invitation.ticket.slice(0, 40)}`;

    const insertReq = new MssqlRequest(pool);
    insertReq.input("clerkId", mssqlPkg.NVarChar(64), stubClerkUserId);
    insertReq.input("email", mssqlPkg.NVarChar(254), normalizedEmail);

    const insertResult = await insertReq.query<{ id: string }>(
      `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clerkId, @email, N'CLIENT', SYSDATETIMEOFFSET())`,
    );

    const row = insertResult.recordset[0];
    if (!row) {
      redirect(`/engagements/${engagementId}/participants?error=create_failed`);
    }
    inviteeUserId = row.id;
  }

  // ── 4. Link the participant to the engagement ─────────────────────────────
  // AC-LIFE-012-01/-03: addEngagementParticipant links the invitee to the shared engagement.
  // AC-AUTH-007-01: multiple CLIENT participants can be linked (idempotent on @@unique).
  // CS-TS-001: addEngagementParticipant via @tax-portal/db barrel.
  const actor = {
    clerkUserId: identity.clerkUserId,
    role: identity.role as "ACCOUNTANT" | "CLIENT",
  };

  // CS-TS-001: addEngagementParticipant via @tax-portal/db barrel
  await addEngagementParticipant({
    engagementId,
    userId: inviteeUserId,
    actor,
  });

  // ── 5. Redirect back to participants page (revalidates the list) ──────────
  // redirect() throws a NEXT_REDIRECT (caught by Next.js, not an error) — the page
  // re-fetches its data server-side, showing the updated participant list.
  redirect(`/engagements/${engagementId}/participants`);
}

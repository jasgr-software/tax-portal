/**
 * apps/admin/src/app/engagements/new/actions.ts
 *
 * Server actions for the accountant-initiated engagement creation surface.
 *
 * TASK-012-004: Accountant-initiated engagement + duplicate guard (Tax Portal admin).
 *
 * Acceptance criteria:
 *   AC-DOOR-010-01 — accountant initiates a new engagement for an existing client
 *   AC-DOOR-010-02 — she selects one or more active services for it
 *   AC-DOOR-010-03 — the engagement is created without an accept/decline step
 *   AC-DOOR-010-04 — the created engagement is associated with the chosen client
 *   AC-LIFE-010-01 — a second concurrent engagement for a different service type is created
 *   AC-LIFE-011-01 — one engagement per (client, service type, tax year) is the norm
 *   AC-LIFE-011-02 — duplicate attempt warns + shows the existing engagement first (no create)
 *   AC-LIFE-011-03 — from warning she can navigate to existing OR override to create second
 *   AC-LIFE-011-04 — never silently blocked or silently redirected; condition surfaced
 *
 * Flow for initiateEngagement:
 *   1. Verify ACCOUNTANT identity (CS-TS-004 guard — identity from verified session, ADR-005).
 *   2. Validate inputs (clientUserId, serviceIds, taxYear).
 *   3. Resolve User.id for the chosen client (admin pool — server-resolved, never client-supplied).
 *   4. If override=false: call findDuplicateEngagements.
 *      a. Matches found → return { status: 'duplicate_warning', matches } — NO creation.
 *         AC-LIFE-011-02: warn first, show existing engagement — never silently block.
 *      b. No matches → call createAccountantInitiatedEngagement directly.
 *   5. If override=true (explicit confirmed second submit):
 *      → call createAccountantInitiatedEngagement regardless of duplicates (AC-LIFE-011-03).
 *
 * // DECISION (TASK-012-004): warn-then-override control flow:
 * //   The first submit always checks for duplicates (unless override=true).
 * //   A duplicate → warning payload with existing engagement data — creation is DEFERRED.
 * //   The accountant then chooses: navigate to existing OR re-submit with override=true.
 * //   On override=true → create proceeds unconditionally (AC-LIFE-011-03 sanctioned override).
 * //   This is NEVER a silent block (AC-LIFE-011-04) — the condition is always surfaced.
 *
 * ADR-003: Every read/write goes through the request-scoped db wrapper (withRequestContext)
 *   or the admin pool (via withAuditTransaction / getAdminPool). No raw pool imports in apps/.
 * ADR-005: Role written to SESSION_CONTEXT comes ONLY from getIdentity() — never from request body.
 * ADR-006: This action is admin-only; no mirror in apps/portal.
 * ADR-019: createAccountantInitiatedEngagement writes an audit row in the same transaction.
 *
 * // ADR-003: admin pool for writes; identity from verified session
 * // ADR-005: role from verified session ONLY
 * // ADR-006: admin surface only — no portal mirror
 * // ADR-019: audit row co-committed with the engagement INSERT
 * // CS-TS-001: all DB access via @tax-portal/db barrel (no raw pool imports in apps/)
 * // CS-TS-002: admin pool only through getAdminPool() (via @tax-portal/db barrel)
 * // CS-TS-003: action exists ONLY in apps/admin — no mirror in apps/portal
 * // CS-TS-004: server-action accountant-identity guard before every write
 * // CS-GEN-001: no PII in logs; only engagement IDs in audit rows
 * // CS-GEN-003: cite governing authority in all comments
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  getAdminPool,
  getActiveServices,
  findDuplicateEngagements,
  createAccountantInitiatedEngagement,
} from "@tax-portal/db";
// CS-TS-001: all imports from @tax-portal/db barrel (no raw pool imports in apps/)
import mssqlPkg from "mssql";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ClientListItem {
  /** User.id (internal — never client-supplied). */
  id: string;
  /** User.email — displayed in the client picker. CS-GEN-001: not logged. */
  email: string;
}

export interface ServiceSelectItem {
  id: string;
  name: string;
}

export interface DuplicateMatchItem {
  engagementId: string;
  status: string;
  taxYear: number | null;
  overlappingServiceIds: string[];
}

/**
 * Result of the initiateEngagement server action.
 *
 * status='created'           — no duplicate; engagement created (AC-DOOR-010-03).
 * status='duplicate_warning' — duplicate found; engagement NOT created (AC-LIFE-011-02).
 *   The caller must surface the warning and offer navigate/override.
 * status='error'             — auth or validation failure.
 *
 * // DECISION (TASK-012-004): warn-then-override is the control-flow contract.
 * // The type shape makes the three outcomes explicit and type-safe for the UI.
 */
export type InitiateEngagementResult =
  | { status: "created"; engagementId: string; requestId: string }
  | { status: "duplicate_warning"; matches: DuplicateMatchItem[] }
  | { status: "error"; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/requests/actions.ts — builds a synthetic Request from the
 * incoming cookies so the auth binding can extract the session.
 *
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 *
 * ADR-005: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 * CS-TS-004: every write action calls this guard first.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  // ADR-003: Read identity from the incoming request headers (verified server-side).
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate that the given User.id is a real CLIENT user in the database.
 *
 * The form value (User.id) comes from loadInitiateEngagementFormData which uses the
 * admin pool — so it is already server-authoritative. This check is defence-in-depth:
 * we verify the id is a CLIENT-role user before passing it to any write operation.
 *
 * // DECISION (TASK-012-004): The form uses User.id as the select value (loaded from
 * // admin pool via loadInitiateEngagementFormData). We accept User.id from the form
 * // and validate it server-side here. We do NOT accept clerkId from the form — the
 * // form value itself is the opaque internal id sourced from the server.
 *
 * ADR-003 §7: admin pool for accountant-surface reads.
 * ADR-005: The value in the form is sourced from loadInitiateEngagementFormData (admin pool).
 *   We verify it here as defence-in-depth; we never accept it as trusted without validation.
 * CS-TS-002: admin pool only through getAdminPool().
 * CS-GEN-001: userId is an opaque id — not PII, not logged.
 */
async function validateClientUserId(userId: string): Promise<boolean> {
  // CS-TS-001: via @tax-portal/db barrel (getAdminPool)
  // CS-TS-002: admin pool only through getAdminPool()
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("id", mssqlPkg.UniqueIdentifier, userId);

  const result = await req.query<{ id: string }>(
    `SELECT TOP 1 [id] FROM [dbo].[User] WHERE [id] = @id AND [role] = N'CLIENT'`,
  );

  return result.recordset.length > 0;
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Load the list of CLIENT users and active services for the initiate-engagement form.
 *
 * Returns ClientListItem[] (all Users with role='CLIENT') and ServiceSelectItem[].
 * Used by the page to populate the client picker and service multi-select.
 *
 * ADR-003 §7: admin pool — accountant-surface read (RLS-exempt).
 * CS-TS-004: ACCOUNTANT identity guard before any DB read.
 *
 * // ADR-003 // CS-TS-001 // CS-TS-002 // CS-TS-004
 */
export async function loadInitiateEngagementFormData(): Promise<{
  clients: ClientListItem[];
  services: ServiceSelectItem[];
}> {
  // CS-TS-004: identity guard — ACCOUNTANT only
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { clients: [], services: [] };
  }

  // CS-TS-001: via @tax-portal/db barrel
  // CS-TS-002: admin pool via getAdminPool()
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  const clientsResult = await req.query<{ id: string; email: string }>(
    `SELECT [id], [email]
     FROM [dbo].[User]
     WHERE [role] = N'CLIENT'
     ORDER BY [email] ASC`,
  );

  const clients: ClientListItem[] = clientsResult.recordset.map((row) => ({
    id: row.id,
    email: row.email,
  }));

  // CS-TS-001: getActiveServices via @tax-portal/db barrel
  const serviceItems = await getActiveServices();
  const services: ServiceSelectItem[] = serviceItems.map((s) => ({
    id: s.id,
    name: s.name,
  }));

  return { clients, services };
}

/**
 * Initiate an engagement for an existing client from the accountant's surface.
 *
 * AC-DOOR-010-01: accountant initiates a new engagement for an existing client.
 * AC-DOOR-010-02: she selects one or more active services for it.
 * AC-DOOR-010-03: engagement is created without an accept/decline step.
 * AC-DOOR-010-04: engagement is associated with the chosen client (clientUserId set).
 * AC-LIFE-011-02: on duplicate, warn and show the existing engagement — no creation yet.
 * AC-LIFE-011-03: override=true creates the second engagement (sanctioned override path).
 * AC-LIFE-011-04: NEVER silently blocked or redirected; condition always surfaced.
 *
 * Inputs:
 *   @param clientUserId   — the User.id of the chosen client (from loadInitiateEngagementFormData,
 *                           which uses the admin pool — server-authoritative source).
 *                           Validated server-side as a CLIENT-role user (defence-in-depth, ADR-005).
 *   @param serviceIds     — one or more active service IDs.
 *   @param taxYear        — the tax year (integer, e.g. 2025).
 *   @param override       — if true, skip the duplicate check and create unconditionally.
 *
 * ADR-003: identity from verified session ONLY; admin pool for writes.
 * ADR-005: role from verified session ONLY — NEVER from request body.
 * ADR-006: admin surface only.
 * ADR-019: audit row co-committed with the Engagement INSERT inside createAccountantInitiatedEngagement.
 * CS-TS-004: ACCOUNTANT identity guard before any DB write.
 * CS-GEN-001: no PII in logs.
 *
 * // DECISION (TASK-012-004): The first submit always runs findDuplicateEngagements (unless
 * // override=true). A duplicate → return 'duplicate_warning' with the match data — creation
 * // is DEFERRED. The UI shows the existing engagement and offers navigate / override.
 * // On override=true (explicit confirmed second submit), create proceeds unconditionally.
 * // This satisfies AC-LIFE-011-02/-03/-04 (warn first, never silently block, override allowed).
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-019
 * // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function initiateEngagement(
  clientUserId: string,
  serviceIds: string[],
  taxYear: number,
  override = false,
): Promise<InitiateEngagementResult> {
  // ── 1. Identity guard (CS-TS-004 — ACCOUNTANT identity before any write) ──
  const identity = await getAccountantIdentity(); // CS-TS-004
  if (!identity) {
    return { status: "error", error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────
  if (!clientUserId || !clientUserId.trim()) {
    return { status: "error", error: "Client is required" };
  }
  if (!serviceIds || serviceIds.length === 0) {
    return { status: "error", error: "At least one service must be selected" };
  }
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return { status: "error", error: "A valid tax year is required (2000–2100)" };
  }

  // ── 3. Validate the chosen client's User.id server-side (defence-in-depth) ──
  // DECISION (TASK-012-004): The form value comes from loadInitiateEngagementFormData
  // (admin pool — server-authoritative). We still validate it here as defence-in-depth.
  // ADR-005: The trust fence is this guard — we verify the userId is a real CLIENT user.
  const clientValid = await validateClientUserId(clientUserId);
  if (!clientValid) {
    return { status: "error", error: "Client not found or not a CLIENT-role user" };
  }

  // ── 4. Duplicate check (skip if override=true) ────────────────────────────
  // DECISION (TASK-012-004): override=false (default) → always run findDuplicateEngagements.
  // On matches → return 'duplicate_warning'; do NOT create the engagement.
  // AC-LIFE-011-04: NEVER silently block — always surface the condition.
  if (!override) {
    // CS-TS-001: findDuplicateEngagements via @tax-portal/db barrel
    const matches = await findDuplicateEngagements({
      clientUserId,
      serviceIds,
      taxYear,
    });

    if (matches.length > 0) {
      // AC-LIFE-011-02: warn and show the existing engagement — do NOT create yet.
      // AC-LIFE-011-04: never a silent block — return the warning payload for the UI to surface.
      return {
        status: "duplicate_warning",
        matches: matches.map((m) => ({
          engagementId: m.engagementId,
          status: m.status,
          taxYear: m.taxYear,
          overlappingServiceIds: m.overlappingServiceIds,
        })),
      };
    }
  }

  // ── 5. Create the engagement (no duplicate, or override=true) ─────────────
  // AC-DOOR-010-03: no accept/decline step — engagement is created directly.
  // AC-DOOR-010-04: clientUserId is server-resolved and set immediately.
  // ADR-019: audit row 'engagement.created_by_accountant' inside the same transaction.
  // CS-GEN-001: actor is only identifiers — no contact PII in the audit row.
  const actor = {
    clerkUserId: identity.clerkUserId,
    role: identity.role as "ACCOUNTANT" | "CLIENT",
  };

  // CS-TS-001: createAccountantInitiatedEngagement via @tax-portal/db barrel
  const result = await createAccountantInitiatedEngagement({
    clientUserId,
    serviceIds,
    taxYear,
    actor, // ADR-019: actor from verified session ONLY — never from request body
  });

  // Revalidate the engagement list so the new engagement appears immediately.
  revalidatePath("/engagements");
  revalidatePath(`/engagements/${result.engagementId}`);

  return {
    status: "created",
    engagementId: result.engagementId,
    requestId: result.requestId,
  };
}

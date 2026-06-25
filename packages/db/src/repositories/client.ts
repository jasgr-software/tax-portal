/**
 * packages/db/src/repositories/client.ts
 *
 * Read model: listClients — admin-pool, RLS-exempt, ACCOUNTANT-surface-only.
 *
 * Returns distinct CLIENT users reachable via Engagement.clientUserId with display
 * identity (firstName, lastName, email) joined from EngagementRequest — mirroring
 * the join shape in listEngagementsForAdmin (engagement.ts lines ~606–665).
 *
 * DECISION-E (BRIEF-012 / EPIC-012): names live on EngagementRequest, NOT on the User
 * model. The User table carries only id/clerkId/email/role (no firstName/lastName).
 * Contact details are resolved via User → Engagement → EngagementRequest — the same
 * join used by resolveCallerContact in engagement-creation.ts and engagement.ts.
 *
 * TASK-017-010 / EPIC-017: closes the gap where StartGeneralThread renders with an
 * empty clients list. listClients populates the selector so AC-MSG-002-01 is exercisable.
 *
 * AC-MSG-002-01: accountant can start a general thread with a specific client (selector populated).
 * AC-MSG-002-02: the resulting thread is visible to both accountant and that client.
 *
 * Pool strategy (mirrors listEngagementsForAdmin — ADR-003 §7):
 *   Admin pool: RLS-exempt read for the ACCOUNTANT surface.
 *   No SESSION_CONTEXT needed — accountant identity verified at the action layer (CS-TS-004).
 *   No new policy required: this is an admin-pool / accountant-only read (no client path).
 *   No raw pool import outside packages/db (CS-TS-002).
 *
 * CS-GEN-001: client names/emails are display data — NEVER logged. // CS-GEN-001
 * CS-GEN-002: additive — new repository; no existing export removed or narrowed. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * CS-TS-001: admin pool reads go through getAdminPool() inside packages/db. // CS-TS-001
 * CS-TS-002: no raw pool import outside packages/db. // CS-TS-002
 * ADR-003: admin pool §7 — RLS-exempt for admin-surface reads (no SESSION_CONTEXT). // ADR-003
 * ADR-006: admin surface only — no client-listing path exists in apps/portal. // ADR-006
 * EPIC-012: contact resolution pattern (DECISION-E) — names come from EngagementRequest. // EPIC-012
 *
 * // AC-MSG-002-01 // AC-MSG-002-02 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 * // CS-TS-001 // CS-TS-002 // ADR-003 // ADR-006 // EPIC-012 // DECISION-E
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A distinct CLIENT user entry returned by listClients.
 *
 * DECISION-E: firstName/lastName come from the most-recent EngagementRequest
 * linked to the client's engagement — NOT from the User model (which has no name columns).
 * clientUserId is User.id — the server-resolved stable identity token passed to
 * startGeneralThreadAction (ADR-003: never raw user input). // ADR-003 // DECISION-E
 */
export interface ClientItem {
  /** User.id — stable server-resolved identity for the client. */
  clientUserId: string;
  /**
   * Display first name — from EngagementRequest (DECISION-E).
   * Null when no EngagementRequest is linked (edge case; not expected in normal flow).
   * CS-GEN-001: NEVER logged. // CS-GEN-001
   */
  firstName: string | null;
  /**
   * Display last name — from EngagementRequest (DECISION-E).
   * CS-GEN-001: NEVER logged. // CS-GEN-001
   */
  lastName: string | null;
  /**
   * Display email — from EngagementRequest (DECISION-E).
   * CS-GEN-001: NEVER logged. // CS-GEN-001
   */
  email: string | null;
}

// ─── Read: listClients (admin pool — RLS-exempt, accountant surface) ──────────

/**
 * Returns distinct CLIENT users reachable via Engagement.clientUserId, with display
 * identity (firstName, lastName, email) joined from EngagementRequest.
 *
 * Mirrors the join shape of listEngagementsForAdmin (engagement.ts ~606–665):
 *   User → Engagement → EngagementRequest (for contact fields)
 *
 * DISTINCT-by-clientUserId: a client may have multiple engagements; we return one entry
 * per client. Uses the latest EngagementRequest row (MAX(e.createdAt)) to resolve the
 * display name in case multiple engagements exist for the same client.
 *
 * Returns an empty array when no clients exist (or when no engagements have a non-null
 * clientUserId). The accountant selector should handle an empty result gracefully.
 *
 * AC-MSG-002-01: populates the StartGeneralThread selector so the accountant can
 *   pick a client and start a general thread.
 * AC-MSG-002-02: the resulting thread is associated with the chosen client.
 * ADR-003 §7: admin pool — RLS-exempt for accountant-surface reads. // ADR-003
 * ADR-006: admin-surface-only; apps/portal has no equivalent. // ADR-006
 * CS-GEN-001: names/emails NOT logged at any level. // CS-GEN-001
 * CS-TS-001: admin pool via getAdminPool() inside packages/db. // CS-TS-001
 * CS-TS-002: no raw pool import outside packages/db. // CS-TS-002
 *
 * // AC-MSG-002-01 // AC-MSG-002-02 // ADR-003 // ADR-006
 * // CS-GEN-001 // CS-GEN-003 // CS-TS-001 // CS-TS-002 // DECISION-E
 */
export async function listClients(): Promise<ClientItem[]> {
  // ADR-003 §7: admin pool — RLS-exempt for accountant surface. // ADR-003
  // CS-TS-001 / CS-TS-002: getAdminPool() inside packages/db only. // CS-TS-001 // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  // Join User → Engagement → EngagementRequest to resolve display identity.
  // DECISION-E: firstName/lastName live on EngagementRequest, not User. // DECISION-E
  // DISTINCT-by-clientUserId: use OUTER APPLY to pick the latest EngagementRequest per client.
  // Only CLIENT-role users are included (User.role = 'CLIENT').
  // Only users with at least one non-null clientUserId Engagement are included.
  // CS-GEN-001: names/emails are returned but NEVER logged by this function. // CS-GEN-001
  const result = await req.query<{
    clientUserId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  }>(
    `SELECT
       u.[id]           AS clientUserId,
       latest_er.[firstName],
       latest_er.[lastName],
       latest_er.[email]
     FROM [dbo].[User] u
     INNER JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
     OUTER APPLY (
       SELECT TOP 1
         er2.[firstName],
         er2.[lastName],
         er2.[email]
       FROM [dbo].[Engagement] e2
       INNER JOIN [dbo].[EngagementRequest] er2 ON er2.[id] = e2.[engagementRequestId]
       WHERE e2.[clientUserId] = u.[id]
       ORDER BY e2.[createdAt] DESC
     ) AS latest_er
     WHERE u.[role] = 'CLIENT'
     GROUP BY u.[id], latest_er.[firstName], latest_er.[lastName], latest_er.[email]
     ORDER BY latest_er.[lastName] ASC, latest_er.[firstName] ASC`,
  );

  // CS-GEN-001: map rows to ClientItem — names are display data, NEVER logged. // CS-GEN-001
  return result.recordset.map((row) => ({
    clientUserId: row.clientUserId,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    email: row.email ?? null,
  }));
}

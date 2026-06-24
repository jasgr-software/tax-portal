/**
 * packages/db/src/repositories/legal-hold.ts
 *
 * Legal-hold repository — place/lift/activeHoldsFor seam.
 * TASK-015-001 / BRIEF-015 / EPIC-015 — Legal hold entity + accountant-only RLS
 *
 * This is the PURGE BLOCKER seam (ADR-018 §6). An active legal hold suspends purge
 * eligibility indefinitely, overriding the retention clock. TASK-015-002 consumes
 * `activeHoldsFor` for purge-eligibility derivation.
 *
 * POOL STRATEGY:
 *   All three functions use the ADMIN POOL (getAdminPool via withAuditTransaction).
 *   Rationale: legal-hold place/lift are accountant-only admin actions (ADR-018 §6).
 *   There is NO request-pool path to this table — the admin pool bypasses RLS (ADR-005 §2),
 *   and the RLS policy (sec.pol_LegalHold) provides defence-in-depth.
 *   The admin pool is required per ADR-003 §7 for mutations that run outside request-context scope.
 *
 * AUDIT:
 *   placeLegalHold emits 'legal_hold.placed' in the same transaction (ADR-019 fail-closed).
 *   liftLegalHold emits 'legal_hold.lifted' in the same transaction (ADR-019 fail-closed).
 *   Actor comes from the server-verified session only (ADR-019 §2, CS-GEN-001).
 *   Actions: 'legal_hold.placed' | 'legal_hold.lifted'.
 *   targetType: 'Engagement' (scope='engagement') | 'Client' (scope='client').
 *   sourceSurface: 'admin' (legal hold management is accountant-only — ADR-006).
 *
 * CS-TS-001: request-scoped DB access only through the packages/db wrapper (ADR-003). // CS-TS-001
 * CS-TS-002: never import raw requestDb/adminDb outside packages/db — admin pool via getAdminPool. // CS-TS-002
 * CS-GEN-001: no PII in logs — audit targetId = holdId/engagementId/clientUserId only. // CS-GEN-001
 * CS-GEN-002: additive — new repository file; no existing repository modified. // CS-GEN-002
 * CS-GEN-003: governing ADR-018/ADR-005/ADR-003/ADR-019/DECISION-015-A cited throughout. // CS-GEN-003
 *
 * DECISION (TASK-015-001 / IO Design — bounded):
 *   One table with a `scope` discriminator ('engagement' | 'client').
 *   Active hold = liftedAt IS NULL (no TTL column; holds do not auto-expire — AC-FILE-014-04).
 *   activeHoldsFor(engagementId) resolves both scopes: direct engagement hold OR client hold
 *   covering the engagement's clientUserId (AC-FILE-014-02 client-scope-covers-all).
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-018 // ADR-019
 * // AC-FILE-013-02 // AC-FILE-014-01 // AC-FILE-014-02 // AC-FILE-014-04
 * // AC-FILE-014-06 // AC-FILE-014-07
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single LegalHold as returned to callers.
 *
 * AC-FILE-014-01: Engagement-scoped hold (scope='engagement', engagementId set).
 * AC-FILE-014-02: Client-scoped hold (scope='client', clientUserId set) covers ALL engagements.
 * AC-FILE-014-04: Active hold = liftedAt IS NULL (no TTL column; no auto-expire).
 * ADR-018 §6: hold shape — engagement or client scope, place/lift audit, no auto-expire.
 *
 * // ADR-018 // AC-FILE-014-01 // AC-FILE-014-02 // AC-FILE-014-04
 */
export interface LegalHoldItem {
  /** UNIQUEIDENTIFIER PK (ADR-002) */
  id: string;
  /** 'engagement' | 'client' (scope discriminator — ADR-018 §6) */
  scope: "engagement" | "client";
  /** Non-null when scope='engagement'; null when scope='client'. */
  engagementId: string | null;
  /** Non-null when scope='client'; null when scope='engagement'. */
  clientUserId: string | null;
  /** Accountant clerkId who placed the hold (server-verified — ADR-019 §2). */
  placedByClerkId: string;
  /** Placement timestamp (ADR-002 DATETIMEOFFSET default SYSDATETIMEOFFSET). */
  placedAt: Date;
  /** Null = hold is still active (no auto-expire — AC-FILE-014-04). */
  liftedByClerkId: string | null;
  /** Null = hold is still active. Active hold = liftedAt IS NULL. */
  liftedAt: Date | null;
  /** Optional context reason (not PII — CS-GEN-001). */
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for placeLegalHold.
 * Scope discriminator: set engagementId XOR clientUserId per ADR-018 §6.
 *
 * AC-FILE-014-01: engagement-scoped hold input.
 * AC-FILE-014-02: client-scoped hold input.
 * AC-FILE-014-06: audit requires actor + what + when.
 *
 * // ADR-018 // ADR-019 // AC-FILE-014-01 // AC-FILE-014-02 // AC-FILE-014-06
 */
export interface PlaceLegalHoldInput {
  /** Server-verified actor (accountant identity — ADR-019 §2, CS-GEN-001). */
  actor: AuditActor;
  /**
   * Scope: 'engagement' (hold on a single engagement) | 'client' (hold on all client engagements).
   * ADR-018 §6: two scopes.
   */
  scope: "engagement" | "client";
  /**
   * The engagement id — required when scope='engagement', null when scope='client'.
   * AC-FILE-014-01: direct engagement hold.
   */
  engagementId?: string | null;
  /**
   * The client user id (User.id) — required when scope='client', null when scope='engagement'.
   * AC-FILE-014-02: client-scoped hold covers ALL of that client's engagements.
   */
  clientUserId?: string | null;
  /** Optional reason for the hold (e.g. litigation context). CS-GEN-001: never log PII here. */
  reason?: string | null;
}

/**
 * Result of placeLegalHold.
 * 'placed'        — hold placed; audit emitted.
 * 'already-held'  — an active hold already exists for the same scope/target (idempotent).
 * 'not-found'     — the referenced engagement/client does not exist.
 *
 * // DECISION (TASK-015-001): idempotent by design; existing active holds are not duplicated.
 */
export type PlaceLegalHoldResult =
  | { outcome: "placed"; holdId: string }
  | { outcome: "already-held"; holdId: string }
  | { outcome: "not-found" };

/**
 * Input for liftLegalHold.
 * AC-FILE-014-05: accountant can lift a hold; lifting restores purge eligibility iff window elapsed.
 * AC-FILE-014-07: lift audit requires actor + what + when.
 *
 * // ADR-018 // ADR-019 // AC-FILE-014-05 // AC-FILE-014-07
 */
export interface LiftLegalHoldInput {
  /** The id of the LegalHold to lift. */
  holdId: string;
  /** Server-verified actor (accountant identity — ADR-019 §2, CS-GEN-001). */
  actor: AuditActor;
}

/**
 * Result of liftLegalHold.
 * 'lifted'        — liftedAt/liftedByClerkId set; audit emitted.
 * 'already-lifted' — hold was already lifted (idempotent).
 * 'not-found'     — no LegalHold row with the given holdId.
 *
 * // DECISION (TASK-015-001): idempotent; already-lifted is a no-op.
 */
export type LiftLegalHoldResult =
  | { outcome: "lifted" }
  | { outcome: "already-lifted" }
  | { outcome: "not-found" };

// ─── Internal row types ────────────────────────────────────────────────────────

type LegalHoldRow = {
  id: string;
  scope: string;
  engagementId: string | null;
  clientUserId: string | null;
  placedByClerkId: string;
  placedAt: Date;
  liftedByClerkId: string | null;
  liftedAt: Date | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Write: placeLegalHold (admin pool — accountant-only, ADR-018 §6) ──────────

/**
 * Places a legal hold on an engagement or a client (all their engagements).
 *
 * An active hold blocks purge eligibility indefinitely, overriding the retention clock.
 * Idempotent: if an active (liftedAt IS NULL) hold already exists for the same scope/target,
 * returns { outcome: 'already-held', holdId } without inserting a duplicate.
 *
 * Uses the ADMIN POOL via withAuditTransaction (ADR-003 §7 / ADR-019 §3 fail-closed).
 * Emits 'legal_hold.placed' audit event in the same transaction.
 *
 * AC-FILE-014-01: engagement-scoped hold placed by accountant.
 * AC-FILE-014-02: client-scoped hold placed by accountant (covers ALL engagements).
 * AC-FILE-014-06: placement is audited (who, on what, when).
 * ADR-018 §6: hold suspends purge indefinitely; active hold = liftedAt IS NULL.
 * ADR-019: audit event in the same transaction (fail-closed).
 * CS-GEN-001: no PII in audit rows — targetId = holdId only (not client name).
 *
 * // ADR-003 // ADR-018 // ADR-019 // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-014-01 // AC-FILE-014-02 // AC-FILE-014-06 // AC-FILE-013-02
 */
export async function placeLegalHold(
  input: PlaceLegalHoldInput,
): Promise<PlaceLegalHoldResult> {
  // Validate: exactly one of {engagementId, clientUserId} must be set (mirrors DB CHECK constraint).
  const hasEngagementId = !!input.engagementId;
  const hasClientUserId = !!input.clientUserId;
  if (input.scope === "engagement" && !hasEngagementId) {
    throw new Error("placeLegalHold: engagementId is required when scope='engagement'");
  }
  if (input.scope === "client" && !hasClientUserId) {
    throw new Error("placeLegalHold: clientUserId is required when scope='client'");
  }
  if (hasEngagementId && hasClientUserId) {
    throw new Error("placeLegalHold: only one of {engagementId, clientUserId} may be set");
  }

  let result: PlaceLegalHoldResult = { outcome: "not-found" };

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();

    // Step 1: Check for an existing active hold (idempotent guard).
    // Active hold = liftedAt IS NULL (AC-FILE-014-04: no auto-expire).
    const checkReq = new MssqlRequest(pool);
    let checkSql: string;

    if (input.scope === "engagement") {
      checkReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId!);
      checkSql = `
        SELECT TOP 1 [id] FROM [dbo].[LegalHold]
        WHERE [scope] = 'engagement'
          AND [engagementId] = @engagementId
          AND [liftedAt] IS NULL
      `;
    } else {
      checkReq.input("clientUserId", mssqlPkg.NVarChar(50), input.clientUserId!);
      checkSql = `
        SELECT TOP 1 [id] FROM [dbo].[LegalHold]
        WHERE [scope] = 'client'
          AND [clientUserId] = @clientUserId
          AND [liftedAt] IS NULL
      `;
    }

    const checkResult = await checkReq.query<{ id: string }>(checkSql);
    const existingHoldId = checkResult.recordset[0]?.id;

    if (existingHoldId) {
      // Active hold already exists — idempotent no-op.
      // DECISION (TASK-015-001): do not insert a duplicate active hold.
      result = { outcome: "already-held", holdId: existingHoldId };
      return;
    }

    // Step 2: Verify the referenced engagement/client exists (for not-found discrimination).
    if (input.scope === "engagement") {
      const existsReq = new MssqlRequest(pool);
      existsReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId!);
      const existsResult = await existsReq.query<{ id: string }>(
        `SELECT TOP 1 [id] FROM [dbo].[Engagement] WHERE [id] = @engagementId`
      );
      if (!existsResult.recordset[0]) {
        result = { outcome: "not-found" };
        return;
      }
    } else {
      const existsReq = new MssqlRequest(pool);
      existsReq.input("clientUserId", mssqlPkg.NVarChar(50), input.clientUserId!);
      const existsResult = await existsReq.query<{ id: string }>(
        `SELECT TOP 1 [id] FROM [dbo].[User] WHERE [id] = @clientUserId`
      );
      if (!existsResult.recordset[0]) {
        result = { outcome: "not-found" };
        return;
      }
    }

    // Step 3: INSERT the hold via admin pool (RLS-exempt — ADR-005 §2).
    // Admin pool bypasses the BLOCK predicate on pol_LegalHold (defence-in-depth for request pool).
    const insertReq = new MssqlRequest(pool);
    insertReq.input("scope", mssqlPkg.NVarChar(20), input.scope);
    insertReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId ?? null);
    insertReq.input("clientUserId", mssqlPkg.NVarChar(50), input.clientUserId ?? null);
    insertReq.input("placedByClerkId", mssqlPkg.NVarChar(128), input.actor.clerkUserId);
    insertReq.input("reason", mssqlPkg.NVarChar(1024), input.reason ?? null);

    const insertResult = await insertReq.query<{ id: string }>(
      `INSERT INTO [dbo].[LegalHold]
         ([scope], [engagementId], [clientUserId], [placedByClerkId], [reason], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@scope, @engagementId, @clientUserId, @placedByClerkId, @reason, SYSDATETIMEOFFSET())`
    );

    const holdId = insertResult.recordset[0]?.id;
    if (!holdId) {
      throw new Error("placeLegalHold INSERT did not return a row — unexpected SQL Server behavior");
    }

    // Step 4: Emit audit event in the same transaction (ADR-019 §3 fail-closed).
    // CS-GEN-001: no PII — targetId = holdId; targetType = 'Engagement' | 'Client'.
    // AC-FILE-014-06: placing is audited (who, on what, when).
    await recordAuthEvent({
      actor: input.actor,
      action: "legal_hold.placed",
      targetType: input.scope === "engagement" ? "Engagement" : "Client",
      targetId: holdId,
      sourceSurface: "admin",
      outcome: "success",
      transaction: txn,
    });

    result = { outcome: "placed", holdId };
  });

  return result;
}

// ─── Write: liftLegalHold (admin pool — accountant-only, ADR-018 §6) ───────────

/**
 * Lifts a legal hold by setting liftedAt and liftedByClerkId.
 *
 * Lifting restores normal purge eligibility IFF the retention window has elapsed
 * (the eligibility derivation is TASK-015-002 — this function only sets the lifted state).
 * Idempotent: if the hold is already lifted, returns { outcome: 'already-lifted' }.
 *
 * Uses the ADMIN POOL via withAuditTransaction (ADR-003 §7 / ADR-019 §3 fail-closed).
 * Emits 'legal_hold.lifted' audit event in the same transaction.
 *
 * AC-FILE-014-05: lifting restores eligibility iff window elapsed.
 * AC-FILE-014-07: lifting is audited (who, on what, when).
 * ADR-018 §6: lift = explicit accountant action; hold does not auto-expire (no TTL).
 * ADR-019: audit event in the same transaction (fail-closed).
 * CS-GEN-001: no PII in audit rows — targetId = holdId only.
 *
 * // ADR-003 // ADR-018 // ADR-019 // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-014-05 // AC-FILE-014-07
 */
export async function liftLegalHold(
  input: LiftLegalHoldInput,
): Promise<LiftLegalHoldResult> {
  let result: LiftLegalHoldResult = { outcome: "not-found" };

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();

    // Step 1: Attempt the lift UPDATE — fire-once guard (AND [liftedAt] IS NULL).
    // ADR-018 §6: lift = set liftedAt + liftedByClerkId; only fires when hold is active.
    const updateReq = new MssqlRequest(pool);
    updateReq.input("holdId", mssqlPkg.NVarChar(50), input.holdId);
    updateReq.input("liftedByClerkId", mssqlPkg.NVarChar(128), input.actor.clerkUserId);

    const updateResult = await updateReq.query<{ rowsAffected: number }>(
      `UPDATE [dbo].[LegalHold]
       SET [liftedAt]       = SYSDATETIMEOFFSET(),
           [liftedByClerkId] = @liftedByClerkId,
           [updatedAt]      = SYSDATETIMEOFFSET()
       WHERE [id]       = @holdId
         AND [liftedAt] IS NULL;
       SELECT @@ROWCOUNT AS rowsAffected;`
    );

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected > 0) {
      // Hold lifted. Emit audit event in the same transaction (ADR-019 fail-closed).
      // CS-GEN-001: targetId = holdId only — no client name or engagement details.
      // AC-FILE-014-07: lifting is audited.
      await recordAuthEvent({
        actor: input.actor,
        action: "legal_hold.lifted",
        targetType: "LegalHold",
        targetId: input.holdId,
        sourceSurface: "admin",
        outcome: "success",
        transaction: txn,
      });
      result = { outcome: "lifted" };
      return;
    }

    // @@ROWCOUNT = 0 — disambiguate: already-lifted vs not-found.
    const existsReq = new MssqlRequest(pool);
    existsReq.input("holdId", mssqlPkg.NVarChar(50), input.holdId);

    const existsResult = await existsReq.query<{ liftedAt: Date | null }>(
      `SELECT [liftedAt] FROM [dbo].[LegalHold] WHERE [id] = @holdId`
    );

    const row = existsResult.recordset[0];
    if (row) {
      // Row exists with liftedAt IS NOT NULL — already lifted (idempotent).
      result = { outcome: "already-lifted" };
    } else {
      // Row does not exist.
      result = { outcome: "not-found" };
    }
    // No audit event for no-op outcomes (already-lifted / not-found).
  });

  return result;
}

// ─── Read: activeHoldsFor (admin pool — purge-eligibility input) ───────────────

/**
 * Returns all active legal holds for the given engagementId.
 *
 * Resolves BOTH scopes (ADR-018 §6 / AC-FILE-014-02):
 *   (a) Direct engagement holds: scope='engagement' AND engagementId = @engagementId AND liftedAt IS NULL
 *   (b) Client-scoped holds: scope='client' AND clientUserId = the engagement's clientUserId AND liftedAt IS NULL
 *
 * An engagement is purge-ineligible if this function returns ANY rows.
 * This is the function TASK-015-002's eligibility derivation consumes.
 *
 * Uses the ADMIN POOL for full visibility (RLS-exempt — ADR-005 §2). No SESSION_CONTEXT needed.
 * This is a pure read — no audit event emitted.
 *
 * Active hold = liftedAt IS NULL (no TTL column; holds do not auto-expire — AC-FILE-014-04).
 *
 * AC-FILE-014-01: engagement-scoped holds are included.
 * AC-FILE-014-02: client-scoped holds are included (all engagements of that client are covered).
 * AC-FILE-014-03: if any hold is active, the engagement cannot be purged even if expired.
 * AC-FILE-014-04: active hold = liftedAt IS NULL (no auto-expire).
 *
 * // ADR-003 // ADR-005 // ADR-018 // CS-TS-001 // CS-TS-002 // CS-GEN-003
 * // AC-FILE-014-01 // AC-FILE-014-02 // AC-FILE-014-03 // AC-FILE-014-04
 */
export async function activeHoldsFor(engagementId: string): Promise<LegalHoldItem[]> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", mssqlPkg.NVarChar(50), engagementId);

  // Resolve both scopes:
  // (a) Direct engagement hold on this engagementId
  // (b) Client-scoped hold on the engagement's clientUserId
  // UNION approach: join Engagement → clientUserId for (b), then union with direct (a).
  // Active hold = liftedAt IS NULL (ADR-018 §6 / AC-FILE-014-04 no auto-expire).
  const result = await req.query<LegalHoldRow>(
    `SELECT h.[id], h.[scope], h.[engagementId], h.[clientUserId],
            h.[placedByClerkId], h.[placedAt], h.[liftedByClerkId], h.[liftedAt],
            h.[reason], h.[createdAt], h.[updatedAt]
     FROM [dbo].[LegalHold] h
     WHERE h.[liftedAt] IS NULL
       AND (
         -- (a) Direct engagement hold: scope='engagement' targeting this engagement
         --     AC-FILE-014-01: direct engagement-scoped hold
         (h.[scope] = 'engagement' AND h.[engagementId] = @engagementId)
         OR
         -- (b) Client-scoped hold: scope='client' targeting the engagement's owner client
         --     AC-FILE-014-02: client-scoped hold covers ALL of that client's engagements
         --     DECISION (TASK-015-001): resolve clientUserId via join on Engagement
         (h.[scope] = 'client' AND h.[clientUserId] = (
           SELECT e.[clientUserId] FROM [dbo].[Engagement] e WHERE e.[id] = @engagementId
         ) AND h.[clientUserId] IS NOT NULL)
       )`
  );

  return result.recordset.map(mapLegalHoldRow);
}

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapLegalHoldRow(row: LegalHoldRow): LegalHoldItem {
  return {
    id: row.id,
    scope: row.scope as "engagement" | "client",
    engagementId: row.engagementId ?? null,
    clientUserId: row.clientUserId ?? null,
    placedByClerkId: row.placedByClerkId,
    placedAt: row.placedAt,
    liftedByClerkId: row.liftedByClerkId ?? null,
    liftedAt: row.liftedAt ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * packages/db/src/repositories/purge.ts
 *
 * Purge-eligibility derivation + admin-pool, accountant-confirmed engagement purge.
 * TASK-015-002 / BRIEF-015 / EPIC-015 — post-retention destructive lifecycle.
 *
 * ADR-018 §3/§5/§6:
 *   §3  — retention clock anchored at completedAt (EPIC-014 seam).
 *   §5  — post-retention purge: admin-pool, accountant-confirmed, NEVER automatic;
 *          eligibility gated on elapsed window AND no active hold.
 *   §6  — precedence: (1) legal hold → (2) retention window → (3) purge-eligible.
 *
 * NEVER-AUTOMATIC (ADR-018 §5 / AC-FILE-013-04):
 *   `purgeEngagement` fires ONLY on an explicit accountant call with confirmed: true.
 *   There is NO cron, scheduled trigger, or auto-path that calls this function.
 *   Window expiry creates eligibility ONLY — it does NOT destroy data.
 *   // ADR-018 §5 // AC-FILE-013-04
 *
 * AUDIT-SURVIVES-PURGE (ADR-019 §5 / AC-NFR-010-07 / AC-FILE-013-06):
 *   The destructive sweep covers: DocumentVersion rows + Document rows + storage bytes.
 *   The AuditEvent table is EXCLUDED — it is the append-only ledger (ADR-019 §4).
 *   After the purge, AuditEvent rows for the engagement — including the
 *   'engagement.purged' event — remain intact.
 *   // DECISION: AuditEvent is structurally excluded from the purge sweep.
 *   // ADR-019 §5 // AC-NFR-010-07 // AC-FILE-013-06
 *
 * TEMPORAL-HISTORY DEFERRAL (OQ-014-01):
 *   // DECISION: Temporal-history side-row purge is deferred under OQ-014-01.
 *   // No system-versioned temporal tables exist in this repo (OQ-014-01 was raised
 *   // upstream by EPIC-014). This purge removes the real data graph (Document +
 *   // DocumentVersion rows + storage bytes). The history-side-row purge is part of
 *   // the deferred temporal mechanism and is NOT in scope here — no AC requires it.
 *   // OQ-014-01
 *
 * ADMIN-POOL ONLY (ADR-005 / ADR-003 / AC-FILE-013-02 / CS-SQL-002):
 *   `purgeEngagement` uses the ADMIN POOL via withAuditTransaction.
 *   It is NEVER reachable from a client request handler or client principal.
 *   The physical DELETE is the ONE sanctioned physical DELETE path — all other
 *   paths use soft-delete (ADR-018 §1). // CS-SQL-002
 *
 * CS-TS-001: request-scoped DB access only through the packages/db wrapper (ADR-003). // CS-TS-001
 * CS-TS-002: never import raw requestDb/adminDb outside packages/db. // CS-TS-002
 * CS-GEN-001: no PII in logs — audit targetId = engagementId only. // CS-GEN-001
 * CS-GEN-002: additive — new repository file; no existing repository modified. // CS-GEN-002
 * CS-GEN-003: governing ADR-018/ADR-005/ADR-003/ADR-019/ADR-009/OQ-014-01 cited throughout. // CS-GEN-003
 * CS-SQL-001: purge is admin-pool only; client principal cannot reach it (RLS-exempt admin). // CS-SQL-001
 * CS-SQL-002: physical DELETE on the raw-SQL / admin-pool track (Prisma cannot express it). // CS-SQL-002
 *
 * // ADR-003 // ADR-005 // ADR-009 // ADR-018 // ADR-019
 * // AC-FILE-013-01 // AC-FILE-013-02 // AC-FILE-013-03 // AC-FILE-013-04
 * // AC-FILE-013-05 // AC-FILE-013-06 // AC-FILE-014-03 // AC-FILE-014-05
 * // AC-FILE-015-01 // AC-FILE-015-02 // AC-NFR-010-07
 */

import mssqlPkg from "mssql";
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";
import {
  retentionDeadlineFor,
} from "./retention.js";
import type { RetentionEngagementInput } from "./retention.js";
import type { LegalHoldItem } from "./legal-hold.js";
import { getStorage } from "@tax-portal/storage";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The discriminated result of purgeEligibility.
 *
 * Precedence order (ADR-018 §6):
 *   (1) blocked-by-hold — engagement is under an active legal hold (AC-FILE-014-03).
 *   (2) in-window       — retention window has not yet elapsed (AC-FILE-013-01).
 *   (3) not-completed   — engagement was never completed; retention clock is not running.
 *   (4) eligible        — window elapsed AND no hold → may be accountant-confirmed purged.
 *
 * // ADR-018 §3/§5/§6 // AC-FILE-013-01 // AC-FILE-014-03 // AC-FILE-015-02
 */
export type PurgeEligibilityResult =
  | { eligible: false; reason: "blocked-by-hold" }
  | { eligible: false; reason: "in-window" }
  | { eligible: false; reason: "not-completed" }
  | { eligible: true; reason: "eligible" };

/**
 * Input for purgeEngagement.
 * Actor must come from the server-verified session (ADR-019 §2, ADR-003).
 */
export interface PurgeEngagementInput {
  engagementId: string;
  /** Server-verified actor (accountant identity — ADR-019 §2, CS-GEN-001). */
  actor: AuditActor;
  /**
   * Explicit confirmation required (AC-FILE-013-03 / ADR-018 §5).
   * No data is removed unless confirmed === true.
   * NEVER-AUTOMATIC: this flag must be explicitly set by an accountant action.
   * // AC-FILE-013-03 // ADR-018 §5
   */
  confirmed: boolean;
}

/**
 * Discriminated result of purgeEngagement.
 *
 * 'purged'        — eligible + confirmed → data destroyed, audit emitted.
 * 'not-confirmed' — confirmed !== true → no data removed (AC-FILE-013-03).
 * 'not-found'     — engagement does not exist.
 * 'not-completed' — engagement has no completedAt; retention clock not running.
 * 'in-window'     — window has not elapsed; purge refused (AC-FILE-015-01/-02).
 * 'blocked-by-hold' — active hold blocks purge (AC-FILE-014-03).
 *
 * // AC-FILE-013-03 // AC-FILE-014-03 // AC-FILE-015-01 // AC-FILE-015-02
 */
export type PurgeEngagementResult =
  | { outcome: "purged" }
  | { outcome: "not-confirmed" }
  | { outcome: "not-found" }
  | { outcome: "not-completed" }
  | { outcome: "in-window" }
  | { outcome: "blocked-by-hold" };

// ─── Internal row types ───────────────────────────────────────────────────────

type EngagementRow = {
  id: string;
  completedAt: Date | null;
};

type DocumentVersionRow = {
  storageKey: string;
};

// ─── Pure function: purgeEligibility ─────────────────────────────────────────

/**
 * Derives purge eligibility for an engagement, given its active holds.
 *
 * PURE function — no DB access, no side effects. Reuse at both eligibility-display
 * (UI) and inside the atomic purge transaction (server-side re-resolution).
 *
 * Precedence (ADR-018 §6):
 *   (1) held → not eligible regardless of window state.
 *   (2) in-window (or not-completed) → not eligible.
 *   (3) window elapsed AND no hold → eligible.
 *
 * The caller MUST re-resolve eligibility server-side inside the purge transaction
 * (never trust a client-passed eligibility result — defence-in-depth, ADR-003 §5).
 *
 * @param engagement  - Minimal engagement shape with completedAt (retention anchor).
 * @param activeHolds - Result of activeHoldsFor(engagementId) — empty = no hold.
 *
 * AC-FILE-013-01: in-window engagement is not purge-eligible.
 * AC-FILE-013-04: expiry creates eligibility only; not triggered automatically.
 * AC-FILE-014-03: active hold blocks purge even if window elapsed.
 * AC-FILE-014-05: after lift, if window elapsed, engagement becomes eligible.
 * AC-FILE-015-02: physical destruction impossible in-window.
 *
 * // ADR-018 §3/§5/§6 // DECISION-014-F // CS-GEN-003
 * // AC-FILE-013-01 // AC-FILE-013-04 // AC-FILE-014-03 // AC-FILE-014-05 // AC-FILE-015-02
 */
export function purgeEligibility(
  engagement: RetentionEngagementInput,
  activeHolds: LegalHoldItem[],
): PurgeEligibilityResult {
  // Precedence 1: legal hold is the strongest block (ADR-018 §6).
  // A held engagement cannot be purged regardless of the retention clock.
  // AC-FILE-014-03: active hold blocks purge even post-expiry.
  // // ADR-018 §6 // AC-FILE-014-03
  if (activeHolds.length > 0) {
    return { eligible: false, reason: "blocked-by-hold" };
  }

  // Compute the retention deadline (EPIC-014 seam).
  // retentionDeadlineFor returns null when completedAt is null.
  // REUSE from EPIC-014 — do NOT re-derive the window.
  // ADR-018 §3 / DECISION-014-F
  const deadline = retentionDeadlineFor(engagement);

  // Precedence 2: engagement not yet completed — clock is not running.
  // AC-FILE-013-01: only completed engagements have a running retention clock.
  if (deadline === null) {
    return { eligible: false, reason: "not-completed" };
  }

  // Precedence 3: window has not elapsed — engagement is in-window.
  // AC-FILE-013-01: data within the retention window cannot be purged.
  // AC-FILE-015-01/-02: in-window physical removal is impossible.
  // // ADR-018 §5 // AC-FILE-013-01 // AC-FILE-015-01 // AC-FILE-015-02
  if (Date.now() < deadline.getTime()) {
    return { eligible: false, reason: "in-window" };
  }

  // Window elapsed AND no active hold — purge-eligible.
  // Expiry creates eligibility ONLY — it does NOT trigger automatic destruction.
  // AC-FILE-013-04: never automatic; the accountant must confirm.
  // // ADR-018 §5 // AC-FILE-013-04
  return { eligible: true, reason: "eligible" };
}

// ─── Write: purgeEngagement (admin pool — accountant-only, confirmed, destructive) ─────

/**
 * Physically purges an engagement's document data (rows + storage bytes).
 *
 * ADMIN-POOL ONLY — never callable from a client request handler (AC-FILE-013-02 / ADR-005).
 * ACCOUNTANT-CONFIRMED — caller must pass confirmed: true (AC-FILE-013-03 / ADR-018 §5).
 * NEVER-AUTOMATIC — this function has no cron or scheduled trigger (ADR-018 §5 / AC-FILE-013-04).
 *
 * ATOMICITY PROTOCOL (ADR-019 §3 / AC-FILE-013-06 / AC-NFR-010-07):
 *   ALL DB statements run on the TRANSACTION connection (new MssqlRequest(txn)).
 *   This enrolls every read and write in the same mssql Transaction so that:
 *   - The engagement read, holds re-check, version-key SELECT, both DELETEs, and the
 *     'engagement.purged' audit INSERT all commit or rollback atomically.
 *   - If recordAuthEvent throws, txn.rollback() rolls back the DELETEs too (fail-closed).
 *   - TOCTOU defence: holds re-check runs ON the transaction connection, so a hold placed
 *     after the read but before the commit is observed (serializable within the txn scope).
 *
 * STORAGE-BYTE SEQUENCING (ADR-009 / AC-FILE-013-06):
 *   Storage bytes are deleted AFTER the DB transaction commits successfully.
 *   Rationale: bytes deletion is inherently non-transactional (no rollback).
 *   Deleting bytes only after the row-delete + audit commit means a DB failure leaves
 *   recoverable rows (no orphaned-and-unauditable destruction).
 *   A crash after commit but before storage deletion leaves orphaned bytes — acceptable
 *   (the rows are gone; a future scrub can collect orphaned keys). The inverse is not
 *   acceptable (bytes gone, rows intact, no audit).
 *
 * Protocol:
 *   1. Re-resolve eligibility server-side from the DB (never trust caller eligibility).
 *      Engagement load + holds re-check run inside the same transaction.
 *   2. Require confirmed === true — if false, return 'not-confirmed' (no-op).
 *   3. Collect all DocumentVersion + Document storageKeys INSIDE the transaction.
 *   4. Physical DELETE: DocumentVersion rows, then Document rows — ALL on txn.
 *      // DECISION: AuditEvent rows are EXCLUDED from the purge sweep — they are the
 *      // append-only ledger (ADR-019 §4/§5). Purge audit records survive by design.
 *      // DECISION: Temporal-history side-row purge is deferred under OQ-014-01.
 *   5. Emit 'engagement.purged' audit event IN THE SAME TRANSACTION (ADR-019 §3).
 *   6. AFTER the transaction commits: call storage.delete(key) per collected key.
 *
 * Returns a discriminated outcome so the UI layer can surface the refusal reason.
 *
 * AC-FILE-013-01: in-window refused (purge-eligibility check prevents it).
 * AC-FILE-013-02: admin-pool only; no client path reaches this function.
 * AC-FILE-013-03: confirmed: true required; no data removed without it.
 * AC-FILE-013-04: no auto-trigger; called only on explicit accountant action.
 * AC-FILE-013-05: eligible-but-unconfirmed stays accessible (this function is a no-op then).
 * AC-FILE-013-06: 'engagement.purged' audit event emitted + excluded from the purge.
 * AC-FILE-014-03: active hold blocks purge (eligibility re-resolution inside the txn).
 * AC-FILE-015-01/-02: in-window physical removal refused.
 * AC-NFR-010-07: AuditEvent rows survive the purge.
 *
 * // ADR-003 // ADR-005 // ADR-009 // ADR-018 // ADR-019 // OQ-014-01
 * // CS-TS-001 // CS-TS-002 // CS-SQL-001 // CS-SQL-002 // CS-GEN-001 // CS-GEN-003
 */
export async function purgeEngagement(
  input: PurgeEngagementInput,
): Promise<PurgeEngagementResult> {
  // Confirmation gate — check before entering the transaction for a fast no-op path.
  // AC-FILE-013-03 / ADR-018 §5 / NEVER-AUTOMATIC: no confirmation → no destruction.
  // // AC-FILE-013-03 // ADR-018 §5
  if (!input.confirmed) {
    return { outcome: "not-confirmed" };
  }

  let result: PurgeEngagementResult = { outcome: "not-found" };
  // Storage keys to delete AFTER the transaction commits (storage deletion is
  // non-transactional; defer until row-delete + audit are durably committed).
  // ADR-009: bytes deleted after DB commit — fail leaves recoverable rows, not orphaned bytes.
  let storageKeysToDelete: string[] = [];

  await withAuditTransaction(async (txn) => {
    // ATOMICITY: every DB statement below uses new MssqlRequest(txn) to enroll in the
    // transaction. No statement uses the pool directly (pool-based requests auto-commit
    // and bypass the transaction boundary in node-mssql).
    // ADR-019 §3 / AC-FILE-013-06 / AC-NFR-010-07

    // ─── Step 1: Load the engagement (txn — RLS-exempt admin pool, ADR-005 §2) ──
    // Re-resolve eligibility server-side INSIDE the txn.
    // Never trust a client-passed eligibility — ADR-003 §5 defence-in-depth.
    const engReq = new MssqlRequest(txn);
    engReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    const engResult = await engReq.query<EngagementRow>(
      `SELECT [id], [completedAt]
       FROM [dbo].[Engagement]
       WHERE [id] = @engagementId`
    );

    const engRow = engResult.recordset[0];
    if (!engRow) {
      result = { outcome: "not-found" };
      return;
    }

    // ─── Step 2: Re-resolve active holds (txn — TOCTOU defence) ──────────────
    // Inline the holds query on the transaction connection so a hold placed BETWEEN
    // the read and the DELETE is observed within the same transaction scope.
    // AC-FILE-014-03 / ADR-018 §6
    //
    // Resolves both scopes (mirrors activeHoldsFor logic — ADR-018 §6):
    //   (a) Direct engagement hold
    //   (b) Client-scoped hold (covering all engagements of that client)
    const holdsReq = new MssqlRequest(txn);
    holdsReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    const holdsResult = await holdsReq.query<{ id: string }>(
      `SELECT h.[id]
       FROM [dbo].[LegalHold] h
       WHERE h.[liftedAt] IS NULL
         AND (
           (h.[scope] = 'engagement' AND h.[engagementId] = @engagementId)
           OR
           (h.[scope] = 'client' AND h.[clientUserId] = (
             SELECT e.[clientUserId] FROM [dbo].[Engagement] e WHERE e.[id] = @engagementId
           ) AND h.[clientUserId] IS NOT NULL)
         )`
    );

    // Build a minimal LegalHoldItem array for purgeEligibility (only length is checked).
    const holds: LegalHoldItem[] = holdsResult.recordset.map((r) => ({
      id: r.id,
      scope: "engagement" as const,
      engagementId: input.engagementId,
      clientUserId: null,
      placedByClerkId: "",
      placedAt: new Date(),
      liftedByClerkId: null,
      liftedAt: null,
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const eligibility = purgeEligibility(
      { id: engRow.id, completedAt: engRow.completedAt ?? null },
      holds,
    );

    if (!eligibility.eligible) {
      // Map the precedence reason to the outcome type.
      // AC-FILE-013-01: in-window → 'in-window'
      // AC-FILE-014-03: blocked-by-hold → 'blocked-by-hold'
      // not-completed → 'not-completed'
      result = { outcome: eligibility.reason };
      return;
    }

    // ─── Step 3: Collect DocumentVersion storageKeys (txn) ───────────────────
    // Gather all DocumentVersion rows for the engagement's Documents.
    // ADR-009 two-track lifecycle: keys collected here; bytes deleted after commit.
    const versionsReq = new MssqlRequest(txn);
    versionsReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    const versionsResult = await versionsReq.query<DocumentVersionRow>(
      `SELECT dv.[storageKey]
       FROM [dbo].[DocumentVersion] dv
       INNER JOIN [dbo].[Document] d ON d.[id] = dv.[documentId]
       WHERE d.[engagementId] = @engagementId`
    );

    const versionRows = versionsResult.recordset;

    // Also collect current Document storageKeys (covers initial upload before versioning).
    const docKeysReq = new MssqlRequest(txn);
    docKeysReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    const docKeysResult = await docKeysReq.query<{ storageKey: string }>(
      `SELECT [storageKey] FROM [dbo].[Document]
       WHERE [engagementId] = @engagementId`
    );

    // Dedupe keys: DocumentVersion keys + Document keys not already covered.
    const versionKeySet = new Set(versionRows.map((v) => v.storageKey));
    const extraDocKeys = docKeysResult.recordset
      .map((r) => r.storageKey)
      .filter((k) => !versionKeySet.has(k));
    // Capture for post-commit deletion (ADR-009).
    storageKeysToDelete = [...versionKeySet, ...extraDocKeys];

    // ─── Step 4: Physically DELETE DocumentVersion then Document rows (txn) ───
    //
    // ADMIN POOL — this is the ONE sanctioned physical DELETE path (ADR-018 §1 / CS-SQL-002).
    // All other delete paths use soft-delete (ADR-018 §1).
    //
    // DECISION: The AuditEvent table is EXPLICITLY EXCLUDED from this sweep.
    // AuditEvent is the append-only ledger (ADR-019 §4/§5). App code only ever INSERTs.
    // After this purge, AuditEvent rows for the engagement — including the
    // 'engagement.purged' row — remain intact.
    // ADR-019 §5 // AC-NFR-010-07 // AC-FILE-013-06
    //
    // DECISION: Temporal-history side-row purge is deferred under OQ-014-01.
    // No system-versioned temporal tables exist in this repo yet.
    // The history-side-row purge is part of the deferred temporal mechanism.
    // OQ-014-01
    //
    // DELETE order: child rows before parent rows (FK constraint safety).
    // // CS-SQL-002 // ADR-018 §5 // ADR-005

    const deleteVersionsReq = new MssqlRequest(txn);
    deleteVersionsReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    await deleteVersionsReq.query(
      `DELETE dv
       FROM [dbo].[DocumentVersion] dv
       INNER JOIN [dbo].[Document] d ON d.[id] = dv.[documentId]
       WHERE d.[engagementId] = @engagementId`
    );

    const deleteDocsReq = new MssqlRequest(txn);
    deleteDocsReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    await deleteDocsReq.query(
      `DELETE FROM [dbo].[Document]
       WHERE [engagementId] = @engagementId`
    );

    // ─── Step 5: Emit 'engagement.purged' audit event (txn — fail-closed) ─────
    // ADR-019 §3: fail-closed — audit INSERT in the same transaction.
    // ADR-019 §4: INSERT only; no UPDATE/DELETE path from app code.
    // CS-GEN-001: no PII — targetId = engagementId only.
    // DECISION: This audit event is NOT removed by the purge sweep above.
    // ADR-019 §5 // AC-FILE-013-06 // AC-NFR-010-07
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.purged",
      targetType: "Engagement",
      targetId: input.engagementId,
      sourceSurface: "admin",
      outcome: "success",
      transaction: txn,
    });

    result = { outcome: "purged" };
    // storageKeysToDelete is populated above; bytes are deleted after txn.commit().
  });

  // ─── Step 6: Remove storage bytes AFTER the transaction commits ───────────
  // ADR-009: storage-object purge is coordinated with DB purge (two-track lifecycle).
  // SEQUENCING: bytes deleted only after rows + audit are durably committed.
  // A crash here leaves orphaned bytes — acceptable (rows are gone; scrub can collect).
  // Inverse is NOT acceptable (bytes gone, rows intact, no audit record).
  // CS-GEN-001: do NOT log storageKey values (contains engagement path information).
  // // ADR-009 // CS-GEN-001
  if (result.outcome === "purged" && storageKeysToDelete.length > 0) {
    const storage = getStorage();
    for (const key of storageKeysToDelete) {
      await storage.delete(key);
    }
  }

  return result;
}

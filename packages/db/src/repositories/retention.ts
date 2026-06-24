/**
 * packages/db/src/repositories/retention.ts
 *
 * Retention clock — 7-year configurable retention window + engagement-completion anchor.
 *
 * ADR-018 §3: A retention clock is anchored at engagement completion.
 * The 7-year duration is encoded as a configurable constant (RETENTION_WINDOW_YEARS),
 * not hard-coded magic at call sites. The deadline is computable from:
 *   retentionDeadlineFor(engagement) = completedAt + RETENTION_WINDOW_YEARS years
 *
 * Exports:
 *   RETENTION_WINDOW_YEARS    — configurable constant (default 7, env-overridable).
 *   retentionDeadlineFor      — computes the retention deadline for an engagement.
 *   setEngagementCompleted    — additive write that stamps completedAt on the engagement's
 *                               first completion transition (idempotent — only sets when NULL).
 *
 * Out of scope (EPIC-015 — do NOT build here):
 *   purge-eligibility computation, legal-hold markers, post-retention purge paths.
 *
 * ADR-003 §7: setEngagementCompleted uses the ADMIN POOL (no request-pool SESSION_CONTEXT).
 * ADR-019: setEngagementCompleted emits an audit event in the same transaction.
 * CS-TS-002: admin pool accessed only via getAdminPool/withAuditTransaction.
 * CS-GEN-001: no PII in audit rows (targetId = engagementId only).
 * CS-GEN-002: additive — extends the existing engagement completion seam additively.
 * CS-GEN-003: cite governing keys in code and test comments.
 *
 * // ADR-018 // ADR-003 // ADR-019 // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 * // AC-FILE-005-01 // AC-FILE-005-02 // AC-FILE-005-03 // AC-NFR-006-01
 * // DECISION-014-F
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Configurable retention window ────────────────────────────────────────────

/**
 * The configurable retention window in years (ADR-018 §3 / REQ-NFR-006).
 *
 * Default: 7 (IRS records-retention norm for tax documents).
 * Env-overridable via RETENTION_WINDOW_YEARS — the single source of truth for the
 * window duration. Call sites MUST use this constant, never a hard-coded literal.
 *
 * The retention deadline is computable as: completedAt + RETENTION_WINDOW_YEARS years.
 *
 * // ADR-018 // REQ-NFR-006 // DECISION-014-F // AC-FILE-005-01 // AC-NFR-006-01
 */
export const RETENTION_WINDOW_YEARS: number = (() => {
  const raw = process.env["RETENTION_WINDOW_YEARS"];
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 7; // ADR-018 §3 default
})();

// ─── EngagementItem subset for retention operations ───────────────────────────

/**
 * Minimal engagement shape for retention-clock computation.
 * completedAt is the clock anchor (ADR-018 §3 / DECISION-014-A).
 */
export interface RetentionEngagementInput {
  /** Engagement id. */
  id: string;
  /**
   * The engagement-completion timestamp (ADR-018 §3 / DECISION-014-A).
   * NULL if the engagement has not yet been marked Complete.
   */
  completedAt: Date | null;
}

// ─── Retention-deadline computation ───────────────────────────────────────────

/**
 * Computes the retention deadline for an engagement.
 *
 * ADR-018 §3: deadline = completedAt + RETENTION_WINDOW_YEARS years.
 * Returns null when completedAt is null (engagement not yet complete — no clock running).
 *
 * System-enforced: the deadline is computed from the engagement-completion anchor +
 * the configurable window; it is never a hand-entered date (AC-NFR-006-01).
 *
 * A document of a completed engagement is retained until this deadline (AC-FILE-005-01).
 * Within the window (Date.now() < deadline) no purge path is reachable — EPIC-015.
 *
 * // ADR-018 // DECISION-014-F // AC-FILE-005-01 // AC-NFR-006-01 // CS-GEN-003
 */
export function retentionDeadlineFor(engagement: RetentionEngagementInput): Date | null {
  if (engagement.completedAt === null || engagement.completedAt === undefined) {
    // No clock running — engagement not yet Complete.
    return null;
  }

  // Compute deadline: completedAt + RETENTION_WINDOW_YEARS calendar years.
  // Use UTC calendar arithmetic so leap-year / DST shifts do not affect the boundary.
  // ADR-018 §3: duration is the configurable window, not a hard-coded literal.
  const deadline = new Date(engagement.completedAt);
  deadline.setUTCFullYear(deadline.getUTCFullYear() + RETENTION_WINDOW_YEARS);
  return deadline;
}

// ─── Input types for setEngagementCompleted ──────────────────────────────────

/**
 * Input for setEngagementCompleted.
 * The actor comes from the server-verified session (ADR-003, ADR-019 §2).
 */
export interface SetEngagementCompletedInput {
  engagementId: string;
  /** Server-verified actor (accountant identity from the request session). */
  actor: AuditActor;
  /** Source surface for the audit event. */
  sourceSurface: "admin";
}

/**
 * Result of setEngagementCompleted.
 * 'stamped'          — completedAt set for the first time (clock started).
 * 'already-complete' — completedAt was already non-NULL (idempotent no-op).
 * 'not-found'        — engagement does not exist.
 */
export type SetEngagementCompletedResult =
  | { outcome: "stamped" }
  | { outcome: "already-complete" }
  | { outcome: "not-found" };

// ─── Write: setEngagementCompleted (admin pool — additive, idempotent) ────────

/**
 * Additively stamps `completedAt = SYSDATETIMEOFFSET()` on an Engagement when the
 * engagement has been transitioned to status='Complete' (ADR-018 §3 retention-clock anchor).
 *
 * Idempotent: the UPDATE only fires when [completedAt] IS NULL (fire-once guard).
 * Additive: does NOT fork or replace the engagement status machine (CS-GEN-002).
 * Wire point: called from transitionEngagementStatus when toStatus='Complete' (EPIC-010 seam).
 *
 * The completion timestamp is the anchor for:
 *   retentionDeadlineFor(engagement) = completedAt + RETENTION_WINDOW_YEARS
 * (AC-FILE-005-01, AC-NFR-006-01 — system-enforced, not hand-entered).
 *
 * ADR-003 §7: admin pool (no request-pool SESSION_CONTEXT needed for this write).
 * ADR-019: audit event 'engagement.completed_stamped' emitted in the same transaction.
 * CS-GEN-001: no PII — audit targetId = engagementId only.
 * CS-GEN-002: additive — extends the existing completion seam without forking the state machine.
 *
 * // ADR-003 // ADR-018 // ADR-019 // DECISION-014-F // CS-TS-001 // CS-TS-002
 * // CS-GEN-001 // CS-GEN-002 // CS-GEN-003 // AC-FILE-005-01 // AC-NFR-006-01
 */
export async function setEngagementCompleted(
  input: SetEngagementCompletedInput,
): Promise<SetEngagementCompletedResult> {
  let outcome: SetEngagementCompletedResult["outcome"] = "not-found";

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();

    // Idempotent UPDATE: stamp completedAt only when NULL (fire-once guard).
    // ADR-018 §3: completedAt is the retention-clock anchor — set exactly once.
    // CS-GEN-002: additive — does not touch status or any other field.
    const updateReq = new MssqlRequest(pool);
    updateReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    const updateResult = await updateReq.query<{ rowsAffected: number }>(
      `UPDATE [dbo].[Engagement]
       SET [completedAt] = SYSDATETIMEOFFSET(),
           [updatedAt]   = SYSDATETIMEOFFSET()
       WHERE [id]          = @engagementId
         AND [completedAt] IS NULL;
       SELECT @@ROWCOUNT AS rowsAffected;`
    );

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected > 0) {
      // completedAt stamped for the first time — retention clock started.
      // ADR-019: emit audit event in the same transaction (fail-closed).
      // CS-GEN-001: targetId = engagementId only — no client name, no PII.
      await recordAuthEvent({
        actor: input.actor,
        action: "engagement.completed_stamped",
        targetType: "Engagement",
        targetId: input.engagementId,
        sourceSurface: input.sourceSurface,
        outcome: "success",
        transaction: txn,
      });
      outcome = "stamped";
      return;
    }

    // @@ROWCOUNT = 0 — disambiguate: already-complete vs not-found.
    const existsReq = new MssqlRequest(pool);
    existsReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    const existsResult = await existsReq.query<{ completedAt: Date | null }>(
      `SELECT [completedAt] FROM [dbo].[Engagement]
       WHERE [id] = @engagementId`
    );

    const row = existsResult.recordset[0];
    if (row) {
      // Row exists — completedAt IS NOT NULL → already stamped (idempotent no-op).
      outcome = "already-complete";
    } else {
      // No row found.
      outcome = "not-found";
    }
  });

  return { outcome };
}

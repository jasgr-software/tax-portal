/**
 * packages/db/src/repositories/reminder-cadence.ts
 *
 * Cadence configuration data layer for BRIEF-019 / EPIC-019 (TASK-019-002).
 *
 * Provides:
 *   getGlobalDefaultCadence()      — reads the singleton ReminderSetting row (get-or-create)
 *   setGlobalDefaultCadence()      — writes reminderFrequencyDays on the singleton row
 *   getEngagementCadenceOverride() — reads Engagement.reminderFrequencyDaysOverride
 *   setEngagementCadenceOverride() — writes or clears Engagement.reminderFrequencyDaysOverride
 *   resolveReminderCadence()       — PURE precedence resolver: override ?? globalDefault
 *
 * Architecture:
 *   - getGlobalDefaultCadence: admin pool read (app_admin_role; the ReminderSetting policy
 *     is accountant-only on the request pool, so reads here are done via admin pool to avoid
 *     SESSION_CONTEXT coupling at the repository layer; the server action guards role).
 *   - setGlobalDefaultCadence: admin pool write (same principal decision).
 *   - getEngagementCadenceOverride: admin pool read (Engagement is already admin-readable).
 *   - setEngagementCadenceOverride: admin pool write (mirrors setEngagementDueDate pattern).
 *   - resolveReminderCadence: PURE FUNCTION — no DB, deterministic, testable without a pool.
 *
 * Governance keys:
 *   ADR-006: cadence config on apps/admin; client nudges on apps/portal. // ADR-006
 *   ADR-003: SESSION_CONTEXT propagated for request-pool paths; admin pool exempt. // ADR-003
 *   ADR-005: ReminderSetting has sec.pol_ReminderSetting (accountant-only). // ADR-005
 *   CS-TS-001: request-pool paths (none here — all admin pool) must use the db wrapper. // CS-TS-001
 *   CS-TS-002: admin pool via getAdminPool() inside this module only. // CS-TS-002
 *   CS-SQL-001: the ReminderSetting table carries sec.pol_ReminderSetting + test (TASK-019-001). // CS-SQL-001
 *   CS-GEN-001: no PII or config detail logged. // CS-GEN-001
 *   CS-GEN-002: additive new module; no existing export removed or narrowed. // CS-GEN-002
 *   CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *   DECISION-019-A: per-engagement override = Engagement.reminderFrequencyDaysOverride column. // DECISION-019-A
 *   DECISION-019-B: global default = singleton ReminderSetting row. // DECISION-019-B
 *   DECISION-019-G: resolveReminderCadence = overrideDays ?? globalDefaultDays (PURE). // DECISION-019-G
 */

import { getAdminPool } from "../admin-connection.js";
import mssqlPkg from "mssql";

const { Request: MssqlRequest, Int } = mssqlPkg;

// ─── Sentinel default ──────────────────────────────────────────────────────────

/**
 * Fallback value used when creating the ReminderSetting row on first get-or-create.
 * Matches the seeded default (0008-seed-default-reminder-setting.sql / DECISION-019-B).
 * // DECISION-019-B
 */
const SEEDED_DEFAULT_FREQUENCY_DAYS = 7;
const SEEDED_DEFAULT_APPROACHING_DAYS = 7;

// ─── Types ────────────────────────────────────────────────────────────────────

/** The shape returned by getGlobalDefaultCadence(). */
export interface GlobalDefaultCadence {
  id: string;
  /** Global default cadence in days (AC-DASH-008-01, AC-MSG-018-03). // AC-DASH-008-01 // AC-MSG-018-03 */
  reminderFrequencyDays: number;
  /** Approaching-due notification window in days (AC-MSG-013-06 mechanism). // AC-MSG-013-06 */
  approachingDueWindowDays: number;
  /** Fallback request-due interval (null → no fallback). // DECISION-019-C */
  defaultRequestDueDays: number | null;
}

export interface SetGlobalDefaultCadenceInput {
  /** New global default cadence interval in days. // AC-DASH-008-01 // DECISION-019-B */
  reminderFrequencyDays: number;
}

export interface SetGlobalDefaultCadenceResult {
  updated: boolean;
}

export interface GetEngagementCadenceOverrideResult {
  engagementId: string;
  /** Per-engagement override in days; null = no override (global default applies). // DECISION-019-A */
  reminderFrequencyDaysOverride: number | null;
}

export interface SetEngagementCadenceOverrideInput {
  engagementId: string;
  /**
   * New override in days; null clears the override (global default applies again).
   * // AC-DASH-008-02 // DECISION-019-A
   */
  reminderFrequencyDays: number | null;
}

export interface SetEngagementCadenceOverrideResult {
  updated: boolean;
}

export interface ResolveReminderCadenceInput {
  /** Per-engagement override (null = no override). // DECISION-019-A */
  overrideDays: number | null;
  /** Global default to fall back to when overrideDays is null. // DECISION-019-B */
  globalDefaultDays: number;
}

// ─── getGlobalDefaultCadence ──────────────────────────────────────────────────

/**
 * Reads the singleton ReminderSetting row.
 *
 * Uses the admin pool (app_admin_role) so SESSION_CONTEXT is not required.
 * The server action layer (TASK-019-002) guards the ACCOUNTANT role before calling this.
 *
 * If the row does not exist (e.g. seed failed), inserts the default row idempotently.
 * DECISION-019-B: singleton pattern; exactly one row. // DECISION-019-B
 *
 * AC-DASH-008-01: accountant can read/set global default frequency. // AC-DASH-008-01
 * AC-MSG-018-03: overdue reminders raised at the global default frequency. // AC-MSG-018-03
 *
 * CS-TS-002: admin pool via getAdminPool() inside this module only. // CS-TS-002
 * CS-GEN-001: no config values logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */
export async function getGlobalDefaultCadence(): Promise<GlobalDefaultCadence> {
  // CS-TS-002: admin pool — RLS-exempt; no SESSION_CONTEXT needed for admin reads. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  // Try SELECT first
  const selectResult = await req.query<{
    id: string;
    reminderFrequencyDays: number;
    approachingDueWindowDays: number;
    defaultRequestDueDays: number | null;
  }>(
    `SELECT TOP 1
       [id],
       [reminderFrequencyDays],
       [approachingDueWindowDays],
       [defaultRequestDueDays]
     FROM [dbo].[ReminderSetting]
     ORDER BY [createdAt]`
  );

  if (selectResult.recordset.length > 0) {
    const row = selectResult.recordset[0]!;
    return {
      id: row.id,
      reminderFrequencyDays: row.reminderFrequencyDays,
      approachingDueWindowDays: row.approachingDueWindowDays,
      defaultRequestDueDays: row.defaultRequestDueDays,
    };
  }

  // Get-or-create: no row exists — insert the seeded default idempotently.
  // DECISION-019-B: a single default row is expected (seeded by migration); this is the
  // defensive fallback path. // DECISION-019-B
  const insertReq = new MssqlRequest(pool);
  insertReq.input("freqDays", Int, SEEDED_DEFAULT_FREQUENCY_DAYS);
  insertReq.input("approachDays", Int, SEEDED_DEFAULT_APPROACHING_DAYS);

  const insertResult = await insertReq.query<{
    id: string;
    reminderFrequencyDays: number;
    approachingDueWindowDays: number;
    defaultRequestDueDays: number | null;
  }>(
    `INSERT INTO [dbo].[ReminderSetting]
       ([reminderFrequencyDays], [approachingDueWindowDays], [defaultRequestDueDays], [updatedAt])
     OUTPUT
       INSERTED.[id],
       INSERTED.[reminderFrequencyDays],
       INSERTED.[approachingDueWindowDays],
       INSERTED.[defaultRequestDueDays]
     VALUES (@freqDays, @approachDays, NULL, SYSDATETIMEOFFSET())`
  );

  const inserted = insertResult.recordset[0]!;
  return {
    id: inserted.id,
    reminderFrequencyDays: inserted.reminderFrequencyDays,
    approachingDueWindowDays: inserted.approachingDueWindowDays,
    defaultRequestDueDays: inserted.defaultRequestDueDays,
  };
}

// ─── setGlobalDefaultCadence ──────────────────────────────────────────────────

/**
 * Writes the global default cadence interval to the singleton ReminderSetting row.
 *
 * Uses the admin pool (app_admin_role). The server action layer guards ACCOUNTANT role.
 * Does a get-or-create read first to ensure the row exists before the UPDATE.
 *
 * AC-DASH-008-01: accountant can set global default frequency; it is recorded. // AC-DASH-008-01
 * AC-MSG-018-03: overdue reminders raised at this frequency where no override exists. // AC-MSG-018-03
 *
 * CS-TS-002: admin pool via getAdminPool() only. // CS-TS-002
 * CS-SQL-001: the BLOCK predicate on sec.pol_ReminderSetting enforces accountant-only writes
 *   via the request pool; the admin pool bypasses RLS (defence-in-depth via server action guard).
 *   // CS-SQL-001
 * CS-GEN-001: no PII or config detail logged. // CS-GEN-001
 * DECISION-019-B: singleton pattern — update the one existing row (or create if absent). // DECISION-019-B
 */
export async function setGlobalDefaultCadence(
  input: SetGlobalDefaultCadenceInput,
): Promise<SetGlobalDefaultCadenceResult> {
  // Ensure the singleton row exists (get-or-create idempotent) then UPDATE.
  // DECISION-019-B: singleton — we UPDATE the first (and only) row. // DECISION-019-B
  const existing = await getGlobalDefaultCadence();

  // CS-TS-002: admin pool — no SESSION_CONTEXT needed for admin writes. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("id", existing.id);
  req.input("freqDays", Int, input.reminderFrequencyDays);

  await req.query(
    `UPDATE [dbo].[ReminderSetting]
     SET [reminderFrequencyDays] = @freqDays,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @id`
  );

  return { updated: true };
}

// ─── getEngagementCadenceOverride ─────────────────────────────────────────────

/**
 * Reads the per-engagement reminder frequency override from Engagement.reminderFrequencyDaysOverride.
 *
 * Returns null when no override is set — the global default applies for that engagement.
 *
 * AC-DASH-008-02: engagement carries its own reminder frequency when set. // AC-DASH-008-02
 * DECISION-019-A: override = nullable column on Engagement (no new table, no new policy). // DECISION-019-A
 *
 * CS-TS-002: admin pool via getAdminPool(). // CS-TS-002
 * CS-GEN-001: no engagement detail logged. // CS-GEN-001
 */
export async function getEngagementCadenceOverride(
  engagementId: string,
): Promise<GetEngagementCadenceOverrideResult> {
  // CS-TS-002: admin pool — RLS-exempt; correct for admin-surface reads. // CS-TS-002
  // DECISION-019-A: Engagement.reminderFrequencyDaysOverride is the override column. // DECISION-019-A
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", engagementId);

  const result = await req.query<{
    reminderFrequencyDaysOverride: number | null;
  }>(
    `SELECT [reminderFrequencyDaysOverride]
     FROM [dbo].[Engagement]
     WHERE [id] = @engagementId`
  );

  // If the engagement is not found, treat override as null (safe fallback).
  const row = result.recordset[0] ?? { reminderFrequencyDaysOverride: null };

  return {
    engagementId,
    reminderFrequencyDaysOverride: row.reminderFrequencyDaysOverride,
  };
}

// ─── setEngagementCadenceOverride ─────────────────────────────────────────────

/**
 * Writes (or clears) the per-engagement reminder frequency override.
 *
 * Pass reminderFrequencyDays = null to clear the override (global default resumes).
 *
 * AC-DASH-008-02: sets per-engagement reminder frequency. // AC-DASH-008-02
 * AC-DASH-008-03: per-engagement takes precedence; clearing it reverts to global default. // AC-DASH-008-03
 * DECISION-019-A: Engagement.reminderFrequencyDaysOverride is the column; null = no override. // DECISION-019-A
 *
 * CS-TS-002: admin pool via getAdminPool(). // CS-TS-002
 * CS-GEN-001: no engagement detail logged. // CS-GEN-001
 */
export async function setEngagementCadenceOverride(
  input: SetEngagementCadenceOverrideInput,
): Promise<SetEngagementCadenceOverrideResult> {
  // CS-TS-002: admin pool — RLS-exempt; mirrors setEngagementDueDate pattern. // CS-TS-002
  // DECISION-019-A: writes Engagement.reminderFrequencyDaysOverride; null clears it. // DECISION-019-A
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", input.engagementId);

  if (input.reminderFrequencyDays === null) {
    // Clear the override — SET to NULL (back to global default).
    await req.query(
      `UPDATE [dbo].[Engagement]
       SET [reminderFrequencyDaysOverride] = NULL,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @engagementId`
    );
  } else {
    req.input("overrideDays", Int, input.reminderFrequencyDays);
    await req.query(
      `UPDATE [dbo].[Engagement]
       SET [reminderFrequencyDaysOverride] = @overrideDays,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @engagementId`
    );
  }

  return { updated: true };
}

// ─── resolveReminderCadence ───────────────────────────────────────────────────

/**
 * PURE precedence resolver: per-engagement override takes precedence over global default.
 *
 * DECISION-019-G: resolvedDays = overrideDays ?? globalDefaultDays. // DECISION-019-G
 *
 * This is a PURE FUNCTION — no DB round-trip, no side effects, fully deterministic.
 * It is the unit the engine (TASK-019-003) imports for cadence resolution.
 * The precedence property is this slice's correctness guarantee:
 *   - engagement WITH an override → returns the override (NOT the global default)
 *   - engagement WITHOUT an override → returns the global default
 *
 * AC-MSG-018-04: per-engagement frequency takes precedence over global default. // AC-MSG-018-04
 * AC-DASH-008-03: per-engagement frequency wins for that engagement. // AC-DASH-008-03
 *
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 *
 * @param input.overrideDays - per-engagement override (null = none set)
 * @param input.globalDefaultDays - global default to fall back to
 * @returns the resolved cadence interval in days
 */
export function resolveReminderCadence(input: ResolveReminderCadenceInput): number {
  // DECISION-019-G: override takes precedence; null override → fall back to global default. // DECISION-019-G
  // AC-MSG-018-04: per-engagement override takes precedence. // AC-MSG-018-04
  // AC-DASH-008-03: per-engagement wins for that engagement. // AC-DASH-008-03
  return input.overrideDays ?? input.globalDefaultDays;
}

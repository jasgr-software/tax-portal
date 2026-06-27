/**
 * packages/db/src/document-request.overdue-flag.test.ts
 *
 * Unit tests for computeIsOverdue — the shared TypeScript overdue predicate.
 *
 * AC-FILE-012-02: An overdue document request is flagged/surfaced as overdue when
 *   the accountant views the request. This tests the derivation logic that powers
 *   that flag in listDocumentRequestsForEngagementAdmin.
 *
 * DECISION-019-C: effective due date = explicit dueDate ?? (createdAt + defaultRequestDueDays).
 * DECISION-019-D: unfulfilled = isFulfilled=false; fulfilled requests are never overdue.
 * ADR-018: overdue is DERIVED from existing lifecycle attributes — no new stored clock.
 * ADR-023: now is injectable for deterministic testing (the clock seam).
 *
 * These are PURE UNIT TESTS — no real DB connection required.
 * computeIsOverdue is a deterministic TypeScript function that mirrors the SQL predicate
 * in reminder-engine.ts (Phase-1 WHERE clause). Keeping them in sync is the hard constraint.
 *
 * // ADR-018 // ADR-023 // DECISION-019-C // DECISION-019-D // AC-FILE-012-02 // AC-FILE-012-04
 */

import { describe, it, expect } from "vitest";
import { computeIsOverdue } from "./repositories/document-request.js";

// ─── Reference dates ──────────────────────────────────────────────────────────

/** "Today" as the injected clock: 2026-06-15 UTC. */
const NOW = new Date("2026-06-15T12:00:00.000Z");

/** A due date strictly in the past (2026-06-14 < 2026-06-15). */
const PAST_DUE = new Date("2026-06-14T00:00:00.000Z");

/** Today's date as a due date (2026-06-15 is NOT strictly before 2026-06-15 — not overdue). */
const DUE_TODAY = new Date("2026-06-15T00:00:00.000Z");

/** A due date in the future (2026-06-16 > 2026-06-15 — not overdue). */
const FUTURE_DUE = new Date("2026-06-16T00:00:00.000Z");

/** createdAt for fallback computations. */
const CREATED_AT = new Date("2026-06-01T09:00:00.000Z");

// ─── Tests: explicit dueDate path ─────────────────────────────────────────────

describe("computeIsOverdue — explicit dueDate", () => {

  /**
   * AC-FILE-012-02: overdue flag is true when unfulfilled + past its due date.
   * DECISION-019-D: isFulfilled=false → eligible for overdue check. // DECISION-019-D
   * AC-FILE-012-04: only past-due requests are overdue. // AC-FILE-012-04
   */
  it(
    "AC-FILE-012-02 — [true] unfulfilled request with explicit dueDate strictly in the past is overdue",
    () => {
      const result = computeIsOverdue({
        dueDate: PAST_DUE,
        createdAt: CREATED_AT,
        defaultRequestDueDays: null,
        isFulfilled: false,
        now: NOW,
      });
      expect(result).toBe(true);
    },
  );

  /**
   * AC-FILE-012-02: not overdue when the due date is today (not strictly past).
   * SQL: dueDate < CAST(@now AS DATE) → strictly before, not equal. // DECISION-019-C
   */
  it(
    "AC-FILE-012-02 — [false] unfulfilled request with explicit dueDate = today is NOT overdue (not strictly past)",
    () => {
      const result = computeIsOverdue({
        dueDate: DUE_TODAY,
        createdAt: CREATED_AT,
        defaultRequestDueDays: null,
        isFulfilled: false,
        now: NOW,
      });
      expect(result).toBe(false);
    },
  );

  /**
   * AC-FILE-012-02: not overdue when the due date is in the future.
   * AC-FILE-012-04: only a request past its due date is treated as overdue. // AC-FILE-012-04
   */
  it(
    "AC-FILE-012-04 — [false] unfulfilled request with explicit dueDate in the future is NOT overdue",
    () => {
      const result = computeIsOverdue({
        dueDate: FUTURE_DUE,
        createdAt: CREATED_AT,
        defaultRequestDueDays: null,
        isFulfilled: false,
        now: NOW,
      });
      expect(result).toBe(false);
    },
  );

  /**
   * DECISION-019-D: fulfilled request is NEVER overdue, even when past its due date. // DECISION-019-D
   * AC-FILE-012-04: a fulfilled request past its due date is NOT treated as overdue. // AC-FILE-012-04
   */
  it(
    "AC-FILE-012-04 — [false] FULFILLED request with explicit dueDate in the past is NOT overdue (fulfilled excludes overdue)",
    () => {
      const result = computeIsOverdue({
        dueDate: PAST_DUE,
        createdAt: CREATED_AT,
        defaultRequestDueDays: null,
        isFulfilled: true,  // DECISION-019-D: fulfilled → not overdue
        now: NOW,
      });
      expect(result).toBe(false);
    },
  );

});

// ─── Tests: fallback dueDate path (defaultRequestDueDays) ────────────────────

describe("computeIsOverdue — fallback dueDate (defaultRequestDueDays)", () => {

  /**
   * DECISION-019-C: when dueDate IS NULL and defaultRequestDueDays is set,
   * effective due date = createdAt + defaultRequestDueDays. // DECISION-019-C
   *
   * createdAt=2026-06-01, defaultRequestDueDays=7 → effective due=2026-06-08.
   * NOW=2026-06-15 → 2026-06-08 < 2026-06-15 → overdue.
   */
  it(
    "AC-FILE-012-02 — [true] unfulfilled request with null dueDate + defaultRequestDueDays elapsed is overdue (fallback)",
    () => {
      const result = computeIsOverdue({
        dueDate: null,
        createdAt: CREATED_AT, // 2026-06-01
        defaultRequestDueDays: 7, // effective due = 2026-06-08
        isFulfilled: false,
        now: NOW, // 2026-06-15 > 2026-06-08 → overdue
      });
      expect(result).toBe(true);
    },
  );

  /**
   * DECISION-019-C: when dueDate IS NULL and defaultRequestDueDays is set,
   * effective due date = createdAt + defaultRequestDueDays. // DECISION-019-C
   *
   * createdAt=2026-06-14, defaultRequestDueDays=7 → effective due=2026-06-21.
   * NOW=2026-06-15 → 2026-06-21 > 2026-06-15 → NOT overdue.
   */
  it(
    "AC-FILE-012-02 — [false] unfulfilled request with null dueDate + defaultRequestDueDays not yet elapsed is NOT overdue (fallback)",
    () => {
      const result = computeIsOverdue({
        dueDate: null,
        createdAt: new Date("2026-06-14T00:00:00.000Z"), // effective due = 2026-06-21
        defaultRequestDueDays: 7,
        isFulfilled: false,
        now: NOW, // 2026-06-15 < 2026-06-21 → not overdue
      });
      expect(result).toBe(false);
    },
  );

  /**
   * DECISION-019-C: when dueDate IS NULL and defaultRequestDueDays is NULL,
   * there is no effective due date → the request is NEVER overdue. // DECISION-019-C
   */
  it(
    "AC-FILE-012-02 — [false] unfulfilled request with null dueDate and no defaultRequestDueDays is NOT overdue (no effective due date)",
    () => {
      const result = computeIsOverdue({
        dueDate: null,
        createdAt: CREATED_AT,
        defaultRequestDueDays: null, // no fallback → never overdue
        isFulfilled: false,
        now: NOW,
      });
      expect(result).toBe(false);
    },
  );

  /**
   * DECISION-019-D: fulfilled request with null dueDate + elapsed fallback is NOT overdue. // DECISION-019-D
   */
  it(
    "AC-FILE-012-04 — [false] FULFILLED request with null dueDate + elapsed fallback is NOT overdue (fulfilled excludes overdue)",
    () => {
      const result = computeIsOverdue({
        dueDate: null,
        createdAt: CREATED_AT, // effective due = 2026-06-08
        defaultRequestDueDays: 7,
        isFulfilled: true, // DECISION-019-D: fulfilled → not overdue
        now: NOW,
      });
      expect(result).toBe(false);
    },
  );

});

// ─── Tests: both directions (AC-FILE-012-04 discrimination) ──────────────────

describe("computeIsOverdue — AC-FILE-012-04 both-direction discrimination", () => {

  /**
   * AC-FILE-012-04 BOTH WAYS: given two unfulfilled requests — one past its due date,
   * one not — assert ONLY the past-due one is overdue.
   *
   * This is the required two-sided proof: the past-due IS overdue AND the not-yet-due is NOT.
   * // AC-FILE-012-04 // DECISION-019-C // DECISION-019-D
   */
  it(
    "AC-FILE-012-04 — [both directions] past-due request IS overdue; not-yet-due request is NOT overdue",
    () => {
      const commonInput = {
        createdAt: CREATED_AT,
        defaultRequestDueDays: null,
        isFulfilled: false,
        now: NOW,
      };

      // Past-due request: dueDate=2026-06-14 < 2026-06-15 → overdue
      const pastDueResult = computeIsOverdue({ ...commonInput, dueDate: PAST_DUE });
      expect(pastDueResult, "past-due request must be overdue").toBe(true);

      // Not-yet-due request: dueDate=2026-06-16 > 2026-06-15 → NOT overdue
      const notYetDueResult = computeIsOverdue({ ...commonInput, dueDate: FUTURE_DUE });
      expect(notYetDueResult, "not-yet-due request must NOT be overdue").toBe(false);
    },
  );

});

// ─── Tests: injected clock (ADR-023 seam) ────────────────────────────────────

describe("computeIsOverdue — ADR-023 time-injectable seam", () => {

  /**
   * ADR-023: now defaults to new Date() when omitted (production path). // ADR-023
   * When omitted: a request with a due date far in the future is not overdue.
   */
  it(
    "ADR-023 — [false] request with far-future due date is NOT overdue when now is omitted (defaults to wall-clock)",
    () => {
      const result = computeIsOverdue({
        dueDate: new Date("2099-12-31T00:00:00.000Z"), // far future
        createdAt: CREATED_AT,
        defaultRequestDueDays: null,
        isFulfilled: false,
        // now omitted → defaults to wall-clock new Date()
      });
      expect(result).toBe(false);
    },
  );

  /**
   * ADR-023: injected now allows deterministic testing without wall-clock waits. // ADR-023
   * Advancing the injected clock past the due date makes the request overdue.
   */
  it(
    "ADR-023 — [true] injected clock advanced past due date makes request overdue (no wall-clock wait)",
    () => {
      const dueDate = new Date("2026-05-01T00:00:00.000Z"); // May 1
      const beforeDue = new Date("2026-04-30T12:00:00.000Z"); // April 30 → not overdue
      const afterDue = new Date("2026-05-02T12:00:00.000Z");  // May 2 → overdue

      expect(
        computeIsOverdue({ dueDate, createdAt: CREATED_AT, defaultRequestDueDays: null, isFulfilled: false, now: beforeDue }),
        "before due date: NOT overdue",
      ).toBe(false);

      expect(
        computeIsOverdue({ dueDate, createdAt: CREATED_AT, defaultRequestDueDays: null, isFulfilled: false, now: afterDue }),
        "after due date: overdue",
      ).toBe(true);
    },
  );

});

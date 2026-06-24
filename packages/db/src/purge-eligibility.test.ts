/**
 * packages/db/src/purge-eligibility.test.ts
 *
 * TIER-1 UNIT TESTS — pure function (no DB required).
 *
 * Tests purgeEligibility() — the pure, side-effect-free eligibility derivation.
 * TASK-015-002 / BRIEF-015 / EPIC-015 — purge-eligibility (ADR-018 §3/§5/§6).
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-015 gherkin methodology):
 *
 *   AC-FILE-013-01 — An engagement whose retention window has NOT elapsed is not purge-eligible.
 *     Given an engagement in-window → not eligible.
 *
 *   AC-FILE-013-04 — Expiry creates eligibility ONLY; system never auto-purges.
 *     Given an engagement whose window just elapsed, no hold → eligible.
 *     The test asserts eligibility (purge-CAPABLE) but no purge fires — that's the never-automatic proof.
 *
 *   AC-FILE-014-03 — An engagement under legal hold cannot be purged even if window elapsed.
 *     Given an expired engagement with an active hold → blocked-by-hold.
 *
 *   AC-FILE-014-05 — Lifting the hold restores normal purge eligibility if window elapsed.
 *     Given an expired engagement, hold lifted (zero active holds) → eligible.
 *
 *   Bonus coverage (not a standalone AC, but verifies the clock precondition):
 *     completedAt=null (never completed) → not-completed; no clock running.
 *
 * Precedence ordering verified (ADR-018 §6):
 *   (1) blocked-by-hold beats in-window
 *   (2) not-completed when no completedAt
 *   (3) eligible only when window elapsed AND no hold
 *
 * ADR-018 §3/§5/§6: the governing retention/purge/hold ADR.
 * DECISION-014-F: RETENTION_WINDOW_YEARS is the configurable constant; REUSED here.
 *
 * CS-GEN-001: no PII in test data (synthetic ids only). // CS-GEN-001
 * CS-GEN-002: additive — new test file, no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing ADR-018 cited throughout. // CS-GEN-003
 *
 * // ADR-018 // DECISION-014-F
 * // AC-FILE-013-01 // AC-FILE-013-04 // AC-FILE-014-03 // AC-FILE-014-05
 */

import { describe, it, expect } from "vitest";
import { RETENTION_WINDOW_YEARS } from "./repositories/retention.js";
import { purgeEligibility } from "./repositories/purge.js";
import type { LegalHoldItem } from "./repositories/legal-hold.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal LegalHoldItem stub for hold-related tests. */
function makeActiveHold(id: string): LegalHoldItem {
  return {
    id,
    scope: "engagement",
    engagementId: "eng-test-001",
    clientUserId: null,
    placedByClerkId: "user_accountant_test",
    placedAt: new Date(),
    liftedByClerkId: null,
    liftedAt: null, // active hold = liftedAt IS NULL (ADR-018 §6 / AC-FILE-014-04)
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Compute a completedAt date that places the deadline in the past (expired).
 * Uses RETENTION_WINDOW_YEARS + 1 year ago so the deadline is ~1 year in the past.
 * // ADR-018 §3 // DECISION-014-F
 */
function completedAtExpired(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - (RETENTION_WINDOW_YEARS + 1));
  return d;
}

/**
 * Compute a completedAt date that places the deadline in the future (in-window).
 * Uses 1 year ago so the deadline is ~6 years in the future (for 7-year window).
 * // ADR-018 §3 // DECISION-014-F
 */
function completedAtInWindow(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1); // 1 year ago — 6 years remaining
  return d;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("purgeEligibility — pure eligibility derivation (ADR-018 §3/§5/§6)", () => {

  /**
   * [AC-FILE-013-01] An engagement whose 7-year retention window has NOT elapsed is not purge-eligible.
   *
   * Gherkin:
   *   Given an engagement whose 7-year retention window has not elapsed
   *   When a purge is attempted
   *   Then it is not purge-eligible and cannot be purged
   *
   * // AC-FILE-013-01 // ADR-018 §5 // AC-FILE-015-02
   */
  it("[AC-FILE-013-01] in-window engagement (deadline in the future) → not eligible, reason in-window", () => {
    const engagement = {
      id: "eng-in-window-001",
      completedAt: completedAtInWindow(),
    };
    const activeHolds: LegalHoldItem[] = [];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("in-window");
    // AC-FILE-015-02: physical destruction impossible in-window.
    // // AC-FILE-013-01 // AC-FILE-015-02
  });

  /**
   * [AC-FILE-013-04] Just-expired engagement, no active hold → eligible.
   *
   * Gherkin:
   *   Given an engagement whose retention window has just elapsed
   *   When no accountant action is taken
   *   Then the system does not automatically purge it; expiry only creates eligibility
   *
   * Note: this test asserts the engagement IS eligible (purge-CAPABLE), but no purge fires —
   * the never-automatic invariant is proven by the absence of any auto-trigger path, not by
   * a state change. The integration test (purge.integration.test.ts) proves the eligible-but-
   * unconfirmed data stays readable (AC-FILE-013-05).
   *
   * // AC-FILE-013-04 // ADR-018 §5
   */
  it("[AC-FILE-013-04] just-expired engagement, no hold → eligible", () => {
    const engagement = {
      id: "eng-expired-001",
      completedAt: completedAtExpired(),
    };
    const activeHolds: LegalHoldItem[] = [];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("eligible");
    // Expiry creates eligibility ONLY — it does NOT destroy data automatically.
    // // AC-FILE-013-04 // ADR-018 §5
  });

  /**
   * [AC-FILE-014-03] Expired engagement WITH an active hold → not eligible (blocked-by-hold).
   *
   * Gherkin:
   *   Given an engagement under legal hold whose 7-year window has elapsed
   *   When a purge is attempted
   *   Then it cannot be purged while the hold is active
   *
   * Precedence: legal hold (1) beats retention window (2) — ADR-018 §6.
   *
   * // AC-FILE-014-03 // ADR-018 §6
   */
  it("[AC-FILE-014-03] expired engagement with active hold → not eligible, reason blocked-by-hold", () => {
    const engagement = {
      id: "eng-expired-held-001",
      completedAt: completedAtExpired(),
    };
    const activeHolds: LegalHoldItem[] = [makeActiveHold("hold-001")];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("blocked-by-hold");
    // ADR-018 §6: hold is the strongest block; overrides the elapsed window.
    // // AC-FILE-014-03 // ADR-018 §6
  });

  /**
   * [AC-FILE-014-05] After the hold is lifted (zero active holds), window already elapsed → eligible.
   *
   * Gherkin:
   *   Given an engagement under legal hold whose retention window has elapsed
   *   When the accountant lifts the hold
   *   Then normal purge eligibility is restored
   *
   * Here we model "hold lifted" as activeHolds = [] (liftLegalHold already cleared the hold;
   * activeHoldsFor returns an empty array). The pure function sees no holds and the window
   * has elapsed → eligible.
   *
   * // AC-FILE-014-05 // ADR-018 §6
   */
  it("[AC-FILE-014-05] expired engagement, hold lifted (empty active holds) → eligible", () => {
    const engagement = {
      id: "eng-expired-lifted-001",
      completedAt: completedAtExpired(),
    };
    // After liftLegalHold, activeHoldsFor returns zero holds — model that here.
    const activeHolds: LegalHoldItem[] = [];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("eligible");
    // Lifting the hold restores eligibility because the window has already elapsed.
    // // AC-FILE-014-05 // ADR-018 §6
  });

  /**
   * completedAt = null (never completed) → not-completed; retention clock is not running.
   *
   * An engagement that has never been marked Complete has no completedAt — the clock
   * is not running and it cannot be purge-eligible.
   * ADR-018 §3: retentionDeadlineFor returns null when completedAt is null.
   *
   * // ADR-018 §3 // DECISION-014-F
   */
  it("[completedAt=null] never-completed engagement → not eligible, reason not-completed", () => {
    const engagement = {
      id: "eng-not-completed-001",
      completedAt: null,
    };
    const activeHolds: LegalHoldItem[] = [];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("not-completed");
    // ADR-018 §3: clock starts at completedAt; null → no clock.
    // // ADR-018 §3 // DECISION-014-F
  });

  /**
   * Precedence ordering: held+expired engagement — hold beats window (ADR-018 §6 §1 > §2).
   *
   * A held-and-expired engagement MUST return blocked-by-hold, not in-window.
   * The ordering is not just an endpoint check — the hold (1) must precede window (2).
   *
   * // ADR-018 §6
   */
  it("[precedence] held-and-expired → blocked-by-hold (hold beats window)", () => {
    const engagement = {
      id: "eng-held-expired-001",
      completedAt: completedAtExpired(),
    };
    const activeHolds: LegalHoldItem[] = [makeActiveHold("hold-002"), makeActiveHold("hold-003")];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("blocked-by-hold");
    // Hold is the FIRST check (ADR-018 §6 precedence 1 > 2).
    // The window has elapsed, yet the result is blocked-by-hold.
    // // ADR-018 §6
  });

  /**
   * In-window engagement with a hold — the hold still wins (precedence 1 > 2).
   * Demonstrates the hold check comes before the window check.
   *
   * // ADR-018 §6
   */
  it("[precedence] held-and-in-window → blocked-by-hold (hold checked before window)", () => {
    const engagement = {
      id: "eng-held-in-window-001",
      completedAt: completedAtInWindow(),
    };
    const activeHolds: LegalHoldItem[] = [makeActiveHold("hold-004")];

    const result = purgeEligibility(engagement, activeHolds);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("blocked-by-hold");
    // The hold is checked first; the window check is never reached.
    // // ADR-018 §6
  });

});

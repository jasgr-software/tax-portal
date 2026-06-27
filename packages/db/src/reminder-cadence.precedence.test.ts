/**
 * packages/db/src/reminder-cadence.precedence.test.ts
 *
 * HARD TIER-3 PRECEDENCE TEST — extra_gate #4 (BRIEF-019)
 *
 * Per the task spec and BRIEF-019 extra_gate #4, this test MUST prove the precedence
 * rule BOTH WAYS:
 *   1. Engagement WITH a per-engagement override → resolves to the OVERRIDE (not the global default)
 *   2. Engagement WITHOUT a per-engagement override → resolves to the GLOBAL DEFAULT
 *
 * A test that only covers one direction is INSUFFICIENT and is a rejection criterion.
 *
 * DECISION-019-G: resolvedDays = overrideDays ?? globalDefaultDays. // DECISION-019-G
 * AC-MSG-018-04: per-engagement frequency takes precedence over global default. // AC-MSG-018-04
 * AC-DASH-008-03: per-engagement wins for that engagement. // AC-DASH-008-03
 *
 * These tests are UNIT tests of the pure function — no DB, no mocks required.
 * The pure function contract is what TASK-019-003 (the engine) depends on.
 *
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * ADR-012: tier-3 service tests (pure function coverage — deterministic). // ADR-012
 */

import { describe, it, expect } from "vitest";
import { resolveReminderCadence } from "./repositories/reminder-cadence.js";

// ─── HARD tier-3 precedence tests (BOTH ways) ─────────────────────────────────

describe("resolveReminderCadence — HARD tier-3 precedence (extra_gate #4, AC-MSG-018-04, AC-DASH-008-03)", () => {

  /**
   * DIRECTION 1: Engagement WITH a per-engagement override → returns the OVERRIDE.
   *
   * The override (14 days) differs from the global default (7 days).
   * The resolver MUST return 14 (the override) and NOT 7 (the global default).
   * This proves that an override is honored for its engagement.
   *
   * AC-MSG-018-04: per-engagement frequency takes precedence over global default. // AC-MSG-018-04
   * AC-DASH-008-03: per-engagement wins for that engagement. // AC-DASH-008-03
   * DECISION-019-G: overrideDays ?? globalDefaultDays. // DECISION-019-G
   *
   * HARD — a test that checks ONLY this direction is insufficient; the opposite
   * direction (no-override → global default) MUST also pass.
   */
  it("[AC-MSG-018-04] [AC-DASH-008-03] engagement WITH override → resolves to the OVERRIDE (not the global default) [HARD — extra_gate #4, direction 1/2]", () => {
    const GLOBAL_DEFAULT_DAYS = 7;
    const PER_ENGAGEMENT_OVERRIDE_DAYS = 14; // Intentionally different from global default

    // DIRECTION 1: override is non-null → resolver must return the override.
    // AC-MSG-018-04: per-engagement frequency TAKES PRECEDENCE over global default. // AC-MSG-018-04
    // DECISION-019-G: overrideDays ?? globalDefaultDays = 14 ?? 7 = 14. // DECISION-019-G
    const resolved = resolveReminderCadence({
      overrideDays: PER_ENGAGEMENT_OVERRIDE_DAYS,
      globalDefaultDays: GLOBAL_DEFAULT_DAYS,
    });

    // MUST equal the override value (14), NOT the global default (7).
    expect(resolved).toBe(PER_ENGAGEMENT_OVERRIDE_DAYS);
    expect(resolved).not.toBe(GLOBAL_DEFAULT_DAYS);
  });

  /**
   * DIRECTION 2: Engagement WITHOUT a per-engagement override → returns the GLOBAL DEFAULT.
   *
   * No override is set (null). The resolver MUST return the global default (7 days).
   * This proves that the fallback to global default is correct.
   *
   * AC-MSG-018-03: overdue reminders raised at the global default frequency by default. // AC-MSG-018-03
   * AC-DASH-008-01: global default applies where no override exists. // AC-DASH-008-01
   * DECISION-019-G: overrideDays ?? globalDefaultDays = null ?? 7 = 7. // DECISION-019-G
   *
   * HARD — this direction is the mandatory second half of the precedence proof.
   * The absence of an override MUST fall back to the global default.
   */
  it("[AC-MSG-018-03] [AC-DASH-008-01] engagement WITHOUT override → resolves to the GLOBAL DEFAULT [HARD — extra_gate #4, direction 2/2]", () => {
    const GLOBAL_DEFAULT_DAYS = 7;

    // DIRECTION 2: override is null → resolver must fall back to the global default.
    // AC-DASH-008-01: global default applies where no override exists. // AC-DASH-008-01
    // DECISION-019-G: overrideDays ?? globalDefaultDays = null ?? 7 = 7. // DECISION-019-G
    const resolved = resolveReminderCadence({
      overrideDays: null,
      globalDefaultDays: GLOBAL_DEFAULT_DAYS,
    });

    // MUST equal the global default (7), not zero, not undefined.
    expect(resolved).toBe(GLOBAL_DEFAULT_DAYS);
  });

  /**
   * Additional: override=0 is a valid override (explicit zero-day cadence).
   *
   * null is the sentinel for "no override"; 0 means "override is 0 days".
   * The resolver must distinguish null from 0.
   * This prevents a truthy-falsy bug where `overrideDays || globalDefaultDays`
   * would incorrectly return the global default for a zero-value override.
   *
   * DECISION-019-G: `??` (nullish coalescing) is the correct operator,
   *   NOT `||` (which would treat 0 as falsy). // DECISION-019-G
   */
  it("[DECISION-019-G] override=0 is a valid override (not treated as absent) — nullish coalescing NOT truthy-check", () => {
    const GLOBAL_DEFAULT_DAYS = 7;
    const ZERO_OVERRIDE = 0;

    // overrideDays=0 is a non-null value → ?? does NOT fall back to globalDefaultDays.
    const resolved = resolveReminderCadence({
      overrideDays: ZERO_OVERRIDE,
      globalDefaultDays: GLOBAL_DEFAULT_DAYS,
    });

    // Must return 0 (the override), not 7 (the global default).
    expect(resolved).toBe(0);
    expect(resolved).not.toBe(GLOBAL_DEFAULT_DAYS);
  });

  /**
   * Additional: symmetry check with opposite values.
   *
   * Global default = 30, override = 14. Ensures the precedence is determined by
   * the presence/absence of overrideDays, not by which value is numerically smaller.
   */
  it("[AC-DASH-008-03] override takes precedence regardless of which value is numerically smaller (symmetry check)", () => {
    const GLOBAL_DEFAULT_DAYS = 30;
    const PER_ENGAGEMENT_OVERRIDE_DAYS = 14; // Override is smaller than global default

    // Override present → use override (14), not the larger global default (30).
    const withOverride = resolveReminderCadence({
      overrideDays: PER_ENGAGEMENT_OVERRIDE_DAYS,
      globalDefaultDays: GLOBAL_DEFAULT_DAYS,
    });
    expect(withOverride).toBe(PER_ENGAGEMENT_OVERRIDE_DAYS);
    expect(withOverride).not.toBe(GLOBAL_DEFAULT_DAYS);

    // Override absent → use global default (30).
    const withoutOverride = resolveReminderCadence({
      overrideDays: null,
      globalDefaultDays: GLOBAL_DEFAULT_DAYS,
    });
    expect(withoutOverride).toBe(GLOBAL_DEFAULT_DAYS);
    expect(withoutOverride).not.toBe(PER_ENGAGEMENT_OVERRIDE_DAYS);
  });

});

/**
 * packages/db/src/engagement-label.test.ts
 *
 * TIER-2 UNIT TEST — pure function, no DB required
 *
 * Tests for clientFacingLabel() and the CLIENT_FACING_LABELS constant.
 *
 * AC-LIFE-002-01 — each internal status maps to its client-facing label (4→3 mapping)
 * AC-LIFE-002-02 — the word "Review" (and any raw internal stage name) is NEVER returned
 * AC-LIFE-002-03 — exactly three distinct output labels: {Received, In Progress, Completed}
 * AC-LIFE-004-01 — Review represents the accountant reviewing her own work (invariant documented here)
 * AC-LIFE-004-02 — Review imposes no required client action (presents identically to In Progress)
 * AC-LIFE-004-03 — Review is not presented as a client review/approval step
 *
 * CS-TS-003: helper lives in packages/db — shared for both surfaces (portal + admin) per ADR-006
 * CS-GEN-003: AC and standard keys cited in comments throughout
 *
 * REQ-LIFE-002, REQ-LIFE-004
 */

import { describe, it, expect } from "vitest";
import { clientFacingLabel, CLIENT_FACING_LABELS } from "./engagement-label.js";

// ─── AC-LIFE-002-01: Four-to-three mapping correctness ───────────────────────

describe("[AC-LIFE-002-01] clientFacingLabel — four-to-three status mapping", () => {

  /**
   * [AC-LIFE-002-01] New → "Received"
   * The client sees "Received" when their engagement has been accepted but not yet started.
   */
  it("[AC-LIFE-002-01] New maps to 'Received'", () => {
    expect(clientFacingLabel("New")).toBe("Received");
  });

  /**
   * [AC-LIFE-002-01] In Progress → "In Progress"
   * The label passes through for this status.
   */
  it("[AC-LIFE-002-01] In Progress maps to 'In Progress'", () => {
    expect(clientFacingLabel("In Progress")).toBe("In Progress");
  });

  /**
   * [AC-LIFE-002-01] Review → "In Progress"
   * Review is the accountant's internal quality-check stage. The client sees
   * "In Progress" — the internal label is NEVER surfaced.
   * AC-LIFE-004-01: Review = accountant reviewing her own work before delivery.
   */
  it("[AC-LIFE-002-01] Review maps to 'In Progress' (internal stage hidden from client)", () => {
    expect(clientFacingLabel("Review")).toBe("In Progress");
  });

  /**
   * [AC-LIFE-002-01] Complete → "Completed"
   */
  it("[AC-LIFE-002-01] Complete maps to 'Completed'", () => {
    expect(clientFacingLabel("Complete")).toBe("Completed");
  });

});

// ─── AC-LIFE-002-02: No raw internal name ever returned ──────────────────────

describe("[AC-LIFE-002-02] clientFacingLabel — raw internal stage names are never returned", () => {

  /**
   * [AC-LIFE-002-02] "Review" is never returned for any valid input.
   * The word "Review" is the most critical internal name — it would wrongly imply the
   * client needs to review or approve something (REQ-LIFE-004).
   */
  it("[AC-LIFE-002-02] 'Review' is never returned for any known valid input", () => {
    const allKnownStatuses = ["New", "In Progress", "Review", "Complete"] as const;
    for (const status of allKnownStatuses) {
      expect(clientFacingLabel(status)).not.toBe("Review");
    }
  });

  /**
   * [AC-LIFE-002-02] "New" is never returned for any valid input.
   * "New" is an internal status name — not a client-friendly label.
   */
  it("[AC-LIFE-002-02] 'New' (internal name) is never returned for any valid input", () => {
    const allKnownStatuses = ["New", "In Progress", "Review", "Complete"] as const;
    for (const status of allKnownStatuses) {
      expect(clientFacingLabel(status)).not.toBe("New");
    }
  });

  /**
   * [AC-LIFE-002-02] "Complete" (internal name) is never returned — only "Completed" is.
   */
  it("[AC-LIFE-002-02] 'Complete' (internal name) is never returned — 'Completed' is returned instead", () => {
    const allKnownStatuses = ["New", "In Progress", "Review", "Complete"] as const;
    for (const status of allKnownStatuses) {
      expect(clientFacingLabel(status)).not.toBe("Complete");
    }
  });

  /**
   * [AC-LIFE-002-02] An unexpected/unknown status throws rather than echoing the raw value back.
   * Fail-closed: never echo an unexpected internal name to the client.
   */
  it("[AC-LIFE-002-02] unknown status throws rather than echoing raw value to caller", () => {
    expect(() => clientFacingLabel("UnknownStatus")).toThrow();
  });

  /**
   * [AC-LIFE-002-02] Empty string throws rather than returning an empty or raw label.
   */
  it("[AC-LIFE-002-02] empty string throws rather than returning a raw or empty label", () => {
    expect(() => clientFacingLabel("")).toThrow();
  });

  /**
   * [AC-LIFE-002-02] Lowercase variant "review" is not echoed back.
   * Defensive: even a casing variant must not leak the raw internal word.
   */
  it("[AC-LIFE-002-02] lowercase 'review' throws (not echoed back to caller)", () => {
    expect(() => clientFacingLabel("review")).toThrow();
  });

});

// ─── AC-LIFE-002-03: Exactly three distinct output labels ────────────────────

describe("[AC-LIFE-002-03] clientFacingLabel — exactly three distinct client states", () => {

  /**
   * [AC-LIFE-002-03] The full status set collapses to exactly three distinct output labels:
   * {"Received", "In Progress", "Completed"}.
   * No other value should appear in the output set.
   */
  it("[AC-LIFE-002-03] all four internal statuses collapse to exactly three distinct labels", () => {
    const allKnownStatuses = ["New", "In Progress", "Review", "Complete"] as const;
    const outputs = allKnownStatuses.map((s) => clientFacingLabel(s));
    const distinct = new Set(outputs);
    expect(distinct.size).toBe(3);
    expect(distinct).toEqual(new Set(["Received", "In Progress", "Completed"]));
  });

  /**
   * [AC-LIFE-002-03] CLIENT_FACING_LABELS constant exposes exactly the three allowed labels.
   */
  it("[AC-LIFE-002-03] CLIENT_FACING_LABELS constant contains exactly three allowed values", () => {
    expect(CLIENT_FACING_LABELS).toHaveLength(3);
    expect(CLIENT_FACING_LABELS).toContain("Received");
    expect(CLIENT_FACING_LABELS).toContain("In Progress");
    expect(CLIENT_FACING_LABELS).toContain("Completed");
  });

});

// ─── AC-LIFE-004: Review is internal — no distinct client state, no client action ────────────

describe("[AC-LIFE-004] Review is an internal accountant stage — no client-facing distinction", () => {

  /**
   * [AC-LIFE-004-01] Review represents the accountant reviewing her own work before delivery.
   * Invariant: clientFacingLabel("Review") === clientFacingLabel("In Progress").
   * The two stages are indistinguishable from the client's perspective — Review carries
   * no client-facing distinct state.
   * REQ-LIFE-004: "Review" is a quality step the accountant performs privately.
   * DECISION-010-E: mapping is fixed in v1, not accountant-configurable.
   */
  it("[AC-LIFE-004-01] Review carries no client-facing distinct state — presents identically to In Progress", () => {
    // The invariant: Review === In Progress from the client's view
    expect(clientFacingLabel("Review")).toBe(clientFacingLabel("In Progress"));
  });

  /**
   * [AC-LIFE-004-02] Review imposes no required client action.
   * Evidence: clientFacingLabel("Review") is "In Progress" — the same label as the active
   * work phase, with no implication of any required client action.
   */
  it("[AC-LIFE-004-02] Review label ('In Progress') implies no client action is required", () => {
    const label = clientFacingLabel("Review");
    // AC-LIFE-004-02: label is "In Progress", not any action-implying phrase
    expect(label).toBe("In Progress");
    // Defensive: confirm it is not a value that would imply client action
    expect(label).not.toMatch(/review/i);   // not "Review"
    expect(label).not.toMatch(/approve/i);  // not "Approve"
    expect(label).not.toMatch(/action/i);   // not "Action Required"
    expect(label).not.toMatch(/required/i);
  });

  /**
   * [AC-LIFE-004-03] Review is not presented to the client as a review/approval step.
   * The helper returns "In Progress" — which carries no implication that the client
   * must review or approve anything.
   */
  it("[AC-LIFE-004-03] Review is not surfaced as a client review/approval step — label is 'In Progress'", () => {
    const label = clientFacingLabel("Review");
    expect(label).toBe("In Progress");
    // The label must never contain the word "review" in any casing
    expect(label.toLowerCase()).not.toContain("review");
    // The label must never contain "approve" or "approval"
    expect(label.toLowerCase()).not.toContain("approv");
  });

});

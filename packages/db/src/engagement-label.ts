/**
 * packages/db/src/engagement-label.ts
 *
 * Client-facing engagement status label mapping.
 *
 * The portal surfaces simplified, friendly labels to clients instead of the
 * internal workflow vocabulary used by the accountant. Clients never see raw
 * internal stage names — in particular, "Review" (an internal quality-check
 * stage) is hidden and presented as "In Progress".
 *
 * DECISION-010-E: the mapping is fixed in v1 — NOT accountant-configurable.
 *   (OQ-002 resolved 2026-06-13, REQ-LIFE-002 Notes)
 *
 * CS-TS-003: lives in packages/db (shared for both portal + admin surfaces per
 *   ADR-006); portal is this slice's consumer but the helper must not be
 *   portal-private.
 * CS-GEN-003: AC keys cited throughout.
 *
 * REQ-LIFE-002, REQ-LIFE-004
 */

// ─── Client-facing label type ─────────────────────────────────────────────────

/**
 * The three labels a client ever sees for their engagement.
 *
 * AC-LIFE-002-03: exactly three distinct client-facing states.
 */
export type ClientFacingLabel = "Received" | "In Progress" | "Completed";

// ─── Constant — the three allowed output values ───────────────────────────────

/**
 * All allowed client-facing label values, in lifecycle order.
 * Consumed by UI components to render the label set; by tests for AC-LIFE-002-03.
 *
 * AC-LIFE-002-03, CS-TS-003
 */
export const CLIENT_FACING_LABELS: readonly ClientFacingLabel[] = [
  "Received",
  "In Progress",
  "Completed",
] as const;

// ─── Mapping table ────────────────────────────────────────────────────────────

/**
 * Internal engagement status → client-facing label.
 *
 * AC-LIFE-002-01: the four-to-three mapping exactly.
 *   New         → "Received"
 *   In Progress → "In Progress"
 *   Review      → "In Progress"   ← accountant-internal stage hidden from client
 *   Complete    → "Completed"
 *
 * AC-LIFE-004-01: "Review" represents the accountant reviewing her own work before
 *   delivery. It does NOT represent a step where the client reviews or approves
 *   anything — so it carries no distinct client-facing state.
 * AC-LIFE-004-02/-03: Review imposes no client action and is not surfaced as a
 *   client approval step; it maps to "In Progress".
 */
const LABEL_MAP: Record<string, ClientFacingLabel> = {
  New: "Received",          // AC-LIFE-002-01
  "In Progress": "In Progress", // AC-LIFE-002-01
  Review: "In Progress",    // AC-LIFE-002-01, AC-LIFE-004-01/-02/-03
  Complete: "Completed",    // AC-LIFE-002-01
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Maps an internal engagement status to the simplified client-facing label.
 *
 * Pure, dependency-free, deterministic. Total over the four known status values.
 * Throws on any unexpected value — never echoes a raw internal name back to the
 * caller (AC-LIFE-002-02 fail-closed contract).
 *
 * @param status - Raw internal engagement status from the DB/Prisma model.
 * @returns The client-facing label string.
 * @throws {Error} When `status` is not one of the four known internal stages.
 *
 * AC-LIFE-002-01, AC-LIFE-002-02, AC-LIFE-002-03
 * CS-TS-003, CS-GEN-003
 */
export function clientFacingLabel(status: string): ClientFacingLabel {
  const label = LABEL_MAP[status];

  if (label === undefined) {
    // AC-LIFE-002-02: never echo an unexpected raw value back to the client.
    // Throw so the caller cannot accidentally surface an unknown internal name.
    throw new Error(
      `clientFacingLabel: unknown engagement status "${status}". ` +
        `Expected one of: ${Object.keys(LABEL_MAP).join(", ")}.`
    );
  }

  return label;
}

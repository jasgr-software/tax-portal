#!/usr/bin/env tsx
/**
 * scripts/state-store-validate-awaiting.ts
 *
 * Thin CLI wrapper: validates awaitingMerge records in state.json, specifically:
 *   1. All four gateVerdicts slots are present (containerSmoke, sdetValidation,
 *      sdetCiGate, sdetQualityAudit) and each is string|null.
 *   2. Each record's createdAt is a valid ISO 8601 pattern.
 *   3. No clock inversion — validates the record-level invariant that closes the
 *      long-carried Completed-at/Started-at inversion ungated-fix (retro-012-014).
 *
 * Invoked by validate-gates.sh check 9 (check_awaiting_merge_records) via tsx.
 *
 * Usage: tsx scripts/state-store-validate-awaiting.ts <path-to-state.json>
 * Exit 0 = valid; Exit 1 = invalid (errors printed to stderr).
 *
 * DECISION (TASK-LOE-012-003 / AC-LOE-012-07):
 * This validator calls the FULL validateState() oracle (which includes
 * awaitingMerge record validation) — not a separate re-implementation.
 * The awaiting-merge-specific checks are in validateAwaitingMergeRecord()
 * inside state-store.ts, which validateState() already delegates to.
 * This script additionally performs the clock-inversion invariant check on
 * awaiting-merge records (createdAt vs lastUpdated), which is a record-level
 * invariant not captured by the field-type validation alone.
 *
 * CS-INFRA-004: zero new runtime npm dependencies — Node built-ins + local import.
 * CS-GEN-003: AC-LOE-012-07, retro-012-014 (clock-inversion — CLOSED structurally)
 */

// CS-INFRA-004: Node built-ins only.
import * as fs from "node:fs";

// CS-GEN-003: Reuse the INDEPENDENT ORACLE.
import { validateState, type StateStore, type AwaitingMergeRecord } from "./state-store.js";

const stateJsonPath = process.argv[2];
if (!stateJsonPath) {
  process.stderr.write("Usage: state-store-validate-awaiting.ts <path-to-state.json>\n");
  process.exit(1);
}

let raw: string;
try {
  raw = fs.readFileSync(stateJsonPath, "utf8");
} catch (err) {
  process.stderr.write(`Cannot read state.json at ${stateJsonPath}: ${String(err)}\n`);
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  process.stderr.write(`state.json is not valid JSON: ${String(err)}\n`);
  process.exit(1);
}

// Step 1: Full schema validation via the independent oracle (catches missing/malformed gateVerdicts slots).
// CS-GEN-003: RETRO-LOE-010 — call the INDEPENDENT ORACLE.
const errors = validateState(parsed);
if (errors.length > 0) {
  const detail = errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
  process.stderr.write(
    `state.json failed schema validation (${errors.length} error(s)):\n${detail}\n`
  );
  process.exit(1);
}

// Step 2: Record-level clock-inversion invariant.
// CS-GEN-003: retro-012-014 — this invariant closes the long-carried clock-inversion ungated-fix.
// A record's createdAt must not be later than the store's lastUpdated timestamp.
// This catches the class of errors where an agent writes a completion time before the start time.
const state = parsed as StateStore;
const lastUpdated = state.lastUpdated;
const clockErrors: string[] = [];

for (let i = 0; i < state.awaitingMerge.length; i++) {
  const rec = state.awaitingMerge[i] as AwaitingMergeRecord;
  const createdAt = rec.createdAt;

  // ISO 8601 pattern check (belt-and-suspenders — oracle already checked this)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(createdAt)) {
    clockErrors.push(
      `awaitingMerge[${i}]: createdAt "${createdAt}" is not a valid ISO 8601 datetime`
    );
    continue;
  }

  // Clock-inversion check: createdAt must not be AFTER lastUpdated.
  // Lexicographic comparison is valid for ISO 8601 strings in the same timezone (both UTC).
  // CS-GEN-003: retro-012-014 (clock-inversion invariant — enforced at script level here,
  // not by the field-type schema, which validates format only)
  if (createdAt > lastUpdated) {
    clockErrors.push(
      `awaitingMerge[${i}]: clock inversion — createdAt "${createdAt}" is AFTER lastUpdated "${lastUpdated}"`
    );
  }
}

if (clockErrors.length > 0) {
  const detail = clockErrors.map((e) => `  ${e}`).join("\n");
  process.stderr.write(
    `awaitingMerge records have clock-inversion invariant violations (${clockErrors.length}):\n${detail}\n`
  );
  process.exit(1);
}

// Valid — exit 0.
process.exit(0);

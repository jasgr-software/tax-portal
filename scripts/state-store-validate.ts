#!/usr/bin/env tsx
/**
 * scripts/state-store-validate.ts
 *
 * Thin CLI wrapper: validates a state.json file against the INDEPENDENT ORACLE
 * (validateState() from state-store.ts). Invoked by validate-gates.sh check 3
 * (check_state_json_schema) via tsx.
 *
 * Usage: tsx scripts/state-store-validate.ts <path-to-state.json>
 * Exit 0 = valid; Exit 1 = invalid (errors printed to stderr).
 *
 * DECISION (RETRO-LOE-010 / validation-oracle-independent-of-code):
 * This is NOT a re-implementation of the serializer. It calls validateState()
 * — the same independent oracle that rejects malformed fixtures in the test suite.
 * A malformed state.json MUST fail loudly (non-zero exit + diagnostic output).
 *
 * CS-INFRA-004: zero new runtime npm dependencies — Node built-ins + local import.
 * CS-GEN-003: AC-LOE-012-07, RETRO-LOE-010
 */

// CS-INFRA-004: Node built-ins only.
import * as fs from "node:fs";

// CS-GEN-003: Reuse the INDEPENDENT ORACLE — do NOT re-implement a lenient check.
import { validateState } from "./state-store.js";

const stateJsonPath = process.argv[2];
if (!stateJsonPath) {
  process.stderr.write("Usage: state-store-validate.ts <path-to-state.json>\n");
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

// CS-GEN-003: RETRO-LOE-010 — call the INDEPENDENT ORACLE, not the serializer.
const errors = validateState(parsed);
if (errors.length > 0) {
  const detail = errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
  process.stderr.write(
    `state.json failed schema validation (${errors.length} error(s)):\n${detail}\n`
  );
  process.exit(1);
}

// Valid — exit 0 (silent success, consistent with Unix conventions).
process.exit(0);

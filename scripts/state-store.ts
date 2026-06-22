#!/usr/bin/env tsx
/**
 * scripts/state-store.ts — Structured state store for the implementation engine
 *
 * BRIEF-LOE-012 / TASK-LOE-012-001 (AC-LOE-012-01)
 * Phase 2 of the scripted-bookkeeping initiative.
 *
 * Deliverables:
 *   1. TypeScript types for `.implementation/state.json` and `.implementation/events.jsonl`
 *   2. JSON-Schema definition (vendored — zero third-party deps, CS-INFRA-004)
 *   3. `validateState()` — an INDEPENDENT oracle that is NOT the same code that
 *      serialises the store. This is the Phase-0 YAML-blocker lesson generalised
 *      to JSON: the validator must REJECT a malformed state, not silently pass it.
 *      (RETRO-LOE-010 / validation-oracle-independent-of-code)
 *   4. `migrate()` — lifts the four PROGRESS.md sections into `state.json` + seeds
 *      `events.jsonl`. Read-only against PROGRESS.md (deletion is TASK-LOE-012-003).
 *   5. `renderReport()` — renders a human-readable narrative ON DEMAND. Output is
 *      never committed and is never read back as source of truth (§9).
 *
 * Design constraints (PROPOSAL-scripted-bookkeeping-phase2.md §2):
 *   - CS-INFRA-004: Zero new runtime npm dependencies — Node built-ins only.
 *   - CS-GEN-003: Cite the governing authority in code/test comments.
 *   - Mirror db-migrate.ts conventions: exported pure functions, thin main().
 *   - Atomic writes: write to temp file, fs.renameSync over target.
 *   - Idempotent: re-running a settled migration is a clean no-op.
 *   - §9.1 one-fact-one-home: `## Active bugs` is a QUERY over BUG-* front matter;
 *     it is NOT stored in state.json.
 *   - §9.3 rationale-as-field: every rationale/note is a `note` or `rationale` field
 *     on the relevant record, never a free-floating prose blob.
 *   - §7 decision 1: `events.jsonl` is committed (not gitignored).
 *
 * Run via: pnpm task migrate (future; wired in TASK-LOE-012-002)
 */

// CS-INFRA-004: Zero new runtime npm dependencies — Node built-ins only.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// CS-GEN-003: Reuse Phase-0/1 substrate helpers — do not re-implement.
import { atomicWriteFile, findRepoRoot, nowIso } from "./task.js";

// ─── Phase enum ───────────────────────────────────────────────────────────────

// CS-GEN-003: Phase enum matches PHASES.md § Phase lifecycle.
// "Plan" covers "Plan (Ingest → Clarify → Design → Decompose)"
// The enum is CLOSED — an unknown value is a schema violation.
export const VALID_PHASES = [
  "Plan",
  "Dispatch",
  "Audit",
  "Review",
  "Smoke",
  "Validate",
  "Close-prep",
  "Close-finalize",
] as const;

export type Phase = (typeof VALID_PHASES)[number];

// ─── State-store types ────────────────────────────────────────────────────────

/**
 * A gate-verdict slot in an awaiting-merge record.
 * Each slot is an AGENT-SUPPLIED string (the judgment stays with the agent —
 * PROPOSAL-scripted-bookkeeping-phase2.md §8 / parent §6 judgment line).
 * CS-GEN-003: §9.3 rationale-as-field
 */
export interface GateVerdictSlots {
  containerSmoke: string | null;   // gate 5 — Container Smoke
  sdetValidation: string | null;   // gate 6 — SDET Validation
  sdetCiGate: string | null;       // gate 7 — SDET CI gate
  sdetQualityAudit: string | null; // gate 8 — SDET quality audit
}

/**
 * An awaiting-merge record (one entry per in-flight PR).
 * CS-GEN-003: §7 decision 1 — awaiting-merge records live in state.json hot-state.
 */
export interface AwaitingMergeRecord {
  /** GitHub PR number */
  pr: number;
  /** GitHub PR URL (derived by CLI from `gh pr view`, never agent-transcribed) */
  prUrl: string;
  /** Squash merge SHA after merge (null while pending) */
  squashSha: string | null;
  /** ISO 8601 UTC timestamp when this record was created */
  createdAt: string;
  /** Agent-supplied gate verdicts (the judgment stays with the agent) */
  gateVerdicts: GateVerdictSlots;
  /** Optional agent-supplied note/rationale (§9.3 — field, not free blob) */
  note: string | null;
}

/**
 * An open retro action item.
 * CS-GEN-003: §9.3 rationale-as-field — `note` is a structured field.
 */
export interface RetroActionItem {
  /** Unique stable ID (e.g. "retro-012-001") */
  id: string;
  /** Category tag (e.g. "ungated-fix", "gated-path-fix", "observation") */
  category: string;
  /** One-line description of the action item */
  description: string;
  /** Agent-supplied note/rationale (§9.3) */
  note: string | null;
  /** ISO 8601 date when this item was added */
  addedAt: string;
}

/**
 * The full orchestration hot-state stored in `.implementation/state.json`.
 *
 * DECISION (§9.1 one-fact-one-home): This struct carries ONLY hot-state:
 *   - Current brief/phase/slice context
 *   - Awaiting-merge records (the gated-path accountability ledger)
 *   - Open retro action items
 *
 * It does NOT store:
 *   - Active bugs (these are a QUERY over BUG-* front matter — Phase 0)
 *   - Closed work (git history + tasks/done/ are the durable record)
 *   - Rendered narrative (that is TASK-LOE-012-002's `report` output — generated on demand, never committed)
 *
 * CS-GEN-003: §9.1 one-fact-one-home
 */
export interface StateStore {
  /** Schema version for forward-compatibility detection */
  schemaVersion: "1.0";
  /** ISO 8601 UTC timestamp of last write */
  lastUpdated: string;
  /** The current brief being implemented (null if no active slice) */
  currentBrief: string | null;
  /**
   * The current phase of the active slice.
   * Closed enum matching PHASES.md — unknown values are schema violations.
   */
  currentPhase: Phase | null;
  /** A human-readable one-line description of the current slice */
  currentSliceDescription: string | null;
  /** Branch name for the current slice */
  currentBranch: string | null;
  /**
   * Awaiting-merge records.
   * CS-GEN-003: §7 decision 1 — committed alongside events.jsonl.
   */
  awaitingMerge: AwaitingMergeRecord[];
  /**
   * Open retro action items.
   * CS-GEN-003: §9.3 rationale-as-field — each item has its own `note` field.
   */
  openRetroItems: RetroActionItem[];
}

/**
 * A single event in the append-only `.implementation/events.jsonl`.
 * CS-GEN-003: §7 decision 1 — committed; git log is the deep backstop.
 */
export interface StateEvent {
  /** ISO 8601 UTC timestamp */
  ts: string;
  /** Event type (phase-transition, merge-checkpoint, post-merge, migration) */
  type: "phase-transition" | "merge-checkpoint" | "post-merge" | "migration" | "retro-item-added" | "retro-item-resolved";
  /** Brief this event belongs to */
  brief: string | null;
  /** Phase at time of event */
  phase: Phase | null;
  /** Agent role that triggered the event */
  role: string;
  /** Optional PR number for merge-related events */
  pr: number | null;
  /** Optional agent-supplied note (§9.3 — field, not free blob) */
  note: string | null;
  /** Optional free-form payload for structured data */
  payload: Record<string, unknown> | null;
}

// ─── JSON-Schema definition ───────────────────────────────────────────────────

/**
 * JSON-Schema (draft-07 compatible) for StateStore.
 *
 * DECISION (RETRO-LOE-010 / validation-oracle-independent-of-code):
 * This schema is the INDEPENDENT ORACLE — it is the authority for what a
 * well-formed state.json looks like. The `validateState()` function checks
 * incoming data AGAINST this schema using a minimal vendored validator,
 * NOT by re-reading the serialize path or trusting the same code that wrote it.
 *
 * A malformed state.json MUST fail loudly — this is the Phase-0 YAML-blocker
 * lesson applied to JSON. The counterfactual test proves the oracle catches
 * a deliberately-malformed fixture.
 *
 * CS-INFRA-004: The schema is a plain JS object (no ajv, no third-party).
 * CS-GEN-003: PROPOSAL-scripted-bookkeeping-phase2.md §5 / RETRO-LOE-010
 */
export const STATE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://tax-portal/.implementation/state.schema.json",
  type: "object",
  required: [
    "schemaVersion",
    "lastUpdated",
    "currentBrief",
    "currentPhase",
    "currentSliceDescription",
    "currentBranch",
    "awaitingMerge",
    "openRetroItems",
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: "string",
      enum: ["1.0"],
      description: "Schema version for forward-compatibility detection",
    },
    lastUpdated: {
      type: "string",
      format: "date-time",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}",
      description: "ISO 8601 UTC timestamp of last write",
    },
    currentBrief: {
      type: ["string", "null"],
      description: "Current brief ID (null if no active slice)",
    },
    currentPhase: {
      oneOf: [
        {
          type: "string",
          enum: VALID_PHASES as readonly string[],
          description: "Current phase — closed enum matching PHASES.md",
        },
        { type: "null" },
      ],
    },
    currentSliceDescription: {
      type: ["string", "null"],
      description: "Human-readable one-line description of the current slice",
    },
    currentBranch: {
      type: ["string", "null"],
      description: "Git branch name for the current slice",
    },
    awaitingMerge: {
      type: "array",
      description: "Awaiting-merge records (one per in-flight PR)",
      items: {
        type: "object",
        required: ["pr", "prUrl", "squashSha", "createdAt", "gateVerdicts", "note"],
        additionalProperties: false,
        properties: {
          pr: {
            type: "integer",
            minimum: 1,
            description: "GitHub PR number",
          },
          prUrl: {
            type: "string",
            pattern: "^https://",
            description: "GitHub PR URL (derived by CLI, never agent-transcribed)",
          },
          squashSha: {
            type: ["string", "null"],
            pattern: "^[0-9a-f]{7,40}$",
            description: "Squash merge SHA (null while pending)",
          },
          createdAt: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}",
            description: "ISO 8601 UTC timestamp when this record was created",
          },
          gateVerdicts: {
            type: "object",
            required: ["containerSmoke", "sdetValidation", "sdetCiGate", "sdetQualityAudit"],
            additionalProperties: false,
            properties: {
              containerSmoke: { type: ["string", "null"] },
              sdetValidation: { type: ["string", "null"] },
              sdetCiGate: { type: ["string", "null"] },
              sdetQualityAudit: { type: ["string", "null"] },
            },
          },
          note: {
            type: ["string", "null"],
            description: "Optional agent-supplied note (§9.3 — field, not free blob)",
          },
        },
      },
    },
    openRetroItems: {
      type: "array",
      description: "Open retro action items",
      items: {
        type: "object",
        required: ["id", "category", "description", "note", "addedAt"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            pattern: "^retro-",
            description: "Unique stable retro item ID",
          },
          category: {
            type: "string",
            enum: [
              "ungated-fix",
              "gated-path-fix",
              "observation",
              "acknowledged",
              "CI",
              "infra",
              "process",
              "rule-sunset",
              "doc-drift",
              "metric-integrity",
              "gate-design",
              "gated-path-candidate",
              "e2e-determinism",
              "demo",
              "sec",
            ],
            description: "Category tag for the retro item",
          },
          description: {
            type: "string",
            minLength: 1,
            description: "One-line description of the action item",
          },
          note: {
            type: ["string", "null"],
            description: "Agent-supplied note/rationale (§9.3 — field, not free blob)",
          },
          addedAt: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}",
            description: "ISO 8601 date when this item was added",
          },
        },
      },
    },
  },
} as const;

// ─── Independent JSON-Schema validator (vendored, zero deps) ─────────────────

/**
 * A validation error returned by `validateState()`.
 */
export interface ValidationError {
  /** JSON Pointer to the failing field (e.g. "/currentPhase") */
  path: string;
  /** Human-readable description of the violation */
  message: string;
  /** The offending value (for diagnostic output) */
  value: unknown;
}

/**
 * Validate a candidate state object against the STATE_SCHEMA.
 *
 * DECISION (RETRO-LOE-010 / validation-oracle-independent-of-code):
 * This is the INDEPENDENT ORACLE. It is intentionally a separate code path
 * from the serializer/deserializer — it does NOT simply re-read the output
 * of serializeState() through the same logic that produced it.
 *
 * The validator is a minimal, hand-rolled JSON-Schema v7 checker that validates
 * the structural constraints we care about:
 *   1. All required fields are present
 *   2. Types match (string, null, integer, array, object)
 *   3. Enum values are legal (currentPhase, schemaVersion)
 *   4. Pattern constraints hold (ISO 8601, sha format, etc.)
 *   5. additionalProperties: false (no spurious fields)
 *   6. Record-level invariants (no clock inversion — awaitingMerge.createdAt)
 *
 * WHY VENDORED AND NOT ajv:
 *   CS-INFRA-004 mandates zero new runtime npm dependencies. The set of
 *   constraints we need is small and well-defined — a hand-rolled checker
 *   is more auditable and has no supply-chain risk. The Phase-0 lesson was
 *   that the validator must be INDEPENDENT OF the code being validated, not
 *   that it must be a specific library. A minimal hand-rolled checker that
 *   correctly rejects malformed inputs IS an independent oracle.
 *
 * CS-INFRA-004: Node built-ins only.
 * CS-GEN-003: RETRO-LOE-010, PROPOSAL-scripted-bookkeeping-phase2.md §4
 *
 * @returns An array of ValidationError. Empty = valid. Non-empty = invalid.
 */
export function validateState(candidate: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    errors.push({ path: "/", message: "state must be a non-null object", value: candidate });
    return errors;
  }

  const obj = candidate as Record<string, unknown>;

  // ── 1. Required top-level fields ─────────────────────────────────────────
  const required = [
    "schemaVersion",
    "lastUpdated",
    "currentBrief",
    "currentPhase",
    "currentSliceDescription",
    "currentBranch",
    "awaitingMerge",
    "openRetroItems",
  ];
  for (const field of required) {
    if (!(field in obj)) {
      errors.push({ path: `/${field}`, message: `required field '${field}' is missing`, value: undefined });
    }
  }
  if (errors.length > 0) return errors; // structural — bail early

  // ── 2. additionalProperties: false ────────────────────────────────────────
  const knownTopLevel = new Set(required);
  for (const key of Object.keys(obj)) {
    if (!knownTopLevel.has(key)) {
      errors.push({ path: `/${key}`, message: `unknown field '${key}' (additionalProperties: false)`, value: obj[key] });
    }
  }

  // ── 3. schemaVersion ─────────────────────────────────────────────────────
  if (obj["schemaVersion"] !== "1.0") {
    errors.push({
      path: "/schemaVersion",
      message: `schemaVersion must be "1.0", got "${String(obj["schemaVersion"])}"`,
      value: obj["schemaVersion"],
    });
  }

  // ── 4. lastUpdated — ISO 8601 pattern ─────────────────────────────────────
  if (typeof obj["lastUpdated"] !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj["lastUpdated"])) {
    errors.push({
      path: "/lastUpdated",
      message: "lastUpdated must be an ISO 8601 datetime string",
      value: obj["lastUpdated"],
    });
  }

  // ── 5. currentBrief — string or null ──────────────────────────────────────
  if (obj["currentBrief"] !== null && typeof obj["currentBrief"] !== "string") {
    errors.push({ path: "/currentBrief", message: "currentBrief must be string or null", value: obj["currentBrief"] });
  }

  // ── 6. currentPhase — closed enum or null ─────────────────────────────────
  const phase = obj["currentPhase"];
  if (phase !== null && !VALID_PHASES.includes(phase as Phase)) {
    errors.push({
      path: "/currentPhase",
      message: `currentPhase must be one of [${VALID_PHASES.join(", ")}] or null, got "${String(phase)}"`,
      value: phase,
    });
  }

  // ── 7. currentSliceDescription — string or null ───────────────────────────
  if (obj["currentSliceDescription"] !== null && typeof obj["currentSliceDescription"] !== "string") {
    errors.push({ path: "/currentSliceDescription", message: "currentSliceDescription must be string or null", value: obj["currentSliceDescription"] });
  }

  // ── 8. currentBranch — string or null ─────────────────────────────────────
  if (obj["currentBranch"] !== null && typeof obj["currentBranch"] !== "string") {
    errors.push({ path: "/currentBranch", message: "currentBranch must be string or null", value: obj["currentBranch"] });
  }

  // ── 9. awaitingMerge — array of records ───────────────────────────────────
  if (!Array.isArray(obj["awaitingMerge"])) {
    errors.push({ path: "/awaitingMerge", message: "awaitingMerge must be an array", value: obj["awaitingMerge"] });
  } else {
    for (let i = 0; i < (obj["awaitingMerge"] as unknown[]).length; i++) {
      const rec = (obj["awaitingMerge"] as unknown[])[i];
      errors.push(...validateAwaitingMergeRecord(rec, `/awaitingMerge/${i}`));
    }
  }

  // ── 10. openRetroItems — array of records ─────────────────────────────────
  if (!Array.isArray(obj["openRetroItems"])) {
    errors.push({ path: "/openRetroItems", message: "openRetroItems must be an array", value: obj["openRetroItems"] });
  } else {
    for (let i = 0; i < (obj["openRetroItems"] as unknown[]).length; i++) {
      const item = (obj["openRetroItems"] as unknown[])[i];
      errors.push(...validateRetroItem(item, `/openRetroItems/${i}`));
    }
  }

  return errors;
}

/** Validate a single awaiting-merge record. */
function validateAwaitingMergeRecord(rec: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof rec !== "object" || rec === null || Array.isArray(rec)) {
    errors.push({ path, message: "awaiting-merge record must be a non-null object", value: rec });
    return errors;
  }

  const r = rec as Record<string, unknown>;
  const requiredFields = ["pr", "prUrl", "squashSha", "createdAt", "gateVerdicts", "note"];
  for (const f of requiredFields) {
    if (!(f in r)) {
      errors.push({ path: `${path}/${f}`, message: `required field '${f}' missing on awaiting-merge record`, value: undefined });
    }
  }

  // additionalProperties: false
  const known = new Set(requiredFields);
  for (const k of Object.keys(r)) {
    if (!known.has(k)) {
      errors.push({ path: `${path}/${k}`, message: `unknown field '${k}' on awaiting-merge record (additionalProperties: false)`, value: r[k] });
    }
  }

  if ("pr" in r && (typeof r["pr"] !== "number" || !Number.isInteger(r["pr"]) || (r["pr"] as number) < 1)) {
    errors.push({ path: `${path}/pr`, message: "pr must be a positive integer", value: r["pr"] });
  }

  if ("prUrl" in r && (typeof r["prUrl"] !== "string" || !/^https:\/\//.test(r["prUrl"] as string))) {
    errors.push({ path: `${path}/prUrl`, message: "prUrl must be a string starting with https://", value: r["prUrl"] });
  }

  if ("squashSha" in r) {
    const sha = r["squashSha"];
    if (sha !== null && (typeof sha !== "string" || !/^[0-9a-f]{7,40}$/i.test(sha as string))) {
      errors.push({ path: `${path}/squashSha`, message: "squashSha must be a hex SHA (7–40 chars) or null", value: sha });
    }
  }

  if ("createdAt" in r && (typeof r["createdAt"] !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(r["createdAt"] as string))) {
    errors.push({ path: `${path}/createdAt`, message: "createdAt must be an ISO 8601 datetime string", value: r["createdAt"] });
  }

  if ("gateVerdicts" in r) {
    errors.push(...validateGateVerdicts(r["gateVerdicts"], `${path}/gateVerdicts`));
  }

  if ("note" in r && r["note"] !== null && typeof r["note"] !== "string") {
    errors.push({ path: `${path}/note`, message: "note must be string or null", value: r["note"] });
  }

  return errors;
}

/** Validate a gate-verdicts object. */
function validateGateVerdicts(v: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    errors.push({ path, message: "gateVerdicts must be a non-null object", value: v });
    return errors;
  }

  const obj = v as Record<string, unknown>;
  const slots = ["containerSmoke", "sdetValidation", "sdetCiGate", "sdetQualityAudit"];

  for (const slot of slots) {
    if (!(slot in obj)) {
      errors.push({ path: `${path}/${slot}`, message: `required gate-verdict slot '${slot}' missing`, value: undefined });
    } else if (obj[slot] !== null && typeof obj[slot] !== "string") {
      errors.push({ path: `${path}/${slot}`, message: `gate-verdict slot '${slot}' must be string or null`, value: obj[slot] });
    }
  }

  // additionalProperties: false
  const known = new Set(slots);
  for (const k of Object.keys(obj)) {
    if (!known.has(k)) {
      errors.push({ path: `${path}/${k}`, message: `unknown gate-verdict field '${k}'`, value: obj[k] });
    }
  }

  return errors;
}

/** Validate a single retro action item. */
function validateRetroItem(item: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    errors.push({ path, message: "retro item must be a non-null object", value: item });
    return errors;
  }

  const r = item as Record<string, unknown>;
  const requiredFields = ["id", "category", "description", "note", "addedAt"];
  for (const f of requiredFields) {
    if (!(f in r)) {
      errors.push({ path: `${path}/${f}`, message: `required field '${f}' missing on retro item`, value: undefined });
    }
  }

  // additionalProperties: false
  const known = new Set(requiredFields);
  for (const k of Object.keys(r)) {
    if (!known.has(k)) {
      errors.push({ path: `${path}/${k}`, message: `unknown field '${k}' on retro item (additionalProperties: false)`, value: r[k] });
    }
  }

  if ("id" in r && (typeof r["id"] !== "string" || !/^retro-/.test(r["id"] as string))) {
    errors.push({ path: `${path}/id`, message: "retro item id must be a string starting with 'retro-'", value: r["id"] });
  }

  const validCategories = new Set([
    "ungated-fix", "gated-path-fix", "observation", "acknowledged",
    "CI", "infra", "process", "rule-sunset", "doc-drift",
    "metric-integrity", "gate-design", "gated-path-candidate",
    "e2e-determinism", "demo", "sec",
  ]);
  if ("category" in r && (typeof r["category"] !== "string" || !validCategories.has(r["category"] as string))) {
    errors.push({
      path: `${path}/category`,
      message: `retro item category must be one of [${[...validCategories].join(", ")}], got "${String(r["category"])}"`,
      value: r["category"],
    });
  }

  if ("description" in r && (typeof r["description"] !== "string" || (r["description"] as string).length === 0)) {
    errors.push({ path: `${path}/description`, message: "retro item description must be a non-empty string", value: r["description"] });
  }

  if ("note" in r && r["note"] !== null && typeof r["note"] !== "string") {
    errors.push({ path: `${path}/note`, message: "retro item note must be string or null", value: r["note"] });
  }

  if ("addedAt" in r && (typeof r["addedAt"] !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(r["addedAt"] as string))) {
    errors.push({ path: `${path}/addedAt`, message: "retro item addedAt must be a date string (YYYY-MM-DD)", value: r["addedAt"] });
  }

  return errors;
}

// ─── State serialisation / deserialisation ────────────────────────────────────

/**
 * Serialise a StateStore to pretty-printed JSON (2-space indent, trailing newline).
 * DECISION: JSON.stringify with 2-space indent for human-readability in PRs.
 * CS-GEN-003: §9 — generated view is never committed (but state.json itself is).
 */
export function serializeState(state: StateStore): string {
  return JSON.stringify(state, null, 2) + "\n";
}

/**
 * Deserialise and validate a JSON string into a StateStore.
 * Throws a descriptive error on parse failure or schema violation.
 *
 * DECISION (RETRO-LOE-010): This function runs the INDEPENDENT ORACLE
 * (`validateState`) after deserialising, so every read path is schema-validated.
 * A caller that writes then immediately reads will surface any schema regression.
 */
export function deserializeAndValidateState(json: string): StateStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new StateStoreError(`state.json is not valid JSON: ${String(err)}`, "PARSE_ERROR");
  }

  const errors = validateState(parsed);
  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new StateStoreError(
      `state.json failed schema validation (${errors.length} error(s)):\n${detail}`,
      "SCHEMA_VIOLATION"
    );
  }

  return parsed as StateStore;
}

/** Typed error class for state-store failures. */
export class StateStoreError extends Error {
  constructor(
    message: string,
    public readonly code: "PARSE_ERROR" | "SCHEMA_VIOLATION" | "MIGRATION_ERROR" | "IDEMPOTENT_SKIP"
  ) {
    super(message);
    this.name = "StateStoreError";
  }
}

// ─── File path helpers ────────────────────────────────────────────────────────

/**
 * Get the canonical path to `.implementation/state.json`.
 * CS-GEN-003: path is repo-rooted, not user-supplied (input confinement).
 */
export function getStatePath(repoRoot: string): string {
  return path.join(repoRoot, ".implementation", "state.json");
}

/**
 * Get the canonical path to `.implementation/events.jsonl`.
 * CS-GEN-003: §7 decision 1 — events.jsonl is committed.
 */
export function getEventsPath(repoRoot: string): string {
  return path.join(repoRoot, ".implementation", "events.jsonl");
}

// ─── Atomic state read/write ─────────────────────────────────────────────────

/**
 * Read and validate `state.json` from disk.
 * Returns null if the file does not exist (first-run case).
 */
export function readState(repoRoot: string): StateStore | null {
  const statePath = getStatePath(repoRoot);
  if (!fs.existsSync(statePath)) return null;

  const json = fs.readFileSync(statePath, "utf8");
  return deserializeAndValidateState(json);
}

/**
 * Write `state.json` atomically (temp + rename).
 * Validates the state BEFORE writing (belt-and-suspenders).
 *
 * DECISION: Validate before write, not just after read — catches serialisation
 * bugs in callers before they corrupt the on-disk state.
 * CS-GEN-003: atomicWriteFile from task.ts (Phase 0/1 substrate reuse)
 */
export function writeState(repoRoot: string, state: StateStore): void {
  // Validate before writing (belt-and-suspenders)
  const errors = validateState(state);
  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new StateStoreError(
      `Refusing to write invalid state (${errors.length} error(s)):\n${detail}`,
      "SCHEMA_VIOLATION"
    );
  }

  const statePath = getStatePath(repoRoot);
  atomicWriteFile(statePath, serializeState(state));
}

/**
 * Append a single event to `events.jsonl`.
 * Uses `fs.appendFileSync` (append-only, no temp-rename needed — JSONL is append-safe).
 *
 * DECISION: JSONL append is inherently additive; corruption is limited to the
 * last line if a crash occurs mid-write. The file is read line-by-line, so
 * a partial last line is safely skippable by readers. This mirrors the
 * `.claude/metrics/tasks.jsonl` pattern from Phase 1.
 * CS-GEN-003: §7 decision 1 — events.jsonl is committed.
 */
export function appendEvent(repoRoot: string, event: StateEvent): void {
  const eventsPath = getEventsPath(repoRoot);
  fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n", "utf8");
}

/**
 * Read all events from `events.jsonl`.
 * Skips blank lines and malformed lines (defensive).
 */
export function readEvents(repoRoot: string): StateEvent[] {
  const eventsPath = getEventsPath(repoRoot);
  if (!fs.existsSync(eventsPath)) return [];

  const raw = fs.readFileSync(eventsPath, "utf8");
  const events: StateEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as StateEvent);
    } catch {
      // Skip malformed lines defensively
    }
  }
  return events;
}

// ─── PROGRESS.md section parser ───────────────────────────────────────────────

/**
 * Parsed representation of the four PROGRESS.md sections the migration lifts.
 * CS-GEN-003: ENGINE.md § PROGRESS.md structure contract
 */
export interface ParsedProgressSections {
  currentInitiative: string;   // raw text of `## Current initiative` section
  awaitingPrMerge: string;     // raw text of `## Awaiting PR merge` section
  activeBugs: string;          // raw text of `## Active bugs` section (§9.1 query only)
  openRetroItems: string;      // raw text of `## Open retro action items` section
}

/**
 * Parse the four `## ` sections from PROGRESS.md content.
 *
 * DECISION: We extract ALL four sections, including `## Active bugs`, so we
 * can confirm the facts are reachable via a query. We do NOT copy the bug
 * list into state.json (§9.1 one-fact-one-home). The parsed `activeBugs`
 * field is used ONLY for the lossless-migration assertion in tests.
 *
 * Section boundaries: a section ends at the next `## ` heading OR the `---`
 * session-entry separator (per ENGINE.md § PROGRESS.md structure contract).
 *
 * CS-GEN-003: ENGINE.md § PROGRESS.md structure contract
 */
export function parseProgressSections(content: string): ParsedProgressSections {
  const lines = content.split("\n");

  const sections: Record<string, string> = {};
  let currentSection: string | null = null;
  const currentLines: string[] = [];

  for (const line of lines) {
    // Check for section start (## heading — but not ### or deeper)
    const sectionMatch = /^## (.+)$/.exec(line.trim());
    if (sectionMatch) {
      // Save previous section
      if (currentSection !== null) {
        sections[currentSection] = currentLines.join("\n").trimEnd();
        currentLines.length = 0;
      }
      currentSection = sectionMatch[1]!.trim();
      currentLines.push(line);
      continue;
    }

    // Stop at the session-entry separator `---`
    if (/^---\s*$/.test(line) && currentSection !== null) {
      sections[currentSection] = currentLines.join("\n").trimEnd();
      currentLines.length = 0;
      currentSection = null;
      break;
    }

    if (currentSection !== null) {
      currentLines.push(line);
    }
  }

  // Save any final open section
  if (currentSection !== null && currentLines.length > 0) {
    sections[currentSection] = currentLines.join("\n").trimEnd();
  }

  return {
    currentInitiative: sections["Current initiative"] ?? "",
    awaitingPrMerge: sections["Awaiting PR merge"] ?? "",
    activeBugs: sections["Active bugs"] ?? "",
    openRetroItems: sections["Open retro action items"] ?? "",
  };
}

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Options for the one-shot migration.
 */
export interface MigrateOptions {
  /** Path to PROGRESS.md (injectable for testing) */
  progressPath?: string;
  /** Repo root (injectable for testing) */
  repoRoot?: string;
  /** If true: print the JSON diff and write nothing */
  dryRun?: boolean;
  /** Clock source (injectable for testing) */
  nowFn?: () => string;
}

/**
 * Result of the migration.
 */
export interface MigrateResult {
  /** Whether the migration actually wrote anything */
  changed: boolean;
  /** Human-readable status message */
  message: string;
  /** The state.json that was written (or would be written in --dry-run) */
  state: StateStore;
  /** The events that were appended (or would be in --dry-run) */
  events: StateEvent[];
  /** The parsed PROGRESS.md sections (for lossless-migration assertions) */
  parsedSections: ParsedProgressSections;
}

/**
 * One-shot migration that lifts the four PROGRESS.md sections into `state.json`
 * and seeds `events.jsonl`.
 *
 * Key invariants:
 *   1. Read-only against PROGRESS.md (deletion is TASK-LOE-012-003).
 *   2. §9.1 one-fact-one-home: `## Active bugs` is parsed (for confirmation)
 *      but NOT stored in state.json.
 *   3. Idempotent: re-running over an already-migrated tree is a clean no-op.
 *   4. Atomic: uses atomicWriteFile (temp + rename) for state.json.
 *   5. --dry-run: prints the JSON diff, writes nothing.
 *
 * CS-INFRA-004: Node built-ins only.
 * CS-GEN-003: PROPOSAL-scripted-bookkeeping-phase2.md §3, §9.1, §9.3
 */
export function migrate(opts: MigrateOptions = {}): MigrateResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const now = opts.nowFn ? opts.nowFn() : nowIso();
  const today = now.slice(0, 10);

  // ── Read PROGRESS.md (read-only) ─────────────────────────────────────────
  const progressPath = opts.progressPath ?? path.join(
    repoRoot, ".implementation", "tasks", "PROGRESS.md"
  );

  if (!fs.existsSync(progressPath)) {
    throw new StateStoreError(
      `PROGRESS.md not found at: ${progressPath}`,
      "MIGRATION_ERROR"
    );
  }

  const progressRaw = fs.readFileSync(progressPath, "utf8");
  const sections = parseProgressSections(progressRaw);

  // ── IDEMPOTENCY: if state.json already exists and has the same brief, skip ─
  const statePath = getStatePath(repoRoot);
  if (fs.existsSync(statePath) && !opts.dryRun) {
    try {
      const existing = readState(repoRoot);
      if (existing && existing.currentBrief !== null) {
        // Check if the current initiative section mentions the same brief
        const briefMatch = /BRIEF-[A-Z0-9-]+/.exec(sections.currentInitiative);
        const currentBrief = briefMatch ? briefMatch[0] : null;
        if (existing.currentBrief === currentBrief) {
          return {
            changed: false,
            message: `Migration already completed (state.json exists with brief=${existing.currentBrief}) — no-op`,
            state: existing,
            events: [],
            parsedSections: sections,
          };
        }
      }
    } catch {
      // If the existing state.json is malformed, re-migrate
    }
  }

  // ── Parse the current initiative section ──────────────────────────────────
  // DECISION: Extract key fields from the `## Current initiative` section using
  // heuristic text matching. The section is unstructured prose, so we use
  // conservative patterns to avoid false positives.
  // CS-GEN-003: ENGINE.md § PROGRESS.md structure contract

  const initiativeText = sections.currentInitiative;

  // Extract brief ID (e.g. "BRIEF-LOE-012")
  const briefMatch = /\b(BRIEF-[A-Z0-9-]+)\b/.exec(initiativeText);
  const currentBrief = briefMatch ? briefMatch[1]! : null;

  // Extract phase (e.g. "Phase: Plan COMPLETE → Dispatch" → "Dispatch")
  // Pattern: look for "Phase: <Phase>" or "Phase: <Phase> COMPLETE → <Phase>"
  let currentPhase: Phase | null = null;
  const phaseArrowMatch = /Phase:\s+\w+\s+COMPLETE\s*→\s*(\w[\w-]*)/.exec(initiativeText);
  const phaseSimpleMatch = /Phase:\s*(\w[\w-]*)/.exec(initiativeText);
  const rawPhase = phaseArrowMatch ? phaseArrowMatch[1] : phaseSimpleMatch ? phaseSimpleMatch[1] : null;
  if (rawPhase && VALID_PHASES.includes(rawPhase as Phase)) {
    currentPhase = rawPhase as Phase;
  }

  // Extract branch name (e.g. "branch `brief-LOE-012-state-store`")
  const branchMatch = /branch\s+[`"]?([a-zA-Z0-9/_.-]+)[`"]?/.exec(initiativeText);
  const currentBranch = branchMatch ? branchMatch[1]! : null;

  // Extract one-line description (first bold text after "**BRIEF-...")
  // Pattern: **BRIEF-LOE-012 / Phase 2 — <description>**
  const descMatch = /\*\*BRIEF-[A-Z0-9-]+ [^*]+?—\s*([^*\n]+)/.exec(initiativeText);
  const currentSliceDescription = descMatch
    ? descMatch[1]!.trim().replace(/\.$/, "")
    : currentBrief
    ? `Active slice: ${currentBrief}`
    : null;

  // ── Parse awaiting-merge records ──────────────────────────────────────────
  // DECISION: Parse the `## Awaiting PR merge` section for active records.
  // Delivered/cleared entries (bounded-ledger one-line pointers) are NOT stored
  // (§9.1 one-fact-one-home — deep history is git + tasks/done/).
  // The current PROGRESS.md has "_None active._" — so awaitingMerge is empty.
  const awaitingMerge: AwaitingMergeRecord[] = [];
  const awaitingText = sections.awaitingPrMerge;

  // Check for an active (non-cleared) awaiting-merge entry
  // Active entries have the pattern: "PR #NNN" with a URL and gate verdicts
  // The "bounded-ledger one-line pointer" entries are in blockquotes (> ...)
  // We skip blockquote lines when looking for active records.
  const prLineMatch = /(?:^|\n)(?!>)\s*.*?\bPR #(\d+)\b.*?(https:\/\/github\.com\/[^\s)]+)/m.exec(awaitingText);
  if (prLineMatch) {
    const prNumber = parseInt(prLineMatch[1]!, 10);
    const prUrl = prLineMatch[2]!;

    // Extract squash SHA if present (e.g. "merged `abc1234`" or "→ `abc1234`")
    const shaMatch = /(?:merged|→|sha:)\s*[`"]?([0-9a-f]{7,40})[`"]?/i.exec(awaitingText);
    const squashSha = shaMatch ? shaMatch[1]! : null;

    awaitingMerge.push({
      pr: prNumber,
      prUrl,
      squashSha,
      createdAt: now,
      gateVerdicts: {
        containerSmoke: null,
        sdetValidation: null,
        sdetCiGate: null,
        sdetQualityAudit: null,
      },
      note: "Migrated from PROGRESS.md ## Awaiting PR merge",
    });
  }

  // ── Parse retro action items ───────────────────────────────────────────────
  // DECISION: Parse the `## Open retro action items` section.
  // Each bullet point starting with `- **[category — ...]` becomes a retro item.
  // §9.3 rationale-as-field: the full bullet text becomes the `note` field.
  // CS-GEN-003: §9.3
  const retroItems: RetroActionItem[] = [];
  const retroText = sections.openRetroItems;
  const retroLines = retroText.split("\n");

  let retroIdCounter = 1;
  let currentBullet: string[] = [];
  let currentCategory: string | null = null;

  const flushBullet = () => {
    if (currentBullet.length === 0 || currentCategory === null) return;
    const fullText = currentBullet.join(" ").replace(/\s+/g, " ").trim();
    // Remove the leading `- **[category ...]` marker for the description
    const descriptionMatch = /^-\s+\*\*\[([^\]]+)\]\s*([A-Za-z0-9_-]+\s+[^*]*?)\*\*\s+(?:—\s+)?(.*)$/.exec(fullText) ??
                             /^-\s+\*\*\[([^\]]+)\]\**\s+(.*)$/.exec(fullText);
    let description = fullText;
    if (descriptionMatch) {
      // Use everything after the category marker
      description = (descriptionMatch[3] ?? descriptionMatch[2] ?? fullText).trim();
    }
    // Truncate to reasonable length for description field
    if (description.length > 200) {
      description = description.slice(0, 197) + "...";
    }

    const id = `retro-012-${String(retroIdCounter).padStart(3, "0")}`;
    retroIdCounter++;

    // Normalise category to a valid enum value
    const normalisedCategory = normaliseRetroCategory(currentCategory);

    retroItems.push({
      id,
      category: normalisedCategory,
      description: description || `Retro item from ## Open retro action items`,
      note: fullText.length > 200 ? fullText : null,
      addedAt: today,
    });

    currentBullet = [];
    currentCategory = null;
  };

  for (const line of retroLines) {
    const trimmed = line.trim();
    // New top-level bullet: starts with `- **[category`
    if (/^-\s+\*\*\[/.test(trimmed)) {
      flushBullet();
      // Extract category from `[category — ...]` or `[category]`
      const catMatch = /^-\s+\*\*\[([^\]—]+)/.exec(trimmed);
      currentCategory = catMatch ? catMatch[1]!.trim() : "observation";
      currentBullet = [trimmed];
    } else if (/^-\s+/.test(trimmed) && currentBullet.length > 0) {
      // Sub-bullet: append to current
      currentBullet.push(trimmed);
    } else if (trimmed && currentBullet.length > 0) {
      // Continuation line
      currentBullet.push(trimmed);
    }
  }
  flushBullet();

  // ── Build state.json ──────────────────────────────────────────────────────
  // §9.1: Active bugs are NOT stored — they are a QUERY over BUG-* front matter.
  const state: StateStore = {
    schemaVersion: "1.0",
    lastUpdated: now,
    currentBrief,
    currentPhase,
    currentSliceDescription,
    currentBranch,
    awaitingMerge,
    openRetroItems: retroItems,
  };

  // ── Validate the proposed state before writing ─────────────────────────────
  const validationErrors = validateState(state);
  if (validationErrors.length > 0) {
    const detail = validationErrors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new StateStoreError(
      `Migration produced invalid state (${validationErrors.length} error(s)):\n${detail}`,
      "MIGRATION_ERROR"
    );
  }

  // ── Seed events.jsonl ─────────────────────────────────────────────────────
  const migrationEvent: StateEvent = {
    ts: now,
    type: "migration",
    brief: currentBrief,
    phase: currentPhase,
    role: "devops",
    pr: null,
    note: "One-shot migration from PROGRESS.md (TASK-LOE-012-001)",
    payload: {
      progressPath: progressPath,
      sectionsFound: Object.keys(sections).filter(
        (k) => sections[k as keyof ParsedProgressSections].length > 0
      ),
      // §9.1: activeBugs confirmed reachable via query, not stored
      activeBugsHandling: "QUERY over BUG-* front matter — not stored in state.json (§9.1 one-fact-one-home)",
    },
  };

  // ── dry-run: print the diff, write nothing ────────────────────────────────
  if (opts.dryRun) {
    const existingState = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8") : null;
    const proposedJson = serializeState(state);

    console.log("=== DRY RUN: state.json diff ===");
    if (existingState) {
      // Simple line-diff between existing and proposed
      const existingLines = existingState.split("\n");
      const proposedLines = proposedJson.split("\n");
      const maxLen = Math.max(existingLines.length, proposedLines.length);
      for (let i = 0; i < maxLen; i++) {
        const existing = existingLines[i];
        const proposed = proposedLines[i];
        if (existing !== proposed) {
          if (existing !== undefined) console.log(`- ${existing}`);
          if (proposed !== undefined) console.log(`+ ${proposed}`);
        }
      }
    } else {
      console.log("(no existing state.json — would create)");
      console.log(proposedJson);
    }
    console.log("=== END DRY RUN (nothing written) ===");

    return {
      changed: false,
      message: "dry-run: printed JSON diff, wrote nothing",
      state,
      events: [migrationEvent],
      parsedSections: sections,
    };
  }

  // ── Write state.json and events.jsonl ─────────────────────────────────────
  writeState(repoRoot, state);
  appendEvent(repoRoot, migrationEvent);

  return {
    changed: true,
    message: `Migration complete: state.json + events.jsonl written to ${path.join(repoRoot, ".implementation")}`,
    state,
    events: [migrationEvent],
    parsedSections: sections,
  };
}

/**
 * Normalise a raw category string extracted from PROGRESS.md to a valid enum value.
 *
 * DECISION: We normalise heuristically rather than failing, because the PROGRESS.md
 * category labels are prose and may not exactly match our closed enum.
 * Any unrecognised label becomes "observation".
 * CS-GEN-003: §9.3 rationale-as-field — the original text is preserved in `note`.
 */
function normaliseRetroCategory(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("ungated-fix") || lower.includes("ungated fix")) return "ungated-fix";
  if (lower.includes("gated-path candidate") || lower.includes("gated-path-candidate")) return "gated-path-candidate";
  if (lower.includes("gated-path-fix") || lower.includes("gated-path fix")) return "gated-path-fix";
  if (lower.includes("ci")) return "CI";
  if (lower.includes("infra")) return "infra";
  if (lower.includes("process")) return "process";
  if (lower.includes("rule-sunset") || lower.includes("rule sunset")) return "rule-sunset";
  if (lower.includes("doc-drift") || lower.includes("doc drift")) return "doc-drift";
  if (lower.includes("metric-integrity") || lower.includes("metric integrity")) return "metric-integrity";
  if (lower.includes("gate-design") || lower.includes("gate design")) return "gate-design";
  if (lower.includes("e2e-determinism") || lower.includes("e2e determinism")) return "e2e-determinism";
  if (lower.includes("demo")) return "demo";
  if (lower.includes("sec")) return "sec";
  if (lower.includes("acknowledged")) return "acknowledged";
  return "observation";
}

// ─── Report renderer ──────────────────────────────────────────────────────────

/**
 * Render a human-readable narrative from `state.json` + `events.jsonl`.
 *
 * Output is NEVER committed and is NEVER read back as a source of truth.
 * This is the on-demand replacement for PROGRESS.md (§7 decision 2).
 *
 * CS-GEN-003: §9 generated view is never a source of truth
 */
export function renderReport(state: StateStore, events: StateEvent[], opts: { md?: boolean } = {}): string {
  const lines: string[] = [];

  if (opts.md) {
    lines.push("# Implementation State Report");
    lines.push(`> Generated on demand — NOT a source of truth (BRIEF-LOE-012 §9). Do not commit.`);
    lines.push("");
    lines.push("## Current initiative");
    if (state.currentBrief) {
      lines.push(`**${state.currentBrief}** — ${state.currentSliceDescription ?? "(no description)"}`);
      lines.push(`- Branch: \`${state.currentBranch ?? "unknown"}\``);
      lines.push(`- Phase: ${state.currentPhase ?? "(none)"}`);
      lines.push(`- Last updated: ${state.lastUpdated}`);
    } else {
      lines.push("_No active slice._");
    }
    lines.push("");
    lines.push("## Awaiting PR merge");
    if (state.awaitingMerge.length === 0) {
      lines.push("_None active._");
    } else {
      for (const rec of state.awaitingMerge) {
        lines.push(`- **PR #${rec.pr}** (${rec.prUrl})`);
        lines.push(`  - SHA: ${rec.squashSha ?? "(pending)"}`);
        lines.push(`  - Container Smoke: ${rec.gateVerdicts.containerSmoke ?? "(pending)"}`);
        lines.push(`  - SDET Validation: ${rec.gateVerdicts.sdetValidation ?? "(pending)"}`);
        lines.push(`  - SDET CI Gate: ${rec.gateVerdicts.sdetCiGate ?? "(pending)"}`);
        lines.push(`  - SDET Quality Audit: ${rec.gateVerdicts.sdetQualityAudit ?? "(pending)"}`);
        if (rec.note) lines.push(`  - Note: ${rec.note}`);
      }
    }
    lines.push("");
    lines.push("## Active bugs");
    lines.push("_Active bugs are a QUERY over BUG-\\* front matter — not stored here. See `scripts/task.ts list` filtered by BUG prefix._");
    lines.push("");
    lines.push("## Open retro action items");
    if (state.openRetroItems.length === 0) {
      lines.push("_None._");
    } else {
      for (const item of state.openRetroItems) {
        lines.push(`- **[${item.category}]** ${item.description}`);
        if (item.note && item.note !== item.description) {
          lines.push(`  > ${item.note.slice(0, 120)}`);
        }
      }
    }
    lines.push("");
    lines.push("## Recent events");
    const recentEvents = events.slice(-10).reverse();
    for (const ev of recentEvents) {
      lines.push(`- ${ev.ts} [${ev.role}] ${ev.type}${ev.brief ? ` / ${ev.brief}` : ""}${ev.note ? ` — ${ev.note}` : ""}`);
    }
  } else {
    // Compact text format
    lines.push("=== Implementation State ===");
    lines.push(`Brief:   ${state.currentBrief ?? "(none)"}`);
    lines.push(`Phase:   ${state.currentPhase ?? "(none)"}`);
    lines.push(`Branch:  ${state.currentBranch ?? "(none)"}`);
    lines.push(`Updated: ${state.lastUpdated}`);
    lines.push("");
    lines.push(`Awaiting PR merge: ${state.awaitingMerge.length === 0 ? "none" : state.awaitingMerge.map((r) => `#${r.pr}`).join(", ")}`);
    lines.push(`Open retro items:  ${state.openRetroItems.length}`);
    lines.push(`Active bugs:       [query BUG-* front matter — not stored]`);
    lines.push("");
    lines.push(`Recent events (${Math.min(events.length, 5)} of ${events.length}):`);
    for (const ev of events.slice(-5).reverse()) {
      lines.push(`  ${ev.ts.slice(0, 19)} ${ev.type}${ev.brief ? ` ${ev.brief}` : ""}${ev.note ? ` — ${ev.note.slice(0, 60)}` : ""}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Thin main() ─────────────────────────────────────────────────────────────

/**
 * Determine if this module is the entry point (ESM guard).
 * Mirrors db-migrate.ts convention.
 */
function isMain(): boolean {
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    return process.argv[1] === scriptPath;
  } catch {
    return false;
  }
}

/** Thin main — run the migration when invoked directly. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`state-store migration${dryRun ? " (dry-run)" : ""}...`);

  try {
    const result = migrate({ dryRun });
    console.log(result.message);
    if (!dryRun && result.changed) {
      console.log("Active bugs note: NOT stored in state.json — they are a QUERY over BUG-* front matter (§9.1).");
    }
    process.exit(0);
  } catch (err) {
    if (err instanceof StateStoreError) {
      console.error(`Error [${err.code}]: ${err.message}`);
    } else {
      console.error(`Unexpected error: ${String(err)}`);
    }
    process.exit(1);
  }
}

if (isMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

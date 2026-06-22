#!/usr/bin/env tsx
/**
 * scripts/task.ts — Task lifecycle write CLI
 *
 * Phase 1 of the scripted-bookkeeping initiative
 * (PROPOSAL-scripted-bookkeeping.md §3.1 / §5 Phase 1 / §6 judgment line).
 *
 * Provides 7 write subcommands:
 *   start <ID>   --role <r> --complexity-estimate N [--note "..."]
 *   review <ID>  --role <r> --complexity-actual N   [--note "..."]
 *   done <ID>    --role <r>                         [--note "..."]
 *   reject <ID>  --role <r> --bug <BUG-ID>          [--note "..."]
 *   log <ID>     --role <r> --did "..." --next "..." [--blockers "..."]
 *   archive      [--brief NNN | --all-done]
 *   verify       [--brief NNN]
 *
 * Design constraints (PROPOSAL-scripted-bookkeeping.md §2):
 *   - Agents decide; scripts record. The CLI owns format/timestamps/ordering/
 *     atomicity/idempotency. It NEVER computes a judgment.
 *   - All front-matter read/write goes through ./task-frontmatter exports.
 *     No re-implemented YAML parsing. (CS-GEN-003)
 *   - Zero new runtime npm dependencies — Node built-ins + ./task-frontmatter only.
 *     (CS-INFRA-004)
 *   - Mirror db-migrate.ts conventions: exported pure functions, thin main(),
 *     isMain ESM guard.
 *   - Atomic writes: write to temp file, fs.renameSync over target.
 *   - Idempotent: re-running a settled transition is a clean no-op, exit 0.
 *   - Metrics self-report: each write appends a record to .claude/metrics/tasks.jsonl
 *     in the same shape log-task-edit.py emits (AC-LOE-011-05).
 *
 * Run via: pnpm task <cmd> [args]
 */

// CS-INFRA-004: Zero new runtime npm dependencies — Node built-ins only.
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";

// CS-GEN-003: Cite the governing module — this is the Point of the task
// (BRIEF-LOE-011 / TASK-LOE-011-001 context). All FM read/write goes here.
import {
  extractFrontMatter,
  serializeFrontMatter,
  verifyFrontMatter,
  type FrontMatter,
} from "./task-frontmatter.js";

// CS-GEN-003: Import state-store helpers for the 5 heavier commands
// (BRIEF-LOE-012 / TASK-LOE-012-002).
import {
  readState,
  writeState,
  appendEvent,
  readEvents,
  VALID_PHASES,
  type StateStore,
  type StateEvent,
  type Phase,
  type AwaitingMergeRecord,
  type GateVerdictSlots,
  serializeState,
  renderReport,
} from "./state-store.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Valid agent roles (PROPOSAL-scripted-bookkeeping.md §10 Q3, AC-LOE-011-04) */
export const VALID_ROLES = [
  "webapp-developer",
  "devops",
  "sdet",
  "overwatch",
  "io",
] as const;

export type Role = (typeof VALID_ROLES)[number];

export interface WriteResult {
  changed: boolean;
  message: string;
  filePath: string;
  taskId: string;
}

export interface ParsedArgs {
  subcommand: string;
  taskId?: string;
  role?: string;
  complexityEstimate?: number;
  complexityActual?: number;
  note?: string;
  bugId?: string;
  did?: string;
  next?: string;
  blockers?: string;
  brief?: string;
  allDone?: boolean;
  // Read/query subcommand flags (PROPOSAL-scripted-bookkeeping.md §8.2 / AC-LOE-011-06)
  fields?: string[];    // --fields f1,f2,… (for show)
  statuses?: string[];  // --status s1,s2,… (for list, multi-value)
  json?: boolean;       // --json opt-in output (AC-LOE-011-06 §10 Q5)
  // State-store command flags (BRIEF-LOE-012 / TASK-LOE-012-002)
  dryRun?: boolean;     // --dry-run: print JSON diff, write nothing (AC-LOE-012-02..05)
  to?: string;          // --to <phase>: for phase-transition
  pr?: number;          // --pr N: for merge-checkpoint / post-merge
  // Gate verdicts for merge-checkpoint (agent-supplied; CLI records verbatim)
  containerSmoke?: string;    // --container-smoke "..."
  sdetValidation?: string;    // --sdet-validation "..."
  sdetCiGate?: string;        // --sdet-ci-gate "..."
  sdetQualityAudit?: string;  // --sdet-quality-audit "..."
  bug?: string;               // --bug "<desc>" for post-merge fail branch
  md?: boolean;               // --md for report (markdown output)
}

// ─── Repo root detection ──────────────────────────────────────────────────────

/**
 * Determine the repo root by locating the package.json relative to this script.
 * DECISION: Use __dirname-equivalent (fileURLToPath + dirname) rather than
 * process.cwd() so the CLI works from any working directory.
 */
export function findRepoRoot(): string {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  // scripts/ is one level below the repo root
  return path.resolve(scriptDir, "..");
}

// ─── Path-confinement helper ──────────────────────────────────────────────────

/**
 * Returns true iff `candidate` is equal to `root` or is a descendant of `root`.
 *
 * DECISION (minor-2 review fix): factor the two-arm predicate so all path-
 * confinement sites use the same expression and can't drift.
 * CS-GEN-003: mirrors log-task-edit.py's allowed_root check pattern
 */
export function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

// ─── File resolution: ID → path ──────────────────────────────────────────────

/**
 * Resolve a task ID (e.g. "TASK-LOE-011-001") to its file path.
 * Searches .implementation/tasks/ then .implementation/tasks/done/.
 * Confined to the repo task tree (no traversal outside).
 *
 * DECISION: ID matching uses prefix match on filename (case-insensitive)
 * to allow "TASK-TST-001" to find "TASK-TST-001-some-description.md".
 * (PROPOSAL-scripted-bookkeeping.md §3 / implementation notes)
 */
export function resolveTaskFile(
  taskId: string,
  repoRoot: string,
  opts: { searchDone?: boolean } = {}
): string | null {
  const tasksDir = path.join(repoRoot, ".implementation", "tasks");
  const doneDir = path.join(tasksDir, "done");

  // CS-GEN-003: Path-confinement mirrors log-task-edit.py's allowed_root check
  const allowedRoot = path.resolve(tasksDir);

  function searchDir(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir);
    const normalId = taskId.toUpperCase();
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const upperEntry = entry.toUpperCase();
      if (upperEntry === `${normalId}.MD` || upperEntry.startsWith(`${normalId}-`)) {
        const fullPath = path.join(dir, entry);
        // Confine to allowedRoot (no traversal outside)
        const resolved = path.resolve(fullPath);
        if (isWithin(allowedRoot, resolved)) {
          return fullPath;
        }
      }
    }
    return null;
  }

  const found = searchDir(tasksDir) ?? (opts.searchDone ? searchDir(doneDir) : null);
  return found;
}

// ─── Role validation ──────────────────────────────────────────────────────────

/**
 * Validate a role string against the roster.
 * AC-LOE-011-04: --role required + roster-validated; unknown → error.
 */
export function validateRole(role: string | undefined): role is Role {
  if (!role) return false;
  return (VALID_ROLES as readonly string[]).includes(role);
}

// ─── Date utilities ───────────────────────────────────────────────────────────

/**
 * Return the current UTC ISO 8601 timestamp.
 * DECISION: Always use new Date().toISOString() — never a sentinel value.
 * (AC-LOE-011-02 / PROPOSAL-scripted-bookkeeping.md §3.1)
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Format a Date as YYYY-MM-DD for Work Log prefixes.
 */
export function datePart(isoString: string): string {
  return isoString.slice(0, 10);
}

// ─── Atomic write helpers ─────────────────────────────────────────────────────

/**
 * Atomically write content to targetPath via a temp file + rename.
 * DECISION: Write to a sibling temp file (same directory for same-filesystem
 * guarantee) then fs.renameSync. Never partial-write the original.
 * (AC-LOE-011-01 / PROPOSAL-scripted-bookkeeping.md §5 Phase 1)
 */
export function atomicWriteFile(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  // Randomize suffix to avoid collision under concurrent runs or reused pids.
  // "wx" flag: exclusive open — fails if file already exists (incl. a symlink
  // target), preventing symlink-redirect writes. (security: minor finding)
  const rand = crypto.randomBytes(6).toString("hex");
  const tmpPath = path.join(dir, `.tmp-${base}-${rand}`);
  try {
    fs.writeFileSync(tmpPath, content, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    // Clean up temp file if rename fails
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

// ─── Metrics self-report ──────────────────────────────────────────────────────

/**
 * Append a metrics record to .claude/metrics/tasks.jsonl after a CLI write.
 *
 * Record shape matches log-task-edit.py exactly (snake_case keys, same 9 fields):
 *   { ts, task_id, file_path, status, complexity_estimate, complexity_actual,
 *     started_at, completed_at, assigned_to }
 *
 * DECISION: Read values from the post-write file (same as the hook which reads
 * the file after the Edit/Write tool finishes). This ensures the record reflects
 * the committed state. One record per CLI write, no double-count.
 * (AC-LOE-011-05 / PROPOSAL-scripted-bookkeeping.md §4)
 *
 * @param filePath     Absolute path to the mutated task file
 * @param taskId       Task ID derived from the filename
 * @param metricsPath  Path to the metrics JSONL file (injectable for testing)
 */
export function appendMetricsRecord(
  filePath: string,
  taskId: string,
  metricsPath?: string
): void {
  // Read the post-write file to extract current field values (mirrors hook behavior)
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8").slice(0, 4096);
  } catch {
    // If we can't read the file, skip metrics (non-fatal)
    return;
  }

  const extracted = extractFrontMatter(text);
  const fm: FrontMatter = extracted.found ? extracted.fm : {};

  // Build the record in the same shape as log-task-edit.py
  const record = {
    ts: nowIso(),
    task_id: taskId,
    file_path: filePath,
    status: (fm["status"] as string | undefined) ?? null,
    complexity_estimate: (fm["complexity_estimate"] as string | undefined) ?? null,
    complexity_actual: (fm["complexity_actual"] as string | undefined) ?? null,
    started_at: (fm["started_at"] as string | undefined) ?? null,
    completed_at: (fm["completed_at"] as string | undefined) ?? null,
    assigned_to: (fm["assigned_to"] as string | undefined) ?? null,
  };

  // Determine metrics file path
  const repoRoot = findRepoRoot();
  const defaultMetricsPath = path.join(repoRoot, ".claude", "metrics", "tasks.jsonl");
  const targetPath = metricsPath ?? defaultMetricsPath;

  try {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.appendFileSync(targetPath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Metrics write failure is non-fatal (like the hook's try/catch)
  }
}

// ─── Work Log breadcrumb ──────────────────────────────────────────────────────

/**
 * Format a Work Log breadcrumb entry in the canonical shape.
 * validate-gates.sh check 5 greps for "Starting implementation" in this output.
 *
 * Shape: YYYY-MM-DD [role] <did> | What's next: <next> | Blockers: <blockers>
 */
export function formatBreadcrumb(
  role: string,
  did: string,
  next: string,
  blockers: string = "none"
): string {
  const today = datePart(nowIso());
  return `- ${today} [${role}] ${did} | What's next: ${next} | Blockers: ${blockers}`;
}

/**
 * Append a breadcrumb to the Work Log section of file content.
 * DECISION: Appends immediately after the "## Work Log" header line.
 * If no Work Log section exists, appends to end of file.
 */
export function appendToWorkLog(content: string, breadcrumb: string): string {
  // Find the Work Log section
  const lines = content.split("\n");
  const workLogIdx = lines.findIndex((l) => l.trim() === "## Work Log");

  if (workLogIdx === -1) {
    // No Work Log section — append to end
    return content + "\n" + breadcrumb + "\n";
  }

  // Insert after the Work Log header line (and skip any blank comment lines)
  // Find the insertion point: after any comment line immediately following the header.
  // DECISION: parenthesize so the bounds check governs BOTH the blank-line branch and
  // the closed-comment branch, making the bound explicit and robust. (correctness: minor)
  let insertIdx = workLogIdx + 1;
  // Skip blank lines and closed <!-- ... --> comment lines
  while (
    insertIdx < lines.length &&
    (lines[insertIdx]!.trim() === "" ||
      (lines[insertIdx]!.trim().startsWith("<!--") && lines[insertIdx]!.includes("-->")))
  ) {
    insertIdx++;
  }

  // Insert the breadcrumb at insertIdx
  const result = [
    ...lines.slice(0, insertIdx),
    breadcrumb,
    ...lines.slice(insertIdx),
  ];
  return result.join("\n");
}

// ─── Idempotency helpers ──────────────────────────────────────────────────────

/**
 * Check if a Work Log breadcrumb with the given substring already exists
 * (to detect duplicate entries and be idempotent).
 */
function workLogHasEntry(content: string, marker: string): boolean {
  return content.includes(marker);
}

/**
 * Check if a field value is "empty" (empty string, dash sentinel, or em-dash).
 */
export function isEmptyField(value: string | string[] | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return false;
  return value === "" || value === "-" || value === "—";
}

// ─── Parse complexity number ───────────────────────────────────────────────────

/**
 * Parse complexity_actual / complexity_estimate from a front-matter value.
 * Returns the number if valid (1..5), or null if empty/dash, or NaN if invalid.
 */
export function parseComplexity(value: string | string[] | undefined): number | null {
  if (isEmptyField(value)) return null;
  if (Array.isArray(value)) return NaN;
  const s = String(value).trim();
  // NOTE: the ""/"-"/"—" cases are already excluded by isEmptyField above;
  // no redundant re-check here. (nit: dead branch removed)
  const n = parseInt(s, 10);
  if (isNaN(n)) return NaN;
  return n;
}

// ─── Read + parse task file ───────────────────────────────────────────────────

export interface TaskFile {
  raw: string;
  fm: FrontMatter;
  bodyAfterFm: string;
  filePath: string;
}

/**
 * Read and parse a task file from disk.
 * Exits with non-zero + message if file not found or has no front matter.
 */
export function readTaskFile(filePath: string): TaskFile {
  if (!fs.existsSync(filePath)) {
    throw new TaskCliError(`File not found: ${filePath}`, 1);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const extracted = extractFrontMatter(raw);
  if (!extracted.found) {
    throw new TaskCliError(`No YAML front matter found in: ${filePath}`, 1);
  }
  return { raw, fm: extracted.fm, bodyAfterFm: extracted.bodyAfterFm, filePath };
}

/** CLI error with an exit code */
export class TaskCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = "TaskCliError";
  }
}

// ─── Subcommand: start ────────────────────────────────────────────────────────

/**
 * `start <ID> --role <r> --complexity-estimate N [--note "..."]`
 *
 * Transition: backlog/in-progress → in-progress (idempotent double-start = no-op)
 * Stamps: real UTC started_at, sets complexity_estimate, updated_by.
 * Appends: canonical "Starting implementation" breadcrumb.
 *
 * AC-LOE-011-01, AC-LOE-011-02, AC-LOE-011-03
 */
export function cmdStart(
  opts: {
    taskId: string;
    role: Role;
    complexityEstimate: number;
    note?: string;
    repoRoot?: string;
    metricsPath?: string;
    nowFn?: () => string;
  }
): WriteResult {
  // AC-LOE-011-04: --role required + roster-validated at runtime (not just TypeScript types)
  if (!validateRole(opts.role)) {
    throw new TaskCliError(
      `Unknown role "${opts.role}". Valid roles: ${VALID_ROLES.join(", ")}`,
      1
    );
  }

  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const filePath = resolveTaskFile(opts.taskId, repoRoot);
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);
  const status = task.fm["status"] as string | undefined;

  // Transition legality: only backlog or in-progress allowed
  if (status !== "backlog" && status !== "in-progress") {
    throw new TaskCliError(
      `Cannot start: task ${opts.taskId} has status "${status}" (expected backlog or in-progress)`,
      1
    );
  }

  // IDEMPOTENCY: if already in-progress, check if it has a "Starting implementation"
  // breadcrumb already — if so, this is a clean no-op.
  if (status === "in-progress") {
    if (workLogHasEntry(task.raw, "Starting implementation")) {
      return {
        changed: false,
        message: `Task ${opts.taskId} is already in-progress with a Starting implementation breadcrumb — no-op`,
        filePath,
        taskId: opts.taskId,
      };
    }
    // in-progress but no breadcrumb yet — fall through to add the breadcrumb
  }

  const nowTs = opts.nowFn ? opts.nowFn() : nowIso();

  // Build mutated front matter
  const newFm: FrontMatter = { ...task.fm };
  newFm["status"] = "in-progress";
  newFm["updated_by"] = opts.role;
  newFm["started_at"] = nowTs;
  newFm["complexity_estimate"] = String(opts.complexityEstimate);

  // Build canonical "Starting implementation" breadcrumb
  // validate-gates.sh check 5 greps for "Starting implementation" substring
  const noteText = opts.note ?? `task ${opts.taskId}`;
  const did = `Starting implementation — ${noteText}`;
  const next = "implement and run gates";
  const breadcrumb = formatBreadcrumb(opts.role, did, next);

  // Reconstruct file content
  const newFmBlock = serializeFrontMatter(newFm);
  let newContent = newFmBlock + task.bodyAfterFm;
  newContent = appendToWorkLog(newContent, breadcrumb);

  // Atomic write
  atomicWriteFile(filePath, newContent);

  // Metrics self-report (after atomic rename)
  const taskIdForMetrics = deriveTaskId(filePath);
  appendMetricsRecord(filePath, taskIdForMetrics, opts.metricsPath);

  return {
    changed: true,
    message: `Task ${opts.taskId} started (in-progress, started_at=${nowTs})`,
    filePath,
    taskId: opts.taskId,
  };
}

// ─── Subcommand: review ───────────────────────────────────────────────────────

/**
 * `review <ID> --role <r> --complexity-actual N [--note "..."]`
 *
 * Transition: in-progress → review
 * Sets: complexity_actual, updated_by.
 *
 * AC-LOE-011-01, AC-LOE-011-02, AC-LOE-011-03
 */
export function cmdReview(
  opts: {
    taskId: string;
    role: Role;
    complexityActual: number;
    note?: string;
    repoRoot?: string;
    metricsPath?: string;
    // NOTE: no nowFn — cmdReview stamps no timestamp; injectable clock seam
    // belongs only on cmdStart/cmdDone which do. (over-engineering: minor)
  }
): WriteResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const filePath = resolveTaskFile(opts.taskId, repoRoot);
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);
  const status = task.fm["status"] as string | undefined;

  // IDEMPOTENCY: already review with same complexity_actual → no-op
  if (status === "review") {
    const existingActual = task.fm["complexity_actual"] as string | undefined;
    if (existingActual === String(opts.complexityActual)) {
      return {
        changed: false,
        message: `Task ${opts.taskId} is already in review with complexity_actual=${opts.complexityActual} — no-op`,
        filePath,
        taskId: opts.taskId,
      };
    }
  }

  // Transition legality
  if (status !== "in-progress") {
    throw new TaskCliError(
      `Cannot move to review: task ${opts.taskId} has status "${status}" (expected in-progress)`,
      1
    );
  }

  // Build mutated front matter
  const newFm: FrontMatter = { ...task.fm };
  newFm["status"] = "review";
  newFm["updated_by"] = opts.role;
  newFm["complexity_actual"] = String(opts.complexityActual);

  const noteText = opts.note ?? `gates passed`;
  const did = `Marking as review — ${noteText}`;
  const next = "SDET review";
  const breadcrumb = formatBreadcrumb(opts.role, did, next);

  const newFmBlock = serializeFrontMatter(newFm);
  let newContent = newFmBlock + task.bodyAfterFm;
  newContent = appendToWorkLog(newContent, breadcrumb);

  atomicWriteFile(filePath, newContent);

  const taskIdForMetrics = deriveTaskId(filePath);
  appendMetricsRecord(filePath, taskIdForMetrics, opts.metricsPath);

  return {
    changed: true,
    message: `Task ${opts.taskId} moved to review (complexity_actual=${opts.complexityActual})`,
    filePath,
    taskId: opts.taskId,
  };
}

// ─── Subcommand: done ─────────────────────────────────────────────────────────

/**
 * `done <ID> --role <r> [--note "..."]`
 *
 * Transition: review → done
 * Requires: complexity_actual ∈ 1..5 already set on disk (NEVER invents it).
 * Stamps: real UTC completed_at (>= started_at).
 *
 * THE JUDGMENT LINE (AC-LOE-011-07, PROPOSAL-scripted-bookkeeping.md §6):
 * done NEVER invents complexity_actual. If it is missing or out of range, exit
 * non-zero. The SDET supplies this field (when using --role sdet).
 *
 * AC-LOE-011-01, AC-LOE-011-02, AC-LOE-011-03, AC-LOE-011-07
 */
export function cmdDone(
  opts: {
    taskId: string;
    role: Role;
    note?: string;
    repoRoot?: string;
    metricsPath?: string;
    nowFn?: () => string;
  }
): WriteResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const filePath = resolveTaskFile(opts.taskId, repoRoot);
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);
  const status = task.fm["status"] as string | undefined;

  // IDEMPOTENCY: already done → no-op
  if (status === "done") {
    return {
      changed: false,
      message: `Task ${opts.taskId} is already done — no-op`,
      filePath,
      taskId: opts.taskId,
    };
  }

  // Transition legality
  if (status !== "review") {
    throw new TaskCliError(
      `Cannot mark done: task ${opts.taskId} has status "${status}" (expected review)`,
      1
    );
  }

  // THE JUDGMENT LINE: verify complexity_actual is set and in range (never invent it)
  const actualRaw = task.fm["complexity_actual"] as string | undefined;
  const actualN = parseComplexity(actualRaw);

  if (actualN === null) {
    throw new TaskCliError(
      `Cannot mark done: task ${opts.taskId} has no complexity_actual set. ` +
      `The SDET must supply this value (ENGINE.md § Task Metadata Contract). ` +
      `Use: pnpm task review ${opts.taskId} --role <r> --complexity-actual N`,
      1
    );
  }
  if (isNaN(actualN) || actualN < 1 || actualN > 5) {
    throw new TaskCliError(
      `Cannot mark done: task ${opts.taskId} has complexity_actual="${actualRaw}" which is not in range 1..5.`,
      1
    );
  }

  const nowTs = opts.nowFn ? opts.nowFn() : nowIso();

  // Enforce completed_at >= started_at (correctness: minor finding).
  // The docstring asserts this invariant; enforce it here rather than relying
  // on the monotonic wall clock being correct in all execution environments.
  const startedAtRaw = task.fm["started_at"] as string | undefined;
  if (startedAtRaw && !isEmptyField(startedAtRaw)) {
    const startedMs = new Date(startedAtRaw).getTime();
    const completedMs = new Date(nowTs).getTime();
    if (!isNaN(startedMs) && completedMs < startedMs) {
      throw new TaskCliError(
        `Cannot mark done: completed_at (${nowTs}) is before started_at (${startedAtRaw}) — clock skew detected. ` +
        `Do not silently write an inverted timestamp (TASK-006-002 metric integrity).`,
        1
      );
    }
  }

  // Build mutated front matter
  const newFm: FrontMatter = { ...task.fm };
  newFm["status"] = "done";
  newFm["updated_by"] = opts.role;
  newFm["completed_at"] = nowTs;

  const noteText = opts.note ?? `approved`;
  const did = `Marking done — ${noteText}`;
  const next = "archive";
  const breadcrumb = formatBreadcrumb(opts.role, did, next);

  const newFmBlock = serializeFrontMatter(newFm);
  let newContent = newFmBlock + task.bodyAfterFm;
  newContent = appendToWorkLog(newContent, breadcrumb);

  atomicWriteFile(filePath, newContent);

  const taskIdForMetrics = deriveTaskId(filePath);
  appendMetricsRecord(filePath, taskIdForMetrics, opts.metricsPath);

  return {
    changed: true,
    message: `Task ${opts.taskId} marked done (completed_at=${nowTs})`,
    filePath,
    taskId: opts.taskId,
  };
}

// ─── Subcommand: reject ───────────────────────────────────────────────────────

/**
 * `reject <ID> --role <r> --bug <BUG-ID> [--note "..."]`
 *
 * Transition: review → in-progress
 * Wires the bug reference into the Work Log.
 *
 * AC-LOE-011-01, AC-LOE-011-02, AC-LOE-011-03
 */
export function cmdReject(
  opts: {
    taskId: string;
    role: Role;
    bugId: string;
    note?: string;
    repoRoot?: string;
    metricsPath?: string;
    // NOTE: no nowFn — cmdReject stamps no timestamp. (over-engineering: minor)
  }
): WriteResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const filePath = resolveTaskFile(opts.taskId, repoRoot);
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);
  const status = task.fm["status"] as string | undefined;

  // IDEMPOTENCY: already in-progress with this bug ref → no-op
  if (status === "in-progress") {
    if (workLogHasEntry(task.raw, opts.bugId)) {
      return {
        changed: false,
        message: `Task ${opts.taskId} already in-progress with bug reference ${opts.bugId} — no-op`,
        filePath,
        taskId: opts.taskId,
      };
    }
  }

  // Transition legality: must be in review
  if (status !== "review") {
    throw new TaskCliError(
      `Cannot reject: task ${opts.taskId} has status "${status}" (expected review)`,
      1
    );
  }

  // Build mutated front matter — back to in-progress
  const newFm: FrontMatter = { ...task.fm };
  newFm["status"] = "in-progress";
  newFm["updated_by"] = opts.role;

  const noteText = opts.note ? ` — ${opts.note}` : "";
  const did = `Rejected (back to in-progress): ${opts.bugId}${noteText}`;
  const next = `fix issues from ${opts.bugId}`;
  const breadcrumb = formatBreadcrumb(opts.role, did, next);

  const newFmBlock = serializeFrontMatter(newFm);
  let newContent = newFmBlock + task.bodyAfterFm;
  newContent = appendToWorkLog(newContent, breadcrumb);

  atomicWriteFile(filePath, newContent);

  const taskIdForMetrics = deriveTaskId(filePath);
  appendMetricsRecord(filePath, taskIdForMetrics, opts.metricsPath);

  return {
    changed: true,
    message: `Task ${opts.taskId} rejected back to in-progress (bug: ${opts.bugId})`,
    filePath,
    taskId: opts.taskId,
  };
}

// ─── Subcommand: log ──────────────────────────────────────────────────────────

/**
 * `log <ID> --role <r> --did "..." --next "..." [--blockers "..."]`
 *
 * Appends a Work Log breadcrumb. No status change.
 *
 * AC-LOE-011-01, AC-LOE-011-02
 */
export function cmdLog(
  opts: {
    taskId: string;
    role: Role;
    did: string;
    next: string;
    blockers?: string;
    repoRoot?: string;
    metricsPath?: string;
    // NOTE: no nowFn — cmdLog stamps no timestamp. (over-engineering: minor)
  }
): WriteResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  // Search done/ too for log command (allows logging on done tasks)
  const filePath = resolveTaskFile(opts.taskId, repoRoot, { searchDone: true });
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);

  const breadcrumb = formatBreadcrumb(opts.role, opts.did, opts.next, opts.blockers ?? "none");

  // Build new content — no front matter change
  const newFmBlock = serializeFrontMatter(task.fm);
  let newContent = newFmBlock + task.bodyAfterFm;
  newContent = appendToWorkLog(newContent, breadcrumb);

  atomicWriteFile(filePath, newContent);

  const taskIdForMetrics = deriveTaskId(filePath);
  appendMetricsRecord(filePath, taskIdForMetrics, opts.metricsPath);

  return {
    changed: true,
    message: `Work Log entry appended to ${opts.taskId}`,
    filePath,
    taskId: opts.taskId,
  };
}

// ─── Subcommand: archive ──────────────────────────────────────────────────────

/**
 * `archive [--brief NNN | --all-done]`
 *
 * Moves only status: done task files from tasks/ to tasks/done/.
 * Does NOT move open tasks.
 * --brief NNN scopes to TASK-NNN-* and BUG-NNN-* files.
 *
 * DECISION: "NNN" in --brief can be the full prefix like "LOE-011" or a numeric
 * like "011". Matching is prefix-based on the filename after "TASK-" or "BUG-".
 *
 * AC-LOE-011-01, AC-LOE-011-03
 */
export function cmdArchive(
  opts: {
    brief?: string;
    // NOTE: allDone removed — cmdArchive never reads it; bare archive (no --brief)
    // already means "all done tasks". The CLI dispatcher uses !brief && !allDone as
    // its usage guard, but the function itself only cares about brief. (over-engineering: minor)
    repoRoot?: string;
  }
): { moved: string[]; skipped: string[]; errors: string[] } {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const tasksDir = path.join(repoRoot, ".implementation", "tasks");
  const doneDir = path.join(tasksDir, "done");

  if (!fs.existsSync(tasksDir)) {
    throw new TaskCliError(`Tasks directory not found: ${tasksDir}`, 1);
  }

  // Ensure done/ directory exists
  if (!fs.existsSync(doneDir)) {
    fs.mkdirSync(doneDir, { recursive: true });
  }

  const moved: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // List task files in tasks/ (not recursing into done/)
  const entries = fs.readdirSync(tasksDir);
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    // Only TASK- and BUG- files
    if (!/^(TASK-|BUG-)/i.test(entry)) continue;

    // --brief filter
    if (opts.brief) {
      // Match TASK-{brief}-* or BUG-{brief}-*
      const briefUpper = opts.brief.toUpperCase();
      const entryUpper = entry.toUpperCase();
      // e.g. brief="LOE-011" → match "TASK-LOE-011-*" or "BUG-LOE-011-*"
      if (
        !entryUpper.startsWith(`TASK-${briefUpper}-`) &&
        !entryUpper.startsWith(`BUG-${briefUpper}-`)
      ) {
        continue;
      }
    }

    const srcPath = path.join(tasksDir, entry);
    if (!fs.statSync(srcPath).isFile()) continue;

    // Check if status is done
    try {
      const raw = fs.readFileSync(srcPath, "utf8");
      const extracted = extractFrontMatter(raw);
      if (!extracted.found) {
        skipped.push(entry + " (no front matter)");
        continue;
      }
      const status = extracted.fm["status"] as string | undefined;
      if (status !== "done") {
        skipped.push(entry + ` (status=${status})`);
        continue;
      }

      // Move to done/
      const dstPath = path.join(doneDir, entry);
      fs.renameSync(srcPath, dstPath);
      moved.push(entry);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${entry}: ${errMsg}`);
    }
  }

  return { moved, skipped, errors };
}

// ─── Subcommand: verify ───────────────────────────────────────────────────────

/**
 * `verify [--brief NNN]`
 *
 * Thin wrapper over verifyFrontMatter from task-frontmatter.ts.
 * Scans .implementation/tasks/ (and tasks/done/) for task files,
 * optionally scoped to a brief.
 * Non-zero exit on any violation.
 *
 * DECISION: Delegates entirely to verifyFrontMatter from task-frontmatter.ts —
 * no schema logic reimplemented here. This is the Phase-0 module's first
 * production consumer. (BRIEF-LOE-011 / PR #74 over-engineering finding)
 *
 * AC-LOE-011-01: all front-matter I/O via task-frontmatter.ts module
 */
export function cmdVerify(
  opts: {
    brief?: string;
    repoRoot?: string;
  }
): { violations: Array<{ file: string; rule: string; message: string }>; fileCount: number } {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const tasksDir = path.join(repoRoot, ".implementation", "tasks");
  const doneDir = path.join(tasksDir, "done");

  const allViolations: Array<{ file: string; rule: string; message: string }> = [];
  let fileCount = 0;

  function verifyDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir).sort();
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (!/^(TASK-|BUG-)/i.test(entry)) continue;

      // --brief filter
      if (opts.brief) {
        const briefUpper = opts.brief.toUpperCase();
        const entryUpper = entry.toUpperCase();
        if (
          !entryUpper.startsWith(`TASK-${briefUpper}-`) &&
          !entryUpper.startsWith(`BUG-${briefUpper}-`)
        ) {
          continue;
        }
      }

      const filePath = path.join(dir, entry);
      if (!fs.statSync(filePath).isFile()) continue;

      fileCount++;
      const raw = fs.readFileSync(filePath, "utf8");
      const extracted = extractFrontMatter(raw);

      if (!extracted.found) {
        allViolations.push({
          file: filePath,
          rule: "front_matter.missing",
          message: `${filePath}: file has no YAML front-matter block`,
        });
        continue;
      }

      // Delegate to verifyFrontMatter — no schema logic reimplemented here
      const violations = verifyFrontMatter(extracted.fm, filePath);
      for (const v of violations) {
        allViolations.push({ file: filePath, rule: v.rule, message: v.message });
      }
    }
  }

  verifyDir(tasksDir);
  verifyDir(doneDir);

  return { violations: allViolations, fileCount };
}

// ─── Task ID derivation ───────────────────────────────────────────────────────

/**
 * Derive a task ID from a file path.
 * e.g. "/path/to/TASK-LOE-011-001-write-cli.md" → "TASK-LOE-011-001"
 * Mirrors log-task-edit.py's TASK_ID_RE logic.
 */
export function deriveTaskId(filePath: string): string {
  const base = path.basename(filePath, ".md");
  // Match TASK-NNN-NNN or BUG-NNN-NNN or TASK-LOE-NNN-NNN etc. (first segment only)
  const m = base.match(/^(TASK-[A-Z0-9]+-[A-Z0-9]+-[0-9]+|BUG-[A-Z0-9]+-[A-Z0-9]+-[0-9]+|TASK-[A-Z0-9]+-[0-9]+|BUG-[A-Z0-9]+-[0-9]+|RETRO-[0-9]+)/i);
  if (m && m[1]) return m[1].toUpperCase();
  return base.toUpperCase();
}

// ─── Read/query subcommands (AC-LOE-011-06) ──────────────────────────────────
//
// Design (PROPOSAL-scripted-bookkeeping.md §8.2 / §10 Q5):
//   - Strictly read-only: no fs.writeFile, no rename, no metrics self-report.
//     Deriving from on-disk front matter (and PROGRESS.md for `progress`) is the
//     whole job — one fact, one home (NORTH-STAR #3).  CS-GEN-003
//   - Default output: compact text/tables (token-cheap, human- and agent-readable).
//   - --json opt-in for programmatic callers.
//   - brief-context: defaults to paste-ready markdown bundle; --json available.
//   - CS-INFRA-004: zero new runtime npm dependencies — Node built-ins only.

// ─── Lifecycle field set (for `show` default and bounded projections) ─────────

/**
 * Default lifecycle fields returned by `show` when no --fields are specified.
 * DECISION: "lifecycle block" = status + timestamps + complexity (the four
 * ENGINE § Task Metadata Contract fields), plus brief + updated_by + assigned_to
 * for context. This matches what agents need for a bounded status check.
 * (PROPOSAL-scripted-bookkeeping.md §8.2)
 */
const LIFECYCLE_FIELDS = [
  "brief",
  "status",
  "assigned_to",
  "updated_by",
  "started_at",
  "completed_at",
  "complexity_estimate",
  "complexity_actual",
];

// ─── Show result ──────────────────────────────────────────────────────────────

export interface ShowResult {
  taskId: string;
  filePath: string;
  fields: Record<string, string | string[] | undefined>;
}

/**
 * `show <ID> [--fields status,complexity_actual,…]`
 *
 * Returns just the requested metadata fields (default: lifecycle block).
 * NEVER dumps the whole file. Read-only — no mutation.
 *
 * AC-LOE-011-06 / PROPOSAL-scripted-bookkeeping.md §8.2
 */
export function cmdShow(
  opts: {
    taskId: string;
    fields?: string[];
    repoRoot?: string;
  }
): ShowResult {
  // CS-GEN-003: path confinement mirrors resolveTaskFile (no traversal outside task tree)
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const filePath = resolveTaskFile(opts.taskId, repoRoot, { searchDone: true });
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);

  // Determine which fields to return
  const requestedFields = (opts.fields && opts.fields.length > 0)
    ? opts.fields
    : LIFECYCLE_FIELDS;

  // Extract only the requested fields from front matter (bounded projection)
  const result: Record<string, string | string[] | undefined> = {};
  for (const field of requestedFields) {
    // Accept both snake_case and hyphenated forms (e.g. complexity-actual → complexity_actual)
    const normalized = field.replace(/-/g, "_");
    result[normalized] = task.fm[normalized];
  }

  return {
    taskId: opts.taskId,
    filePath,
    fields: result,
  };
}

// ─── List result ──────────────────────────────────────────────────────────────

export interface ListEntry {
  taskId: string;
  filePath: string;
  status: string | undefined;
  scope: string | undefined; // first line of body (short scope description)
}

export interface ListResult {
  brief: string;
  entries: ListEntry[];
  filtered: boolean;
}

/**
 * `list --brief NNN [--status s1,s2,…]`
 *
 * Returns a compact table of task IDs + status for a brief, with optional
 * status filtering. Read-only — no mutation.
 *
 * AC-LOE-011-06 / PROPOSAL-scripted-bookkeeping.md §8.2
 */
export function cmdList(
  opts: {
    brief: string;
    statuses?: string[];
    repoRoot?: string;
  }
): ListResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const tasksDir = path.join(repoRoot, ".implementation", "tasks");
  const doneDir = path.join(tasksDir, "done");

  // CS-GEN-003: Input confinement — brief is used as a prefix filter, not a path
  const briefUpper = opts.brief.toUpperCase();
  const entries: ListEntry[] = [];

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).sort();
    for (const entry of files) {
      if (!entry.endsWith(".md")) continue;
      if (!/^(TASK-|BUG-)/i.test(entry)) continue;

      // Brief prefix filter (e.g. brief="LOE-011" → match TASK-LOE-011-*)
      const entryUpper = entry.toUpperCase();
      if (
        !entryUpper.startsWith(`TASK-${briefUpper}-`) &&
        !entryUpper.startsWith(`BUG-${briefUpper}-`)
      ) continue;

      const filePath = path.join(dir, entry);
      if (!fs.statSync(filePath).isFile()) continue;

      const raw = fs.readFileSync(filePath, "utf8");
      const extracted = extractFrontMatter(raw);
      const fm = extracted.found ? extracted.fm : {};

      const status = fm["status"] as string | undefined;

      // Status filter (if specified)
      if (opts.statuses && opts.statuses.length > 0) {
        if (!status || !opts.statuses.includes(status)) continue;
      }

      // Extract one-line scope from body (first non-empty h1 or first non-empty line)
      const body = extracted.found ? extracted.bodyAfterFm : raw;
      const scopeLine = extractScopeLine(body);

      entries.push({
        taskId: deriveTaskId(filePath),
        filePath,
        status,
        scope: scopeLine,
      });
    }
  }

  scanDir(tasksDir);
  scanDir(doneDir);

  return {
    brief: opts.brief,
    entries,
    filtered: (opts.statuses && opts.statuses.length > 0) ? true : false,
  };
}

/**
 * Extract a one-line scope description from a task file body.
 * Uses the first H1 title (# ...) if present, else the first non-empty line.
 * DECISION: H1 title is the best scope line (it's the task's official name);
 * strip the "# " prefix so it reads cleanly in a compact table.
 */
function extractScopeLine(body: string): string | undefined {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      return trimmed.replace(/^#+\s*/, "").trim() || undefined;
    }
    return trimmed;
  }
  return undefined;
}

// ─── Next result ──────────────────────────────────────────────────────────────

export interface NextResult {
  taskId: string | null;
  scope: string | null;
  filePath: string | null;
  reason: string; // why this is the "next" task
}

/**
 * `next [--brief NNN]`
 *
 * Returns the next actionable task id + one-line scope.
 * "Actionable" priority order:
 *   1. Oldest backlog task (not yet started) for the brief
 *   2. In-progress task
 *   3. Review task awaiting SDET
 *
 * DECISION: for "next", prefer backlog tasks (they are the unstarted work)
 * over in-progress (already started) or review (already delivered, awaiting
 * external action). The intent is "what should the developer do next?"
 * (PROPOSAL-scripted-bookkeeping.md §8.2)
 *
 * AC-LOE-011-06
 */
export function cmdNext(
  opts: {
    brief?: string;
    repoRoot?: string;
  }
): NextResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const briefFilter = opts.brief;

  // Collect all tasks, then find the next actionable one
  const listResult = briefFilter
    ? cmdList({ brief: briefFilter, repoRoot })
    : cmdList({ brief: "", repoRoot }); // empty brief = all (no filter)

  // If no brief, scan all tasks
  const allEntries = briefFilter
    ? listResult.entries
    : (() => {
        // No brief filter — scan all TASK-* files directly
        const tasksDir = path.join(repoRoot, ".implementation", "tasks");
        const doneDir = path.join(tasksDir, "done");
        const all: ListEntry[] = [];

        function scanForAll(dir: string): void {
          if (!fs.existsSync(dir)) return;
          const files = fs.readdirSync(dir).sort();
          for (const entry of files) {
            if (!entry.endsWith(".md")) continue;
            if (!/^(TASK-|BUG-)/i.test(entry)) continue;
            const filePath = path.join(dir, entry);
            if (!fs.statSync(filePath).isFile()) continue;
            const raw = fs.readFileSync(filePath, "utf8");
            const extracted = extractFrontMatter(raw);
            const fm = extracted.found ? extracted.fm : {};
            const status = fm["status"] as string | undefined;
            const body = extracted.found ? extracted.bodyAfterFm : raw;
            all.push({
              taskId: deriveTaskId(filePath),
              filePath,
              status,
              scope: extractScopeLine(body),
            });
          }
        }

        scanForAll(tasksDir);
        scanForAll(doneDir);
        return all;
      })();

  // Priority: backlog first, then in-progress, then review
  const byStatus = (s: string) => {
    if (s === "backlog") return 0;
    if (s === "in-progress") return 1;
    if (s === "review") return 2;
    return 99;
  };

  // Filter to actionable statuses and sort by priority
  const actionable = allEntries
    .filter(e => e.status === "backlog" || e.status === "in-progress" || e.status === "review")
    .sort((a, b) => byStatus(a.status ?? "") - byStatus(b.status ?? ""));

  if (actionable.length === 0) {
    return { taskId: null, scope: null, filePath: null, reason: "no actionable tasks found" };
  }

  const next = actionable[0]!;
  return {
    taskId: next.taskId,
    scope: next.scope ?? null,
    filePath: next.filePath,
    reason: `status: ${next.status ?? "unknown"}`,
  };
}

// ─── Summary result ───────────────────────────────────────────────────────────

export interface SummaryResult {
  brief: string;
  total: number;
  byStatus: Record<string, number>;
  openGates: string[];       // tasks with open (unchecked) quality gates
  missingMetadata: string[]; // tasks with empty required metadata fields
}

/**
 * `summary --brief NNN`
 *
 * Computed rollup: counts by status, open gates, missing-metadata flags.
 * Read-only — no mutation.
 *
 * "Open gates" = tasks where the body contains unchecked gate boxes `- [ ]`.
 * "Missing metadata" = tasks where lifecycle fields are empty/sentinel.
 * DECISION: Checks the 4 ENGINE § Task Metadata Contract lifecycle fields
 * (started_at, completed_at, complexity_estimate, complexity_actual) for
 * empty/sentinel values relative to the task's status.
 * (PROPOSAL-scripted-bookkeeping.md §8.2, AC-LOE-011-06)
 */
export function cmdSummary(
  opts: {
    brief: string;
    repoRoot?: string;
  }
): SummaryResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const listResult = cmdList({ brief: opts.brief, repoRoot });

  const byStatus: Record<string, number> = {};
  const openGates: string[] = [];
  const missingMetadata: string[] = [];

  for (const entry of listResult.entries) {
    const status = entry.status ?? "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    // Read full file to check gates and metadata
    if (!fs.existsSync(entry.filePath)) continue;
    const raw = fs.readFileSync(entry.filePath, "utf8");
    const extracted = extractFrontMatter(raw);
    const fm = extracted.found ? extracted.fm : {};
    const body = extracted.found ? extracted.bodyAfterFm : raw;

    // Open gates: look for unchecked gate boxes in the body
    // DECISION: Only detect mandatory gates (not N/A boxes or SDET Review box)
    // A gate is "open" if it has "- [ ]" and is not in a comment
    const hasOpenGate = /^- \[ \] \*\*/m.test(body);
    if (hasOpenGate) {
      openGates.push(entry.taskId);
    }

    // Missing metadata: check lifecycle fields relative to status
    const missingForTask: string[] = [];
    const started = fm["started_at"] as string | undefined;
    const completed = fm["completed_at"] as string | undefined;
    const estimate = fm["complexity_estimate"] as string | undefined;
    const actual = fm["complexity_actual"] as string | undefined;

    // started_at should be set for non-backlog tasks
    if (status !== "backlog" && isEmptyField(started)) {
      missingForTask.push("started_at");
    }
    // complexity_estimate should be set for non-backlog tasks
    if (status !== "backlog" && isEmptyField(estimate)) {
      missingForTask.push("complexity_estimate");
    }
    // complexity_actual should be set for review/done tasks
    if ((status === "review" || status === "done") && isEmptyField(actual)) {
      missingForTask.push("complexity_actual");
    }
    // completed_at should be set for done tasks
    if (status === "done" && isEmptyField(completed)) {
      missingForTask.push("completed_at");
    }

    if (missingForTask.length > 0) {
      missingMetadata.push(`${entry.taskId}: missing ${missingForTask.join(", ")}`);
    }
  }

  return {
    brief: opts.brief,
    total: listResult.entries.length,
    byStatus,
    openGates,
    missingMetadata,
  };
}

// ─── Progress result ──────────────────────────────────────────────────────────

export interface ProgressResult {
  hotState: string; // the ## Current initiative section content only
}

/**
 * `progress`
 *
 * Projects the `## Current initiative` hot-state from PROGRESS.md ONLY —
 * not the session-entry tail. Read-only — no mutation, no new store.
 *
 * DECISION: This is a READ PROJECTION of the existing PROGRESS.md file.
 * We do NOT create or own a separate progress store. The `## Current initiative`
 * section is bounded by either the next `##` heading or the `---` horizontal rule
 * (which marks the session-entry tail per ENGINE.md § PROGRESS.md structure contract).
 * (PROPOSAL-scripted-bookkeeping.md §8.2, AC-LOE-011-06)
 *
 * CS-GEN-003: PROGRESS.md structure per ENGINE.md § PROGRESS.md structure contract.
 */
export function cmdProgress(
  opts: {
    repoRoot?: string;
    progressPath?: string; // injectable for testing
  } = {}
): ProgressResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();

  // CS-GEN-003: Input confinement — path is repo-rooted, not user-supplied
  const progressPath = opts.progressPath ?? path.join(
    repoRoot,
    ".implementation",
    "tasks",
    "PROGRESS.md"
  );

  if (!fs.existsSync(progressPath)) {
    throw new TaskCliError(`PROGRESS.md not found at: ${progressPath}`, 1);
  }

  const raw = fs.readFileSync(progressPath, "utf8");

  // Extract the ## Current initiative section
  // Per ENGINE.md § PROGRESS.md structure contract:
  //   (1) ## Current initiative (2) ## Awaiting PR merge (3) ## Active bugs
  //   (4) ## Open retro action items (5) --- marker + session entries
  // We want section (1) only — up to (but not including) the next ## heading.
  const hotState = extractCurrentInitiativeSection(raw);

  return { hotState };
}

/**
 * Extract the `## Current initiative` section from PROGRESS.md content.
 *
 * Returns the section text from the heading down to (not including) the next
 * `## ` heading or the `---` session-entry marker, whichever comes first.
 *
 * DECISION: The `---` horizontal rule (the session-entry separator per
 * ENGINE.md § PROGRESS.md structure contract) is the hard stop even if no
 * next `##` heading appears. This ensures the session-entry tail is NEVER
 * included in the projection.
 */
export function extractCurrentInitiativeSection(content: string): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (!inSection) {
      // Look for the ## Current initiative heading
      if (/^## Current initiative\s*$/.test(line.trim())) {
        inSection = true;
        sectionLines.push(line);
      }
      continue;
    }

    // We are in the section. Stop at:
    //   - another ## heading (next section), or
    //   - a bare `---` line (session-entry separator)
    // DECISION: a bare `---` at the start of a line (session-entry tail marker)
    // is the guaranteed stop even in the absence of the next ## heading.
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) {
      break;
    }

    sectionLines.push(line);
  }

  return sectionLines.join("\n").trimEnd();
}

// ─── Brief-context result ─────────────────────────────────────────────────────

export interface BriefContextResult {
  taskId: string;
  taskSpec: string;          // full task spec content (title + body, no FM)
  frontMatter: Record<string, string | string[] | undefined>;
  citedAcs: string[];        // AC IDs from acceptance_criteria FM field
  acTexts: Record<string, string>; // AC ID → text from the brief
  citedCs: string[];         // CS-* IDs from code_standards FM field
  csTexts: Record<string, string>; // CS ID → brief text from the standard file
}

/**
 * `brief-context <ID>`
 *
 * Returns the bounded bundle a subagent needs to implement a task:
 *   - The task spec (title + body), NOT the whole file
 *   - The acceptance criteria texts from the brief
 *   - The code standards texts from .code-standards/
 *
 * Default output: paste-ready markdown bundle (for spawn prompts).
 * --json: structured object.
 *
 * DECISION: "bounded bundle" means we extract the relevant fragments from
 * potentially large source files (brief, CS standards) rather than including
 * the whole files. The task spec itself is included in full because it IS the
 * bounded unit — the FM is extracted separately as structured data.
 * (PROPOSAL-scripted-bookkeeping.md §8.2, AC-LOE-011-06)
 *
 * CS-GEN-003: CS standard lookup mirrors the code-standards directory layout
 * (.code-standards/standards/{lang}/CS-{LANG}-NNN-{name}.md).
 */
export function cmdBriefContext(
  opts: {
    taskId: string;
    repoRoot?: string;
  }
): BriefContextResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const filePath = resolveTaskFile(opts.taskId, repoRoot, { searchDone: true });
  if (!filePath) {
    throw new TaskCliError(`Task not found: ${opts.taskId}`, 1);
  }

  const task = readTaskFile(filePath);

  // Extract accepted criteria IDs from FM
  const acRaw = task.fm["acceptance_criteria"];
  const acIds: string[] = Array.isArray(acRaw)
    ? acRaw
    : (typeof acRaw === "string" && acRaw && acRaw !== "none")
      ? [acRaw]
      : [];

  // Extract code standards IDs from FM
  const csRaw = task.fm["code_standards"];
  const csIds: string[] = Array.isArray(csRaw)
    ? csRaw.map(s => extractCsId(s))
    : (typeof csRaw === "string" && csRaw && csRaw !== "none")
      ? csRaw.split(",").map(s => extractCsId(s.trim())).filter(Boolean)
      : [];

  // Locate the brief file and extract AC texts
  const briefId = task.fm["brief"] as string | undefined;
  const acTexts: Record<string, string> = {};
  if (briefId) {
    const briefPath = findBriefFile(briefId, repoRoot);
    if (briefPath) {
      const briefContent = fs.readFileSync(briefPath, "utf8");
      for (const acId of acIds) {
        const text = extractAcText(briefContent, acId);
        if (text) acTexts[acId] = text;
      }
    }
  }

  // Locate CS standard files and extract brief texts
  const csTexts: Record<string, string> = {};
  for (const csId of csIds) {
    if (!csId) continue;
    const csPath = findCsFile(csId, repoRoot);
    if (csPath) {
      const csContent = fs.readFileSync(csPath, "utf8");
      csTexts[csId] = extractCsSummary(csContent, csId);
    }
  }

  return {
    taskId: opts.taskId,
    taskSpec: task.bodyAfterFm.trimStart(),
    frontMatter: task.fm,
    citedAcs: acIds,
    acTexts,
    citedCs: csIds.filter(Boolean),
    csTexts,
  };
}

/**
 * Extract a CS-* standard ID from a string like "CS-INFRA-004 (recommended)".
 * Returns "CS-INFRA-004" (the bare ID).
 */
function extractCsId(raw: string): string {
  const m = raw.match(/^(CS-[A-Z]+-\d+)/i);
  return m ? m[1]!.toUpperCase() : "";
}

/**
 * Find the brief file for a given brief ID.
 * DECISION: briefs live at .implementation/briefs/BRIEF-<ID>-*.md.
 * We do a prefix-match scan (same pattern as task resolution).
 * CS-GEN-003: Input confinement — briefId is matched against a fixed dir.
 */
function findBriefFile(briefId: string, repoRoot: string): string | null {
  const briefsDir = path.join(repoRoot, ".implementation", "briefs");
  if (!fs.existsSync(briefsDir)) return null;

  const normalId = briefId.toUpperCase();
  const entries = fs.readdirSync(briefsDir);
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const upper = entry.toUpperCase();
    // Match exact (BRIEF-LOE-011.md) or with suffix (BRIEF-LOE-011-task-cli.md)
    if (upper === `${normalId}.MD` || upper.startsWith(`${normalId}-`)) {
      const fullPath = path.join(briefsDir, entry);
      // Confine to briefsDir
      const resolved = path.resolve(fullPath);
      const allowedRoot = path.resolve(briefsDir);
      if (isWithin(allowedRoot, resolved)) {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Find a CS standard file by ID (e.g. "CS-INFRA-004").
 * Searches recursively under .code-standards/standards/.
 * CS-GEN-003: path confinement to .code-standards/standards/.
 */
function findCsFile(csId: string, repoRoot: string): string | null {
  const stdDir = path.join(repoRoot, ".code-standards", "standards");
  if (!fs.existsSync(stdDir)) return null;

  const normalId = csId.toUpperCase();
  return searchCsDir(stdDir, normalId, path.resolve(stdDir));
}

function searchCsDir(dir: string, csId: string, allowedRoot: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const resolved = path.resolve(fullPath);
    // Confine to allowedRoot
    if (!isWithin(allowedRoot, resolved)) continue;

    if (entry.isDirectory()) {
      const found = searchCsDir(fullPath, csId, allowedRoot);
      if (found) return found;
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const upperName = entry.name.toUpperCase();
      // Match CS-INFRA-004-*.md or CS-INFRA-004.md
      if (upperName.startsWith(`${csId}-`) || upperName === `${csId}.MD`) {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Extract the text for a specific AC ID from a brief file.
 * The brief's front matter has acceptance_criteria as a YAML block with id/text pairs.
 * DECISION: we first try the YAML front matter (structured), then fall back to
 * scanning the brief body for the AC ID pattern.
 */
function extractAcText(briefContent: string, acId: string): string | null {
  // Try front matter first (for briefs with structured AC lists)
  const extracted = extractFrontMatter(briefContent);
  if (extracted.found) {
    // Front matter may have acceptance_criteria as a list of ids
    // But in this project, ACs are embedded in the front matter as multi-line YAML objects.
    // DECISION: Parse the raw brief YAML block for "id: AC-... text: ..." patterns.
    // The brief's YAML front matter uses multi-line YAML objects under acceptance_criteria.
    // Since our hand-rolled parser only handles flat scalar/list, scan the fmText directly.
    const fmText = extracted.fmText ?? "";
    const bodyText = extracted.bodyAfterFm ?? "";

    // Try to find "id: AC-LOE-011-06\n    text: ..." pattern in fmText
    const acText = extractAcFromYamlBlock(fmText, acId);
    if (acText) return acText;

    // Fallback: scan body for "- **AC-LOE-011-06**" or similar heading pattern
    return extractAcFromBody(bodyText, acId);
  }

  // No front matter — scan body
  return extractAcFromBody(briefContent, acId);
}

/**
 * Extract AC text from a YAML front-matter block using simple line scanning.
 * Handles the brief's multi-entry acceptance_criteria structure:
 *   acceptance_criteria:
 *     - id: AC-LOE-011-06
 *       text: "..."
 *
 * DECISION: This hand-rolls a nested-object YAML scanner for the acceptance_criteria
 * block, which is in tension with the file's "no re-implemented YAML parsing"
 * constraint (line 21 / CS-GEN-003). The constraint holds for front-matter I/O
 * (all of which goes through task-frontmatter.ts); this function reads the YAML
 * text *after* task-frontmatter has already parsed it out. It handles only
 * single-line double-quoted text: "..." scalars — the real brief shape — and
 * is not a general YAML parser. A future maintainer should be aware that embedded
 * double quotes in text: values, or block-scalar (| or >) text fields, will not
 * parse correctly. Pulling in a YAML library here is a deliberate follow-up, not
 * in scope for this fix pass. (over-engineering/correctness: panel noted, accept-with-note)
 */
function extractAcFromYamlBlock(yamlText: string, acId: string): string | null {
  const lines = yamlText.split("\n");
  let inAcEntry = false;
  let textLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Detect "- id: AC-..." or "id: AC-..."
    if (trimmed === `- id: ${acId}` || trimmed === `id: ${acId}`) {
      inAcEntry = true;
      textLines = [];
      continue;
    }

    if (inAcEntry) {
      // Look for "text: ..." on the next (possibly indented) line
      if (trimmed.startsWith("text:")) {
        const textContent = trimmed.slice(5).trim();
        // Defensive guard: block-scalar indicators (| or >) are not handled by this
        // simple scanner — return raw so a future maintainer sees something rather
        // than a mis-stripped value. (per DECISION comment above)
        if (textContent === "|" || textContent === ">") {
          return textContent;
        }
        // Handle quoted text: "..." (strip outer quotes)
        if (textContent.startsWith('"') && textContent.endsWith('"')) {
          // Guard: if the outer-stripped content itself contains a bare `"`, that
          // signals an escape sequence we don't handle — return raw.
          const inner = textContent.slice(1, -1);
          if (inner.includes('"')) return textContent;
          return inner;
        }
        if (textContent.startsWith('"')) {
          // Multi-line quoted text — collect until closing quote
          textLines = [textContent.slice(1)];
          for (let j = i + 1; j < lines.length; j++) {
            const next = lines[j]!.trim();
            if (next.endsWith('"')) {
              textLines.push(next.slice(0, -1));
              break;
            }
            textLines.push(next);
          }
          return textLines.join(" ").trim();
        }
        return textContent || null;
      }
      // Hit another entry or end of AC block — give up
      if (trimmed.startsWith("- id:") || trimmed.startsWith("id:")) {
        inAcEntry = false;
        textLines = [];
      }
    }
  }
  return null;
}

/**
 * Extract AC text by scanning the markdown body of a brief.
 * Looks for patterns like "- **AC-LOE-011-06**" or "AC-LOE-011-06" headings.
 */
function extractAcFromBody(bodyText: string, acId: string): string | null {
  const lines = bodyText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes(acId)) {
      // Return the line itself (trimmed) as the context
      return line.trim();
    }
  }
  return null;
}

/**
 * Extract a brief summary from a CS standard file.
 * Returns the ## Rule section or the first non-empty paragraph after the front matter.
 * DECISION: The ## Rule section is the most concise, actionable text for a spawn prompt.
 */
function extractCsSummary(csContent: string, csId: string): string {
  const lines = csContent.split("\n");
  let inRule = false;
  const ruleLines: string[] = [];

  for (const line of lines) {
    if (/^## Rule\s*$/.test(line.trim())) {
      inRule = true;
      continue;
    }
    if (inRule) {
      if (/^##/.test(line)) break; // next section
      ruleLines.push(line);
    }
  }

  const rule = ruleLines.join("\n").trim();
  if (rule) return rule;

  // Fallback: return the title line from the H1
  for (const line of lines) {
    const m = line.match(/^# .+/);
    if (m) return line.trim();
  }

  return `${csId} — see .code-standards/standards/`;
}

// ─── Output rendering (compact text vs JSON) ──────────────────────────────────
//
// DECISION (§10 Q5): compact text/tables is the DEFAULT everywhere
// (token-cheap, human- and agent-readable). --json is opt-in.
// brief-context defaults to paste-ready markdown bundle.
// CS-GEN-003

/**
 * Render a ShowResult as compact text (default) or JSON.
 */
export function renderShow(result: ShowResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      task_id: result.taskId,
      file_path: result.filePath,
      fields: result.fields,
    }, null, 2);
  }

  // Compact text: one "key: value" per line
  const lines: string[] = [`task: ${result.taskId}`];
  for (const [key, value] of Object.entries(result.fields)) {
    const display = Array.isArray(value) ? value.join(", ") : (value ?? "—");
    lines.push(`  ${key}: ${display}`);
  }
  return lines.join("\n");
}

/**
 * Render a ListResult as a compact table (default) or JSON.
 */
export function renderList(result: ListResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      brief: result.brief,
      filtered: result.filtered,
      entries: result.entries.map(e => ({
        task_id: e.taskId,
        status: e.status ?? null,
        scope: e.scope ?? null,
      })),
    }, null, 2);
  }

  if (result.entries.length === 0) {
    return `No tasks found for brief: ${result.brief}`;
  }

  // Compact table: ID | STATUS | SCOPE
  const colWidthId = Math.max(7, ...result.entries.map(e => e.taskId.length));
  const colWidthStatus = Math.max(6, ...result.entries.map(e => (e.status ?? "").length));

  const header = `${"TASK-ID".padEnd(colWidthId)}  ${"STATUS".padEnd(colWidthStatus)}  SCOPE`;
  const sep    = `${"-".repeat(colWidthId)}  ${"-".repeat(colWidthStatus)}  ${"-".repeat(40)}`;
  const rows = result.entries.map(e => {
    const scope = (e.scope ?? "—").slice(0, 60);
    return `${e.taskId.padEnd(colWidthId)}  ${(e.status ?? "—").padEnd(colWidthStatus)}  ${scope}`;
  });

  return [header, sep, ...rows].join("\n");
}

/**
 * Render a NextResult as compact text (default) or JSON.
 */
export function renderNext(result: NextResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      task_id: result.taskId,
      scope: result.scope,
      file_path: result.filePath,
      reason: result.reason,
    }, null, 2);
  }

  if (!result.taskId) {
    return `next: none (${result.reason})`;
  }
  const scope = result.scope ? ` — ${result.scope}` : "";
  return `next: ${result.taskId}${scope}\n  (${result.reason})`;
}

/**
 * Render a SummaryResult as compact text (default) or JSON.
 */
export function renderSummary(result: SummaryResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      brief: result.brief,
      total: result.total,
      by_status: result.byStatus,
      open_gates: result.openGates,
      missing_metadata: result.missingMetadata,
    }, null, 2);
  }

  const lines: string[] = [`brief: ${result.brief}  total: ${result.total}`];
  lines.push("");
  lines.push("by status:");
  for (const [status, count] of Object.entries(result.byStatus)) {
    lines.push(`  ${status}: ${count}`);
  }
  if (result.openGates.length > 0) {
    lines.push("");
    lines.push(`open gates (${result.openGates.length}):`);
    for (const id of result.openGates) lines.push(`  ${id}`);
  } else {
    lines.push("");
    lines.push("open gates: none");
  }
  if (result.missingMetadata.length > 0) {
    lines.push("");
    lines.push(`missing metadata (${result.missingMetadata.length}):`);
    for (const m of result.missingMetadata) lines.push(`  ${m}`);
  } else {
    lines.push("");
    lines.push("missing metadata: none");
  }

  return lines.join("\n");
}

/**
 * Render a ProgressResult as compact text (default) or JSON.
 */
export function renderProgress(result: ProgressResult, json: boolean): string {
  if (json) {
    return JSON.stringify({ current_initiative: result.hotState }, null, 2);
  }
  // Compact text: the section content as-is (already bounded)
  return result.hotState;
}

/**
 * Render a BriefContextResult as paste-ready markdown bundle (default) or JSON.
 *
 * DECISION (§8.2, §10 Q5): brief-context defaults to paste-ready markdown
 * because its primary consumer pastes the bundle into a spawn prompt.
 * The markdown bundle is more usable for that purpose than JSON.
 */
export function renderBriefContext(result: BriefContextResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      task_id: result.taskId,
      front_matter: result.frontMatter,
      cited_acs: result.citedAcs,
      ac_texts: result.acTexts,
      cited_cs: result.citedCs,
      cs_texts: result.csTexts,
      task_spec: result.taskSpec,
    }, null, 2);
  }

  // Paste-ready markdown bundle
  const parts: string[] = [];

  parts.push(`## Task: ${result.taskId}`);
  parts.push("");

  // Front matter summary (key lifecycle fields only, not the full FM dump)
  parts.push("### Metadata");
  const displayFmKeys = ["brief", "status", "assigned_to", "acceptance_criteria", "code_standards", "upstream_refs"];
  for (const key of displayFmKeys) {
    const val = result.frontMatter[key];
    if (val !== undefined) {
      const display = Array.isArray(val) ? val.join(", ") : val;
      parts.push(`- **${key}**: ${display}`);
    }
  }
  parts.push("");

  // Task spec body
  parts.push("### Task Spec");
  parts.push(result.taskSpec.trimEnd());
  parts.push("");

  // Acceptance criteria texts
  if (result.citedAcs.length > 0) {
    parts.push("### Acceptance Criteria");
    for (const acId of result.citedAcs) {
      const text = result.acTexts[acId];
      parts.push(`**${acId}**: ${text ?? "(see brief)"}`);
    }
    parts.push("");
  }

  // Code standards
  if (result.citedCs.length > 0) {
    parts.push("### Code Standards");
    for (const csId of result.citedCs) {
      const text = result.csTexts[csId];
      parts.push(`**${csId}**:`);
      if (text) {
        // Indent the standard text
        for (const line of text.split("\n")) {
          parts.push(`  ${line}`);
        }
      } else {
        parts.push(`  (see .code-standards/standards/)`);
      }
      parts.push("");
    }
  }

  return parts.join("\n");
}

// ─── State-store command helpers ──────────────────────────────────────────────

/**
 * Build an empty StateStore (used when no state.json exists yet).
 * DECISION: Zero-state has null brief/phase/branch so the first phase-transition
 * can write a meaningful entry. (BRIEF-LOE-012 §7)
 * CS-GEN-003
 */
function buildEmptyState(nowFn?: () => string): StateStore {
  return {
    schemaVersion: "1.0",
    lastUpdated: nowFn ? nowFn() : nowIso(),
    currentBrief: null,
    currentPhase: null,
    currentSliceDescription: null,
    currentBranch: null,
    awaitingMerge: [],
    openRetroItems: [],
  };
}

/**
 * Compute a JSON diff string between two JSON representations.
 * Returns a human-readable "before vs after" diff (line-level).
 * DECISION: This is intentionally a minimal line-diff (not a true unified diff)
 * to remain zero-dep while being useful for human review.
 * CS-INFRA-004: zero new runtime npm dependencies.
 * CS-GEN-003: mirrors the dry-run pattern in state-store.ts migrate().
 */
function jsonLineDiff(before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const diffLines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b !== a) {
      if (b !== undefined) diffLines.push(`- ${b}`);
      if (a !== undefined) diffLines.push(`+ ${a}`);
    }
  }
  return diffLines.length > 0 ? diffLines.join("\n") : "(no changes)";
}

// ─── Subcommand: phase-transition ─────────────────────────────────────────────

/**
 * `phase-transition --to <phase> --role <r> [--dry-run]`
 *
 * Sets `state.json` `currentPhase` + appends a `phase-transition` event
 * ATOMICALLY together. Rejects illegal/unknown phases non-zero.
 * Re-run to a settled phase = clean no-op (exit 0).
 *
 * THE JUDGMENT LINE (BRIEF-LOE-012 §6 / PROPOSAL-scripted-bookkeeping-phase2.md §8):
 * // DECISION: This command RECORDS the phase transition — it does NOT decide
 * // whether the transition is valid from a business perspective. The agent
 * // decides to invoke the transition; the CLI records it atomically.
 * // Validation is structural only (is the phase string a legal enum value?).
 * CS-GEN-003: PROPOSAL-scripted-bookkeeping-phase2.md §8 / AC-LOE-012-02
 * CS-INFRA-004: zero new runtime npm dependencies.
 *
 * AC-LOE-012-02
 */
export function cmdPhaseTransition(opts: {
  to: string;
  role: Role;
  note?: string;
  repoRoot?: string;
  dryRun?: boolean;
  nowFn?: () => string;
}): { changed: boolean; message: string } {
  // AC-LOE-012-02: --role required + roster-validated
  if (!validateRole(opts.role)) {
    throw new TaskCliError(
      `Unknown role "${opts.role}". Valid roles: ${VALID_ROLES.join(", ")}`,
      1
    );
  }

  // Validate the target phase against the closed VALID_PHASES enum
  // DECISION: This is structural validation, not a judgment. The phase enum
  // is authoritative (PHASES.md); an unknown string is always invalid.
  // CS-GEN-003: VALID_PHASES from state-store.ts — the single source of truth.
  if (!VALID_PHASES.includes(opts.to as Phase)) {
    throw new TaskCliError(
      `Unknown phase "${opts.to}". Valid phases: ${VALID_PHASES.join(", ")}`,
      1
    );
  }

  const targetPhase = opts.to as Phase;
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const now = opts.nowFn ? opts.nowFn() : nowIso();

  // Read current state (or build empty if first run)
  const current = readState(repoRoot) ?? buildEmptyState(opts.nowFn);

  // IDEMPOTENCY: if the phase is already settled to the same value, clean no-op
  if (current.currentPhase === targetPhase) {
    return {
      changed: false,
      message: `Phase is already ${targetPhase} — no-op`,
    };
  }

  // Build new state
  const newState: StateStore = {
    ...current,
    lastUpdated: now,
    currentPhase: targetPhase,
  };

  // Build the event
  const event: StateEvent = {
    ts: now,
    type: "phase-transition",
    brief: newState.currentBrief,
    phase: targetPhase,
    role: opts.role,
    pr: null,
    note: opts.note ?? null,
    payload: {
      previousPhase: current.currentPhase,
      targetPhase,
    },
  };

  // --dry-run: print diff and return without writing
  if (opts.dryRun) {
    const before = serializeState(current);
    const after = serializeState(newState);
    console.log("=== DRY RUN: state.json diff (phase-transition) ===");
    console.log(jsonLineDiff(before, after));
    console.log(`=== event that would be appended to events.jsonl ===`);
    console.log(JSON.stringify(event, null, 2));
    console.log("=== END DRY RUN (nothing written) ===");
    return {
      changed: false,
      message: `dry-run: would transition phase ${current.currentPhase ?? "(none)"} → ${targetPhase}`,
    };
  }

  // ATOMICITY: writeState uses atomicWriteFile (temp + rename); then append event.
  // DECISION: We write state.json FIRST, then append to events.jsonl.
  // If the event append fails, state.json still reflects the transition (recoverable).
  // The inverse (event first) would leave a ghost event with no matching state change.
  // CS-GEN-003: §7 decision 1 — events.jsonl is the append-only audit log.
  writeState(repoRoot, newState);
  appendEvent(repoRoot, event);

  return {
    changed: true,
    message: `Phase transitioned ${current.currentPhase ?? "(none)"} → ${targetPhase}`,
  };
}

// ─── Subcommand: merge-checkpoint ─────────────────────────────────────────────

/**
 * Injectable shim type for `gh` / `git` calls in merge-checkpoint.
 * Allows tests to substitute a fake without live network access.
 * CS-GEN-003: derive-from-source precedent from orchestrate-state.sh / id-alloc.sh
 * AC-LOE-012-03
 */
export interface MergeCheckpointShims {
  /** Run `gh pr view <N> --json url` and return the URL string */
  ghPrViewUrl: (prNumber: number) => string;
  /** Run `git log` / `git rev-parse` to get the HEAD squash SHA */
  gitRevParse: () => string;
}

/**
 * Default shims that call `gh` and `git` via spawnSync.
 *
 * SECURITY (AC-LOE-012-03): The PR number is numeric-validated before use.
 * NEVER allow --pr to carry a shell-injectable string — pass it as a separate
 * argv element to spawnSync (which does NOT use a shell by default).
 * CS-GEN-003: §11 derive-from-source — mirrors orchestrate-state.sh pattern.
 */
function defaultMergeCheckpointShims(): MergeCheckpointShims {
  return {
    ghPrViewUrl(prNumber: number): string {
      // SECURITY: prNumber is already validated as a positive integer by the caller.
      // Passed as a separate argv element — no shell interpolation.
      // CS-GEN-003: §11 derive-from-source
      const result = child_process.spawnSync(
        "gh",
        ["pr", "view", String(prNumber), "--json", "url", "--jq", ".url"],
        { encoding: "utf8" }
      );
      if (result.status !== 0) {
        throw new TaskCliError(
          `gh pr view ${prNumber} failed: ${result.stderr ?? result.error?.message ?? "(unknown error)"}`,
          1
        );
      }
      return (result.stdout ?? "").trim();
    },

    gitRevParse(): string {
      // DECISION: Use `git rev-parse HEAD` — the current HEAD after a squash merge
      // is the squash commit SHA. The agent NEVER types this value.
      // CS-GEN-003: §11 derive-from-source
      const result = child_process.spawnSync(
        "git",
        ["rev-parse", "HEAD"],
        { encoding: "utf8" }
      );
      if (result.status !== 0) {
        throw new TaskCliError(
          `git rev-parse HEAD failed: ${result.stderr ?? result.error?.message ?? "(unknown error)"}`,
          1
        );
      }
      return (result.stdout ?? "").trim();
    },
  };
}

/**
 * `merge-checkpoint --pr N --role <r> [--container-smoke "..."] [--sdet-validation "..."]
 *  [--sdet-ci-gate "..."] [--sdet-quality-audit "..."] [--note "..."] [--dry-run]`
 *
 * Creates an awaiting-merge record in `state.json` and appends a `merge-checkpoint`
 * event to `events.jsonl`. DERIVES the PR URL + squash SHA from `gh`/`git` —
 * the agent NEVER transcribes them.
 *
 * THE JUDGMENT LINE (BRIEF-LOE-012 §6 / PROPOSAL-scripted-bookkeeping-phase2.md §8):
 * // DECISION: Gate verdicts are AGENT-SUPPLIED inputs recorded VERBATIM.
 * // The CLI does NOT compute, evaluate, or interpret them. The agent decides
 * // whether a gate passed; the CLI stores what the agent says.
 * CS-GEN-003: AC-LOE-012-03 / PROPOSAL-scripted-bookkeeping-phase2.md §8
 *
 * AC-LOE-012-03
 */
export function cmdMergeCheckpoint(opts: {
  pr: number;
  role: Role;
  gateVerdicts?: Partial<GateVerdictSlots>;
  note?: string;
  repoRoot?: string;
  dryRun?: boolean;
  nowFn?: () => string;
  // Injectable shims for gh/git (no live network in tests)
  shims?: MergeCheckpointShims;
}): { changed: boolean; message: string; record?: AwaitingMergeRecord } {
  // AC-LOE-012-03: --role required + roster-validated
  if (!validateRole(opts.role)) {
    throw new TaskCliError(
      `Unknown role "${opts.role}". Valid roles: ${VALID_ROLES.join(", ")}`,
      1
    );
  }

  // SECURITY (AC-LOE-012-03): numeric-validate --pr to prevent shell injection.
  // opts.pr is already typed as number but verify at runtime for CLI path safety.
  if (!Number.isInteger(opts.pr) || opts.pr < 1) {
    throw new TaskCliError(`--pr must be a positive integer, got: ${opts.pr}`, 1);
  }

  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const now = opts.nowFn ? opts.nowFn() : nowIso();
  const shims = opts.shims ?? defaultMergeCheckpointShims();

  // Read current state
  const current = readState(repoRoot) ?? buildEmptyState(opts.nowFn);

  // IDEMPOTENCY: if a record for this PR already exists, clean no-op
  const existing = current.awaitingMerge.find((r) => r.pr === opts.pr);
  if (existing) {
    return {
      changed: false,
      message: `merge-checkpoint for PR #${opts.pr} already exists — no-op`,
      record: existing,
    };
  }

  // DERIVE PR URL + squash SHA from primary sources (never from agent flags)
  // CS-GEN-003: §11 derive-from-source
  // DECISION: This is the heart of AC-LOE-012-03 — the agent NEVER transcribes
  // these values. The CLI shells out to gh/git (injected for tests).
  const prUrl = shims.ghPrViewUrl(opts.pr);
  const squashSha = shims.gitRevParse();

  // Validate derived URL (must start with https://)
  if (!prUrl.startsWith("https://")) {
    throw new TaskCliError(
      `Derived PR URL "${prUrl}" does not start with https:// — check gh output`,
      1
    );
  }

  // Build gate verdicts (AGENT-SUPPLIED, recorded verbatim)
  // DECISION: null = not yet recorded (the agent may supply verdicts incrementally).
  // CS-GEN-003: §8 judgment line — the CLI RECORDS, NEVER DECIDES.
  const gateVerdicts: GateVerdictSlots = {
    containerSmoke: opts.gateVerdicts?.containerSmoke ?? null,
    sdetValidation: opts.gateVerdicts?.sdetValidation ?? null,
    sdetCiGate: opts.gateVerdicts?.sdetCiGate ?? null,
    sdetQualityAudit: opts.gateVerdicts?.sdetQualityAudit ?? null,
  };

  const record: AwaitingMergeRecord = {
    pr: opts.pr,
    prUrl,
    squashSha,
    createdAt: now,
    gateVerdicts,
    note: opts.note ?? null,
  };

  // Build new state (append the record)
  const newState: StateStore = {
    ...current,
    lastUpdated: now,
    awaitingMerge: [...current.awaitingMerge, record],
  };

  // Build event
  const event: StateEvent = {
    ts: now,
    type: "merge-checkpoint",
    brief: newState.currentBrief,
    phase: newState.currentPhase,
    role: opts.role,
    pr: opts.pr,
    note: opts.note ?? null,
    payload: { prUrl, squashSha, gateVerdicts },
  };

  // --dry-run: print diff and return without writing
  if (opts.dryRun) {
    const before = serializeState(current);
    const after = serializeState(newState);
    console.log("=== DRY RUN: state.json diff (merge-checkpoint) ===");
    console.log(jsonLineDiff(before, after));
    console.log(`=== event that would be appended to events.jsonl ===`);
    console.log(JSON.stringify(event, null, 2));
    console.log("=== END DRY RUN (nothing written) ===");
    return {
      changed: false,
      message: `dry-run: would create merge-checkpoint for PR #${opts.pr}`,
      record,
    };
  }

  writeState(repoRoot, newState);
  appendEvent(repoRoot, event);

  return {
    changed: true,
    message: `merge-checkpoint created for PR #${opts.pr} (url=${prUrl}, sha=${squashSha})`,
    record,
  };
}

// ─── Subcommand: post-merge ────────────────────────────────────────────────────

/**
 * `post-merge --pr N --role <r> [--bug "<desc>"] [--note "..."] [--dry-run]`
 *
 * Pass (no --bug): clears the awaiting-merge record for the PR.
 * Fail (--bug "<desc>"): scaffolds a BUG-BBB-POST-NNN file via task-frontmatter.ts
 *                        AND keeps the awaiting-merge record.
 *
 * THE JUDGMENT LINE (BRIEF-LOE-012 §6 / PROPOSAL-scripted-bookkeeping-phase2.md §8):
 * // DECISION: The pass/fail determination and the bug description are AGENT-SUPPLIED
 * // inputs. The CLI does NOT decide whether the merge passed or failed; it records
 * // what the agent says and takes the appropriate structural action (clear or scaffold).
 * CS-GEN-003: AC-LOE-012-04 / PROPOSAL-scripted-bookkeeping-phase2.md §8
 *
 * Bug scaffold goes through serializeFrontMatter from task-frontmatter.ts —
 * NOT a re-implemented YAML writer. (CS-GEN-003)
 *
 * AC-LOE-012-04
 */
export function cmdPostMerge(opts: {
  pr: number;
  role: Role;
  bug?: string;   // If present → fail branch (scaffold BUG and keep record)
  note?: string;
  repoRoot?: string;
  dryRun?: boolean;
  nowFn?: () => string;
}): { changed: boolean; message: string; bugFilePath?: string } {
  // AC-LOE-012-04: --role required + roster-validated
  if (!validateRole(opts.role)) {
    throw new TaskCliError(
      `Unknown role "${opts.role}". Valid roles: ${VALID_ROLES.join(", ")}`,
      1
    );
  }

  // SECURITY: numeric-validate --pr
  if (!Number.isInteger(opts.pr) || opts.pr < 1) {
    throw new TaskCliError(`--pr must be a positive integer, got: ${opts.pr}`, 1);
  }

  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const now = opts.nowFn ? opts.nowFn() : nowIso();
  const today = now.slice(0, 10);

  // Read current state
  const current = readState(repoRoot) ?? buildEmptyState(opts.nowFn);

  // Find the awaiting-merge record
  const recIdx = current.awaitingMerge.findIndex((r) => r.pr === opts.pr);
  if (recIdx === -1) {
    throw new TaskCliError(
      `No awaiting-merge record found for PR #${opts.pr}. Run merge-checkpoint first.`,
      1
    );
  }

  const isFail = opts.bug !== undefined && opts.bug !== "";

  if (isFail) {
    // ── FAIL BRANCH: scaffold BUG file AND keep the awaiting-merge record ────
    // DECISION: On fail, the record is kept so the accountability ledger shows
    // the open bug. The agent must re-run post-merge (pass) after the fix.
    // CS-GEN-003: §8 judgment line — the agent decides to fail; the CLI records it.

    // Derive the BUG file ID from the tasks directory listing
    // Pattern: BUG-BBB-POST-NNN where NNN is auto-incremented
    const tasksDir = path.join(repoRoot, ".implementation", "tasks");
    const bugNumber = deriveNextBugNumber(tasksDir, "POST");
    const bugId = `BUG-LOE-012-POST-${String(bugNumber).padStart(3, "0")}`;
    const bugFileName = `${bugId}-post-merge-pr-${opts.pr}.md`;
    const bugFilePath = path.join(tasksDir, bugFileName);

    // SECURITY: confine the bug file path to the tasks directory
    const allowedRoot = path.resolve(tasksDir);
    const resolvedBugPath = path.resolve(bugFilePath);
    if (!isWithin(allowedRoot, resolvedBugPath)) {
      throw new TaskCliError(
        `Bug file path escapes tasks directory (path-confinement violation): ${bugFilePath}`,
        1
      );
    }

    // IDEMPOTENCY: if the bug file already exists, it's a no-op
    if (fs.existsSync(bugFilePath) && !opts.dryRun) {
      return {
        changed: false,
        message: `BUG file ${bugId} already exists — no-op`,
        bugFilePath,
      };
    }

    // Scaffold the BUG file via serializeFrontMatter from task-frontmatter.ts
    // CS-GEN-003: All FM write goes through task-frontmatter.ts (NOT re-implemented here).
    const bugFm: FrontMatter = {
      brief: current.currentBrief ?? "BRIEF-LOE-012",
      status: "open",
      assigned_to: opts.role,
      updated_by: opts.role,
      found_in: `PR #${opts.pr}`,
      category: "post-merge-regression",
      severity: "major",
      started_at: "—",
      completed_at: "—",
    };
    const bugFmBlock = serializeFrontMatter(bugFm);
    const bugBody = `\n# ${bugId}: post-merge regression (PR #${opts.pr})\n\n` +
      `## Description\n\n${opts.bug ?? "(no description)"}\n\n` +
      `## Filed at\n\n${today} by [${opts.role}]\n\n` +
      (opts.note ? `## Note\n\n${opts.note}\n\n` : "") +
      `## Resolution\n\n_Pending._\n`;
    const bugContent = bugFmBlock + bugBody;

    // Build the post-merge fail event
    const event: StateEvent = {
      ts: now,
      type: "post-merge",
      brief: current.currentBrief,
      phase: current.currentPhase,
      role: opts.role,
      pr: opts.pr,
      note: opts.bug ?? null,
      payload: {
        result: "fail",
        bugDescription: opts.bug ?? null,
        bugFilePath: resolvedBugPath,
        recordKept: true,
      },
    };

    if (opts.dryRun) {
      console.log("=== DRY RUN: post-merge FAIL branch ===");
      console.log(`Would scaffold BUG file: ${bugFilePath}`);
      console.log(`BUG front matter:\n${bugFmBlock.trim()}`);
      console.log(`=== event that would be appended to events.jsonl ===`);
      console.log(JSON.stringify(event, null, 2));
      console.log("=== awaiting-merge record KEPT (fail branch) ===");
      console.log("=== END DRY RUN (nothing written) ===");
      return {
        changed: false,
        message: `dry-run: would scaffold ${bugId} and keep awaiting-merge record for PR #${opts.pr}`,
        bugFilePath,
      };
    }

    // Write the BUG file (atomic)
    atomicWriteFile(bugFilePath, bugContent);

    // Update state: keep awaitingMerge record but update lastUpdated
    const newState: StateStore = {
      ...current,
      lastUpdated: now,
    };
    writeState(repoRoot, newState);
    appendEvent(repoRoot, event);

    return {
      changed: true,
      message: `post-merge FAIL: scaffolded ${bugId} (PR #${opts.pr} awaiting-merge record kept)`,
      bugFilePath,
    };

  } else {
    // ── PASS BRANCH: clear the awaiting-merge record ──────────────────────────
    // DECISION: On pass, the record is removed (it is now committed to git history
    // and the merge is the durable record). The events.jsonl still carries the trace.
    // CS-GEN-003: §8 judgment line — the agent decides to pass; the CLI records it.

    const rec = current.awaitingMerge[recIdx]!;

    // IDEMPOTENCY: if already cleared (shouldn't happen but guard)
    const newMerge = current.awaitingMerge.filter((r) => r.pr !== opts.pr);

    const event: StateEvent = {
      ts: now,
      type: "post-merge",
      brief: current.currentBrief,
      phase: current.currentPhase,
      role: opts.role,
      pr: opts.pr,
      note: opts.note ?? null,
      payload: {
        result: "pass",
        prUrl: rec.prUrl,
        squashSha: rec.squashSha,
        recordCleared: true,
      },
    };

    const newState: StateStore = {
      ...current,
      lastUpdated: now,
      awaitingMerge: newMerge,
    };

    if (opts.dryRun) {
      const before = serializeState(current);
      const after = serializeState(newState);
      console.log("=== DRY RUN: state.json diff (post-merge PASS) ===");
      console.log(jsonLineDiff(before, after));
      console.log(`=== event that would be appended to events.jsonl ===`);
      console.log(JSON.stringify(event, null, 2));
      console.log("=== END DRY RUN (nothing written) ===");
      return {
        changed: false,
        message: `dry-run: would clear awaiting-merge record for PR #${opts.pr}`,
      };
    }

    writeState(repoRoot, newState);
    appendEvent(repoRoot, event);

    return {
      changed: true,
      message: `post-merge PASS: awaiting-merge record for PR #${opts.pr} cleared`,
    };
  }
}

/**
 * Derive the next available BUG number for a given suffix (e.g. "POST").
 * Scans the tasks directory for BUG-*-POST-NNN-* files and returns max+1.
 * DECISION: Simple filesystem scan — no separate counter state needed.
 * CS-GEN-003: path-confinement to tasksDir (no traversal outside).
 */
function deriveNextBugNumber(tasksDir: string, suffix: string): number {
  if (!fs.existsSync(tasksDir)) return 1;

  const pattern = new RegExp(`BUG-[A-Z0-9-]+-${suffix}-(\\d+)`, "i");
  let max = 0;

  // Scan both active and done/
  const dirs = [tasksDir, path.join(tasksDir, "done")];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const m = pattern.exec(entry);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n > max) max = n;
      }
    }
  }

  return max + 1;
}

// ─── Subcommand: trace ────────────────────────────────────────────────────────

/**
 * Result of the `trace --brief NNN` command.
 */
export interface TraceResult {
  brief: string;
  /** Per-AC tier breakdown: AC-ID → { unit: string[], e2e: string[], tier3: string[] }
   * DECISION (minor-5 review fix): integration tier dropped — no /integration/ path
   * segment exists in the default scan roots; adding a dead column misleads.
   * Re-add when an integration/ convention is established.
   * CS-GEN-003: AC-LOE-012-05
   */
  acMap: Record<string, { unit: string[]; e2e: string[]; tier3: string[] }>;
  /** Total @AC-* tags found across all files */
  totalTags: number;
  /** Files scanned */
  filesScanned: number;
}

/**
 * `trace --brief NNN`
 *
 * Tallies `@AC-*` tags from test files into a per-AC tier map
 * (unit / integration / e2e / tier-3). Builds the table — does NOT compute
 * an adequacy verdict (that stays agent-supplied).
 *
 * THE JUDGMENT LINE (BRIEF-LOE-012 §6 / PROPOSAL-scripted-bookkeeping-phase2.md §8):
 * // DECISION: trace BUILDS THE TABLE. It tallies occurrences of @AC-* tags
 * // and maps them to tiers by file location heuristics. It does NOT decide
 * // whether coverage is adequate — that is an agent judgment. The output is
 * // a structured input to the agent's adequacy assessment.
 * CS-GEN-003: AC-LOE-012-05 / PROPOSAL-scripted-bookkeeping-phase2.md §8
 *
 * Tier classification heuristic (DECISION):
 *   - files under .../e2e/...              → e2e
 *   - files under .../tier-3/...           → tier-3
 *   - everything else                      → unit (the default)
 * DECISION (minor-5 review fix): integration tier dropped — no /integration/
 * path segment exists in the default scan roots. Re-add when the convention lands.
 * These are heuristics — the agent is authoritative on adequacy.
 *
 * AC-LOE-012-05
 */
export function cmdTrace(opts: {
  brief: string;
  repoRoot?: string;
  /** Override the root paths to scan (injectable for testing) */
  scanRoots?: string[];
}): TraceResult {
  const repoRoot = opts.repoRoot ?? findRepoRoot();

  // DECISION: Default scan roots for this project — cover both apps and scripts.
  // The agent may override via scanRoots for targeted scans.
  // CS-GEN-003: path-confinement to repo root (no traversal outside).
  const defaultScanRoots = [
    path.join(repoRoot, "apps", "portal", "e2e"),
    path.join(repoRoot, "apps", "admin", "e2e"),
    path.join(repoRoot, "apps", "portal", "src"),
    path.join(repoRoot, "apps", "admin", "src"),
    path.join(repoRoot, "scripts"),
    path.join(repoRoot, "packages"),
  ];

  const scanRoots = opts.scanRoots ?? defaultScanRoots;

  // Collect all test files (*.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx)
  const testFiles: string[] = [];
  for (const root of scanRoots) {
    collectTestFiles(root, testFiles, path.resolve(repoRoot));
  }

  // Build the AC → tier map
  // @AC-* tag pattern: @AC-LOE-012-02 or @AC-LOE-012 etc.
  // DECISION: we match @AC-{UPPERCASE-OR-DIGIT-OR-HYPHEN}+ — must start with @AC-
  const acTagPattern = /@(AC-[A-Z0-9][A-Z0-9-]*)/g;

  const acMap: Record<string, { unit: string[]; e2e: string[]; tier3: string[] }> = {};
  let totalTags = 0;

  for (const filePath of testFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const tier = classifyTestFileTier(filePath);

    // Find all @AC-* tags in this file
    const matches = [...content.matchAll(acTagPattern)];
    for (const m of matches) {
      const acId = m[1]!; // e.g. "AC-LOE-012-02"

      // Filter by brief if specified
      // DECISION: brief NNN matches AC-NNN-* patterns where NNN includes the brief suffix.
      // e.g. brief="LOE-012" matches AC-LOE-012-*, AC-LOE-012
      if (opts.brief) {
        const briefUpper = opts.brief.toUpperCase();
        if (!acId.startsWith(`AC-${briefUpper}`)) continue;
      }

      if (!acMap[acId]) {
        acMap[acId] = { unit: [], e2e: [], tier3: [] };
      }

      totalTags++;
      const relPath = path.relative(repoRoot, filePath);

      // Add file path to the appropriate tier bucket (avoid duplicates)
      const bucket = acMap[acId]![tier];
      if (!bucket.includes(relPath)) {
        bucket.push(relPath);
      }
    }
  }

  return {
    brief: opts.brief,
    acMap,
    totalTags,
    filesScanned: testFiles.length,
  };
}

/**
 * Collect all test files (*.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx) under a directory.
 * DECISION: Confine to allowedRoot (no symlink escape).
 * CS-GEN-003: path-confinement mirrors resolveTaskFile.
 */
function collectTestFiles(dir: string, results: string[], allowedRoot: string): void {
  if (!fs.existsSync(dir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const resolved = path.resolve(fullPath);

    // Confine to allowedRoot
    if (!isWithin(allowedRoot, resolved)) continue;

    if (entry.isDirectory()) {
      // Skip node_modules, .next, dist, build
      if (["node_modules", ".next", "dist", "build", ".git"].includes(entry.name)) continue;
      collectTestFiles(fullPath, results, allowedRoot);
    } else if (entry.isFile()) {
      if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
}

/**
 * Classify a test file path into a tier.
 * DECISION (TASK-LOE-012-002 / AC-LOE-012-05):
 *   - e2e: files under e2e/ directory paths
 *   - tier-3: files under tier-3/ directory paths (future)
 *   - unit: everything else (the default)
 * DECISION (minor-5 review fix): integration tier removed — no /integration/
 * path convention exists in this project's scan roots. Re-add when it does.
 * This is a path-heuristic — the agent is authoritative on actual adequacy.
 * CS-GEN-003: §8 judgment line — the CLI CLASSIFIES by path, NEVER DECIDES adequacy.
 */
function classifyTestFileTier(filePath: string): "unit" | "e2e" | "tier3" {
  const normalized = filePath.replace(/\\/g, "/");
  if (/\/e2e\//.test(normalized)) return "e2e";
  if (/\/tier-3\//.test(normalized)) return "tier3";
  return "unit";
}

/**
 * Render a TraceResult as compact text (default) or JSON.
 *
 * THE JUDGMENT LINE (BRIEF-LOE-012 §6):
 * // DECISION: renderTrace renders the tier map verbatim. It does NOT add
 * // any adequacy verdict or "sufficient/insufficient" label. The agent reads
 * // this table and makes the adequacy judgment.
 * CS-GEN-003: AC-LOE-012-05
 */
export function renderTrace(result: TraceResult, json: boolean): string {
  if (json) {
    return JSON.stringify({
      brief: result.brief,
      files_scanned: result.filesScanned,
      total_tags: result.totalTags,
      ac_map: result.acMap,
    }, null, 2);
  }

  const lines: string[] = [
    `trace: brief=${result.brief}  files_scanned=${result.filesScanned}  total_tags=${result.totalTags}`,
    "",
  ];

  const acIds = Object.keys(result.acMap).sort();
  if (acIds.length === 0) {
    lines.push("(no @AC-* tags found matching this brief)");
  } else {
    // Table header (integration column dropped — minor-5 review fix)
    lines.push(`${"AC-ID".padEnd(20)}  ${"UNIT".padEnd(4)}  ${"E2E".padEnd(3)}  ${"TIER3".padEnd(5)}  FILES`);
    lines.push(`${"-".repeat(20)}  ${"-".repeat(4)}  ${"-".repeat(3)}  ${"-".repeat(5)}  ${"-".repeat(40)}`);

    for (const acId of acIds) {
      const buckets = result.acMap[acId]!;
      const allFiles = [
        ...buckets.unit.map((f) => `unit:${f}`),
        ...buckets.e2e.map((f) => `e2e:${f}`),
        ...buckets.tier3.map((f) => `tier3:${f}`),
      ];
      const filesSummary = allFiles.slice(0, 3).join(", ") + (allFiles.length > 3 ? `, ...+${allFiles.length - 3}` : "");

      lines.push(
        `${acId.padEnd(20)}  ${String(buckets.unit.length).padEnd(4)}  ` +
        `${String(buckets.e2e.length).padEnd(3)}  ${String(buckets.tier3.length).padEnd(5)}  ${filesSummary}`
      );
    }
  }

  lines.push("");
  lines.push("NOTE: adequacy verdict stays agent-supplied. This table is an INPUT to the agent's judgment.");

  return lines.join("\n");
}

// ─── Subcommand: report ────────────────────────────────────────────────────────

/**
 * `report [--md]`
 *
 * Renders `state.json` + `events.jsonl` as a human-readable narrative.
 *
 * THE JUDGMENT LINE (BRIEF-LOE-012 §6 / §9):
 * // DECISION: report is a GENERATED VIEW. It reads state.json + events.jsonl
 * // and renders them. Its output is NEVER committed and NEVER read back as
 * // source of truth (BRIEF-LOE-012 §9). This is the on-demand replacement for
 * // the prose PROGRESS.md hot-state section. The CLI writes NOTHING to the repo.
 * CS-GEN-003: AC-LOE-012-06 / BRIEF-LOE-012 §9
 *
 * AC-LOE-012-06
 */
export function cmdReport(opts: {
  repoRoot?: string;
  md?: boolean;
}): string {
  // DECISION: report is strictly read-only. No fs.writeFile, no rename, no metrics.
  // CS-GEN-003: §9 generated view is never a source of truth.
  const repoRoot = opts.repoRoot ?? findRepoRoot();

  const state = readState(repoRoot);
  if (!state) {
    // No state.json yet — render a placeholder
    if (opts.md) {
      return "# Implementation State Report\n\n> No state.json found. Run `pnpm task migrate` first.\n";
    }
    return "=== Implementation State ===\n(no state.json found — run pnpm task migrate first)\n";
  }

  const events = readEvents(repoRoot);

  // Delegate to renderReport from state-store.ts (CS-GEN-003: no re-implementation)
  return renderReport(state, events, { md: opts.md ?? false });
}

// ─── Argument parser ──────────────────────────────────────────────────────────

/**
 * Parse process.argv into a ParsedArgs structure.
 * Handles: --role, --complexity-estimate, --complexity-actual, --note,
 *          --bug, --did, --next, --blockers, --brief, --all-done,
 *          --fields, --status, --json (read/query flags, AC-LOE-011-06)
 *          --dry-run, --to, --pr, --container-smoke, --sdet-validation,
 *          --sdet-ci-gate, --sdet-quality-audit, --md (state-store flags, AC-LOE-012-02..06)
 *
 * DECISION: Hand-rolled arg parser (no third-party library) to honor CS-INFRA-004.
 * CS-INFRA-004: zero new runtime npm dependencies.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // remove 'node' and script path
  const subcommand = args[0] ?? "";
  const result: ParsedArgs = { subcommand };

  // Task ID is the second positional argument (for most subcommands)
  if (subcommand === "start" || subcommand === "review" || subcommand === "done" ||
      subcommand === "reject" || subcommand === "log" ||
      subcommand === "show" || subcommand === "brief-context") {
    result.taskId = args[1];
  }

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case "--role":
        result.role = next;
        i++;
        break;
      case "--complexity-estimate":
        result.complexityEstimate = next !== undefined ? parseInt(next, 10) : undefined;
        i++;
        break;
      case "--complexity-actual":
        result.complexityActual = next !== undefined ? parseInt(next, 10) : undefined;
        i++;
        break;
      case "--note":
        result.note = next;
        i++;
        break;
      case "--bug":
        // For post-merge: --bug "<desc>" is the fail-branch description
        // For reject: --bug <BUG-ID> is the bug reference
        // Disambiguated by subcommand in dispatch.
        if (subcommand === "post-merge") {
          result.bug = next;
        } else {
          result.bugId = next;
        }
        i++;
        break;
      case "--did":
        result.did = next;
        i++;
        break;
      case "--next":
        result.next = next;
        i++;
        break;
      case "--blockers":
        result.blockers = next;
        i++;
        break;
      case "--brief":
        result.brief = next;
        i++;
        break;
      case "--all-done":
        result.allDone = true;
        break;
      // Read/query flags (AC-LOE-011-06 / PROPOSAL-scripted-bookkeeping.md §8.2)
      case "--fields":
        // Comma-separated list: --fields status,complexity_actual
        result.fields = next ? next.split(",").map(s => s.trim()).filter(Boolean) : [];
        i++;
        break;
      case "--status":
        // Comma-separated list or single value: --status backlog,in-progress
        result.statuses = next ? next.split(",").map(s => s.trim()).filter(Boolean) : [];
        i++;
        break;
      case "--json":
        // Opt-in JSON output (§10 Q5)
        result.json = true;
        break;
      // State-store flags (BRIEF-LOE-012 / TASK-LOE-012-002, AC-LOE-012-02..06)
      case "--dry-run":
        // AC-LOE-012-02..05: print JSON diff, write nothing
        result.dryRun = true;
        break;
      case "--to":
        // phase-transition --to <phase>
        if (next !== undefined) result.to = next;
        i++;
        break;
      case "--pr":
        // merge-checkpoint / post-merge --pr N
        // SECURITY: reject non-numeric values loudly rather than silently truncating.
        // parseInt("123abc") returns 123 — the /^\d+$/ guard catches that class.
        // CS-GEN-003: minor-1 review fix
        if (next !== undefined) {
          if (!/^\d+$/.test(next)) {
            throw new TaskCliError(`--pr must be a positive integer, got: ${next}`, 1);
          }
          const prNum = parseInt(next, 10);
          if (!isNaN(prNum)) result.pr = prNum;
        }
        i++;
        break;
      // Gate verdicts for merge-checkpoint (agent-supplied, recorded verbatim)
      case "--container-smoke":
        if (next !== undefined) result.containerSmoke = next;
        i++;
        break;
      case "--sdet-validation":
        if (next !== undefined) result.sdetValidation = next;
        i++;
        break;
      case "--sdet-ci-gate":
        if (next !== undefined) result.sdetCiGate = next;
        i++;
        break;
      case "--sdet-quality-audit":
        if (next !== undefined) result.sdetQualityAudit = next;
        i++;
        break;
      case "--md":
        // report --md: markdown output
        result.md = true;
        break;
    }
  }

  return result;
}

// ─── Main CLI dispatch ────────────────────────────────────────────────────────

/**
 * Main entry point: parse argv and dispatch to the appropriate subcommand.
 * Mirrors db-migrate.ts: thin main() over exported pure functions.
 *
 * Exit codes:
 *   0 — success (or clean no-op)
 *   1 — usage error, illegal transition, or validation failure
 */
export async function main(argv: string[] = process.argv): Promise<void> {
  const parsed = parseArgs(argv);
  const cmd = parsed.subcommand;

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    process.exit(0);
  }

  try {
    switch (cmd) {
      case "start": {
        // Validate required flags
        if (!parsed.taskId) die("start requires a task ID: pnpm task start <ID> --role <r> --complexity-estimate N");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);
        if (parsed.complexityEstimate === undefined || isNaN(parsed.complexityEstimate)) {
          die("start requires --complexity-estimate N (integer 1..5)");
        }

        const result = cmdStart({
          taskId: parsed.taskId,
          role: parsed.role as Role,
          complexityEstimate: parsed.complexityEstimate,
          note: parsed.note,
        });
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        break;
      }

      case "review": {
        if (!parsed.taskId) die("review requires a task ID: pnpm task review <ID> --role <r> --complexity-actual N");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);
        if (parsed.complexityActual === undefined || isNaN(parsed.complexityActual)) {
          die("review requires --complexity-actual N (integer 1..5)");
        }

        const result = cmdReview({
          taskId: parsed.taskId,
          role: parsed.role as Role,
          complexityActual: parsed.complexityActual,
          note: parsed.note,
        });
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        break;
      }

      case "done": {
        if (!parsed.taskId) die("done requires a task ID: pnpm task done <ID> --role <r>");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);

        const result = cmdDone({
          taskId: parsed.taskId,
          role: parsed.role as Role,
          note: parsed.note,
        });
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        break;
      }

      case "reject": {
        if (!parsed.taskId) die("reject requires a task ID: pnpm task reject <ID> --role <r> --bug <BUG-ID>");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);
        if (!parsed.bugId) die("reject requires --bug <BUG-ID>");

        const result = cmdReject({
          taskId: parsed.taskId,
          role: parsed.role as Role,
          bugId: parsed.bugId,
          note: parsed.note,
        });
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        break;
      }

      case "log": {
        if (!parsed.taskId) die("log requires a task ID: pnpm task log <ID> --role <r> --did '...' --next '...'");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);
        if (!parsed.did) die("log requires --did '...'");
        if (!parsed.next) die("log requires --next '...'");

        const result = cmdLog({
          taskId: parsed.taskId,
          role: parsed.role as Role,
          did: parsed.did,
          next: parsed.next,
          blockers: parsed.blockers,
        });
        console.log(`✓ ${result.message}`);
        break;
      }

      case "archive": {
        if (!parsed.brief && !parsed.allDone) {
          die("archive requires --brief NNN or --all-done");
        }

        const result = cmdArchive({ brief: parsed.brief });
        if (result.errors.length > 0) {
          console.error(`Errors during archive:`);
          for (const e of result.errors) console.error(`  ${e}`);
          process.exit(1);
        }
        console.log(`✓ Archive complete: ${result.moved.length} moved, ${result.skipped.length} skipped`);
        if (result.moved.length > 0) {
          for (const m of result.moved) console.log(`  moved: ${m}`);
        }
        break;
      }

      case "verify": {
        const result = cmdVerify({ brief: parsed.brief });
        if (result.violations.length === 0) {
          console.log(`✓ PASS: ${result.fileCount} files verified, 0 violations`);
          process.exit(0);
        } else {
          for (const v of result.violations) {
            console.log(`VIOLATION: ${v.rule}: ${v.message}`);
          }
          console.log(`FAIL: ${result.fileCount} files verified, ${result.violations.length} violations`);
          process.exit(1);
        }
        break;
      }

      // ─── Read/query subcommands (AC-LOE-011-06) ─────────────────────────────
      // DESIGN: strictly read-only; no mutation, no metrics self-report.
      // Output: compact text by default, --json opt-in. (§10 Q5, CS-GEN-003)

      case "show": {
        if (!parsed.taskId) die("show requires a task ID: pnpm task show <ID> [--fields f1,f2,...] [--json]");

        const result = cmdShow({
          taskId: parsed.taskId,
          fields: parsed.fields,
        });
        console.log(renderShow(result, parsed.json ?? false));
        break;
      }

      case "list": {
        if (!parsed.brief) die("list requires --brief NNN: pnpm task list --brief NNN [--status s1,...] [--json]");

        const result = cmdList({
          brief: parsed.brief,
          statuses: parsed.statuses,
        });
        console.log(renderList(result, parsed.json ?? false));
        break;
      }

      case "next": {
        const result = cmdNext({
          brief: parsed.brief,
        });
        console.log(renderNext(result, parsed.json ?? false));
        break;
      }

      case "summary": {
        if (!parsed.brief) die("summary requires --brief NNN: pnpm task summary --brief NNN [--json]");

        const result = cmdSummary({
          brief: parsed.brief,
        });
        console.log(renderSummary(result, parsed.json ?? false));
        break;
      }

      case "progress": {
        const result = cmdProgress();
        console.log(renderProgress(result, parsed.json ?? false));
        break;
      }

      case "brief-context": {
        if (!parsed.taskId) die("brief-context requires a task ID: pnpm task brief-context <ID> [--json]");

        const result = cmdBriefContext({
          taskId: parsed.taskId,
        });
        console.log(renderBriefContext(result, parsed.json ?? false));
        break;
      }

      // ─── State-store subcommands (BRIEF-LOE-012 / TASK-LOE-012-002) ─────────
      // DESIGN: mutating commands require --role; read projections do not.
      // All state writes are idempotent + atomic; --dry-run prints diff, writes nothing.
      // CS-GEN-003: §6 judgment line — CLI RECORDS, NEVER DECIDES.

      case "phase-transition": {
        // AC-LOE-012-02
        if (!parsed.to) die("phase-transition requires --to <phase>: pnpm task phase-transition --to <phase> --role <r>");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);

        // CS-GEN-003: exactOptionalPropertyTypes — spread only defined values
        const ptOpts: Parameters<typeof cmdPhaseTransition>[0] = {
          to: parsed.to,
          role: parsed.role as Role,
        };
        if (parsed.note !== undefined) ptOpts.note = parsed.note;
        if (parsed.dryRun !== undefined) ptOpts.dryRun = parsed.dryRun;

        const result = cmdPhaseTransition(ptOpts);
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        break;
      }

      case "merge-checkpoint": {
        // AC-LOE-012-03
        if (parsed.pr === undefined) die("merge-checkpoint requires --pr N: pnpm task merge-checkpoint --pr N --role <r>");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);

        // Gate verdicts: only include defined values (null is a valid absent verdict)
        // CS-GEN-003: agent supplies verdicts verbatim; undefined = not supplied this call
        const gateVerdicts: Partial<GateVerdictSlots> = {};
        if (parsed.containerSmoke !== undefined) gateVerdicts.containerSmoke = parsed.containerSmoke;
        if (parsed.sdetValidation !== undefined) gateVerdicts.sdetValidation = parsed.sdetValidation;
        if (parsed.sdetCiGate !== undefined) gateVerdicts.sdetCiGate = parsed.sdetCiGate;
        if (parsed.sdetQualityAudit !== undefined) gateVerdicts.sdetQualityAudit = parsed.sdetQualityAudit;

        const mcOpts: Parameters<typeof cmdMergeCheckpoint>[0] = {
          pr: parsed.pr,
          role: parsed.role as Role,
          gateVerdicts,
        };
        if (parsed.note !== undefined) mcOpts.note = parsed.note;
        if (parsed.dryRun !== undefined) mcOpts.dryRun = parsed.dryRun;

        const result = cmdMergeCheckpoint(mcOpts);
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        break;
      }

      case "post-merge": {
        // AC-LOE-012-04
        if (parsed.pr === undefined) die("post-merge requires --pr N: pnpm task post-merge --pr N --role <r> [--bug '<desc>']");
        if (!validateRole(parsed.role)) dieInvalidRole(parsed.role);

        const pmOpts: Parameters<typeof cmdPostMerge>[0] = {
          pr: parsed.pr,
          role: parsed.role as Role,
        };
        if (parsed.bug !== undefined) pmOpts.bug = parsed.bug;
        if (parsed.note !== undefined) pmOpts.note = parsed.note;
        if (parsed.dryRun !== undefined) pmOpts.dryRun = parsed.dryRun;

        const result = cmdPostMerge(pmOpts);
        console.log(result.changed ? `✓ ${result.message}` : `~ ${result.message}`);
        if (result.bugFilePath) {
          console.log(`  bug file: ${result.bugFilePath}`);
        }
        break;
      }

      case "trace": {
        // AC-LOE-012-05
        if (!parsed.brief) die("trace requires --brief NNN: pnpm task trace --brief NNN [--json]");

        const result = cmdTrace({ brief: parsed.brief });
        console.log(renderTrace(result, parsed.json ?? false));
        break;
      }

      case "report": {
        // AC-LOE-012-06
        const rpOpts: Parameters<typeof cmdReport>[0] = {};
        if (parsed.md !== undefined) rpOpts.md = parsed.md;
        const output = cmdReport(rpOpts);
        console.log(output);
        break;
      }

      default:
        die(`Unknown subcommand: "${cmd}". Run pnpm task --help for usage.`);
    }
  } catch (err) {
    if (err instanceof TaskCliError) {
      console.error(`Error: ${err.message}`);
      process.exit(err.exitCode);
    }
    throw err;
  }
}

function die(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function dieInvalidRole(role: string | undefined): never {
  if (!role) {
    die(`--role is required. Valid roles: ${VALID_ROLES.join(", ")}`);
  }
  die(`Unknown role "${role}". Valid roles: ${VALID_ROLES.join(", ")}`);
}

function printUsage(): void {
  console.log(`
pnpm task <subcommand> [args]

Write subcommands (PROPOSAL-scripted-bookkeeping.md §3.1):
  start <ID> --role <r> --complexity-estimate N [--note "..."]
      Transition: backlog/in-progress → in-progress
      Stamps started_at, sets complexity_estimate, appends "Starting implementation" breadcrumb

  review <ID> --role <r> --complexity-actual N [--note "..."]
      Transition: in-progress → review
      Sets complexity_actual

  done <ID> --role <r> [--note "..."]
      Transition: review → done
      Requires complexity_actual 1..5 already on disk (NEVER invents it)
      Stamps completed_at

  reject <ID> --role <r> --bug <BUG-ID> [--note "..."]
      Transition: review → in-progress
      Wires bug reference into Work Log

  log <ID> --role <r> --did "..." --next "..." [--blockers "..."]
      Appends a Work Log breadcrumb (no status change)

  archive [--brief NNN | --all-done]
      Moves status: done tasks from tasks/ to tasks/done/

  verify [--brief NNN]
      Validates front matter via verifyFrontMatter (task-frontmatter.ts)
      Non-zero exit on any violation

Read/query subcommands (PROPOSAL-scripted-bookkeeping.md §8.2, AC-LOE-011-06):
  show <ID> [--fields f1,f2,...] [--json]
      Returns just the requested metadata fields (default: lifecycle block)
      Never dumps the whole file

  list --brief NNN [--status s1,s2,...] [--json]
      Compact table of task IDs + status for a brief
      Optional comma-separated status filter

  next [--brief NNN] [--json]
      The next actionable task id + one-line scope

  summary --brief NNN [--json]
      Computed rollup: counts by status, open gates, missing-metadata flags

  progress [--json]
      Projects ## Current initiative hot-state from PROGRESS.md ONLY
      Never includes the session-entry tail

  brief-context <ID> [--json]
      Bounded bundle: task spec + cited ACs + cited CS-* (paste-ready markdown default)
      --json for structured output

State-store subcommands (BRIEF-LOE-012, AC-LOE-012-02..06):
  phase-transition --to <phase> --role <r> [--note "..."] [--dry-run]
      Set the current phase in state.json + append a phase-transition event.
      --dry-run: print JSON diff, write nothing.
      Valid phases: ${VALID_PHASES.join(", ")}
      Re-run to the same settled phase = clean no-op (exit 0).

  merge-checkpoint --pr N --role <r>
      [--container-smoke "..."] [--sdet-validation "..."]
      [--sdet-ci-gate "..."] [--sdet-quality-audit "..."]
      [--note "..."] [--dry-run]
      Create an awaiting-merge record. DERIVES PR URL + SHA from gh/git — NEVER
      from agent-typed flags. Gate verdicts are AGENT-SUPPLIED inputs (recorded verbatim).

  post-merge --pr N --role <r> [--bug "<desc>"] [--note "..."] [--dry-run]
      Pass (no --bug): clear the awaiting-merge record for PR N.
      Fail (--bug "<desc>"): scaffold BUG-BBB-POST-NNN via task-frontmatter.ts AND
                             keep the awaiting-merge record.
      The pass/fail decision is AGENT-SUPPLIED — the CLI records it.

  trace --brief NNN [--json]
      Tally @AC-* tags in test files into a per-AC tier map (unit/integration/e2e/tier-3).
      Builds the table — NEVER computes an adequacy verdict (stays agent-supplied).

  report [--md]
      Render state.json + events.jsonl as a human-readable narrative.
      READ-ONLY: writes NOTHING to the repo. NEVER committed, NEVER read back as truth.

Output: compact text/tables by default; --json opt-in. AC-LOE-011-06 / §10 Q5.
CLI RECORDS, NEVER DECIDES (§6 judgment line): verdicts, adequacy, pass/fail are agent inputs.

Valid roles: ${VALID_ROLES.join(", ")}
`.trim());
}

// ─── isMain ESM guard (mirrors db-migrate.ts) ─────────────────────────────────
// CS-GEN-003: Pattern cited from db-migrate.ts convention

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isMain) {
  main(process.argv).catch((err) => {
    console.error("[ERROR]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

#!/usr/bin/env bash
# scripts/validate-gates.sh
#
# Programmatic gate validation backstop for the tax-portal multi-agent workflow.
# See .implementation/ENGINE.md § Programmatic Gate Validation.
#
# Usage:
#   bash scripts/validate-gates.sh                              # full check against real repo
#   bash scripts/validate-gates.sh --fixture-dir <dir>         # run against test fixtures
#   bash scripts/validate-gates.sh --pr-body <file> --changed-files <file>  # PR-body quad-review mode
#
# Exit codes: 0 = all checks passed, 1 = one or more checks failed

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

FIXTURE_DIR=""
PR_BODY_FILE=""
CHANGED_FILES_FILE=""
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REMOVED_FILES_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fixture-dir)
      FIXTURE_DIR="$2"
      shift 2
      ;;
    --pr-body)
      PR_BODY_FILE="$2"
      shift 2
      ;;
    --changed-files)
      CHANGED_FILES_FILE="$2"
      shift 2
      ;;
    --removed-files)
      REMOVED_FILES_FILE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Path resolution helpers
# ---------------------------------------------------------------------------

# When --fixture-dir is supplied, checks operate against the fixture directory
# instead of the real repo. Individual checks pick up their paths from these vars.

if [[ -n "$FIXTURE_DIR" ]]; then
  TASKS_DIR="${FIXTURE_DIR}/.implementation/tasks"
  TASKS_DONE_DIR="${FIXTURE_DIR}/.implementation/tasks/done"
  STATE_JSON="${FIXTURE_DIR}/.implementation/state.json"
  REPO_SCAN_ROOT="${FIXTURE_DIR}"
else
  TASKS_DIR="${REPO_ROOT}/.implementation/tasks"
  TASKS_DONE_DIR="${REPO_ROOT}/.implementation/tasks/done"
  STATE_JSON="${REPO_ROOT}/.implementation/state.json"
  REPO_SCAN_ROOT="${REPO_ROOT}"
fi

# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------

FAILURES=()

pass() {
  local name="$1"
  printf "  %-52s %s\n" "$name" "PASS"
}

fail() {
  local name="$1"
  local detail="$2"
  printf "  %-52s %s\n" "$name" "FAIL"
  printf "    → %s\n" "$detail"
  FAILURES+=("$name: $detail")
}

skip() {
  local name="$1"
  local reason="$2"
  printf "  %-52s %s  (%s)\n" "$name" "SKIP" "$reason"
}

# ---------------------------------------------------------------------------
# Check 1: check_task_file_completion
#
# All tasks with status: done must have all 4 metadata fields filled:
#   started_at, completed_at, complexity_estimate, complexity_actual
#
# DECISION (TASK-LOE-010-002): Field extraction reads YAML front-matter keys
# directly in bash using a targeted grep of the front-matter block (lines
# between the opening --- and closing --- fences). This is scoped to the
# same 4 fields the pre-migration check verified (started_at, completed_at,
# complexity_estimate, complexity_actual) — preserving identical verdicts
# (AC-LOE-010-04) without importing the full TS schema checker (which validates
# additional fields like introduces_gate enum that the old check didn't touch).
#
# yq is NOT on PATH (Plan-verified; adding a system binary to CI is fragile).
# The TS library (scripts/task-frontmatter.ts) is the authoritative schema
# parser — it is exercised by scripts/migrate-task-frontmatter.test.ts (unit
# tests + YAML-validity regression oracle) and is reserved for Phase 1 gate
# wiring. Check 1 here reads only the 4 lifecycle fields it has always checked,
# keeping the blast radius minimal.
#
# Named code path (Gate Authoring evidence Item 2):
#   _check_done_metadata_fm() uses grep -qE '^started_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T'
#   (the optional "? tolerates the quoted scalar form the migration emits — see
#   TASK-LOE-010-004; equivalent patterns guard the other 3 fields) on the
#   front-matter block extracted from the task file via awk.
# ---------------------------------------------------------------------------

# Extract the front-matter block (between the two --- fences) from a task file.
# Outputs the lines between the fences; caller greps them.
_extract_fm_block() {
  local f="$1"
  # awk: skip the opening --- line, then print until the closing --- line
  awk 'NR==1 && /^---$/{found=1; next} found && /^---$/{exit} found{print}' "$f"
}

check_task_file_completion() {
  local check_name="check_task_file_completion"
  local found_any=0
  local all_pass=1

  # Check done/ subdirectory (completed tasks).
  # Scope: TASK-*.md only — matches the pre-migration check behavior.
  # BUG-*.md files in done/ use status: closed (not done) and lack the
  # lifecycle metadata fields this check requires; they are intentionally excluded.
  if [[ -d "$TASKS_DONE_DIR" ]]; then
    while IFS= read -r -d '' f; do
      found_any=1
      _check_done_metadata_fm "$f" "$check_name" || all_pass=0
    done < <(find "$TASKS_DONE_DIR" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  fi

  # Also check active tasks that carry status: done (front-matter form).
  # Scope: TASK-*.md only — matches the pre-migration check behavior.
  if [[ -d "$TASKS_DIR" ]]; then
    while IFS= read -r -d '' f; do
      if grep -q "^status: done$" "$f" 2>/dev/null; then
        found_any=1
        _check_done_metadata_fm "$f" "$check_name" || all_pass=0
      fi
    done < <(find "$TASKS_DIR" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  fi

  if [[ $all_pass -eq 1 ]]; then
    if [[ $found_any -eq 0 ]]; then
      pass "$check_name (no done tasks)"
    else
      pass "$check_name"
    fi
  fi
}

_check_done_metadata_fm() {
  local f="$1"
  local check_name="$2"
  local fname
  fname="$(basename "$f")"
  local ok=1
  local fm_block
  fm_block="$(_extract_fm_block "$f")"

  # started_at must be present in the front-matter block and be ISO 8601.
  # Accept both unquoted (started_at: 2026-06-21T18:52:52Z) and quoted
  # (started_at: "2026-06-21T18:52:52Z") forms — the migration may serialize
  # either form. Mirror the quoted/unquoted tolerance already used for complexity_*.
  if ! echo "$fm_block" | grep -qE '^started_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then
    fail "$check_name" "$fname: started_at missing or not ISO 8601"
    ok=0
  fi

  # completed_at must be present in the front-matter block and be ISO 8601.
  # Accept both unquoted and quoted forms (same rationale as started_at above).
  if ! echo "$fm_block" | grep -qE '^completed_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T'; then
    fail "$check_name" "$fname: completed_at missing or not ISO 8601"
    ok=0
  fi

  # complexity_estimate must be 1-5.
  # Accept both unquoted (complexity_estimate: 2) and quoted (complexity_estimate: "2")
  # forms — the migration may serialize either form.
  if ! echo "$fm_block" | grep -qE '^complexity_estimate: "?[1-5]"?$'; then
    fail "$check_name" "$fname: complexity_estimate missing or not 1-5"
    ok=0
  fi

  # complexity_actual must be 1-5 (same quoted/unquoted tolerance as above)
  if ! echo "$fm_block" | grep -qE '^complexity_actual: "?[1-5]"?$'; then
    fail "$check_name" "$fname: complexity_actual missing or not 1-5"
    ok=0
  fi

  [[ $ok -eq 1 ]]
}

# ---------------------------------------------------------------------------
# Check 2: check_bug_files_present_for_done
#
# Any task that was rejected (SDET Review Decision: reject) should have a
# corresponding BUG file. We check: any done task whose Work Log contains
# "rejected" also has a referenced BUG-*.md in the task file.
#
# Note: This check is advisory in cases where no task has been rejected.
# A rejected task Work Log will typically contain "BUG-" references.
# ---------------------------------------------------------------------------

check_bug_files_present_for_done() {
  local check_name="check_bug_files_present_for_done"
  local all_pass=1

  # Look for done tasks that mention rejection in their SDET Review Decision
  local search_dirs=()
  [[ -d "$TASKS_DONE_DIR" ]] && search_dirs+=("$TASKS_DONE_DIR")
  [[ -d "$TASKS_DIR" ]] && search_dirs+=("$TASKS_DIR")

  for dir in "${search_dirs[@]}"; do
    while IFS= read -r -d '' f; do
      local fname
      fname="$(basename "$f")"
      # Only check done tasks — front-matter form (post TASK-LOE-010-001 migration)
      if ! grep -q "^status: done$" "$f" 2>/dev/null; then
        continue
      fi
      # Check if SDET Review Decision includes "reject" (body prose — unchanged)
      if grep -qiE "^\*\*Decision\*\*:.*reject" "$f" 2>/dev/null; then
        # Must reference a BUG- file somewhere in the task body
        if ! grep -qE "BUG-[0-9]+-[0-9]+" "$f" 2>/dev/null; then
          fail "$check_name" "$fname: rejected task has no BUG file reference in task body"
          all_pass=0
        fi
      fi
    done < <(find "$dir" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  done

  if [[ $all_pass -eq 1 ]]; then
    pass "$check_name"
  fi
}

# ---------------------------------------------------------------------------
# Check 3: check_state_json_schema
#
# .implementation/state.json must exist and pass the independent schema oracle
# (validateState() from scripts/state-store.ts, CS-GEN-003 RETRO-LOE-010).
#
# Re-pointed from PROGRESS.md section check to state.json schema validation
# per TASK-LOE-012-003 / AC-LOE-012-07. The oracle is REUSED — not re-implemented
# as a lenient bash JSON check (that would re-introduce the Phase-0 YAML-blocker
# trap; RETRO-LOE-010 / validation-oracle-independent-of-code).
#
# Named code path (Gate Authoring evidence Item 2):
#   scripts/state-store.ts:validateState() — checks: (1) all required top-level
#   fields present, (2) additionalProperties: false, (3) schemaVersion == "1.0",
#   (4) lastUpdated ISO 8601 pattern, (5) currentPhase is closed enum or null,
#   (6) awaitingMerge array with well-formed records, (7) openRetroItems array.
#   A malformed state.json (wrong phase, missing field, extra field) MUST fail loudly.
#
# CS-INFRA-004: uses tsx (already in devDependencies, zero new deps).
# CS-GEN-003: AC-LOE-012-07, RETRO-LOE-010
# ---------------------------------------------------------------------------

check_state_json_schema() {
  local check_name="check_state_json_schema"

  if [[ ! -f "$STATE_JSON" ]]; then
    fail "$check_name" "state.json not found at $STATE_JSON"
    return
  fi

  # Invoke the INDEPENDENT ORACLE from state-store.ts via tsx.
  # Do NOT re-implement a lenient JSON check here — that is the trap RETRO-LOE-010 identified.
  # The oracle validates: required fields, types, closed enum (currentPhase), record-level
  # invariants, and additionalProperties: false. A malformed state.json exits non-zero.
  local tsx_bin
  tsx_bin="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/node_modules/.bin/tsx"
  local state_store_script
  state_store_script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/state-store-validate.ts"

  local validate_output
  validate_output="$(
    "${tsx_bin}" "${state_store_script}" "${STATE_JSON}" 2>&1
  )" || {
    fail "$check_name" "state.json failed schema validation: ${validate_output}"
    return
  }

  pass "$check_name"
}

# ---------------------------------------------------------------------------
# Check 4: check_gated_path_accountability
#
# Any file under gated paths (apps/, packages/, infra/, .github/workflows/,
# scripts/, Dockerfile*, docker-compose*.yml) that was changed (relative to
# the git index vs HEAD, or tracked in the fixture) must be referenced in at
# least one active task file.
#
# In real-repo mode: compares git working tree + staged changes against HEAD.
# In fixture mode: reads the list from ${FIXTURE_DIR}/.changed_files if present.
# ---------------------------------------------------------------------------

check_gated_path_accountability() {
  local check_name="check_gated_path_accountability"

  local changed_files=()

  if [[ -n "$FIXTURE_DIR" ]]; then
    # Fixture mode: read from .changed_files manifest
    local manifest="${FIXTURE_DIR}/.changed_files"
    if [[ -f "$manifest" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && changed_files+=("$line")
      done < "$manifest"
    fi
  else
    # Real repo mode: compare HEAD vs working tree + staged
    if git -C "$REPO_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && changed_files+=("$line")
      done < <(git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null)
      while IFS= read -r line; do
        [[ -n "$line" ]] && changed_files+=("$line")
      done < <(git -C "$REPO_ROOT" diff --cached --name-only HEAD 2>/dev/null)
    fi
  fi

  # Filter to gated paths
  local gated_changed=()
  for f in "${changed_files[@]}"; do
    case "$f" in
      apps/*|packages/*|infra/*|.github/workflows/*|scripts/*|Dockerfile*|docker-compose*.yml)
        gated_changed+=("$f")
        ;;
    esac
  done

  if [[ ${#gated_changed[@]} -eq 0 ]]; then
    pass "$check_name (no gated-path changes)"
    return
  fi

  # Gather all task file content into a temp file for reliable grep
  local task_content_file
  task_content_file="$(mktemp /tmp/validate-gates-tasks-XXXXXX.txt)"
  # shellcheck disable=SC2064
  trap "rm -f '$task_content_file'" RETURN

  if [[ -d "$TASKS_DIR" ]]; then
    find "$TASKS_DIR" -maxdepth 1 -name "TASK-*.md" -exec cat {} \; >> "$task_content_file" 2>/dev/null || true
  fi
  if [[ -d "$TASKS_DONE_DIR" ]]; then
    find "$TASKS_DONE_DIR" -maxdepth 1 -name "TASK-*.md" -exec cat {} \; >> "$task_content_file" 2>/dev/null || true
  fi

  local all_pass=1
  local gated_f
  local basename_f
  for gated_f in "${gated_changed[@]}"; do
    # Check if any task references this file (by full path or basename)
    basename_f="$(basename "$gated_f")"
    if ! grep -qF "$gated_f" "$task_content_file" && \
       ! grep -qF "$basename_f" "$task_content_file"; then
      fail "$check_name" "Gated-path change '$gated_f' not referenced in any task file"
      all_pass=0
    fi
  done

  if [[ $all_pass -eq 1 ]]; then
    pass "$check_name"
  fi
}

# ---------------------------------------------------------------------------
# Check 5: check_work_log_content
#
# Every done task must have:
#   - At least one "Starting implementation" breadcrumb (Dispatch Checkpoint)
#   - At least one "review" breadcrumb (indicating status was flipped to review)
#
# Field read: status (front-matter key, post TASK-LOE-010-001 migration)
# Body checks: grep the full file (body prose preserved byte-for-byte by migration)
# ---------------------------------------------------------------------------

check_work_log_content() {
  local check_name="check_work_log_content"
  local all_pass=1
  local found_any=0

  local search_dirs=()
  [[ -d "$TASKS_DONE_DIR" ]] && search_dirs+=("$TASKS_DONE_DIR")
  [[ -d "$TASKS_DIR" ]] && search_dirs+=("$TASKS_DIR")

  for dir in "${search_dirs[@]}"; do
    while IFS= read -r -d '' f; do
      # Front-matter form (post TASK-LOE-010-001 migration)
      if ! grep -q "^status: done$" "$f" 2>/dev/null; then
        continue
      fi
      found_any=1
      local fname
      fname="$(basename "$f")"

      # Must have a "Starting implementation" Work Log entry
      if ! grep -qE "Starting implementation" "$f"; then
        fail "$check_name" "$fname: Work Log missing 'Starting implementation' entry"
        all_pass=0
      fi

      # Must have a "review" breadcrumb (either "What's next: SDET review" or status flip mention)
      if ! grep -qiE "(review|marking.*review|status.*review)" "$f"; then
        fail "$check_name" "$fname: Work Log missing 'review' breadcrumb"
        all_pass=0
      fi
    done < <(find "$dir" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  done

  if [[ $all_pass -eq 1 ]]; then
    if [[ $found_any -eq 0 ]]; then
      pass "$check_name (no done tasks)"
    else
      pass "$check_name"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Check 6: check_playwright_artifacts
#
# Tasks with e2e_required: yes and status: done must have e2e execution output
# in their Work Log (pass/fail counts or test names).
#
# Fields read: status, e2e_required (front-matter keys, post TASK-LOE-010-001)
# Body checks: grep the full file (body prose preserved byte-for-byte by migration)
# ---------------------------------------------------------------------------

check_playwright_artifacts() {
  local check_name="check_playwright_artifacts"
  local all_pass=1
  local found_any=0

  local search_dirs=()
  [[ -d "$TASKS_DONE_DIR" ]] && search_dirs+=("$TASKS_DONE_DIR")
  [[ -d "$TASKS_DIR" ]] && search_dirs+=("$TASKS_DIR")

  for dir in "${search_dirs[@]}"; do
    while IFS= read -r -d '' f; do
      # Front-matter form (post TASK-LOE-010-001 migration)
      if ! grep -q "^status: done$" "$f" 2>/dev/null; then
        continue
      fi
      if ! grep -q "^e2e_required: yes$" "$f" 2>/dev/null; then
        continue
      fi
      found_any=1
      local fname
      fname="$(basename "$f")"

      # Work Log must contain e2e output evidence
      # Accept: "passed", "failed", "e2e", "playwright", "spec", test names
      if ! grep -qiE "(passed|failed|e2e.*run|playwright|[0-9]+ (test|spec))" "$f"; then
        fail "$check_name" "$fname: E2e-required done task has no e2e execution output in Work Log"
        all_pass=0
      fi
    done < <(find "$dir" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  done

  if [[ $all_pass -eq 1 ]]; then
    if [[ $found_any -eq 0 ]]; then
      pass "$check_name (no E2e-required done tasks)"
    else
      pass "$check_name"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Check 7: check_ci_evidence
#
# Done tasks with introduces_gate: yes must have all three Gate Authoring
# Rules evidence items in their Work Log:
#   1. A run URL (https://github.com/.../runs/...)
#   2. A named code path (file reference)
#   3. A counterfactual (the word "counterfactual" or "if ... were changed")
#
# Fields read: status, introduces_gate (front-matter keys, post TASK-LOE-010-001)
# Body checks: grep the full file (body prose preserved byte-for-byte by migration)
# ---------------------------------------------------------------------------

check_ci_evidence() {
  local check_name="check_ci_evidence"
  local all_pass=1
  local found_any=0

  local search_dirs=()
  [[ -d "$TASKS_DONE_DIR" ]] && search_dirs+=("$TASKS_DONE_DIR")
  [[ -d "$TASKS_DIR" ]] && search_dirs+=("$TASKS_DIR")

  for dir in "${search_dirs[@]}"; do
    while IFS= read -r -d '' f; do
      # Front-matter form (post TASK-LOE-010-001 migration)
      if ! grep -q "^status: done$" "$f" 2>/dev/null; then
        continue
      fi
      if ! grep -q "^introduces_gate: yes$" "$f" 2>/dev/null; then
        continue
      fi
      found_any=1
      local fname
      fname="$(basename "$f")"

      # Item 1: Run URL, local log path, or prose red-then-green evidence.
      # Prose branch requires two anchors (RED:+GREEN: or Pre-rule+Post-rule) per
      # .implementation/ENGINE.md § Gate Authoring Rules § In-flight regression exception.
      if ! grep -qE "(https://github\.com/.*/actions/runs/[0-9]+|/tmp/[a-zA-Z0-9_-]+\.log)" "$f" && \
         ! { grep -qE "(RED:|Pre-rule)" "$f" && grep -qE "(GREEN:|Post-rule)" "$f"; }; then
        fail "$check_name" "$fname: Introduces-gate done task missing run URL or local log path"
        all_pass=0
      fi

      # Item 2: Named code path (a file reference — look for typical path patterns)
      # Single-quoted regex avoids bash treating backticks as command substitution.
      if ! grep -qE '\.(sh|yml|yaml|ts|tsx|js|json|md):[0-9]+|`[a-zA-Z0-9_./-]+\.(sh|yml|yaml|ts|tsx|js|json)`' "$f"; then
        fail "$check_name" "$fname: Introduces-gate done task missing named code path"
        all_pass=0
      fi

      # Item 3: Counterfactual
      if ! grep -qiE "(counterfactual|if .* were (changed|removed|set to)|would (red|fail|exit))" "$f"; then
        fail "$check_name" "$fname: Introduces-gate done task missing counterfactual"
        all_pass=0
      fi
    done < <(find "$dir" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  done

  if [[ $all_pass -eq 1 ]]; then
    if [[ $found_any -eq 0 ]]; then
      pass "$check_name (no Introduces-gate done tasks)"
    else
      pass "$check_name"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Check 8: check_pr_body_quad_review
#
# Only active when --pr-body <file> is passed.
# If changed files include .implementation/ENGINE.md or .implementation/agents/*.md,
# the PR body must contain all four verdict markers: [sa], [ra], [sdet], [overwatch].
# ---------------------------------------------------------------------------

check_pr_body_quad_review() {
  local check_name="check_pr_body_quad_review"

  if [[ -z "$PR_BODY_FILE" ]]; then
    skip "$check_name" "--pr-body not supplied"
    return
  fi

  if [[ ! -f "$PR_BODY_FILE" ]]; then
    fail "$check_name" "PR body file not found: $PR_BODY_FILE"
    return
  fi

  # Gather changed files list
  local changed_files=()
  if [[ -n "$CHANGED_FILES_FILE" && -f "$CHANGED_FILES_FILE" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && changed_files+=("$line")
    done < "$CHANGED_FILES_FILE"
  elif [[ -n "$FIXTURE_DIR" ]]; then
    local manifest="${FIXTURE_DIR}/.changed_files"
    if [[ -f "$manifest" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && changed_files+=("$line")
      done < "$manifest"
    fi
  else
    # Real repo mode: use git
    if git -C "$REPO_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && changed_files+=("$line")
      done < <(git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null)
      while IFS= read -r line; do
        [[ -n "$line" ]] && changed_files+=("$line")
      done < <(git -C "$REPO_ROOT" diff --cached --name-only HEAD 2>/dev/null)
    fi
  fi

  # Detect if any changed file is a workflow file
  local is_workflow_pr=0
  for f in "${changed_files[@]}"; do
    case "$f" in
      .implementation/ENGINE.md|.implementation/agents/*.md)
        is_workflow_pr=1
        break
        ;;
    esac
  done

  if [[ $is_workflow_pr -eq 0 ]]; then
    pass "$check_name (not a workflow-file PR — skip quad-review check)"
    return
  fi

  # Check for all four verdict markers
  local all_pass=1
  local markers=("[sa]" "[ra]" "[sdet]" "[overwatch]")
  for marker in "${markers[@]}"; do
    if ! grep -qF "$marker" "$PR_BODY_FILE"; then
      fail "$check_name" "PR body missing verdict marker: $marker"
      all_pass=0
    fi
  done

  if [[ $all_pass -eq 1 ]]; then
    pass "$check_name"
  fi
}

# ---------------------------------------------------------------------------
# Check 9: check_awaiting_merge_records
#
# Reads the awaitingMerge array from .implementation/state.json.
# Re-pointed from ## Awaiting PR merge markdown awk-parse to structured
# state.json validation per TASK-LOE-012-003 / AC-LOE-012-07.
#
# If awaitingMerge is empty → pass.
# For each record: all four gateVerdicts slots (containerSmoke, sdetValidation,
# sdetCiGate, sdetQualityAudit) must be present and must be string or null.
# A missing or non-string/null slot fails loudly (well-formed verdict slot check).
#
# Record-level invariant: no clock inversion (createdAt must be a valid ISO 8601
# timestamp; records with a merged squashSha must have createdAt <= lastUpdated).
# This structurally closes the long-carried Completed-at/Started-at clock-inversion
# ungated-fix (retro-012-014) at the schema-validation level.
#
# Named code path (Gate Authoring evidence Item 2):
#   scripts/state-store-validate-awaiting.ts — reads state.json, iterates
#   awaitingMerge[], checks each record's gateVerdicts keys for presence and
#   string|null type; checks createdAt ISO 8601 pattern.
#   A record missing a gateVerdicts slot exits non-zero (LOUD fail).
#
# Implements .implementation/ENGINE.md § Autonomy Ceiling item 3 condition (d)
# via structured state store (TASK-LOE-012-001) rather than markdown parsing.
#
# CS-GEN-003: AC-LOE-012-07, retro-012-014 (clock-inversion carried item — CLOSED)
# CS-INFRA-004: uses tsx (already in devDependencies, zero new deps).
# ---------------------------------------------------------------------------

check_awaiting_merge_records() {
  local check_name="check_awaiting_merge_records"

  if [[ ! -f "$STATE_JSON" ]]; then
    fail "$check_name" "state.json not found at $STATE_JSON"
    return
  fi

  # Invoke the INDEPENDENT ORACLE from state-store.ts via tsx.
  # The awaiting-merge record validator checks: all four gateVerdicts slots
  # are present (containerSmoke, sdetValidation, sdetCiGate, sdetQualityAudit);
  # each is string or null; no clock-inversion invariant (createdAt pattern).
  local tsx_bin
  tsx_bin="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/node_modules/.bin/tsx"
  local awaiting_merge_script
  awaiting_merge_script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts/state-store-validate-awaiting.ts"

  local validate_output
  validate_output="$(
    "${tsx_bin}" "${awaiting_merge_script}" "${STATE_JSON}" 2>&1
  )" || {
    fail "$check_name" "awaitingMerge records failed validation: ${validate_output}"
    return
  }

  pass "$check_name"
}

# ---------------------------------------------------------------------------
# Check 10: check_removed_artifact_orphans
#
# Cross-layer removal-sweep gate. Catches executable consumers that still
# reference a removed artifact after it is deleted from the repo.
#
# Closes retro-012-017 (BRIEF-LOE-012 /pr-review MAJOR): the PROGRESS.md
# retirement sweep missed two .orchestration/ executable consumers that still
# hard-read the deleted file. This gate catches those at task-time.
# CS-GEN-003: retro-012-017 / BRIEF-LOE-013
#
# SCOPE (file-level only — intentional, not an oversight):
#   Symbol/section/field-level removal is OUT OF SCOPE by design. File-level
#   deletes are deterministic and low-noise; finer-grained removal detection
#   is a deliberate future extension. See BRIEF-LOE-013 § Out-of-scope.
#
# DETECTION STRATEGY:
#   Removals come from `git diff --diff-filter=D -M --name-only <base>...HEAD`
#   (rename-aware via -M, so a rename does NOT count as a removal).
#   In fixture mode, removals come from the `.removed_files` manifest under
#   $FIXTURE_DIR (mirrors the `.changed_files` pattern in checks 4 & 8).
#
# SKIP-not-FAIL:
#   When no diff base is resolvable / removal set is empty / no manifest in
#   fixture mode → SKIP cleanly. A plain push to main with no removals must
#   not red. Mirrors check 8 SKIP behavior.
#
# CLASSIFICATION (LOCKED — no intent heuristics):
#   Executable consumer (.sh .ts .tsx .js .mjs .cjs .py .yml .yaml package.json)
#   referencing a removed file → FAIL, naming consumer path:line.
#   Doc-only (.md) reference → ALLOWED by rule (historical/archive pointers are
#   legitimate and permanent; no allowlist entry needed).
#   File-type + allowlist only; no intent heuristics.
#
# CONSTRUCTED-PATH CATCH:
#   git grep -F on the repo-relative path catches literal suffixes even inside
#   variable-expansion forms like:
#     : "${VAR:=${REPO_ROOT}/<removed-artifact-path>}"
#   The literal suffix "<removed-artifact-path>" is present in source even
#   though the full path is assembled at runtime.
#
# COMMON-BASENAME EXPLOSION GUARD:
#   DECISION (BRIEF-LOE-013 / retro-012-017): Path-primary ONLY. The basename
#   is NOT used as a secondary search signal. The full repo-relative path (or its
#   literal suffix in a constructed-path form) is already a precise signal that
#   catches constructed-path references via git grep -F. Using the basename as a
#   secondary signal would cause catastrophic false-positive explosion for
#   commonly-named files (e.g. "index.ts" appears thousands of times). Omitting
#   the basename signal entirely eliminates this noise; path-primary is sufficient
#   because git grep -F catches even variable-assembled paths (the critical PR #80
#   failure mode). False-positive rate: 0 from basename (omitted). False-negative
#   rate: a consumer that references ONLY the basename (not the path) is missed,
#   but that pattern is uncommon for file-path references in config scripts.
#
# ALLOWLIST:
#   .implementation/removal-sweep-allow.txt (repo root) or same path under
#   $FIXTURE_DIR. Format: <removed-path> | <consumer-path> | <mandatory reason>
#   An allowlisted exec hit → PASS (reason echoed). An entry with EMPTY reason
#   → FAIL (a suppression must be documented, never silent).
#
# EXCLUSIONS (real-repo mode only):
#   The removed file itself, .git/, node_modules/, scripts/__test_fixtures__/,
#   *.test.ts, *.spec.ts. Test fixtures and test files reference removed paths as
#   DATA (scan targets / string literals), not as live consumers; a real removal
#   that breaks a test surfaces at test-time, not via this gate. These exclusions
#   apply ONLY to the real-repo git grep branch — fixture-mode grep scans inside
#   scripts/__test_fixtures__/ by design (it IS the scan target there).
#
# CS-INFRA-003: set -euo pipefail preserved; git grep exit-1-on-no-match is
#   guarded (|| true on the no-match path).
# CS-INFRA-004: pure bash + git; zero new npm dependency.
# ---------------------------------------------------------------------------

check_removed_artifact_orphans() {
  local check_name="check_removed_artifact_orphans"

  # ── Step 1: Gather the removed-file set ─────────────────────────────────────

  local removed_files=()

  if [[ -n "$REMOVED_FILES_FILE" ]]; then
    # Explicit --removed-files override (works in both fixture and real-repo mode).
    if [[ ! -f "$REMOVED_FILES_FILE" ]]; then
      skip "$check_name" "--removed-files file not found: $REMOVED_FILES_FILE"
      return
    fi
    while IFS= read -r line; do
      line="${line%%#*}"
      line="${line#"${line%%[! ]*}"}"  # ltrim
      line="${line%"${line##*[! ]}"}"  # rtrim
      [[ -n "$line" ]] && removed_files+=("$line")
    done < "$REMOVED_FILES_FILE"
  elif [[ -n "$FIXTURE_DIR" ]]; then
    # Fixture mode: read from .removed_files manifest under FIXTURE_DIR.
    local manifest="${FIXTURE_DIR}/.removed_files"
    if [[ ! -f "$manifest" ]]; then
      skip "$check_name" "no .removed_files manifest in fixture dir — nothing to sweep"
      return
    fi
    while IFS= read -r line; do
      # Strip comments and blank lines
      line="${line%%#*}"
      line="${line#"${line%%[! ]*}"}"  # ltrim
      line="${line%"${line##*[! ]}"}"  # rtrim
      [[ -n "$line" ]] && removed_files+=("$line")
    done < "$manifest"
  else
    # Real-repo mode: derive from git diff --diff-filter=D -M vs the merge base.
    # Mirror the base-resolution approach used by checks 4 & 8.
    if ! git -C "$REPO_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
      skip "$check_name" "not a git repo — cannot determine removed files"
      return
    fi
    # Resolve the diff base: prefer origin/main; fall back to HEAD~1; skip if neither.
    local diff_base=""
    if git -C "$REPO_ROOT" rev-parse --verify origin/main > /dev/null 2>&1; then
      diff_base="origin/main"
    elif git -C "$REPO_ROOT" rev-parse --verify HEAD~1 > /dev/null 2>&1; then
      diff_base="HEAD~1"
    fi
    if [[ -z "$diff_base" ]]; then
      skip "$check_name" "no diff base resolvable (initial commit or no origin/main?) — nothing to sweep"
      return
    fi
    # -M flag: rename-aware (a rename is NOT a deletion).
    while IFS= read -r line; do
      [[ -n "$line" ]] && removed_files+=("$line")
    done < <(git -C "$REPO_ROOT" diff --diff-filter=D -M --name-only "${diff_base}...HEAD" 2>/dev/null || true)
  fi

  if [[ ${#removed_files[@]} -eq 0 ]]; then
    skip "$check_name" "no removed files in diff — nothing to sweep"
    return
  fi

  # ── Step 2: Load the allowlist ───────────────────────────────────────────────

  local allowlist_file
  if [[ -n "$FIXTURE_DIR" ]]; then
    allowlist_file="${FIXTURE_DIR}/.implementation/removal-sweep-allow.txt"
  else
    allowlist_file="${REPO_ROOT}/.implementation/removal-sweep-allow.txt"
  fi

  # allowlist_entries: associative array of "removed_path|consumer_path" → reason
  declare -A allowlist_entries=()
  local allowlist_has_empty_reason=0

  if [[ -f "$allowlist_file" ]]; then
    while IFS= read -r line; do
      # Strip comments and blank lines
      local stripped="${line%%#*}"
      stripped="${stripped#"${stripped%%[! ]*}"}"  # ltrim
      stripped="${stripped%"${stripped##*[! ]}"}"  # rtrim
      [[ -z "$stripped" ]] && continue

      # Parse: <removed-path> | <consumer-path> | <reason>
      local rem_path consumer_path reason
      rem_path="${stripped%%|*}"
      rem_path="${rem_path%"${rem_path##*[! ]}"}"  # rtrim
      rem_path="${rem_path#"${rem_path%%[! ]*}"}"  # ltrim
      local rest="${stripped#*|}"
      consumer_path="${rest%%|*}"
      consumer_path="${consumer_path%"${consumer_path##*[! ]}"}"
      consumer_path="${consumer_path#"${consumer_path%%[! ]*}"}"
      reason="${rest#*|}"
      reason="${reason#"${reason%%[! ]*}"}"
      reason="${reason%"${reason##*[! ]}"}"

      if [[ -z "$reason" ]]; then
        # Empty reason is itself a gate failure (a suppression must be documented).
        allowlist_has_empty_reason=1
        fail "$check_name" "allowlist entry missing mandatory reason: '${rem_path} | ${consumer_path} | (empty)'"
      fi

      allowlist_entries["${rem_path}|${consumer_path}"]="$reason"
    done < "$allowlist_file"
  fi

  # If any entry had an empty reason, fail now — do not continue with the sweep.
  if [[ $allowlist_has_empty_reason -eq 1 ]]; then
    return
  fi

  # ── Step 3: Sweep each removed file ─────────────────────────────────────────

  # Determine the scan root. In fixture mode we use the fixture dir.
  # In real-repo mode we use the repo root (git grep runs there).
  local scan_root
  if [[ -n "$FIXTURE_DIR" ]]; then
    scan_root="$FIXTURE_DIR"
  else
    scan_root="$REPO_ROOT"
  fi

  local overall_pass=1

  for removed_path in "${removed_files[@]}"; do
    # Determine the grep token: the repo-relative path is the primary, precise signal.
    # git grep -F catches this literal string even inside constructed-path forms like:
    #   : "${VAR:=${REPO_ROOT}/<removed-artifact-path>}"
    local grep_token="$removed_path"

    # Run git grep -F against the scan root.
    # CS-INFRA-003: guard exit-1-on-no-match (expected non-fatal) with || true.
    local grep_hits=""
    if [[ -n "$FIXTURE_DIR" ]]; then
      # In fixture mode git grep does not work against arbitrary dirs;
      # use grep -rn instead, with the same exclusions.
      grep_hits="$(
        grep -rn --include="*" \
          --exclude-dir=".git" \
          --exclude-dir="node_modules" \
          -F -e "$grep_token" \
          -- "$scan_root" 2>/dev/null || true
      )"
    else
      # Real-repo mode: git grep -F scans the working tree.
      # DECISION: Exclude scripts/__test_fixtures__/ from the real-tree sweep.
      # Test fixtures are test DATA (the scan target in fixture mode), not live
      # consumers of removed artifacts. Hits there are deliberate setup, not
      # orphan references. The exclusion is REAL-REPO mode ONLY — in fixture mode
      # the grep -rn scans INSIDE scripts/__test_fixtures__/ by design (it IS
      # the scan target). Adding this exclusion here cannot leak into fixture mode.
      # DECISION: Exclude *.test.ts and *.spec.ts from the real-tree sweep.
      # Test files reference removed paths as string literals (test inputs), not
      # as live consumers. A removal that breaks a test surfaces at test-time
      # (pnpm test), not via this gate. Excluding them removes self-referential
      # allowlist entries while keeping the gate focused on production consumers.
      grep_hits="$(
        git -C "$REPO_ROOT" grep -Fn -e "$grep_token" -- \
          ':!.git' ':!node_modules' \
          ':!scripts/__test_fixtures__' \
          ':!*.test.ts' ':!*.spec.ts' 2>/dev/null || true
      )"
    fi

    if [[ -z "$grep_hits" ]]; then
      # No references found anywhere — clean removal.
      continue
    fi

    # ── Step 4: Classify each hit ─────────────────────────────────────────────

    while IFS= read -r hit; do
      [[ -z "$hit" ]] && continue

      # Extract the path and line number from the hit.
      # Format (both modes): "path/to/file:linenum:content"
      # The path is the only field that can contain colons, so parse from the RIGHT:
      # the line number is the last purely-numeric field before the content column.
      # Using sed: strip ":digits:content" suffix to get path; capture digits for line.
      # This is colon-safe — a colon in the filename cannot be mistaken for the separator
      # because we anchor on the ":NUM:" pattern (digits only) that must appear before content.
      local hit_path hit_line
      hit_path="$(printf '%s\n' "$hit" | sed 's/:\([0-9][0-9]*\):.*$//')"
      hit_line="$(printf '%s\n' "$hit" | sed 's/.*:\([0-9][0-9]*\):.*/\1/')"
      if [[ -n "$FIXTURE_DIR" ]]; then
        # Make path relative to fixture dir (strip leading scan_root prefix)
        hit_path="${hit_path#"${scan_root}/"}"
      fi

      # Skip the removed file itself (it may contain its own path in a comment/doc)
      if [[ "$hit_path" == "$removed_path" ]]; then
        continue
      fi

      # Skip fixture dir itself (for real-repo mode — should not apply but guard anyway)
      if [[ -n "$FIXTURE_DIR" && "$hit_path" == "${FIXTURE_DIR}"* ]]; then
        continue
      fi

      # Determine the file extension for classification
      local hit_basename hit_ext
      hit_basename="$(basename "$hit_path")"
      # Handle package.json specially (no dot-extension pattern match needed)
      if [[ "$hit_basename" == "package.json" ]]; then
        hit_ext="package.json"
      else
        hit_ext="${hit_basename##*.}"
        # If no extension (no dot), treat as not executable
        [[ "$hit_basename" == "$hit_ext" ]] && hit_ext=""
      fi

      # Classify: doc-only (.md) → ALLOWED by rule
      if [[ "$hit_ext" == "md" ]]; then
        # Historical/archive/retro pointers are legitimate and permanent.
        # No allowlist entry needed for .md consumers.
        continue
      fi

      # Classify: executable extensions → check allowlist, then FAIL or PASS
      case "$hit_ext" in
        sh|ts|tsx|js|mjs|cjs|py|yml|yaml|package.json)
          # Check allowlist: key is "removed_path|consumer_path"
          local allowlist_key="${removed_path}|${hit_path}"
          if [[ -n "${allowlist_entries["$allowlist_key"]+_}" ]]; then
            local reason="${allowlist_entries["$allowlist_key"]}"
            printf "    → ALLOWED (allowlisted): %s:%s — %s\n" "$hit_path" "$hit_line" "$reason"
            continue
          fi
          # Not allowlisted: FAIL, naming the consumer path:line
          fail "$check_name" "executable consumer of removed '${removed_path}': ${hit_path}:${hit_line}"
          overall_pass=0
          ;;
        *)
          # Unknown extension — not classified as executable; skip silently.
          continue
          ;;
      esac

    done <<< "$grep_hits"
  done

  if [[ $overall_pass -eq 1 ]]; then
    pass "$check_name"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  echo ""
  echo "validate-gates.sh — tax-portal gate validation backstop"
  echo "========================================================="
  if [[ -n "$FIXTURE_DIR" ]]; then
    echo "  Mode: fixture (${FIXTURE_DIR})"
  else
    echo "  Mode: real repo (${REPO_ROOT})"
  fi
  echo ""
  echo "Results:"

  check_task_file_completion
  check_bug_files_present_for_done
  check_state_json_schema
  check_gated_path_accountability
  check_work_log_content
  check_playwright_artifacts
  check_ci_evidence
  check_pr_body_quad_review
  check_awaiting_merge_records
  check_removed_artifact_orphans

  echo ""
  if [[ ${#FAILURES[@]} -eq 0 ]]; then
    echo "  Summary: ALL CHECKS PASSED (${#FAILURES[@]} failures)"
    exit 0
  else
    echo "  Summary: ${#FAILURES[@]} check(s) FAILED"
    echo ""
    echo "  Failures:"
    for f in "${FAILURES[@]}"; do
      echo "    - $f"
    done
    exit 1
  fi
}

main

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
  PROGRESS_MD="${FIXTURE_DIR}/.implementation/tasks/PROGRESS.md"
  REPO_SCAN_ROOT="${FIXTURE_DIR}"
else
  TASKS_DIR="${REPO_ROOT}/.implementation/tasks"
  TASKS_DONE_DIR="${REPO_ROOT}/.implementation/tasks/done"
  PROGRESS_MD="${REPO_ROOT}/.implementation/tasks/PROGRESS.md"
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
# Check 3: check_progress_md_structure
#
# PROGRESS.md must contain all 5 section headers per
# .implementation/ENGINE.md § PROGRESS.md structure contract:
#   1. ## Current initiative
#   2. ## Awaiting PR merge
#   3. ## Active bugs
#   4. ## Open retro action items
#   5. --- (section separator before session entries)
# ---------------------------------------------------------------------------

check_progress_md_structure() {
  local check_name="check_progress_md_structure"

  if [[ ! -f "$PROGRESS_MD" ]]; then
    fail "$check_name" "PROGRESS.md not found at $PROGRESS_MD"
    return
  fi

  local all_pass=1
  local required_sections=(
    "## Current initiative"
    "## Awaiting PR merge"
    "## Active bugs"
    "## Open retro action items"
  )

  for section in "${required_sections[@]}"; do
    if ! grep -qF "$section" "$PROGRESS_MD"; then
      fail "$check_name" "Missing section: '$section'"
      all_pass=0
    fi
  done

  # Must have the --- separator
  if ! grep -q "^---$" "$PROGRESS_MD"; then
    fail "$check_name" "Missing '---' session-entry separator"
    all_pass=0
  fi

  if [[ $all_pass -eq 1 ]]; then
    pass "$check_name"
  fi
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
# Check 9: check_pr_awaiting_merge_gate_verdicts
#
# Reads ## Awaiting PR merge section from PROGRESS_MD.
# If the section is empty / _None._ / no "- **PR " bullet entries → pass.
# For each "- **PR " bullet entry: locate the "Quality gates 5–8:" clause and
# verify each of the four named gates appears with either:
#   <gate-name> PASS   (exact, case-sensitive)
#   <gate-name> (deferred per hotfix urgency: <task-id>)
#     where <task-id> matches TASK-[A-Z][A-Z0-9]*-[0-9]{3,} or
#                              BUG-[A-Z0-9][A-Z0-9]*-[0-9]{3,}
#
# Implements .implementation/ENGINE.md § Autonomy Ceiling item 3 condition (d).
# ---------------------------------------------------------------------------

check_pr_awaiting_merge_gate_verdicts() {
  local check_name="check_pr_awaiting_merge_gate_verdicts"
  local all_pass=1

  if [[ ! -f "$PROGRESS_MD" ]]; then
    fail "$check_name" "PROGRESS.md not found at $PROGRESS_MD"
    return
  fi

  # Extract the ## Awaiting PR merge section content:
  # everything between "## Awaiting PR merge" and the next "##" header or "---" separator.
  local section_content
  section_content="$(awk '/^## Awaiting PR merge/{found=1; next} found && /^(##|---)/{exit} found{print}' "$PROGRESS_MD")"

  # Check if section is empty / _None._ / has no "- **PR " bullet entries
  local pr_entries=()
  while IFS= read -r line; do
    if [[ "$line" == "- **PR "* ]]; then
      pr_entries+=("$line")
    fi
  done <<< "$section_content"

  if [[ ${#pr_entries[@]} -eq 0 ]]; then
    pass "$check_name (no PR entries to check)"
    return
  fi

  # The four canonical gate names (case-sensitive)
  local gate_names=("Container Smoke" "RA Validation" "SDET CI" "SDET Quality Parity")
  # Structured task-ID regex: TASK-[A-Z][A-Z0-9]*-[0-9]{3,} or BUG-[A-Z0-9][A-Z0-9]*-[0-9]{3,}
  local task_id_regex="(TASK-[A-Z][A-Z0-9]*-[0-9]{3,}|BUG-[A-Z0-9][A-Z0-9]*-[0-9]{3,})"

  for entry in "${pr_entries[@]}"; do
    # Use the first token after "- **PR " as the PR identifier
    local pr_id
    pr_id="$(echo "$entry" | grep -oE '\*\*PR #[0-9]+ — [^*]+\*\*' | head -1)"
    if [[ -z "$pr_id" ]]; then
      pr_id="$(echo "$entry" | cut -c1-60)..."
    fi

    for gate in "${gate_names[@]}"; do
      # Check for "<gate-name> PASS" (exact, case-sensitive)
      if echo "$entry" | grep -qF "${gate} PASS"; then
        continue
      fi

      # Check for "<gate-name> (deferred per hotfix urgency: <task-id>)"
      # Extract the annotation value after "deferred per hotfix urgency: "
      local deferred_value
      deferred_value="$(echo "$entry" | grep -oP "(?<=${gate} \(deferred per hotfix urgency: )[^)]*" || true)"

      if [[ -n "$deferred_value" ]]; then
        # Validate the task-ID matches the structured regex
        if echo "$deferred_value" | grep -qP "^${task_id_regex}$"; then
          continue
        else
          fail "$check_name" "${gate} deferred annotation has malformed task-ID '${deferred_value}' in ${pr_id}"
          all_pass=0
        fi
      else
        # No PASS and no deferred annotation — silent omission
        fail "$check_name" "${gate} marker missing in ${pr_id}"
        all_pass=0
      fi
    done
  done

  if [[ $all_pass -eq 1 ]]; then
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
  check_progress_md_structure
  check_gated_path_accountability
  check_work_log_content
  check_playwright_artifacts
  check_ci_evidence
  check_pr_body_quad_review
  check_pr_awaiting_merge_gate_verdicts

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

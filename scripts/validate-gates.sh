#!/usr/bin/env bash
# scripts/validate-gates.sh
#
# Programmatic gate validation backstop for the tax-portal multi-agent workflow.
# See .claude/agent-stack.md § Programmatic Gate Validation.
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
  TASKS_DIR="${FIXTURE_DIR}/docs/tasks"
  TASKS_DONE_DIR="${FIXTURE_DIR}/docs/tasks/done"
  PROGRESS_MD="${FIXTURE_DIR}/docs/tasks/PROGRESS.md"
  REPO_SCAN_ROOT="${FIXTURE_DIR}"
else
  TASKS_DIR="${REPO_ROOT}/docs/tasks"
  TASKS_DONE_DIR="${REPO_ROOT}/docs/tasks/done"
  PROGRESS_MD="${REPO_ROOT}/docs/tasks/PROGRESS.md"
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
# All tasks with Status: done must have all 4 metadata fields filled:
#   Started-at, Completed-at, Complexity-estimate, Complexity-actual
# ---------------------------------------------------------------------------

check_task_file_completion() {
  local check_name="check_task_file_completion"
  local found_any=0
  local all_pass=1

  # Check done/ subdirectory (completed tasks)
  if [[ -d "$TASKS_DONE_DIR" ]]; then
    while IFS= read -r -d '' f; do
      found_any=1
      _check_done_metadata "$f" "$check_name" || all_pass=0
    done < <(find "$TASKS_DONE_DIR" -maxdepth 1 -name "TASK-*.md" -print0 2>/dev/null)
  fi

  # Also check active tasks that carry Status: done
  if [[ -d "$TASKS_DIR" ]]; then
    while IFS= read -r -d '' f; do
      if grep -q "^\*\*Status\*\*: done" "$f" 2>/dev/null; then
        found_any=1
        _check_done_metadata "$f" "$check_name" || all_pass=0
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

_check_done_metadata() {
  local f="$1"
  local check_name="$2"
  local fname
  fname="$(basename "$f")"
  local ok=1

  # Started-at must not be blank/dash
  if ! grep -qE "^\*\*Started-at\*\*: [0-9]{4}-[0-9]{2}-[0-9]{2}T" "$f"; then
    fail "$check_name" "$fname: Started-at missing or not ISO 8601"
    ok=0
  fi

  # Completed-at must not be blank/dash
  if ! grep -qE "^\*\*Completed-at\*\*: [0-9]{4}-[0-9]{2}-[0-9]{2}T" "$f"; then
    fail "$check_name" "$fname: Completed-at missing or not ISO 8601"
    ok=0
  fi

  # Complexity-estimate must be 1-5
  if ! grep -qE "^\*\*Complexity-estimate\*\*: [1-5]$" "$f"; then
    fail "$check_name" "$fname: Complexity-estimate missing or not 1-5"
    ok=0
  fi

  # Complexity-actual must be 1-5
  if ! grep -qE "^\*\*Complexity-actual\*\*: [1-5]$" "$f"; then
    fail "$check_name" "$fname: Complexity-actual missing or not 1-5"
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
      # Only check done tasks
      if ! grep -q "^\*\*Status\*\*: done" "$f" 2>/dev/null; then
        continue
      fi
      # Check if SDET Review Decision includes "reject"
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
# .claude/agent-stack.md § PROGRESS.md structure contract:
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
      if ! grep -q "^\*\*Status\*\*: done" "$f" 2>/dev/null; then
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
# Tasks with E2e-required: yes and Status: done must have e2e execution output
# in their Work Log (pass/fail counts or test names).
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
      # Only care about done tasks with E2e-required: yes
      if ! grep -q "^\*\*Status\*\*: done" "$f" 2>/dev/null; then
        continue
      fi
      if ! grep -q "^\*\*E2e-required\*\*: yes" "$f" 2>/dev/null; then
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
# Done tasks with Introduces-gate: yes must have all three Gate Authoring
# Rules evidence items in their Work Log:
#   1. A run URL (https://github.com/.../runs/...)
#   2. A named code path (file reference)
#   3. A counterfactual (the word "counterfactual" or "if ... were changed")
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
      if ! grep -q "^\*\*Status\*\*: done" "$f" 2>/dev/null; then
        continue
      fi
      if ! grep -q "^\*\*Introduces-gate:\*\* yes" "$f" 2>/dev/null; then
        continue
      fi
      found_any=1
      local fname
      fname="$(basename "$f")"

      # Item 1: Run URL (CI run or local log path)
      if ! grep -qE "(https://github\.com/.*/actions/runs/[0-9]+|/tmp/[a-zA-Z0-9_-]+\.log)" "$f"; then
        fail "$check_name" "$fname: Introduces-gate done task missing run URL or local log path"
        all_pass=0
      fi

      # Item 2: Named code path (a file reference — look for typical path patterns)
      if ! grep -qE "(\.(sh|yml|yaml|ts|tsx|js|json|md):[0-9]+|`[a-zA-Z0-9_./-]+\.(sh|yml|yaml|ts|tsx|js|json)`)" "$f"; then
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
# If changed files include .claude/agent-stack.md or agents/*.md,
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
      .claude/agent-stack.md|agents/*.md)
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

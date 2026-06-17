#!/usr/bin/env bash
# .orchestration/bin/orchestrate-gates.sh
#
# Increment 1 — Gate Rails. The deterministic, pure-code evaluator for the
# .orchestration/ Conductor's mechanical gates. It re-derives each verdict from
# PRIMARY SOURCES (epic front-matter, ROADMAP, COVERAGE, PROGRESS.md, git, the
# structured PR-review verdict) — never from a recorded "✓" in STATE.md.
#
# See .orchestration/design/INCREMENT-1-gate-rails.md and NORTH-STAR.md.
#
# This does NOT replace the Conductor. The agent still conducts; this gives it
# (and, later, a deterministic sequencer) a code-sourced answer for the gates
# that are mechanical, and a per-gate verdict log that doubles as the
# contract-erosion alarm and the judge→code promotion ledger.
#
# Usage:
#   orchestrate-gates.sh --gate readiness    --epic EPIC-NNN [opts]
#   orchestrate-gates.sh --gate engine-clear [opts]
#   orchestrate-gates.sh --gate fix-decision --pr-verdict <file> [--pr N] [opts]
#   orchestrate-gates.sh --gate all --epic EPIC-NNN --pr-verdict <file> [opts]
#
# Options:
#   --fixture-dir <dir>   Resolve all primary sources under <dir>; implies --no-git.
#   --planning-dir <dir>  Override the .planning dir (default: <repo>/.planning).
#   --progress-md <file>  Override PROGRESS.md (default: <repo>/.implementation/tasks/PROGRESS.md).
#   --pr-verdict <file>   File containing the pr-review-verdict/v1 JSON (raw or HTML-comment-wrapped).
#   --pr <N>              PR number, for the log record (else read from the verdict payload).
#   --log <file>          Verdict-log JSONL path (default: <repo>/.orchestration/runs/gate-log.jsonl).
#                         Use "-" or NONE to disable logging.
#   --no-git              Skip the git tree-clean / branch-free check (criterion 7).
#   --run-id <id>         Override the run id stamped on log records.
#
# Exit codes: 0 = all evaluated gates PASS, 1 = one or more FAIL, 2 = usage error.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

GATE=""
EPIC=""
FIXTURE_DIR=""
PLANNING_DIR=""
PROGRESS_MD=""
PR_VERDICT_FILE=""
PR_NUMBER=""
LOG_FILE=""
NO_GIT=0
RUN_ID=""

die() { echo "orchestrate-gates: $*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gate)         GATE="${2:-}"; shift 2 ;;
    --epic)         EPIC="${2:-}"; shift 2 ;;
    --fixture-dir)  FIXTURE_DIR="${2:-}"; shift 2 ;;
    --planning-dir) PLANNING_DIR="${2:-}"; shift 2 ;;
    --progress-md)  PROGRESS_MD="${2:-}"; shift 2 ;;
    --pr-verdict)   PR_VERDICT_FILE="${2:-}"; shift 2 ;;
    --pr)           PR_NUMBER="${2:-}"; shift 2 ;;
    --log)          LOG_FILE="${2:-}"; shift 2 ;;
    --no-git)       NO_GIT=1; shift ;;
    --run-id)       RUN_ID="${2:-}"; shift 2 ;;
    -h|--help)      sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              die "unknown argument: $1" ;;
  esac
done

[[ -n "$GATE" ]] || die "missing --gate (readiness|engine-clear|fix-decision|all)"

# ---------------------------------------------------------------------------
# Path + env resolution
# ---------------------------------------------------------------------------
if [[ -n "$FIXTURE_DIR" ]]; then
  [[ -d "$FIXTURE_DIR" ]] || die "fixture dir not found: $FIXTURE_DIR"
  : "${PLANNING_DIR:=${FIXTURE_DIR}/.planning}"
  : "${PROGRESS_MD:=${FIXTURE_DIR}/.implementation/tasks/PROGRESS.md}"
  NO_GIT=1
else
  : "${PLANNING_DIR:=${REPO_ROOT}/.planning}"
  : "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
fi

if [[ -z "$LOG_FILE" ]]; then
  LOG_FILE="${REPO_ROOT}/.orchestration/runs/gate-log.jsonl"
fi

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="${EPIC:-run}-$(date -u +%Y%m%dT%H%M%SZ)"
fi

# ---------------------------------------------------------------------------
# Result tracking + logging
# ---------------------------------------------------------------------------
FAILURES=()

emit_log() {
  # $1 gate  $2 verdict  $3 source  $4 evidence-json
  [[ "$LOG_FILE" == "-" || "$LOG_FILE" == "NONE" ]] && return 0
  local gate="$1" verdict="$2" source="$3" evidence="$4"
  local confidence="1.0"
  mkdir -p "$(dirname "$LOG_FILE")"
  printf '{"run_id":"%s","epic":"%s","gate":"%s","verdict":"%s","confidence":%s,"source":"%s","decided_by":"orchestrate-gates.sh","ts":"%s","evidence":%s}\n' \
    "$RUN_ID" "${EPIC:-}" "$gate" "$verdict" "$confidence" "$source" "$(date -u +%FT%TZ)" "$evidence" \
    >> "$LOG_FILE"
}

report_gate() {
  # $1 gate  $2 verdict(pass|fail)  $3 detail  $4 evidence-json
  local gate="$1" verdict="$2" detail="$3" evidence="${4:-{\}}"
  if [[ "$verdict" == "pass" ]]; then
    printf "  %-44s %s\n" "$gate" "PASS"
  else
    printf "  %-44s %s\n" "$gate" "FAIL"
    printf "    → %s\n" "$detail"
    FAILURES+=("$gate: $detail")
  fi
  emit_log "$gate" "$verdict" "code" "$evidence"
}

# ---------------------------------------------------------------------------
# Front-matter helpers (pragmatic YAML — front-matter is the first ---/--- block)
# ---------------------------------------------------------------------------
epic_file() {
  local id="$1"
  local f
  f="$(find "$PLANNING_DIR" -maxdepth 1 -name "${id}*.md" 2>/dev/null | head -1)"
  [[ -n "$f" ]] && printf '%s' "$f"
}

front_matter() {
  # Print the front-matter block (between the first two `---` lines) of $1.
  sed -n '/^---[[:space:]]*$/,/^---[[:space:]]*$/p' "$1"
}

# Read a scalar front-matter field, stripping inline `# comments` and quotes.
fm_scalar() {
  # $1 file  $2 key
  front_matter "$1" | grep -E "^${2}:" | head -1 \
    | sed -E "s/^${2}:[[:space:]]*//" \
    | sed -E 's/[[:space:]]*#.*$//; s/^["'"'"']//; s/["'"'"']$//; s/[[:space:]]+$//'
}

# ---------------------------------------------------------------------------
# Gate: readiness  (criteria 1-4, 7 — pure structural)
# Criteria 5 (AC-testability) and 6 (engine clear) are deliberately NOT here:
#   5 is a semantic judgment (deferred to a gate-judge, increment 2);
#   6 is the separate engine-clear gate below.
# ---------------------------------------------------------------------------
gate_readiness() {
  [[ -n "$EPIC" ]] || die "readiness gate needs --epic"
  local f; f="$(epic_file "$EPIC")"
  if [[ -z "$f" ]]; then
    report_gate "readiness:epic-exists" fail "no epic file matching ${EPIC}* under ${PLANNING_DIR}" "{}"
    return
  fi

  # C1 — status: planned
  local status; status="$(fm_scalar "$f" status)"
  if [[ "$status" == "planned" ]]; then
    report_gate "readiness:status-planned" pass "" "{\"status\":\"${status}\"}"
  else
    report_gate "readiness:status-planned" fail "status is '${status}', expected 'planned'" "{\"status\":\"${status}\"}"
  fi

  # C2 — open_questions: [] (absent, [], or empty list all pass; any list item fails)
  local oq_line oq_items
  oq_line="$(front_matter "$f" | grep -E '^open_questions:' | head -1 || true)"
  if [[ -z "$oq_line" || "$oq_line" =~ open_questions:[[:space:]]*\[\][[:space:]]*$ ]]; then
    report_gate "readiness:open-questions-empty" pass "" "{\"open_questions\":0}"
  else
    # block form — count `  - ` items under the key until the next top-level key
    oq_items="$(front_matter "$f" | awk '/^open_questions:/{f=1;next} f&&/^[a-zA-Z]/{f=0} f&&/^[[:space:]]*-/{c++} END{print c+0}')"
    if [[ "${oq_items:-0}" -eq 0 ]]; then
      report_gate "readiness:open-questions-empty" pass "" "{\"open_questions\":0}"
    else
      report_gate "readiness:open-questions-empty" fail "${oq_items} open question(s) recorded" "{\"open_questions\":${oq_items}}"
    fi
  fi

  # C3 — every depends_on epic is delivered
  local deps
  deps="$(front_matter "$f" | grep -E '^depends_on:' | head -1 | grep -oE 'EPIC-[0-9]+' || true)"
  # block form fallback
  if [[ -z "$deps" ]]; then
    deps="$(front_matter "$f" | awk '/^depends_on:/{f=1;next} f&&/^[a-zA-Z]/{f=0} f' | grep -oE 'EPIC-[0-9]+' || true)"
  fi
  if [[ -z "$deps" ]]; then
    report_gate "readiness:deps-delivered" pass "no dependencies" "{\"deps\":0}"
  else
    local unmet=() d df dstatus
    while IFS= read -r d; do
      [[ -z "$d" ]] && continue
      df="$(epic_file "$d")"
      if [[ -z "$df" ]]; then unmet+=("${d}(missing)"); continue; fi
      dstatus="$(fm_scalar "$df" status)"
      [[ "$dstatus" == "delivered" ]] || unmet+=("${d}(${dstatus:-unknown})")
    done <<< "$deps"
    if [[ ${#unmet[@]} -eq 0 ]]; then
      report_gate "readiness:deps-delivered" pass "" "{\"deps_all_delivered\":true}"
    else
      report_gate "readiness:deps-delivered" fail "unmet: ${unmet[*]}" "{\"unmet\":\"${unmet[*]}\"}"
    fi
  fi

  # C4 — COVERAGE has rows for the epic. Match the epic id as a markdown TABLE
  # CELL (`| EPIC-NNN |`), not anywhere in prose — a substring match would count
  # a passing mention in a heading or note as "coverage exists".
  local cov="${PLANNING_DIR}/COVERAGE.md" rows=0
  if [[ -f "$cov" ]]; then rows="$(grep -cE "\\|[[:space:]]*${EPIC}[[:space:]]*\\|" "$cov" || true)"; fi
  if [[ "${rows:-0}" -gt 0 ]]; then
    report_gate "readiness:coverage-rows" pass "" "{\"coverage_mentions\":${rows}}"
  else
    report_gate "readiness:coverage-rows" fail "no COVERAGE rows mention ${EPIC}" "{\"coverage_mentions\":0}"
  fi

  # C7 — git tree clean + feature branch free
  if [[ "$NO_GIT" -eq 1 ]]; then
    report_gate "readiness:git-clean-branch-free" pass "skipped (--no-git)" "{\"skipped\":true}"
  else
    local dirty num branch_hit
    dirty="$(git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' ')"
    num="$(printf '%s' "$EPIC" | grep -oE '[0-9]+' | head -1)"
    branch_hit="$(git -C "$REPO_ROOT" branch --list "*${num}*" | wc -l | tr -d ' ')"
    if [[ "$dirty" -eq 0 && "$branch_hit" -eq 0 ]]; then
      report_gate "readiness:git-clean-branch-free" pass "" "{\"dirty\":0,\"branch_collisions\":0}"
    else
      report_gate "readiness:git-clean-branch-free" fail "dirty=${dirty} branch_collisions=${branch_hit}" "{\"dirty\":${dirty},\"branch_collisions\":${branch_hit}}"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Gate: engine-clear  (criterion 6 — structural)
# PROGRESS.md `## Awaiting PR merge` carries no live slice AND `## Active bugs`
# carries no UN-dispositioned bug.
#
# Disposition is a semantic call the engine already records via a maintained
# italic clear-marker (`_None active._` / `_Empty._` / `_None._`) leading each
# section — historical/archived bullets stay listed for the record. This gate
# keys on that marker (the same signal the Conductor reads), and does NOT
# re-judge each archived bullet. The marker is treated as authoritative; if it
# is ever wrong while live bullets remain, that is an erosion signal the verdict
# log surfaces. A section with live bullets and NO clear-marker fails.
# ---------------------------------------------------------------------------
section_body() {
  # Print lines of $PROGRESS_MD strictly between header "## $1" and the next "## ".
  awk -v h="## $1" '
    $0==h {f=1; next}
    f && /^## / {f=0}
    f {print}
  ' "$PROGRESS_MD"
}

# A section is "clear" if it carries an explicit empty/none italic marker, or it
# has no live bullets of the given kind.
section_clear() {
  # $1 section-body  $2 bullet-regex  -> echoes "clear" or "<n> bullets"
  local body="$1" bullet_re="$2" marker bullets
  marker="$(printf '%s\n' "$body" | grep -ciE '_(none|empty)' || true)"
  bullets="$(printf '%s\n' "$body" | grep -cE "$bullet_re" || true)"
  if [[ "${marker:-0}" -gt 0 || "${bullets:-0}" -eq 0 ]]; then
    echo "clear"
  else
    echo "${bullets} bullets"
  fi
}

gate_engine_clear() {
  if [[ ! -f "$PROGRESS_MD" ]]; then
    report_gate "engine-clear:progress-md" fail "PROGRESS.md not found: $PROGRESS_MD" "{}"
    return
  fi
  local aw bug
  aw="$(section_clear "$(section_body 'Awaiting PR merge')" '^- \*\*PR ')"
  bug="$(section_clear "$(section_body 'Active bugs')" '^- \*\*BUG-')"

  if [[ "$aw" == "clear" ]]; then
    report_gate "engine-clear:awaiting-empty" pass "" "{\"awaiting\":\"clear\"}"
  else
    report_gate "engine-clear:awaiting-empty" fail "${aw} awaiting merge, no clear-marker" "{\"awaiting\":\"${aw}\"}"
  fi
  if [[ "$bug" == "clear" ]]; then
    report_gate "engine-clear:no-active-bugs" pass "" "{\"active_bugs\":\"clear\"}"
  else
    report_gate "engine-clear:no-active-bugs" fail "${bug} active, no clear-marker" "{\"active_bugs\":\"${bug}\"}"
  fi
}

# ---------------------------------------------------------------------------
# Gate: fix-decision  (panel-verdict — now pure code, was prose interpretation)
# Reads the structured pr-review-verdict/v1 payload and derives fix-or-skip.
# ---------------------------------------------------------------------------
json_num() { grep -oE "\"$1\"[[:space:]]*:[[:space:]]*[0-9]+" | grep -oE '[0-9]+$' | head -1; }
json_str() { grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed -E "s/.*:[[:space:]]*\"([^\"]*)\".*/\1/" | head -1; }
json_bool() { grep -oE "\"$1\"[[:space:]]*:[[:space:]]*(true|false)" | grep -oE '(true|false)$' | head -1; }

gate_fix_decision() {
  [[ -n "$PR_VERDICT_FILE" ]] || die "fix-decision gate needs --pr-verdict <file>"
  [[ -f "$PR_VERDICT_FILE" ]] || { report_gate "fix-decision:verdict-present" fail "verdict file not found: $PR_VERDICT_FILE" "{}"; return; }

  # Accept raw JSON or the HTML-comment-wrapped block; collapse to one blob.
  local raw; raw="$(tr -d '\n' < "$PR_VERDICT_FILE")"
  local blocker major minor nit verdict fix_req
  blocker="$(printf '%s' "$raw" | json_num blocker)"
  major="$(printf '%s' "$raw" | json_num major)"
  minor="$(printf '%s' "$raw" | json_num minor)"
  nit="$(printf '%s' "$raw" | json_num nit)"
  verdict="$(printf '%s' "$raw" | json_str verdict)"
  fix_req="$(printf '%s' "$raw" | json_bool fix_required)"
  [[ -z "$PR_NUMBER" ]] && PR_NUMBER="$(printf '%s' "$raw" | json_num pr || true)"

  if [[ -z "$blocker" || -z "$major" || -z "$verdict" ]]; then
    report_gate "fix-decision:verdict-parsed" fail "could not parse blocker/major/verdict from payload" "{}"
    return
  fi
  report_gate "fix-decision:verdict-parsed" pass "" "{\"blocker\":${blocker},\"major\":${major},\"minor\":${minor:-0},\"nit\":${nit:-0}}"

  # Derived decision — pure code, no prose interpretation.
  local actionable=$(( blocker + major ))
  local derived="false"; [[ "$actionable" -gt 0 ]] && derived="true"

  # Consistency: the panel's own fix_required must match the derived value, and
  # the prose verdict must agree. A mismatch is a contract-erosion signal.
  local consistent=1
  if [[ -n "$fix_req" && "$fix_req" != "$derived" ]]; then consistent=0; fi
  if [[ "$derived" == "true" && "$verdict" != "request-changes" ]]; then consistent=0; fi
  if [[ "$derived" == "false" && "$verdict" != "approve" ]]; then consistent=0; fi

  if [[ "$consistent" -eq 1 ]]; then
    report_gate "fix-decision:verdict-consistent" pass "" "{\"fix_required\":${derived},\"verdict\":\"${verdict}\"}"
  else
    report_gate "fix-decision:verdict-consistent" fail "payload fix_required='${fix_req:-?}'/verdict='${verdict}' disagree with derived '${derived}'" "{\"derived\":${derived},\"payload_fix_required\":\"${fix_req:-}\",\"verdict\":\"${verdict}\"}"
  fi

  # The decision itself is always reported (it never "fails" — it routes).
  if [[ "$derived" == "true" ]]; then
    printf "  %-44s %s\n" "fix-decision:route" "RUN /pr-fix (${actionable} blocker/major)"
  else
    printf "  %-44s %s\n" "fix-decision:route" "SKIP /pr-fix (0 blocker/major)"
  fi
  emit_log "fix-decision:route" "$([[ "$derived" == "true" ]] && echo run-fix || echo skip-fix)" "code" \
    "{\"pr\":${PR_NUMBER:-null},\"blocker\":${blocker},\"major\":${major},\"minor\":${minor:-0},\"nit\":${nit:-0},\"verdict\":\"${verdict}\"}"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
echo "orchestrate-gates · gate=${GATE} epic=${EPIC:-—} run_id=${RUN_ID}"
case "$GATE" in
  readiness)     gate_readiness ;;
  engine-clear)  gate_engine_clear ;;
  fix-decision)  gate_fix_decision ;;
  all)
    gate_readiness
    gate_engine_clear
    [[ -n "$PR_VERDICT_FILE" ]] && gate_fix_decision
    ;;
  *) die "unknown gate: $GATE" ;;
esac

echo
if [[ ${#FAILURES[@]} -eq 0 ]]; then
  echo "RESULT: all evaluated gates PASS"
  exit 0
else
  echo "RESULT: ${#FAILURES[@]} gate(s) FAILED"
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi

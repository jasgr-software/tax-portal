#!/usr/bin/env bash
# .orchestration/bin/orchestrate-gates.sh
#
# Increment 1 — Gate Rails. The deterministic, pure-code evaluator for the
# .orchestration/ Conductor's mechanical gates. It re-derives each verdict from
# PRIMARY SOURCES (epic front-matter, ROADMAP, COVERAGE, state.json, git, the
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
#   orchestrate-gates.sh --gate standards-decision --pr-standards-verdict <file> [--pr N] [opts]
#   orchestrate-gates.sh --gate all --epic EPIC-NNN --pr-verdict <file> [opts]
#   orchestrate-gates.sh --gate snapshot     [--log <live>] [--history <file>]
#   orchestrate-gates.sh --gate check-drift  [--history <file>]
#
# Durability (the verdict log is load-bearing — "advance on data" needs the data
# to survive): the live `--log` is ephemeral/gitignored; `--gate snapshot`
# unions its records into the committed `--history` ledger (idempotent), and
# `--gate check-drift` reads that ledger as the contract-erosion alarm — it
# flags any (epic,gate) whose `inputs_digest` changed or whose verdict flipped
# across runs. See design/NORTH-STAR.md § Target end-state.
#
# Options:
#   --fixture-dir <dir>   Resolve all primary sources under <dir>; implies --no-git.
#   --planning-dir <dir>  Override the .planning dir (default: <repo>/.planning).
#   --progress-md <file>  Override PROGRESS.md path (legacy; engine-clear no longer reads it).
#   --state-json <file>   Override state.json path (default: <repo>/.implementation/state.json).
#   --pr-verdict <file>   File containing the pr-review-verdict/v1 JSON (raw or HTML-comment-wrapped).
#   --pr-standards-verdict <file>  File with the pr-standards-verdict/v1 JSON (raw or HTML-comment-wrapped).
#   --pr <N>              PR number, for the log record (else read from the verdict payload).
#   --log <file>          Verdict-log JSONL path (default: <repo>/.orchestration/runs/gate-log.jsonl).
#                         Use "-" or NONE to disable logging.
#   --history <file>      Committed durable ledger (default: <repo>/.orchestration/runs/gate-history.jsonl).
#                         Read by check-drift; appended to by snapshot.
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
STATE_JSON=""
PR_VERDICT_FILE=""
PR_STD_VERDICT_FILE=""
PR_NUMBER=""
LOG_FILE=""
HISTORY_FILE=""
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
    --state-json)   STATE_JSON="${2:-}"; shift 2 ;;
    --pr-verdict)   PR_VERDICT_FILE="${2:-}"; shift 2 ;;
    --pr-standards-verdict) PR_STD_VERDICT_FILE="${2:-}"; shift 2 ;;
    --pr)           PR_NUMBER="${2:-}"; shift 2 ;;
    --log)          LOG_FILE="${2:-}"; shift 2 ;;
    --history)      HISTORY_FILE="${2:-}"; shift 2 ;;
    --no-git)       NO_GIT=1; shift ;;
    --run-id)       RUN_ID="${2:-}"; shift 2 ;;
    -h|--help)      sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              die "unknown argument: $1" ;;
  esac
done

[[ -n "$GATE" ]] || die "missing --gate (readiness|engine-clear|fix-decision|standards-decision|all)"

# ---------------------------------------------------------------------------
# Path + env resolution
# ---------------------------------------------------------------------------
if [[ -n "$FIXTURE_DIR" ]]; then
  [[ -d "$FIXTURE_DIR" ]] || die "fixture dir not found: $FIXTURE_DIR"
  : "${PLANNING_DIR:=${FIXTURE_DIR}/.planning}"
  : "${PROGRESS_MD:=${FIXTURE_DIR}/.implementation/tasks/PROGRESS.md}"
  : "${STATE_JSON:=${FIXTURE_DIR}/.implementation/state.json}"
  NO_GIT=1
else
  : "${PLANNING_DIR:=${REPO_ROOT}/.planning}"
  : "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
  : "${STATE_JSON:=${REPO_ROOT}/.implementation/state.json}"
fi

if [[ -z "$LOG_FILE" ]]; then
  LOG_FILE="${REPO_ROOT}/.orchestration/runs/gate-log.jsonl"
fi

if [[ -z "$HISTORY_FILE" ]]; then
  HISTORY_FILE="${REPO_ROOT}/.orchestration/runs/gate-history.jsonl"
fi

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="${EPIC:-run}-$(date -u +%Y%m%dT%H%M%SZ)"
fi

# ---------------------------------------------------------------------------
# Result tracking + logging
# ---------------------------------------------------------------------------
FAILURES=()

# Portable SHA-256 of a string → "sha256:<hex>". The inputs_digest is the
# contract-erosion alarm's memory: it is taken over the RAW primary-source slice
# a gate read (not the derived evidence), so a shape change in the source the
# agent reads changes the digest even when the extracted value is unchanged.
sha() {
  local h
  if command -v sha256sum >/dev/null 2>&1; then
    h="$(printf '%s' "$1" | sha256sum | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    h="$(printf '%s' "$1" | shasum -a 256 | awk '{print $1}')"
  else
    h="unavailable"
  fi
  printf 'sha256:%s' "$h"
}

emit_log() {
  # $1 gate  $2 verdict  $3 source  $4 evidence-json  $5 inputs-raw (digested)
  [[ "$LOG_FILE" == "-" || "$LOG_FILE" == "NONE" ]] && return 0
  local gate="$1" verdict="$2" source="$3" evidence="$4" inputs="${5:-}"
  local confidence="1.0" digest
  digest="$(sha "$inputs")"
  mkdir -p "$(dirname "$LOG_FILE")"
  printf '{"run_id":"%s","epic":"%s","gate":"%s","verdict":"%s","confidence":%s,"source":"%s","inputs_digest":"%s","decided_by":"orchestrate-gates.sh","ts":"%s","evidence":%s}\n' \
    "$RUN_ID" "${EPIC:-}" "$gate" "$verdict" "$confidence" "$source" "$digest" "$(date -u +%FT%TZ)" "$evidence" \
    >> "$LOG_FILE"
}

report_gate() {
  # $1 gate  $2 verdict(pass|fail)  $3 detail  $4 evidence-json  $5 inputs-raw
  local gate="$1" verdict="$2" detail="$3" evidence="${4:-{\}}" inputs="${5:-$4}"
  if [[ "$verdict" == "pass" ]]; then
    printf "  %-44s %s\n" "$gate" "PASS"
  else
    printf "  %-44s %s\n" "$gate" "FAIL"
    printf "    → %s\n" "$detail"
    FAILURES+=("$gate: $detail")
  fi
  emit_log "$gate" "$verdict" "code" "$evidence" "$inputs"
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
    report_gate "readiness:epic-exists" fail "no epic file matching ${EPIC}* under ${PLANNING_DIR}" "{}" "${EPIC}:no-epic-file"
    return
  fi

  # The raw front-matter block is the primary source for C1-C3 — digest it so a
  # shape change in the source (not just the extracted value) trips the alarm.
  local fm_raw; fm_raw="$(front_matter "$f")"

  # C1 — status: planned
  local status; status="$(fm_scalar "$f" status)"
  if [[ "$status" == "planned" ]]; then
    report_gate "readiness:status-planned" pass "" "{\"status\":\"${status}\"}" "$fm_raw"
  else
    report_gate "readiness:status-planned" fail "status is '${status}', expected 'planned'" "{\"status\":\"${status}\"}" "$fm_raw"
  fi

  # C2 — open_questions: [] (absent, [], or empty list all pass; any list item fails)
  local oq_line oq_items
  oq_line="$(front_matter "$f" | grep -E '^open_questions:' | head -1 || true)"
  if [[ -z "$oq_line" || "$oq_line" =~ open_questions:[[:space:]]*\[\][[:space:]]*$ ]]; then
    report_gate "readiness:open-questions-empty" pass "" "{\"open_questions\":0}" "$fm_raw"
  else
    # block form — count `  - ` items under the key until the next top-level key
    oq_items="$(front_matter "$f" | awk '/^open_questions:/{f=1;next} f&&/^[a-zA-Z]/{f=0} f&&/^[[:space:]]*-/{c++} END{print c+0}')"
    if [[ "${oq_items:-0}" -eq 0 ]]; then
      report_gate "readiness:open-questions-empty" pass "" "{\"open_questions\":0}" "$fm_raw"
    else
      report_gate "readiness:open-questions-empty" fail "${oq_items} open question(s) recorded" "{\"open_questions\":${oq_items}}" "$fm_raw"
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
    report_gate "readiness:deps-delivered" pass "no dependencies" "{\"deps\":0}" "${EPIC}:deps:none"
  else
    local unmet=() d df dstatus dep_inputs=""
    while IFS= read -r d; do
      [[ -z "$d" ]] && continue
      df="$(epic_file "$d")"
      if [[ -z "$df" ]]; then unmet+=("${d}(missing)"); dep_inputs+="${d}=missing;"; continue; fi
      dstatus="$(fm_scalar "$df" status)"
      dep_inputs+="${d}=${dstatus:-unknown};"
      [[ "$dstatus" == "delivered" ]] || unmet+=("${d}(${dstatus:-unknown})")
    done <<< "$deps"
    if [[ ${#unmet[@]} -eq 0 ]]; then
      report_gate "readiness:deps-delivered" pass "" "{\"deps_all_delivered\":true}" "$dep_inputs"
    else
      report_gate "readiness:deps-delivered" fail "unmet: ${unmet[*]}" "{\"unmet\":\"${unmet[*]}\"}" "$dep_inputs"
    fi
  fi

  # C4 — COVERAGE has rows for the epic. Match the epic id as a markdown TABLE
  # CELL (`| EPIC-NNN |`), not anywhere in prose — a substring match would count
  # a passing mention in a heading or note as "coverage exists".
  local cov="${PLANNING_DIR}/COVERAGE.md" rows=0 cov_raw=""
  if [[ -f "$cov" ]]; then
    cov_raw="$(grep -E "\\|[[:space:]]*${EPIC}[[:space:]]*\\|" "$cov" || true)"
    rows="$(printf '%s' "$cov_raw" | grep -c . || true)"
  fi
  if [[ "${rows:-0}" -gt 0 ]]; then
    report_gate "readiness:coverage-rows" pass "" "{\"coverage_mentions\":${rows}}" "$cov_raw"
  else
    report_gate "readiness:coverage-rows" fail "no COVERAGE rows mention ${EPIC}" "{\"coverage_mentions\":0}" "${EPIC}:coverage:none"
  fi

  # C7 — git tree clean + feature branch free.
  # The Conductor's OWN working files are expected to change during a run and are
  # not a reason to block a new slice — counting them is the "predictably benign,
  # recurrent false-fail = mis-specified gate" trap (NORTH-STAR § Why #4; it was
  # 2 of 3 Phase-2 git-clean FAILs). Allowlist them: STATE.md (the run ledger the
  # sequencer rewrites every phase) and runs/ (verdict logs + scratch).
  if [[ "$NO_GIT" -eq 1 ]]; then
    report_gate "readiness:git-clean-branch-free" pass "skipped (--no-git)" "{\"skipped\":true}" "${EPIC}:git:skipped"
  else
    local dirty num branch_hit
    dirty="$(git -C "$REPO_ROOT" status --porcelain \
              | grep -vE '\.orchestration/(STATE\.md|runs/)' \
              | grep -c . || true)"
    num="$(printf '%s' "$EPIC" | grep -oE '[0-9]+' | head -1)"
    branch_hit="$(git -C "$REPO_ROOT" branch --list "*${num}*" | wc -l | tr -d ' ')"
    # git state is legitimately volatile run-to-run; digest only the boolean
    # outcome so the alarm flags a clean→dirty contract change, not normal churn.
    if [[ "$dirty" -eq 0 && "$branch_hit" -eq 0 ]]; then
      report_gate "readiness:git-clean-branch-free" pass "" "{\"dirty\":0,\"branch_collisions\":0}" "${EPIC}:git:clean"
    else
      report_gate "readiness:git-clean-branch-free" fail "dirty=${dirty} branch_collisions=${branch_hit}" "{\"dirty\":${dirty},\"branch_collisions\":${branch_hit}}" "${EPIC}:git:dirty"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Gate: engine-clear  (criterion 6 — structural)
# Re-pointed in BRIEF-LOE-012 cutover: PROGRESS.md deleted; now reads primary
# sources directly:
#   awaiting-empty  → state.json awaitingMerge[] must be empty
#   no-active-bugs  → BUG-*.md files in tasks dir with "status: open" must be 0
# ---------------------------------------------------------------------------
gate_engine_clear() {
  # ── awaiting-empty: read awaitingMerge[] from state.json ──────────────────
  if [[ ! -f "$STATE_JSON" ]]; then
    report_gate "engine-clear:awaiting-empty" fail "state.json not found: $STATE_JSON" "{}"
    # still try the bug check
  else
    local aw_count aw_json
    aw_count="$(python3 - "$STATE_JSON" <<'PYEOF'
import json, sys
try:
  data = json.load(open(sys.argv[1]))
  print(len(data.get("awaitingMerge", [])))
except Exception as e:
  sys.stderr.write(f"error reading state.json: {e}\n")
  sys.exit(2)
PYEOF
)"
    aw_json="{\"awaiting_count\":${aw_count:-0}}"
    if [[ "${aw_count:-0}" -eq 0 ]]; then
      report_gate "engine-clear:awaiting-empty" pass "" "$aw_json" ""
    else
      report_gate "engine-clear:awaiting-empty" fail "${aw_count} record(s) in awaitingMerge — engine has an in-flight PR" "$aw_json" ""
    fi
  fi

  # ── no-active-bugs: query BUG-*.md files for status: open ─────────────────
  # Active bugs = QUERY over BUG-* front matter (§9.1 — not stored in state.json).
  # Derive tasks dir from STATE_JSON location: dirname(STATE_JSON)/../tasks
  # This works for both real-repo and fixture modes (STATE_JSON is always set above).
  local tasks_dir
  tasks_dir="$(dirname "$STATE_JSON")/tasks"

  local bug_open_count=0
  local bug_names=""
  if [[ -d "$tasks_dir" ]]; then
    while IFS= read -r -d '' bugfile; do
      # Check status: open in front-matter (first 30 lines, case-insensitive)
      if head -30 "$bugfile" | grep -qiE '^status:[[:space:]]*open'; then
        bug_open_count=$(( bug_open_count + 1 ))
        bug_names="${bug_names} $(basename "$bugfile")"
      fi
    done < <(find "$tasks_dir" -maxdepth 1 -name 'BUG-*.md' -print0 2>/dev/null)
  fi

  local bug_json="{\"open_bugs\":${bug_open_count}}"
  if [[ "$bug_open_count" -eq 0 ]]; then
    report_gate "engine-clear:no-active-bugs" pass "" "$bug_json" ""
  else
    report_gate "engine-clear:no-active-bugs" fail "${bug_open_count} open BUG file(s):${bug_names}" "$bug_json" ""
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
  # The raw payload is the primary source for both fix-decision records.
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
    report_gate "fix-decision:verdict-parsed" fail "could not parse blocker/major/verdict from payload" "{}" "$raw"
    return
  fi
  report_gate "fix-decision:verdict-parsed" pass "" "{\"blocker\":${blocker},\"major\":${major},\"minor\":${minor:-0},\"nit\":${nit:-0}}" "$raw"

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
    report_gate "fix-decision:verdict-consistent" pass "" "{\"fix_required\":${derived},\"verdict\":\"${verdict}\"}" "$raw"
  else
    report_gate "fix-decision:verdict-consistent" fail "payload fix_required='${fix_req:-?}'/verdict='${verdict}' disagree with derived '${derived}'" "{\"derived\":${derived},\"payload_fix_required\":\"${fix_req:-}\",\"verdict\":\"${verdict}\"}" "$raw"
  fi

  # The decision itself is always reported (it never "fails" — it routes).
  if [[ "$derived" == "true" ]]; then
    printf "  %-44s %s\n" "fix-decision:route" "RUN /pr-fix (${actionable} blocker/major)"
  else
    printf "  %-44s %s\n" "fix-decision:route" "SKIP /pr-fix (0 blocker/major)"
  fi
  emit_log "fix-decision:route" "$([[ "$derived" == "true" ]] && echo run-fix || echo skip-fix)" "code" \
    "{\"pr\":${PR_NUMBER:-null},\"blocker\":${blocker},\"major\":${major},\"minor\":${minor:-0},\"nit\":${nit:-0},\"verdict\":\"${verdict}\"}" \
    "$raw"
}

# ---------------------------------------------------------------------------
# Gate: standards-decision  (code-standards audit verdict — mirrors fix-decision)
# Reads the structured pr-standards-verdict/v1 payload and derives fix-or-skip:
# RUN /pr-fix iff there is any `required` CS violation. `recommended`/`experimental`
# are advisory (never force a fix). The Fix phase ORs this with fix-decision.
# ---------------------------------------------------------------------------
gate_standards_decision() {
  [[ -n "$PR_STD_VERDICT_FILE" ]] || die "standards-decision gate needs --pr-standards-verdict <file>"
  [[ -f "$PR_STD_VERDICT_FILE" ]] || { report_gate "standards-decision:verdict-present" fail "verdict file not found: $PR_STD_VERDICT_FILE" "{}"; return; }

  # Accept raw JSON or the HTML-comment-wrapped block; collapse to one blob.
  local raw; raw="$(tr -d '\n' < "$PR_STD_VERDICT_FILE")"
  local required recommended experimental total verdict fix_req
  required="$(printf '%s' "$raw" | json_num required)"
  recommended="$(printf '%s' "$raw" | json_num recommended)"
  experimental="$(printf '%s' "$raw" | json_num experimental)"
  total="$(printf '%s' "$raw" | json_num total)"
  verdict="$(printf '%s' "$raw" | json_str verdict)"
  fix_req="$(printf '%s' "$raw" | json_bool fix_required)"
  [[ -z "$PR_NUMBER" ]] && PR_NUMBER="$(printf '%s' "$raw" | json_num pr || true)"

  if [[ -z "$required" || -z "$verdict" ]]; then
    report_gate "standards-decision:verdict-parsed" fail "could not parse violations.required/verdict from payload" "{}" "$raw"
    return
  fi
  report_gate "standards-decision:verdict-parsed" pass "" "{\"required\":${required},\"recommended\":${recommended:-0},\"experimental\":${experimental:-0},\"total\":${total:-0}}" "$raw"

  # Derived decision — pure code. Only `required` forces a fix.
  local derived="false"; [[ "$required" -gt 0 ]] && derived="true"

  # Consistency: payload fix_required + prose verdict must agree with the derived value.
  local consistent=1
  if [[ -n "$fix_req" && "$fix_req" != "$derived" ]]; then consistent=0; fi
  if [[ "$derived" == "true" && "$verdict" != "request-changes" ]]; then consistent=0; fi
  if [[ "$derived" == "false" && "$verdict" != "approve" ]]; then consistent=0; fi

  if [[ "$consistent" -eq 1 ]]; then
    report_gate "standards-decision:verdict-consistent" pass "" "{\"fix_required\":${derived},\"verdict\":\"${verdict}\"}" "$raw"
  else
    report_gate "standards-decision:verdict-consistent" fail "payload fix_required='${fix_req:-?}'/verdict='${verdict}' disagree with derived '${derived}'" "{\"derived\":${derived},\"payload_fix_required\":\"${fix_req:-}\",\"verdict\":\"${verdict}\"}" "$raw"
  fi

  # The decision itself always reports (it routes, never "fails").
  if [[ "$derived" == "true" ]]; then
    printf "  %-44s %s\n" "standards-decision:route" "RUN /pr-fix (${required} required CS violation(s))"
  else
    printf "  %-44s %s\n" "standards-decision:route" "SKIP /pr-fix (0 required CS violations)"
  fi
  emit_log "standards-decision:route" "$([[ "$derived" == "true" ]] && echo run-fix || echo skip-fix)" "code" \
    "{\"pr\":${PR_NUMBER:-null},\"required\":${required},\"recommended\":${recommended:-0},\"experimental\":${experimental:-0},\"verdict\":\"${verdict}\"}" \
    "$raw"
}

# ---------------------------------------------------------------------------
# Durability: snapshot the ephemeral live log into the committed history ledger.
# Union, deduped by exact line — re-running is idempotent, and a forgotten prior
# run is picked up the next time. The live log stays gitignored; the history is
# committed (the durable, cross-machine record "advance on data" rests on).
# ---------------------------------------------------------------------------
do_snapshot() {
  if [[ ! -f "$LOG_FILE" ]]; then
    echo "snapshot: no live log at $LOG_FILE — nothing to snapshot"
    return 0
  fi
  mkdir -p "$(dirname "$HISTORY_FILE")"
  touch "$HISTORY_FILE"
  local before after added
  before="$(grep -c . "$HISTORY_FILE" || true)"
  # Append only live lines not already present in history (exact-line dedup),
  # preserving live order. Key off FILENAME, not the NR==FNR idiom — the latter
  # mis-fires when history is empty (first live line gets NR==FNR and is dropped).
  awk -v hist="$HISTORY_FILE" '
    FILENAME==hist {seen[$0]=1; next}
    NF && !seen[$0]
  ' "$HISTORY_FILE" "$LOG_FILE" >> "$HISTORY_FILE"
  after="$(grep -c . "$HISTORY_FILE" || true)"
  added=$(( after - before ))
  echo "snapshot: ${added} new record(s) → ${HISTORY_FILE} (${after} total)"
}

# ---------------------------------------------------------------------------
# Erosion alarm. Scoped to the readiness:* gates — the only class with a stable
# invariant: an epic's front-matter / COVERAGE / deps should NOT change between
# re-runs of that epic's readiness gate. (engine-clear is epic-less and reads the
# global PROGRESS state; fix-decision is per-PR — both legitimately vary run to
# run, so cross-run digest comparison there would be benign noise, the alarm
# fatigue conclusion #4 warns against.) For each (epic, readiness:gate) it flags:
#   DIGEST DRIFT     >1 distinct inputs_digest  — the source the gate reads drifted
#   NONDETERMINISTIC same digest, >1 verdict    — a pure-code gate gave two answers
# The canonical hit: EPIC-006's deps-delivered digest encodes EPIC-002=planned
# vs =delivered across the bug + its fix. Exit 1 on any finding, 0 if clean.
# Records predating inputs_digest (empty) are ignored — they can't be compared.
# ---------------------------------------------------------------------------
do_check_drift() {
  if [[ ! -s "$HISTORY_FILE" ]]; then
    echo "check-drift: no history at $HISTORY_FILE — nothing to check (run snapshot first)"
    return 0
  fi
  echo "check-drift · history=${HISTORY_FILE} (scope: readiness:* gates)"
  local findings rc=0
  findings="$(awk '
    function field(line, key,   re, m) {
      re = "\"" key "\":\"[^\"]*\""
      if (match(line, re)) { m = substr(line, RSTART, RLENGTH); gsub("\"" key "\":\"", "", m); gsub("\"", "", m); return m }
      return ""
    }
    {
      gate = field($0, "gate")
      if (gate !~ /^readiness:/) next
      epic   = field($0, "epic")
      digest = field($0, "inputs_digest")
      verd   = field($0, "verdict")
      if (digest == "" || digest == "sha256:unavailable") next
      key = epic "|" gate
      if (index(seen_d[key], "\034" digest "\034") == 0) {
        seen_d[key] = seen_d[key] "\034" digest "\034"; dcount[key]++
      }
      # verdict observed under this exact digest (nondeterminism detector)
      dk = key "\035" digest
      if (index(seen_v[dk], "\034" verd "\034") == 0) {
        seen_v[dk] = seen_v[dk] "\034" verd "\034"; vcount[dk]++
      }
    }
    END {
      n = 0
      for (k in dcount) if (dcount[k] > 1) { printf "  DIGEST DRIFT      %s  (%d distinct inputs_digest)\n", k, dcount[k]; n++ }
      for (dk in vcount) if (vcount[dk] > 1) {
        split(dk, p, "\035"); printf "  NONDETERMINISTIC  %s  (same digest, %d verdicts)\n", p[1], vcount[dk]; n++
      }
      exit (n > 0 ? 3 : 0)
    }
  ' "$HISTORY_FILE")" || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    echo "  no drift — every readiness:(epic,gate) reproduced its inputs_digest"
    return 0
  fi
  printf '%s\n' "$findings"
  echo
  echo "RESULT: erosion alarm — drift detected (investigate before proceeding)"
  return 1
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "$GATE" in
  snapshot)      do_snapshot; exit 0 ;;
  check-drift)   do_check_drift; exit $? ;;
esac

echo "orchestrate-gates · gate=${GATE} epic=${EPIC:-—} run_id=${RUN_ID}"
case "$GATE" in
  readiness)     gate_readiness ;;
  engine-clear)  gate_engine_clear ;;
  fix-decision)  gate_fix_decision ;;
  standards-decision) gate_standards_decision ;;
  all)
    gate_readiness
    gate_engine_clear
    [[ -n "$PR_VERDICT_FILE" ]] && gate_fix_decision
    [[ -n "$PR_STD_VERDICT_FILE" ]] && gate_standards_decision
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

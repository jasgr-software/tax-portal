#!/usr/bin/env bash
# .orchestration/bin/sequence.sh
#
# Increment 3 — the deterministic Conductor sequencer (yield-and-resume driver).
#
# Owns the happy-path control flow as a state machine. Runs the MECHANICAL nodes
# itself (Select, Gate, Fix-route, Report-snapshot via orchestrate-gates.sh + gh);
# at each AGENT node (Compose, /io, /pr-review, /pr-fix, engine-merge, /planning
# validate) it emits a typed "next action" and exits 10 — the main session runs
# that one command, records the result with `--set key=val`, and re-invokes; the
# machine validates the artifact against primary sources and advances.
#
# It carries NO context between invocations: every call cold-starts from the
# machine-state block in STATE.md (the Increment-2 cold-start contract, now
# enforced by construction). A node whose artifact won't validate HALTS — the
# script can't absorb variance, it surfaces it (NORTH-STAR § Why #1).
#
# See .orchestration/design/INCREMENT-3-sequencer.md and NORTH-STAR.md.
#
# Usage:
#   sequence.sh [--epic EPIC-NNN]      run/resume the machine (cold-starts from STATE.md)
#   sequence.sh --set key=val [...]    record an agent node's artifact, then continue
#   sequence.sh --halt "reason"        mark the run halted (defer-to-inner-stop)
#   sequence.sh --status               print machine state; no advance
#   sequence.sh --reset                clear the machine state block (start fresh)
#
# Fixture/test overrides:
#   --state <file> --roadmap <file> --planning-dir <dir> --briefs-dir <dir>
#   --progress-md <file> --no-git --gate-log <file>
#
# Exit codes: 0 = run complete / status, 10 = agent action required (yield),
#             2 = halted / blocked, 1 = usage error.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATES="$(dirname "${BASH_SOURCE[0]}")/orchestrate-gates.sh"

STATE_FILE="${REPO_ROOT}/.orchestration/STATE.md"
ROADMAP="${REPO_ROOT}/.planning/ROADMAP.md"
PLANNING_DIR="${REPO_ROOT}/.planning"
BRIEFS_DIR="${REPO_ROOT}/.implementation/briefs"
PROGRESS_MD="${REPO_ROOT}/.implementation/tasks/PROGRESS.md"
STATE_JSON="${REPO_ROOT}/.implementation/state.json"
GATE_LOG=""            # passed through to orchestrate-gates.sh (default: its own)
GATE_HISTORY=""        # passed through for the report-snapshot (default: its own)
NO_GIT=0
PIN_EPIC=""
ACTION="run"          # run | set | halt | status | reset
SET_KVS=()
HALT_REASON=""

die() { echo "sequence: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --epic)         PIN_EPIC="${2:-}"; shift 2 ;;
    --set)          ACTION="set"; SET_KVS+=("${2:-}"); shift 2 ;;
    --halt)         ACTION="halt"; HALT_REASON="${2:-}"; shift 2 ;;
    --status)       ACTION="status"; shift ;;
    --reset)        ACTION="reset"; shift ;;
    --state)        STATE_FILE="${2:-}"; shift 2 ;;
    --roadmap)      ROADMAP="${2:-}"; shift 2 ;;
    --planning-dir) PLANNING_DIR="${2:-}"; shift 2 ;;
    --briefs-dir)   BRIEFS_DIR="${2:-}"; shift 2 ;;
    --progress-md)  PROGRESS_MD="${2:-}"; shift 2 ;;
    --state-json)   STATE_JSON="${2:-}"; shift 2 ;;
    --gate-log)     GATE_LOG="${2:-}"; shift 2 ;;
    --gate-history) GATE_HISTORY="${2:-}"; shift 2 ;;
    --no-git)       NO_GIT=1; shift ;;
    -h|--help)      sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              die "unknown argument: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# Machine state — a managed key=value block in STATE_FILE between the markers
#   <!-- conductor-state/v1 ... -->
# Loaded into the assoc array S; rewritten in full on every save (fixed key order).
# ---------------------------------------------------------------------------
declare -A S
STATE_KEYS=(phase epic brief pr std_verdict_file verdict_file lane fix_route merge_sha ac_ok fix_done validated halt_reason updated)
BEGIN_MARK="<!-- conductor-state/v1"
END_MARK="-->"

state_load() {
  local k; for k in "${STATE_KEYS[@]}"; do S[$k]=""; done
  [[ -f "$STATE_FILE" ]] || return 0
  local in=0 line key val
  while IFS= read -r line; do
    [[ "$line" == *"$BEGIN_MARK"* ]] && { in=1; continue; }
    [[ "$in" -eq 1 && "$line" == *"$END_MARK"* ]] && { in=0; continue; }
    if [[ "$in" -eq 1 && "$line" == *=* ]]; then
      key="${line%%=*}"; val="${line#*=}"
      key="$(printf '%s' "$key" | tr -d '[:space:]')"
      S[$key]="$val"
    fi
  done < "$STATE_FILE"
}

state_block() {
  printf '%s\n' "$BEGIN_MARK"
  local k; for k in "${STATE_KEYS[@]}"; do printf '%s=%s\n' "$k" "${S[$k]:-}"; done
  printf '%s\n' "$END_MARK"
}

state_save() {
  S[updated]="$(date -u +%FT%TZ)"
  mkdir -p "$(dirname "$STATE_FILE")"
  local block; block="$(state_block)"
  if [[ -f "$STATE_FILE" ]] && grep -qF "$BEGIN_MARK" "$STATE_FILE"; then
    # Replace the existing block in place.
    local tmp; tmp="$(mktemp)"
    awk -v block="$block" -v b="$BEGIN_MARK" -v e="$END_MARK" '
      index($0,b){print block; skip=1; next}
      skip && index($0,e){skip=0; next}
      skip{next}
      {print}
    ' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
  elif [[ -f "$STATE_FILE" ]] && grep -qE '^## Current run' "$STATE_FILE"; then
    # Insert the block right after the "## Current run" header.
    local tmp; tmp="$(mktemp)"
    awk -v block="$block" '
      {print}
      /^## Current run/ && !done {print ""; print block; done=1}
    ' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
  else
    # No STATE.md structure (fixtures) — the block IS the file.
    { printf '%s\n' "$block"; } > "$STATE_FILE"
  fi
}

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
say()   { printf '%s\n' "$*"; }
code()  { printf '  [code]  %-10s %s\n' "$1" "$2"; }
yield_action() {
  # $1 phase  $2 instruction  $3 record-hint
  printf '\n  [YIELD] %-10s %s\n' "$1" "$2"
  printf '          ↳ then: %s && re-invoke sequence.sh\n' "$3"
  say ""
  say "RESULT: agent action required (phase=$1)"
}
halt() {
  S[phase]="halted"; S[halt_reason]="$1"; state_save
  printf '\n  [HALT]  %s\n' "$1"
  say ""
  say "RESULT: halted — $1"
  exit 2
}

advance() { S[phase]="$1"; state_save; }

# ---------------------------------------------------------------------------
# Gate harness wrapper (mechanical gates re-derive from primary sources)
# ---------------------------------------------------------------------------
run_gate() {
  # $@ extra args to orchestrate-gates.sh
  local args=(--planning-dir "$PLANNING_DIR" --progress-md "$PROGRESS_MD" --state-json "$STATE_JSON")
  [[ "$NO_GIT" -eq 1 ]] && args+=(--no-git)
  [[ -n "$GATE_LOG" ]] && args+=(--log "$GATE_LOG")
  [[ -n "$GATE_HISTORY" ]] && args+=(--history "$GATE_HISTORY")
  bash "$GATES" "$@" "${args[@]}"
}

# ---------------------------------------------------------------------------
# Phase: select (code) — pick the earliest `planned` epic from the roadmap,
# or honor the --epic pin. Gate (next phase) decides GO/NO-GO. A NO-GO halts
# with blockers rather than auto-trying the next candidate (unexercised branch).
# ---------------------------------------------------------------------------
do_select() {
  if [[ -n "${S[epic]:-}" ]]; then code select "resume — epic ${S[epic]} already selected"; advance gate; return; fi
  local epic=""
  if [[ -n "$PIN_EPIC" ]]; then
    epic="$PIN_EPIC"
    code select "pinned → $epic"
  else
    [[ -f "$ROADMAP" ]] || halt "roadmap not found: $ROADMAP"
    # earliest table row whose status cell is `planned`, in file (= phase) order.
    epic="$(grep -nE '\*\*EPIC-[0-9]+\*\*' "$ROADMAP" \
            | grep -E '`planned`' \
            | head -1 | grep -oE 'EPIC-[0-9]+' | head -1 || true)"
    [[ -n "$epic" ]] || halt "no \`planned\` epic in $ROADMAP — author/unblock one via /planning"
    code select "next ready → $epic"
  fi
  S[epic]="$epic"; advance gate
}

# ---------------------------------------------------------------------------
# Phase: gate (code) — mechanical readiness + engine-clear. Criterion 5
# (AC-testability) is NOT here — it is the ac-check agent node next.
# ---------------------------------------------------------------------------
do_gate() {
  local out rc=0
  out="$(run_gate --gate readiness --epic "${S[epic]}" 2>&1)" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    say "$out" | sed 's/^/    /'
    halt "readiness gate FAILED for ${S[epic]} — see blockers above (do not relax; unblock via /planning)"
  fi
  rc=0
  out="$(run_gate --gate engine-clear 2>&1)" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    say "$out" | sed 's/^/    /'
    halt "engine-clear gate FAILED — the engine is not clear to start a new slice"
  fi
  code gate "GO (readiness + engine-clear PASS)"
  advance ac-check
}

# ---------------------------------------------------------------------------
# Phase: fix-route (code) — derive run-fix / skip-fix as the OR of the panel
# verdict (fix-decision) and the code-standards audit verdict (standards-decision).
# Route to fix-exec or merge. An inconsistent verdict — or a missing standards
# verdict — halts (erosion / fail-loud). One /pr-fix pass consumes both.
# ---------------------------------------------------------------------------
do_fix_route() {
  local vf="${S[verdict_file]:-}"
  [[ -n "$vf" ]] || halt "fix-route reached with no verdict_file recorded (review node did not complete)"
  [[ -f "$vf" ]] || vf="${REPO_ROOT}/${vf}"
  [[ -f "$vf" ]] || halt "verdict file not found: ${S[verdict_file]}"
  local out rc=0 panel_run=0 std_run=0

  # Panel decision (pr-review-verdict).
  out="$(run_gate --gate fix-decision --pr-verdict "$vf" --pr "${S[pr]:-}" 2>&1)" || rc=$?
  say "$out" | sed 's/^/    /'
  [[ "$rc" -eq 0 ]] || halt "fix-decision gate failed (verdict inconsistency — investigate the panel payload)"
  printf '%s' "$out" | grep -q 'RUN /pr-fix' && panel_run=1

  # Standards-review audit decision (pr-standards-verdict). The standards-review
  # node gates on its verdict file before reaching here, so a miss is fail-loud.
  local svf="${S[std_verdict_file]:-}"
  [[ -n "$svf" && ! -f "$svf" ]] && svf="${REPO_ROOT}/${svf}"
  [[ -n "$svf" && -f "$svf" ]] || halt "standards-review verdict missing (expected runs/PR-${S[pr]:-N}-standards-verdict.json) — fail loudly, not a clean pass"
  rc=0
  out="$(run_gate --gate standards-decision --pr-standards-verdict "$svf" --pr "${S[pr]:-}" 2>&1)" || rc=$?
  say "$out" | sed 's/^/    /'
  [[ "$rc" -eq 0 ]] || halt "standards-decision gate failed (verdict inconsistency — investigate the audit payload)"
  printf '%s' "$out" | grep -q 'RUN /pr-fix' && std_run=1

  if [[ "$panel_run" -eq 1 || "$std_run" -eq 1 ]]; then
    S[fix_route]="run-fix"; code fix-route "→ run-fix (panel=${panel_run} standards=${std_run})"; advance fix-exec
  else
    S[fix_route]="skip-fix"; code fix-route "→ skip-fix (panel + audit both clean)"; advance merge
  fi
}

# ---------------------------------------------------------------------------
# Phase: report (code) — snapshot the live verdict log into the durable ledger
# and scaffold the run report. (The prose run-report is the agent's to finish.)
# ---------------------------------------------------------------------------
do_report() {
  local out rc=0
  out="$(run_gate --gate snapshot 2>&1)" || rc=$?
  say "$out" | sed 's/^/    /'
  code report "verdict log snapshotted → runs/gate-history.jsonl"
  code report "write the run report (_templates/run-report.md) + set STATE outcome"
  code report "collapse the run: orchestrate-state.sh collapse-run --headline \"<one-line summary>\" (prepends ## Recent outcomes)"
  advance done
}

# ---------------------------------------------------------------------------
# Agent node — validate the exit artifact; advance if present, else yield.
#   agent_node <phase> <next> <validator-cmd> <yield-instruction> <record-hint>
# validator-cmd returns 0 when the node's artifact is present + valid.
# ---------------------------------------------------------------------------
agent_node() {
  local phase="$1" next="$2" validator="$3" instr="$4" hint="$5"
  if eval "$validator"; then
    code "$phase" "complete (artifact validated) → $next"
    advance "$next"
    return 0
  fi
  yield_action "$phase" "$instr" "$hint"
  exit 10
}

# Validators (re-derive from primary sources where possible — the contract test).
v_ac()        { [[ "${S[ac_ok]:-}" == "yes" ]]; }
v_brief()     {
  # Anchor to the epic-brief naming convention BRIEF-<NNN>-<slug>.md (AGENT.md § Compose):
  # the epic number must IMMEDIATELY follow "BRIEF-". The old loose glob (BRIEF-*<NNN>*.md)
  # collided with unrelated infix briefs sharing the number — e.g. EPIC-012 matched the
  # already-delivered BRIEF-LOE-012-state-store.md — and falsely satisfied the Compose gate.
  local f; f="$(find "$BRIEFS_DIR" -maxdepth 1 -name "BRIEF-${S[epic]#EPIC-}-*.md" 2>/dev/null | head -1)"
  [[ -z "$f" && -n "${S[brief]:-}" ]] && f="${S[brief]}"
  [[ -n "$f" && -f "$f" ]] && { S[brief]="$f"; return 0; }
  return 1
}
v_pr()        { [[ -n "${S[pr]:-}" ]]; }
v_std_verdict() {
  local vf="${S[std_verdict_file]:-}"; [[ -n "$vf" ]] || return 1
  [[ -f "$vf" || -f "${REPO_ROOT}/${vf}" ]]
}
v_verdict()   {
  local vf="${S[verdict_file]:-}"; [[ -n "$vf" ]] || return 1
  [[ -f "$vf" || -f "${REPO_ROOT}/${vf}" ]]
}
v_fix()       { [[ "${S[fix_done]:-}" == "yes" ]]; }
v_merge()     { [[ -n "${S[merge_sha]:-}" ]]; }
v_validated() { [[ "${S[validated]:-}" == "yes" ]]; }

# ---------------------------------------------------------------------------
# The state machine. Consecutive code phases run in one invocation; the loop
# stops at an agent yield (exit 10), a halt (exit 2), or done (exit 0).
# ---------------------------------------------------------------------------
step() {
  case "${S[phase]:-select}" in
    select)     do_select ;;
    gate)       do_gate ;;
    ac-check)   agent_node ac-check compose 'v_ac' \
                  "Confirm AC-testability for ${S[epic]}: each AC resolves to testable text in its cited REQ-* (Gate criterion 5, the one semantic gate). If any AC is non-verbatim/untestable, --halt." \
                  "sequence.sh --set ac_ok=yes" ;;
    compose)    agent_node compose implement 'v_brief' \
                  "Compose the build brief for ${S[epic]} per AGENT.md § Compose → write BRIEF to ${BRIEFS_DIR}/." \
                  "sequence.sh --set brief=<path>" ;;
    implement)  agent_node implement standards-review 'v_pr' \
                  "Invoke the engine: /io ${S[brief]:-<brief>} — drive to its limbo-ledger signal (PR recorded in state.json awaitingMerge[]). Defer on any inner stop (--halt)." \
                  "bash .orchestration/bin/orchestrate-state.sh derive-pr --apply   # derives PR# from state.json awaitingMerge[] (or: sequence.sh --set pr=<N>)" ;;
    standards-review) agent_node standards-review review 'v_std_verdict' \
                  "Audit the PR against .code-standards/: invoke /code-standards-review ${S[pr]:-<N>}; save the pr-standards-verdict payload to runs/PR-${S[pr]:-N}-standards-verdict.json. (Sequencer drives slice PRs = application code, so the audit always runs; the docs-only skip is the Conductor's, not here.)" \
                  "sequence.sh --set std_verdict_file=runs/PR-${S[pr]:-N}-standards-verdict.json" ;;
    review)     agent_node review fix-route 'v_verdict' \
                  "Invoke /pr-review ${S[pr]:-<N>}; save the pr-review-verdict payload to runs/PR-${S[pr]:-N}-verdict.json." \
                  "sequence.sh --set verdict_file=runs/PR-${S[pr]:-N}-verdict.json" ;;
    fix-route)  do_fix_route ;;
    fix-exec)   agent_node fix-exec merge 'v_fix' \
                  "Verdict routed run-fix: invoke /pr-fix ${S[pr]:-<N>} until CI is green. If the fixer caps out, --halt." \
                  "sequence.sh --set fix_done=yes" ;;
    merge)      agent_node merge validate 'v_merge' \
                  "Let the engine merge + finalize per MERGE-POLICY.md (merge is the engine's, not the Conductor's). Surface — do not satisfy — any LGTM/governance hold (--halt). Capture the merged SHA." \
                  "bash .orchestration/bin/orchestrate-state.sh derive-merge --pr ${S[pr]:-<N>} --apply   # derives merge SHA via gh (or: sequence.sh --set merge_sha=<sha>)" ;;
    validate)   agent_node validate report 'v_validated' \
                  "Invoke /planning validate ${S[epic]} with CI evidence ${S[merge_sha]:-<sha>}; the planning agent flips COVERAGE rows + rolls the epic. If validate returns incomplete/failing, --halt." \
                  "sequence.sh --set validated=yes" ;;
    report)     do_report ;;
    done)       say ""; say "RESULT: run complete — ${S[epic]:-?} delivered (phase=done)"; exit 0 ;;
    halted)     say ""; say "RESULT: run is halted — ${S[halt_reason]:-no reason recorded}. Resolve, then --set/--reset to resume."; exit 2 ;;
    *)          die "unknown phase: ${S[phase]}" ;;
  esac
}

run_machine() {
  say "sequence · cold-start @ phase=${S[phase]:-select} epic=${S[epic]:-—}"
  # Drive until a code phase yields/halts/completes. Each step() either advances
  # (loop continues) or exits (yield 10 / halt 2 / done 0). Bounded by phase count.
  local guard=0
  while :; do
    guard=$((guard+1)); [[ "$guard" -gt 24 ]] && die "phase loop exceeded bound (state machine bug)"
    step
  done
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
state_load

case "$ACTION" in
  status)
    say "conductor-state @ ${STATE_FILE}"
    local_k=""; for local_k in "${STATE_KEYS[@]}"; do
      [[ -n "${S[$local_k]:-}" ]] && printf '  %-12s %s\n' "$local_k" "${S[$local_k]}"
    done
    exit 0 ;;
  reset)
    local_k=""; for local_k in "${STATE_KEYS[@]}"; do S[$local_k]=""; done
    S[phase]="select"; state_save
    say "machine state reset → phase=select"
    exit 0 ;;
  halt)
    halt "${HALT_REASON:-halted by operator}" ;;
  set)
    local_kv=""
    for local_kv in "${SET_KVS[@]}"; do
      [[ "$local_kv" == *=* ]] || die "--set expects key=val, got: $local_kv"
      k="${local_kv%%=*}"; v="${local_kv#*=}"
      printf '%s\n' "${STATE_KEYS[*]}" | grep -qw "$k" || die "unknown state key: $k"
      S[$k]="$v"
    done
    state_save
    say "recorded: ${SET_KVS[*]}"
    run_machine ;;
  run)
    run_machine ;;
esac

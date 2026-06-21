#!/usr/bin/env bash
# .orchestration/bin/sequence.test.sh
#
# Deterministic state-machine test for sequence.sh — NO agents. It drives a full
# happy-path slice by feeding each agent node's exit artifact via --set and
# asserting the next transition (yield / code-step / halt / done) + exit code.
# Reuses orchestrate-gates.sh's own ready/notready fixtures for the gate calls.
#
#   bash .orchestration/bin/sequence.test.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEQ="${HERE}/sequence.sh"
FIX="${HERE}/__test_fixtures__"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PLN="${FIX}/ready/.planning"
PROG="${FIX}/ready/.implementation/tasks/PROGRESS.md"
NPLN="${FIX}/notready/.planning"
BR="${TMP}/briefs"; mkdir -p "$BR"
STATE="${TMP}/state.md"
LOG="${TMP}/gate-log.jsonl"; HIST="${TMP}/gate-history.jsonl"
APPROVE="${FIX}/verdict-approve.json"

# a fixture roadmap whose earliest planned epic is EPIC-900 (the ready fixture)
RM="${TMP}/ROADMAP.md"
cat > "$RM" <<'EOF'
# Roadmap
## Phase 1
| Epic | Slice | Status | Depends on |
|---|---|---|---|
| **EPIC-900** | sample ready slice | `planned` | — |
EOF

PASS=0; FAIL=0
ok()  { printf "  ✓ %s\n" "$1"; PASS=$((PASS+1)); }
bad() { printf "  ✗ %s\n" "$1"; FAIL=$((FAIL+1)); }

OUT=""; RC=0
seq_run() {  # seq_run <args...>
  OUT="$(bash "$SEQ" --state "$STATE" --roadmap "$RM" --planning-dir "$PLN" \
        --progress-md "$PROG" --briefs-dir "$BR" --gate-log "$LOG" \
        --gate-history "$HIST" --no-git "$@" 2>&1)"; RC=$?
}
expect_rc()   { [[ "$RC" -eq "$1" ]] && ok "$2 (exit $RC)" || { bad "$2 — wanted exit $1, got $RC"; printf '%s\n' "$OUT" | sed 's/^/      /'; }; }
expect_out()  { printf '%s' "$OUT" | grep -qF "$1" && ok "$2" || { bad "$2 — missing: $1"; printf '%s\n' "$OUT" | sed 's/^/      /'; }; }
phase_is()    { local p; p="$(bash "$SEQ" --state "$STATE" --status 2>/dev/null | awk '$1=="phase"{print $2}')"; [[ "$p" == "$1" ]] && ok "state phase=$1" || bad "state phase: wanted $1, got '$p'"; }

echo "sequence.test"

echo "[happy path]"
seq_run                                  # fresh: select + gate run, yield at ac-check
expect_rc 10 "fresh run yields"
expect_out "select" "select ran"
expect_out "EPIC-900" "selected the planned epic from the roadmap"
expect_out "GO (readiness + engine-clear PASS)" "gate passed"
expect_out "[YIELD] ac-check" "yielded at ac-check (the one semantic gate)"
phase_is ac-check

seq_run --set ac_ok=yes                   # ac confirmed → yield compose
expect_rc 10 "ac-check → compose yield"
expect_out "[YIELD] compose" "yields at compose"
phase_is compose

touch "${BR}/BRIEF-900-sample.md"         # brief written → auto-validated
seq_run
expect_rc 10 "compose artifact auto-validated → implement yield"
expect_out "[YIELD] implement" "yields at implement"
phase_is implement

seq_run --set pr=123                       # PR recorded → yield standards-review
expect_rc 10 "implement → standards-review yield"
expect_out "[YIELD] standards-review" "yields at standards-review (audit before the panel)"
phase_is standards-review

seq_run --set "std_verdict_file=${FIX}/verdict-standards-approve.json"   # audit verdict present → yield review
expect_rc 10 "standards-review → review yield"
expect_out "[YIELD] review" "yields at review"
phase_is review

seq_run --set "verdict_file=${APPROVE}"    # both verdicts present → review→fix-route(code)→merge yield
expect_rc 10 "review → fix-route(code) → merge yield"
expect_out "fix-route" "fix-route ran as code"
expect_out "skip-fix" "clean panel + clean audit routed skip-fix"
expect_out "[YIELD] merge" "skipped fix-exec, yields at merge"
phase_is merge

seq_run --set merge_sha=deadbee            # merged → yield validate
expect_rc 10 "merge → validate yield"
expect_out "[YIELD] validate" "yields at validate"
phase_is validate

seq_run --set validated=yes                # validated → report(code) → done
expect_rc 0 "validate → report(code) → done"
expect_out "verdict log snapshotted" "report snapshotted the verdict log"
expect_out "run complete" "run reaches done"
phase_is done

echo "[run-fix routing — panel arm of the OR]"
S2="${TMP}/state2.md"; RC2="${FIX}/verdict-request-changes.json"
# Jump straight to fix-route with a request-changes PANEL verdict + a clean audit
# verdict → the panel arm of the OR must route run-fix and yield at fix-exec.
OUT="$(bash "$SEQ" --state "$S2" --roadmap "$RM" --planning-dir "$PLN" --progress-md "$PROG" \
      --briefs-dir "$BR" --gate-log "$LOG" --gate-history "$HIST" --no-git \
      --set phase=fix-route --set pr=55 --set "verdict_file=${RC2}" \
      --set "std_verdict_file=${FIX}/verdict-standards-approve.json" 2>&1)"; RC=$?
expect_rc 10 "request-changes (panel) routes to fix-exec"
expect_out "→ run-fix" "fix-route → run-fix"
expect_out "[YIELD] fix-exec" "yields at fix-exec"

echo "[run-fix routing — standards arm of the OR]"
S3="${TMP}/state3.md"
# Clean PANEL verdict but a required CS violation in the AUDIT verdict → the
# standards arm of the OR must still route run-fix (one /pr-fix consumes both).
OUT="$(bash "$SEQ" --state "$S3" --roadmap "$RM" --planning-dir "$PLN" --progress-md "$PROG" \
      --briefs-dir "$BR" --gate-log "$LOG" --gate-history "$HIST" --no-git \
      --set phase=fix-route --set pr=56 --set "verdict_file=${APPROVE}" \
      --set "std_verdict_file=${FIX}/verdict-standards-request-changes.json" 2>&1)"; RC=$?
expect_rc 10 "required CS violation routes to fix-exec on a clean panel"
expect_out "standards=1" "fix-route attributes the run to the standards audit"
expect_out "[YIELD] fix-exec" "yields at fix-exec"

echo "[standards verdict fail-loud]"
S4="${TMP}/state4.md"
# fix-route with the panel verdict present but the standards verdict MISSING must
# halt (a missing audit verdict is a gap, never a clean pass).
OUT="$(bash "$SEQ" --state "$S4" --roadmap "$RM" --planning-dir "$PLN" --progress-md "$PROG" \
      --briefs-dir "$BR" --gate-log "$LOG" --gate-history "$HIST" --no-git \
      --set phase=fix-route --set pr=57 --set "verdict_file=${APPROVE}" 2>&1)"; RC=$?
expect_rc 2 "fix-route halts when the standards verdict is missing"
expect_out "standards-review verdict missing" "fail-loud, not a clean pass"

echo "[halts]"
# gate failure: pin a not-ready epic → readiness halts
SH="${TMP}/state-halt.md"
OUT="$(bash "$SEQ" --state "$SH" --roadmap "$RM" --planning-dir "$NPLN" --progress-md "$PROG" \
      --briefs-dir "$BR" --gate-log "$LOG" --gate-history "$HIST" --no-git --epic EPIC-902 2>&1)"; RC=$?
expect_rc 2 "not-ready epic halts at gate"
expect_out "readiness gate FAILED" "halt names the failing gate"
# operator --halt
SH2="${TMP}/state-halt2.md"
bash "$SEQ" --state "$SH2" --reset >/dev/null 2>&1
OUT="$(bash "$SEQ" --state "$SH2" --halt "engine killswitch" 2>&1)"; RC=$?
expect_rc 2 "operator --halt stops the run"
expect_out "engine killswitch" "halt records the reason"

echo
echo "RESULT: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]

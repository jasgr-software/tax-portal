#!/usr/bin/env bash
# .orchestration/bin/orchestrate-gates.test.sh
#
# Self-contained test for orchestrate-gates.sh, run against __test_fixtures__/.
# No network, no real repo state. Exit 0 = all assertions pass.
#
#   bash .orchestration/bin/orchestrate-gates.test.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATES="${HERE}/orchestrate-gates.sh"
FIX="${HERE}/__test_fixtures__"
TMP="$(mktemp -d)"
LOG="${TMP}/gate-log.jsonl"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok()   { printf "  ✓ %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  ✗ %s\n" "$1"; FAIL=$((FAIL+1)); }

# run <expected-exit> <desc> -- <args...>
run() {
  local want="$1" desc="$2"; shift 2; [[ "$1" == "--" ]] && shift
  local out; out="$(bash "$GATES" "$@" --log "$LOG" 2>&1)"; local got=$?
  if [[ "$got" -eq "$want" ]]; then ok "$desc (exit $got)"; else
    bad "$desc — wanted exit $want, got $got"; printf '%s\n' "$out" | sed 's/^/      /'
  fi
}

# assert the last log line for a gate contains a substring
log_has() {
  local desc="$1" needle="$2"
  if grep -q "$needle" "$LOG"; then ok "$desc"; else
    bad "$desc — log missing: $needle"; fi
}

echo "orchestrate-gates.test"

echo "[readiness]"
run 0 "ready epic passes readiness"        -- --gate readiness --fixture-dir "$FIX/ready"    --epic EPIC-900
: > "$LOG"
run 1 "not-ready epic fails readiness"     -- --gate readiness --fixture-dir "$FIX/notready" --epic EPIC-902
log_has "  ↳ status-planned fails"     '"gate":"readiness:status-planned","verdict":"fail"'
log_has "  ↳ open-questions fails"     '"gate":"readiness:open-questions-empty","verdict":"fail"'
log_has "  ↳ deps-delivered fails"     '"gate":"readiness:deps-delivered","verdict":"fail"'
log_has "  ↳ coverage-rows fails (table-cell match, not prose)" '"gate":"readiness:coverage-rows","verdict":"fail"'
run 1 "missing epic fails readiness"       -- --gate readiness --fixture-dir "$FIX/ready"    --epic EPIC-404

echo "[engine-clear]"
# BRIEF-LOE-012 cutover: engine-clear now reads state.json (awaitingMerge[]) + BUG-*.md files.
run 0 "empty awaitingMerge + no open BUG files passes engine-clear"   -- --gate engine-clear --fixture-dir "$FIX/ready"
run 1 "in-flight awaitingMerge record fails engine-clear"     -- --gate engine-clear --fixture-dir "$FIX/notready"
# Regression guard: closed BUG-*.md files (status: closed) do NOT trip the no-active-bugs gate.
: > "$LOG"
run 0 "closed BUG files don't trip engine-clear no-active-bugs" -- --gate engine-clear --fixture-dir "$FIX/markerwording"
log_has "  ↳ no-active-bugs passes (closed BUG files ignored)" '"gate":"engine-clear:no-active-bugs","verdict":"pass"'
# Disposition respec: an OPEN bug dispositioned `severity: non-blocking` does NOT block
# the gate (NORTH-STAR § Why #4 — predictably-benign halt = mis-specified gate), but is surfaced.
: > "$LOG"
run 0 "open non-blocking bug does not trip engine-clear no-active-bugs" -- --gate engine-clear --fixture-dir "$FIX/disposed"
log_has "  ↳ no-active-bugs passes (open non-blocking bug skipped)" '"gate":"engine-clear:no-active-bugs","verdict":"pass"'
log_has "  ↳ evidence records the skipped non-blocking bug" '"open_nonblocking_bugs":1'
# Conservative default holds: an open bug with NO non-blocking disposition still blocks,
# via the no-active-bugs rail alone (empty awaitingMerge in this fixture).
: > "$LOG"
run 1 "open blocking bug still fails engine-clear no-active-bugs" -- --gate engine-clear --fixture-dir "$FIX/blockingbug"
log_has "  ↳ no-active-bugs fails on a real open bug" '"gate":"engine-clear:no-active-bugs","verdict":"fail"'

echo "[fix-decision]"
: > "$LOG"
run 0 "approve verdict parses + routes"      -- --gate fix-decision --pr-verdict "$FIX/verdict-approve.json"
log_has "approve routes to skip-fix" '"gate":"fix-decision:route","verdict":"skip-fix"'
: > "$LOG"
run 0 "request-changes verdict parses + routes" -- --gate fix-decision --pr-verdict "$FIX/verdict-request-changes.json"
log_has "request-changes routes to run-fix" '"gate":"fix-decision:route","verdict":"run-fix"'
: > "$LOG"
run 1 "inconsistent verdict fails consistency"  -- --gate fix-decision --pr-verdict "$FIX/verdict-inconsistent.json"

echo "[standards-decision]"
: > "$LOG"
run 0 "approve standards verdict parses + routes"      -- --gate standards-decision --pr-standards-verdict "$FIX/verdict-standards-approve.json"
log_has "approve routes to skip-fix" '"gate":"standards-decision:route","verdict":"skip-fix"'
: > "$LOG"
run 0 "required violation parses + routes"             -- --gate standards-decision --pr-standards-verdict "$FIX/verdict-standards-request-changes.json"
log_has "required violation routes to run-fix" '"gate":"standards-decision:route","verdict":"run-fix"'
: > "$LOG"
run 1 "inconsistent standards verdict fails consistency" -- --gate standards-decision --pr-standards-verdict "$FIX/verdict-standards-inconsistent.json"

echo "[verdict-log]"
: > "$LOG"
bash "$GATES" --gate readiness --fixture-dir "$FIX/ready" --epic EPIC-900 --log "$LOG" >/dev/null 2>&1
if grep -q '"source":"code"' "$LOG" && grep -q '"gate":"readiness:status-planned"' "$LOG"; then
  ok "readiness emits code-sourced log records"
else
  bad "readiness did not emit expected log records"; sed 's/^/      /' "$LOG"
fi

echo "[inputs-digest]"
# every record carries a well-formed sha256: digest (the erosion-alarm memory)
if grep -q '"inputs_digest":"sha256:[0-9a-f]\{64\}"' "$LOG"; then
  ok "records carry a well-formed sha256 inputs_digest"
else
  bad "inputs_digest missing/malformed"; sed 's/^/      /' "$LOG"
fi
# deterministic: same inputs → same digest across two independent runs
A="${TMP}/a.jsonl"; B="${TMP}/b.jsonl"
bash "$GATES" --gate readiness --fixture-dir "$FIX/ready" --epic EPIC-900 --log "$A" >/dev/null 2>&1
bash "$GATES" --gate readiness --fixture-dir "$FIX/ready" --epic EPIC-900 --log "$B" >/dev/null 2>&1
dig_a="$(grep '"gate":"readiness:status-planned"' "$A" | grep -oE '"inputs_digest":"sha256:[0-9a-f]+"' | head -1)"
dig_b="$(grep '"gate":"readiness:status-planned"' "$B" | grep -oE '"inputs_digest":"sha256:[0-9a-f]+"' | head -1)"
if [[ -n "$dig_a" && "$dig_a" == "$dig_b" ]]; then
  ok "same inputs reproduce the same digest (deterministic)"
else
  bad "digest not deterministic: '$dig_a' vs '$dig_b'"
fi
# change-sensitive: a different epic front-matter → a different digest
C="${TMP}/c.jsonl"
bash "$GATES" --gate readiness --fixture-dir "$FIX/notready" --epic EPIC-902 --log "$C" >/dev/null 2>&1
dig_c="$(grep '"gate":"readiness:status-planned"' "$C" | grep -oE '"inputs_digest":"sha256:[0-9a-f]+"' | head -1)"
if [[ -n "$dig_c" && "$dig_c" != "$dig_a" ]]; then
  ok "changed source front-matter → changed digest (drift-sensitive)"
else
  bad "digest did not change on a different source: ready='$dig_a' notready='$dig_c'"
fi

echo "[snapshot]"
LIVE="${TMP}/live.jsonl"; HIST="${TMP}/history.jsonl"
cp "$A" "$LIVE"; rm -f "$HIST"
count() { [[ -f "$1" ]] && wc -l < "$1" | tr -d ' ' || echo 0; }
bash "$GATES" --gate snapshot --log "$LIVE" --history "$HIST" >/dev/null 2>&1
n1="$(count "$HIST")"
bash "$GATES" --gate snapshot --log "$LIVE" --history "$HIST" >/dev/null 2>&1   # re-run
n2="$(count "$HIST")"
if [[ "$n1" -gt 0 && "$n1" -eq "$n2" ]]; then
  ok "snapshot is idempotent (re-run adds 0; ${n1} records)"
else
  bad "snapshot not idempotent: first=$n1 second=$n2"
fi
# a genuinely new live record is picked up by a later snapshot
cat "$C" >> "$LIVE"
bash "$GATES" --gate snapshot --log "$LIVE" --history "$HIST" >/dev/null 2>&1
n3="$(count "$HIST")"
if [[ "$n3" -gt "$n2" ]]; then
  ok "snapshot unions new live records (${n2} → ${n3})"
else
  bad "snapshot did not pick up new records: $n2 → $n3"
fi

echo "[check-drift]"
# clean history (one epic, consistent digests) → exit 0
CLEAN="${TMP}/clean.jsonl"
cat "$A" "$B" > "$CLEAN"
run 0 "consistent history shows no drift"  -- --gate check-drift --history "$CLEAN"
# drifted history (same epic+gate, two different digests) → exit 1
DRIFT="${TMP}/drift.jsonl"
{
  printf '{"run_id":"r1","epic":"EPIC-900","gate":"readiness:deps-delivered","verdict":"pass","source":"code","inputs_digest":"sha256:aaaa","ts":"t1","evidence":{}}\n'
  printf '{"run_id":"r2","epic":"EPIC-900","gate":"readiness:deps-delivered","verdict":"fail","source":"code","inputs_digest":"sha256:bbbb","ts":"t2","evidence":{}}\n'
} > "$DRIFT"
run 1 "digest+verdict drift trips the alarm" -- --gate check-drift --history "$DRIFT"

echo
echo "RESULT: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]

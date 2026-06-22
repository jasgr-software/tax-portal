#!/usr/bin/env bash
# .orchestration/bin/orchestrate-state.test.sh
#
# Self-contained test for orchestrate-state.sh against synthetic fixtures.
# No network, no gh, no real repo state. Exit 0 = all assertions pass.
#
#   bash .orchestration/bin/orchestrate-state.test.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ST="${HERE}/orchestrate-state.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok()  { printf "  ✓ %s\n" "$1"; PASS=$((PASS+1)); }
bad() { printf "  ✗ %s\n" "$1"; FAIL=$((FAIL+1)); }

# eq <expected-stdout> <desc> -- <args...>
eq() {
  local want="$1" desc="$2"; shift 2; [[ "$1" == "--" ]] && shift
  local got; got="$(bash "$ST" "$@" 2>/dev/null)"
  if [[ "$got" == "$want" ]]; then ok "$desc"; else bad "$desc — wanted '$want', got '$got'"; fi
}
# exits <code> <desc> -- <args...>
exits() {
  local want="$1" desc="$2"; shift 2; [[ "$1" == "--" ]] && shift
  bash "$ST" "$@" >/dev/null 2>&1; local got=$?
  if [[ "$got" -eq "$want" ]]; then ok "$desc (exit $got)"; else bad "$desc — wanted exit $want, got $got"; fi
}

# --- fixtures ---------------------------------------------------------------
# BRIEF-LOE-012 cutover: derive-pr reads state.json awaitingMerge[], not PROGRESS.md.
STATE_ONE="$TMP/state-one.json"
STATE_MULTI="$TMP/state-multi.json"
STATE_NONE="$TMP/state-none.json"
cat > "$STATE_ONE" <<'EOF'
{
  "schemaVersion": "1.0",
  "lastUpdated": "2026-06-21T00:00:00Z",
  "currentBrief": "BRIEF-900",
  "currentPhase": "Review",
  "currentSliceDescription": "fixture — one awaiting PR",
  "currentBranch": "brief-900-sample",
  "awaitingMerge": [
    {
      "pr": 55,
      "prUrl": "https://github.com/x/y/pull/55",
      "squashSha": null,
      "createdAt": "2026-06-21T00:00:00Z",
      "gateVerdicts": {
        "containerSmoke": null,
        "sdetValidation": null,
        "sdetCiGate": null,
        "sdetQualityAudit": null
      },
      "note": "BRIEF-900 awaiting merge"
    }
  ],
  "openRetroItems": []
}
EOF
cat > "$STATE_MULTI" <<'EOF'
{
  "schemaVersion": "1.0",
  "lastUpdated": "2026-06-21T00:00:00Z",
  "currentBrief": "BRIEF-900",
  "currentPhase": "Review",
  "currentSliceDescription": "fixture — two awaiting PRs (ambiguous)",
  "currentBranch": "brief-900-sample",
  "awaitingMerge": [
    {
      "pr": 55,
      "prUrl": "https://github.com/x/y/pull/55",
      "squashSha": null,
      "createdAt": "2026-06-21T00:00:00Z",
      "gateVerdicts": {
        "containerSmoke": null,
        "sdetValidation": null,
        "sdetCiGate": null,
        "sdetQualityAudit": null
      },
      "note": null
    },
    {
      "pr": 56,
      "prUrl": "https://github.com/x/y/pull/56",
      "squashSha": null,
      "createdAt": "2026-06-21T00:00:01Z",
      "gateVerdicts": {
        "containerSmoke": null,
        "sdetValidation": null,
        "sdetCiGate": null,
        "sdetQualityAudit": null
      },
      "note": null
    }
  ],
  "openRetroItems": []
}
EOF
cat > "$STATE_NONE" <<'EOF'
{
  "schemaVersion": "1.0",
  "lastUpdated": "2026-06-21T00:00:00Z",
  "currentBrief": null,
  "currentPhase": null,
  "currentSliceDescription": null,
  "currentBranch": null,
  "awaitingMerge": [],
  "openRetroItems": []
}
EOF

MERGE_JSON="$TMP/merge.json"
printf '{"mergeCommit":{"oid":"abc1234def5678901234"}}\n' > "$MERGE_JSON"

VERDICT="$TMP/verdict.json"
cat > "$VERDICT" <<'EOF'
<!-- pr-review-verdict
{"schema":"pr-review-verdict/v1","pr":55,"verdict":"approve","fix_required":false,"findings":{"blocker":0,"major":0,"minor":6,"nit":2,"total_after_dedupe":8}}
-->
EOF

COV="$TMP/coverage.md"
cat > "$COV" <<'EOF'
| REQ | AC | Epic | Phase | Status |
|---|---|---|---|---|
| REQ-X-001 | AC-X-001-01 | EPIC-900 | 2 | verified |
| REQ-X-001 | AC-X-001-02 | EPIC-900 | 2 | planned |
| REQ-X-002 | AC-X-002-01 | EPIC-901 | 2 | verified |
EOF

STATEF="$TMP/state.md"
cat > "$STATEF" <<'EOF'
# Conductor State

## Current run

<!-- conductor-state/v1
phase=report
epic=EPIC-900
pr=55
merge_sha=abc1234def5678901234
-->

## Recent outcomes

- **EPIC-899** ✅ DELIVERED 2026-06-20 · PR #50 → `aaaaaaa` · 5/5 AC · prior thing
EOF

echo "orchestrate-state.test"

echo "[derive-pr]"
# BRIEF-LOE-012 cutover: derive-pr reads state.json awaitingMerge[], not PROGRESS.md.
eq "pr=55" "single awaiting PR → pr=55"             -- derive-pr --state-json "$STATE_ONE"
exits 2 "ambiguous (>1) awaiting PR fails loud"      -- derive-pr --state-json "$STATE_MULTI"
exits 2 "no awaiting PR fails loud"                  -- derive-pr --state-json "$STATE_NONE"

echo "[derive-merge]"
eq "merge_sha=abc1234def5678901234" "merge SHA from json fixture" -- derive-merge --pr 55 --json-file "$MERGE_JSON"
exits 2 "missing --pr and no state fails"            -- derive-merge --json-file "$MERGE_JSON" --state "$TMP/none.md"

echo "[derive-review]"
eq "verdict=approve blocker=0 major=0 minor=6 nit=2" "counts + decision from verdict" -- derive-review --verdict-file "$VERDICT"

echo "[derive-validation]"
eq "ac=1/2" "verified/total for EPIC-900 (cell match, excludes EPIC-901)" -- derive-validation --epic EPIC-900 --coverage "$COV"

echo "[collapse-run]"
eq '- **EPIC-900** ✅ DELIVERED 2026-06-21 · PR #55 → `abc1234` · 8/8 AC · did the thing' \
   "composes the outcome one-liner" \
   -- collapse-run --state "$STATEF" --ac 8/8 --date 2026-06-21 --headline "did the thing"
# the new bullet must be prepended ABOVE the prior EPIC-899 bullet
if [[ "$(grep -nE '^- \*\*EPIC-(900|899)' "$STATEF" | head -1)" == *EPIC-900* ]]; then
  ok "new outcome prepended above the prior one"
else
  bad "new outcome not prepended first"; grep -nE '^- \*\*EPIC-' "$STATEF" | sed 's/^/      /'
fi
exits 2 "collapse-run without --headline fails" -- collapse-run --state "$STATEF" --ac 8/8

echo
echo "RESULT: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]

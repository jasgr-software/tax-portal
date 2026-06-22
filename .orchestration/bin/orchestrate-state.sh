#!/usr/bin/env bash
# .orchestration/bin/orchestrate-state.sh
#
# Increment 3 — Phase 2 (bookkeeping derivers). The Conductor's deterministic
# artifact derivers + the one prose-ledger write. See
# design/INCREMENT-3-sequencer.md § Phase 2.
#
# Phase 1 took control flow + gate verdicts from the agent, but the agent still
# hand-extracts the values it records via `sequence.sh --set` (the PR number off
# state.json, the merge SHA from gh, the AC count from COVERAGE) and hand-writes
# the close-out one-liner. Those are pure mechanics — this scripts them so each
# mechanical yield becomes one command, leaving the agent only the semantic nodes.
#
# BRIEF-LOE-012 cutover: derive-pr was re-pointed from PROGRESS.md to state.json
# (awaitingMerge array). PROGRESS.md was deleted; state.json is the new primary
# source for in-flight PR tracking.
#
# Invariants (design § Phase 2):
#   - Single writer of the machine block: the derive-* verbs EMIT `key=val` and,
#     with --apply, feed `sequence.sh --set` — they never write the
#     <!-- conductor-state/v1 --> block themselves. Only `collapse-run` writes,
#     and only the prose `## Recent outcomes` bullet (the one write nothing else owns).
#   - Re-derive from primary sources (state.json / gh / the verdict JSON / COVERAGE).
#   - Halt on ambiguity, never guess (derive-pr on 0 or >1 awaiting PRs fails loudly).
#   - Derivers, not deciders: they fill artifacts; the gate rails keep all routing.
#
# Usage:
#   orchestrate-state.sh derive-pr          [--state-json <f>] [--apply]
#   orchestrate-state.sh derive-merge --pr N [--json-file <f>]  [--apply]
#   orchestrate-state.sh derive-review --verdict-file <f>
#   orchestrate-state.sh derive-validation --epic EPIC-NNN [--coverage <f>]
#   orchestrate-state.sh collapse-run --headline "<text>" [--date YYYY-MM-DD] [--ac <v/t>]
#
# Common options: --repo-root <dir> · --state <f>   (fixture overrides)
# Output: stdout carries the machine line(s) (`key=value`); commentary goes to stderr.
# Exit codes: 0 = ok, 2 = usage / ambiguity (fail-loud) error.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STATE_FILE=""; PROGRESS_MD=""; STATE_JSON=""; COVERAGE=""; VERDICT_FILE=""; JSON_FILE=""
PR_NUMBER=""; EPIC=""; HEADLINE=""; DATE=""; AC_OVERRIDE=""; APPLY=0

die() { echo "orchestrate-state: $*" >&2; exit 2; }

[[ $# -ge 1 ]] || die "missing <verb> (derive-pr|derive-merge|derive-review|derive-validation|collapse-run)"
VERB="$1"; shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)    REPO_ROOT="${2:-}"; shift 2 ;;
    --state)        STATE_FILE="${2:-}"; shift 2 ;;
    --progress-md)  PROGRESS_MD="${2:-}"; shift 2 ;;
    --state-json)   STATE_JSON="${2:-}"; shift 2 ;;
    --coverage)     COVERAGE="${2:-}"; shift 2 ;;
    --verdict-file) VERDICT_FILE="${2:-}"; shift 2 ;;
    --json-file)    JSON_FILE="${2:-}"; shift 2 ;;
    --pr)           PR_NUMBER="${2:-}"; shift 2 ;;
    --epic)         EPIC="${2:-}"; shift 2 ;;
    --headline)     HEADLINE="${2:-}"; shift 2 ;;
    --date)         DATE="${2:-}"; shift 2 ;;
    --ac)           AC_OVERRIDE="${2:-}"; shift 2 ;;
    --apply)        APPLY=1; shift ;;
    -h|--help)      sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)              die "unknown argument: $1" ;;
  esac
done

: "${STATE_FILE:=${REPO_ROOT}/.orchestration/STATE.md}"
: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
: "${STATE_JSON:=${REPO_ROOT}/.implementation/state.json}"
: "${COVERAGE:=${REPO_ROOT}/.planning/COVERAGE.md}"

# ---------------------------------------------------------------------------
# Helpers (json_* mirror orchestrate-gates.sh; the machine block is read-only here)
# ---------------------------------------------------------------------------
json_str() { grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed -E "s/.*:[[:space:]]*\"([^\"]*)\".*/\1/" | head -1; }
json_num() { grep -oE "\"$1\"[[:space:]]*:[[:space:]]*[0-9]+" | grep -oE '[0-9]+$' | head -1; }

# Read a key from the STATE.md conductor-state block (read-only).
state_get() {
  local key="$1" in=0 line k v
  [[ -f "$STATE_FILE" ]] || return 0
  while IFS= read -r line; do
    [[ "$line" == *"<!-- conductor-state/v1"* ]] && { in=1; continue; }
    [[ "$in" -eq 1 && "$line" == *"-->"* ]] && break
    if [[ "$in" -eq 1 && "$line" == *=* ]]; then
      k="${line%%=*}"; v="${line#*=}"; k="$(printf '%s' "$k" | tr -d '[:space:]')"
      [[ "$k" == "$key" ]] && { printf '%s' "$v"; return 0; }
    fi
  done < "$STATE_FILE"
}

# Print the body of "## <h>" up to the next "## " in $1.
section_body() { awk -v h="## $1" '$0==h{f=1;next} f&&/^## /{f=0} f' "$2"; }

# Record a derived key=val by delegating to sequence.sh (the SOLE block writer).
apply_kv() {
  local kv="$1"
  bash "${SELF_DIR}/sequence.sh" --set "$kv" --state "$STATE_FILE" >&2 || true
}

emit() { # $1 key=val(s, space-sep)  — stdout is the machine line; echo a human note to stderr
  printf '%s\n' "$1"
  if [[ "$APPLY" -eq 1 ]]; then local kv; for kv in $1; do apply_kv "$kv"; done; fi
}

# ---------------------------------------------------------------------------
# derive-pr — the awaiting-merge PR number from state.json (re-pointed from
# PROGRESS.md in the BRIEF-LOE-012 cutover). Reads awaitingMerge[] and
# extracts the single pr value. Fail loud on 0 or >1.
# ---------------------------------------------------------------------------
do_derive_pr() {
  [[ -f "$STATE_JSON" ]] || die "state.json not found: $STATE_JSON"
  local nums count
  # Extract pr values from awaitingMerge array using python3 (system stdlib, no new dep).
  nums="$(python3 - "$STATE_JSON" <<'PYEOF'
import json, sys
try:
  data = json.load(open(sys.argv[1]))
  prs = [str(r["pr"]) for r in data.get("awaitingMerge", [])]
  print("\n".join(sorted(set(prs))))
except Exception as e:
  sys.stderr.write(f"error reading state.json: {e}\n")
  sys.exit(2)
PYEOF
)"
  count="$(printf '%s' "$nums" | grep -c . || true)"
  [[ "${count:-0}" -ge 1 ]] || die "no PR found in state.json awaitingMerge[] — engine has not opened a PR (do not guess)"
  [[ "${count:-0}" -eq 1 ]] || die "ambiguous: ${count} distinct PRs in awaitingMerge ($(printf '%s' "$nums" | tr '\n' ' ')) — refusing to guess"
  echo "orchestrate-state: derive-pr → PR ${nums} (from state.json awaitingMerge)" >&2
  emit "pr=${nums}"
}

# ---------------------------------------------------------------------------
# derive-merge — the squash-merge SHA. From gh by default; --json-file for tests.
# ---------------------------------------------------------------------------
do_derive_merge() {
  [[ -n "$PR_NUMBER" ]] || PR_NUMBER="$(state_get pr)"
  [[ -n "$PR_NUMBER" ]] || die "derive-merge needs --pr <N> (or a pr= in the state block)"
  local sha
  if [[ -n "$JSON_FILE" ]]; then
    [[ -f "$JSON_FILE" ]] || die "json file not found: $JSON_FILE"
    sha="$(tr -d '\n' < "$JSON_FILE" | json_str oid)"
  else
    command -v gh >/dev/null 2>&1 || die "gh not available and no --json-file given"
    sha="$(gh pr view "$PR_NUMBER" --json mergeCommit -q '.mergeCommit.oid' 2>/dev/null || true)"
  fi
  [[ -n "$sha" ]] || die "no merge SHA for PR ${PR_NUMBER} (not merged yet?) — do not guess"
  echo "orchestrate-state: derive-merge → ${sha} (PR ${PR_NUMBER})" >&2
  emit "merge_sha=${sha}"
}

# ---------------------------------------------------------------------------
# derive-review — counts + decision from the pr-review-verdict/v1 payload.
# Informational (feeds the report + collapse-run); not a machine-block key.
# ---------------------------------------------------------------------------
do_derive_review() {
  [[ -n "$VERDICT_FILE" ]] || VERDICT_FILE="$(state_get verdict_file)"
  [[ -n "$VERDICT_FILE" && -f "$VERDICT_FILE" ]] || VERDICT_FILE="${REPO_ROOT}/${VERDICT_FILE:-}"
  [[ -f "$VERDICT_FILE" ]] || die "verdict file not found: ${VERDICT_FILE}"
  local raw; raw="$(tr -d '\n' < "$VERDICT_FILE")"
  local blocker major minor nit verdict
  blocker="$(printf '%s' "$raw" | json_num blocker)"; major="$(printf '%s' "$raw" | json_num major)"
  minor="$(printf '%s' "$raw" | json_num minor)";     nit="$(printf '%s' "$raw" | json_num nit)"
  verdict="$(printf '%s' "$raw" | json_str verdict)"
  [[ -n "$verdict" ]] || die "could not parse verdict from ${VERDICT_FILE}"
  echo "orchestrate-state: derive-review → ${verdict} (blocker ${blocker:-0}/major ${major:-0})" >&2
  printf 'verdict=%s blocker=%s major=%s minor=%s nit=%s\n' \
    "$verdict" "${blocker:-0}" "${major:-0}" "${minor:-0}" "${nit:-0}"
}

# ---------------------------------------------------------------------------
# derive-validation — verified/total AC rows for the epic from COVERAGE.md.
# Informational (feeds the report + collapse-run).
# ---------------------------------------------------------------------------
do_derive_validation() {
  [[ -n "$EPIC" ]] || EPIC="$(state_get epic)"
  [[ -n "$EPIC" ]] || die "derive-validation needs --epic EPIC-NNN (or an epic= in the state block)"
  [[ -f "$COVERAGE" ]] || die "COVERAGE.md not found: $COVERAGE"
  # Rows whose a table CELL equals the epic id (not a prose mention).
  local rows total verified
  rows="$(grep -E "\\|[[:space:]]*${EPIC}[[:space:]]*\\|" "$COVERAGE" || true)"
  total="$(printf '%s' "$rows" | grep -c . || true)"
  # verified = those rows whose last non-empty pipe cell is 'verified'
  verified="$(printf '%s\n' "$rows" | awk -F'|' '
    { for (i=NF;i>=1;i--){ c=$i; gsub(/^[ \t]+|[ \t]+$/,"",c); if(c!=""){ if(c=="verified") v++; break } } }
    END{ print v+0 }')"
  echo "orchestrate-state: derive-validation → ${verified}/${total} AC verified for ${EPIC}" >&2
  printf 'ac=%s/%s\n' "${verified:-0}" "${total:-0}"
}

# ---------------------------------------------------------------------------
# collapse-run — compose + prepend the ## Recent outcomes one-liner. The only
# write this script owns. Mechanical fields are derived; the headline is the
# agent's (prose), passed in as a required arg.
# ---------------------------------------------------------------------------
do_collapse_run() {
  [[ -n "$HEADLINE" ]] || die "collapse-run needs --headline \"<one-line summary>\" (the prose is the agent's)"
  local epic pr sha ac
  epic="$(state_get epic)"; [[ -n "$epic" ]] || die "no epic in the state block — nothing to collapse"
  pr="$(state_get pr)"; sha="$(state_get merge_sha)"
  [[ -z "$DATE" ]] && DATE="$(date -u +%F)"
  if [[ -n "$AC_OVERRIDE" ]]; then ac="$AC_OVERRIDE"; else ac="$(EPIC="$epic" do_derive_validation 2>/dev/null | sed -n 's/^ac=//p')"; fi
  local short="${sha:0:7}"
  local line="- **${epic}** ✅ DELIVERED ${DATE}"
  [[ -n "$pr" ]]  && line="${line} · PR #${pr}"
  [[ -n "$sha" ]] && line="${line} → \`${short}\`"
  [[ -n "$ac" && "$ac" != "0/0" ]] && line="${line} · ${ac} AC"
  line="${line} · ${HEADLINE}"

  [[ -f "$STATE_FILE" ]] || die "STATE.md not found: $STATE_FILE"
  grep -q '^## Recent outcomes' "$STATE_FILE" || die "STATE.md has no '## Recent outcomes' section"
  local tmp; tmp="$(mktemp)"
  # Insert before the first existing '- **EPIC' bullet; else right after the header.
  if grep -qE '^- \*\*EPIC-' "$STATE_FILE"; then
    awk -v ln="$line" '!done && /^- \*\*EPIC-/ { print ln; done=1 } { print }' "$STATE_FILE" > "$tmp"
  else
    awk -v ln="$line" '{ print } /^## Recent outcomes/ && !done { print ""; print ln; done=1 }' "$STATE_FILE" > "$tmp"
  fi
  mv "$tmp" "$STATE_FILE"
  echo "orchestrate-state: collapse-run → prepended outcome for ${epic}" >&2
  printf '%s\n' "$line"
}

case "$VERB" in
  derive-pr)         do_derive_pr ;;
  derive-merge)      do_derive_merge ;;
  derive-review)     do_derive_review ;;
  derive-validation) do_derive_validation ;;
  collapse-run)      do_collapse_run ;;
  *) die "unknown verb: $VERB (derive-pr|derive-merge|derive-review|derive-validation|collapse-run)" ;;
esac

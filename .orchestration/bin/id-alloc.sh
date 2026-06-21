#!/usr/bin/env bash
# .orchestration/bin/id-alloc.sh
#
# Increment 3 — Phase 2 (bookkeeping derivers). Deterministic next-free-ID
# allocator (cross-layer). See design/INCREMENT-3-sequencer.md § Phase 2.
#
# Agents hand-allocate sequential ids (TASK-BBB-NNN, EPIC-NNN, CS-<LANG>-NNN, …)
# by eyeballing the highest existing one and adding 1 — pure mechanics with two
# recurrent failure modes (off-by-one, zero-pad typos like TASK-008-06) and a
# parallel-collision risk. This re-derives the next free id from the PRIMARY
# SOURCE (the file NAMES / ledger that already hold the ids), the same
# "advance on data, never on a recorded marker" contract the gate rails follow.
#
# It allocates the id only; it does NOT create the file (the agent authors the
# content). Use --check to verify a specific id is unused before writing.
#
# SEAM (design § Phase 2 — keep one-way): this is shared pipeline tooling owned by
# the integrator. The standalone layers' AGENT.md files must NOT reference it — the
# orchestration-side wiring (the sequencer / .claude dispatch adapters) calls it,
# and each layer keeps its manual max+1 fallback so it still runs standalone.
#
# Usage:
#   id-alloc.sh <bucket> [scope] [opts]
#
# Buckets (scope required where shown):
#   task   <brief>   TASK-<brief>-NNN   scan .implementation/tasks/ (incl. done/)
#   bug    <brief>   BUG-<brief>-NNN    scan .implementation/tasks/ (incl. done/)
#   epic             EPIC-NNN           scan .planning/ filenames
#   cs     <LANG>    CS-<LANG>-NNN      scan .code-standards/ (LANG ∈ TS|SQL|GEN|INFRA)
#   pq               PQ-NNN             scan .planning/OPEN-QUESTIONS.md contents
#   sq               SQ-NNN             scan .code-standards/ contents
#
# Options:
#   --repo-root <dir>   Resolve layers under <dir> (default: repo root; for fixtures).
#   --width <N>         Zero-pad width of the sequence field (default: 3).
#   --check <ID>        Don't allocate — exit 0 if <ID> is unused, 3 if it exists.
#
# Output: the next free id on stdout (e.g. TASK-008-006). Nothing else on stdout.
# Exit codes: 0 = ok (or --check: id free), 2 = usage error, 3 = --check: id taken.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WIDTH=3
CHECK_ID=""

die() { echo "id-alloc: $*" >&2; exit 2; }

[[ $# -ge 1 ]] || die "missing <bucket> (task|bug|epic|cs|pq|sq)"
BUCKET="$1"; shift

SCOPE=""
# An optional positional scope (brief number / language) may precede the flags.
if [[ $# -gt 0 && "$1" != --* ]]; then SCOPE="$1"; shift; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --width)     WIDTH="${2:-}"; shift 2 ;;
    --check)     CHECK_ID="${2:-}"; shift 2 ;;
    -h|--help)   sed -n '2,45p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)           die "unknown argument: $1" ;;
  esac
done

IMPL_TASKS="${REPO_ROOT}/.implementation/tasks"
PLANNING_DIR="${REPO_ROOT}/.planning"
CODE_STD_DIR="${REPO_ROOT}/.code-standards"

# ---------------------------------------------------------------------------
# Bucket config → PREFIX (the id up to and including the final '-'), TOKEN_RE
# (matches a whole existing id), and how to enumerate the corpus that holds ids.
#   MODE=files   → ids live in file NAMES under a root.
#   MODE=content → ids live in the TEXT of a ledger file / tree.
# ---------------------------------------------------------------------------
MODE="files"; ROOT=""; LEDGER=""; PREFIX=""; TOKEN_RE=""
case "$BUCKET" in
  task)
    [[ -n "$SCOPE" ]] || die "task bucket needs a <brief> scope, e.g. id-alloc.sh task 008"
    PREFIX="TASK-${SCOPE}-"; TOKEN_RE="TASK-${SCOPE}-[0-9]+"; ROOT="$IMPL_TASKS" ;;
  bug)
    [[ -n "$SCOPE" ]] || die "bug bucket needs a <brief> scope, e.g. id-alloc.sh bug 008"
    PREFIX="BUG-${SCOPE}-"; TOKEN_RE="BUG-${SCOPE}-[0-9]+"; ROOT="$IMPL_TASKS" ;;
  epic)
    PREFIX="EPIC-"; TOKEN_RE="EPIC-[0-9]+"; ROOT="$PLANNING_DIR" ;;
  cs)
    [[ -n "$SCOPE" ]] || die "cs bucket needs a <LANG> scope (TS|SQL|GEN|INFRA)"
    case "$SCOPE" in TS|SQL|GEN|INFRA) ;; *) die "cs LANG must be TS|SQL|GEN|INFRA, got: $SCOPE" ;; esac
    PREFIX="CS-${SCOPE}-"; TOKEN_RE="CS-${SCOPE}-[0-9]+"; ROOT="$CODE_STD_DIR" ;;
  pq)
    MODE="content"; PREFIX="PQ-"; TOKEN_RE="PQ-[0-9]+"; LEDGER="${PLANNING_DIR}/OPEN-QUESTIONS.md" ;;
  sq)
    MODE="content"; PREFIX="SQ-"; TOKEN_RE="SQ-[0-9]+"; ROOT="$CODE_STD_DIR" ;;
  *) die "unknown bucket: $BUCKET (task|bug|epic|cs|pq|sq)" ;;
esac

# ---------------------------------------------------------------------------
# Collect every existing id token from the corpus, regardless of mode.
# ---------------------------------------------------------------------------
collect_tokens() {
  if [[ "$MODE" == "files" ]]; then
    [[ -d "$ROOT" ]] || return 0
    # Match against file basenames so a prose mention inside a file never counts.
    find "$ROOT" -type f -name '*.md' 2>/dev/null \
      | sed 's#.*/##' \
      | grep -oE "$TOKEN_RE" || true
  elif [[ -n "$LEDGER" ]]; then
    [[ -f "$LEDGER" ]] || return 0
    grep -ohE "$TOKEN_RE" "$LEDGER" || true
  else
    [[ -d "$ROOT" ]] || return 0
    grep -rohE "$TOKEN_RE" "$ROOT" 2>/dev/null || true
  fi
}

# Highest sequence number currently in use (empty if none).
max_seq() {
  collect_tokens | grep -oE '[0-9]+$' | sed 's/^0*//' | grep -E '.' | sort -n | tail -1 || true
}

# ---------------------------------------------------------------------------
# --check: is a specific id already taken?
# ---------------------------------------------------------------------------
if [[ -n "$CHECK_ID" ]]; then
  if collect_tokens | grep -qx "$CHECK_ID"; then
    echo "id-alloc: ${CHECK_ID} is ALREADY TAKEN" >&2
    exit 3
  fi
  echo "id-alloc: ${CHECK_ID} is free" >&2
  exit 0
fi

# ---------------------------------------------------------------------------
# Allocate next = max + 1 (or 1 when the bucket is empty).
# ---------------------------------------------------------------------------
hi="$(max_seq)"; hi="${hi:-0}"
printf "%s%0${WIDTH}d\n" "$PREFIX" "$(( hi + 1 ))"

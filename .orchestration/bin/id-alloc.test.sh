#!/usr/bin/env bash
# .orchestration/bin/id-alloc.test.sh
#
# Self-contained test for id-alloc.sh against a synthetic --repo-root tree.
# No network, no real repo state. Exit 0 = all assertions pass.
#
#   bash .orchestration/bin/id-alloc.test.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOC="${HERE}/id-alloc.sh"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

PASS=0; FAIL=0
ok()  { printf "  ✓ %s\n" "$1"; PASS=$((PASS+1)); }
bad() { printf "  ✗ %s\n" "$1"; FAIL=$((FAIL+1)); }

# eq <expected> <desc> -- <id-alloc args...>
eq() {
  local want="$1" desc="$2"; shift 2; [[ "$1" == "--" ]] && shift
  local got; got="$(bash "$ALLOC" "$@" --repo-root "$ROOT" 2>/dev/null)"
  if [[ "$got" == "$want" ]]; then ok "$desc → $got"; else bad "$desc — wanted '$want', got '$got'"; fi
}
# exits <code> <desc> -- <args...>
exits() {
  local want="$1" desc="$2"; shift 2; [[ "$1" == "--" ]] && shift
  bash "$ALLOC" "$@" --repo-root "$ROOT" >/dev/null 2>&1; local got=$?
  if [[ "$got" -eq "$want" ]]; then ok "$desc (exit $got)"; else bad "$desc — wanted exit $want, got $got"; fi
}

# --- fixture tree -----------------------------------------------------------
mkdir -p "$ROOT/.implementation/tasks/done" \
         "$ROOT/.planning" \
         "$ROOT/.code-standards/standards/typescript" \
         "$ROOT/.code-standards/standards/cross-cutting"

for n in 001 002 003 005; do : > "$ROOT/.implementation/tasks/TASK-008-${n}-x.md"; done
: > "$ROOT/.implementation/tasks/done/TASK-008-004-done.md"   # recursive: done/ counts
# a prose mention of a higher id inside a body must NOT count (basename scan only)
printf 'see also TASK-008-077 for context\n' > "$ROOT/.implementation/tasks/TASK-008-003-x.md"
: > "$ROOT/.implementation/tasks/BUG-008-001-y.md"

: > "$ROOT/.planning/EPIC-001-front-door.md"
: > "$ROOT/.planning/EPIC-009-enabler.md"
printf '## PQ-001\n## PQ-002\n' > "$ROOT/.planning/OPEN-QUESTIONS.md"

: > "$ROOT/.code-standards/standards/typescript/CS-TS-001-a.md"
: > "$ROOT/.code-standards/standards/typescript/CS-TS-002-b.md"
: > "$ROOT/.code-standards/standards/cross-cutting/CS-GEN-001-a.md"
: > "$ROOT/.code-standards/standards/cross-cutting/CS-GEN-003-c.md"
printf 'tracked: SQ-001 and SQ-002\n' > "$ROOT/.code-standards/standards/cross-cutting/CS-GEN-003-c.md"

echo "id-alloc.test"

echo "[next-free]"
eq "TASK-008-006" "task: max+1 across files (incl. done/, ignoring prose)" -- task 008
eq "BUG-008-002"  "bug: max+1 in its own bucket"                           -- bug 008
eq "EPIC-010"     "epic: max+1 from filenames (gap-tolerant)"             -- epic
eq "CS-TS-003"    "cs TS: max+1 in the bucket"                            -- cs TS
eq "CS-GEN-004"   "cs GEN: max+1 (uses highest, not count)"               -- cs GEN
eq "PQ-003"       "pq: max+1 from the ledger contents"                    -- pq
eq "SQ-003"       "sq: max+1 from catalogue contents"                     -- sq

echo "[empty-bucket]"
eq "TASK-009-001" "task: empty bucket starts at 001"                      -- task 009
eq "CS-SQL-001"   "cs SQL: empty bucket starts at 001"                    -- cs SQL

echo "[zero-pad + width]"
eq "EPIC-010"     "default width 3 zero-pads"                             -- epic
eq "EPIC-0010"    "--width 4 widens the pad"                              -- epic --width 4

echo "[bucket isolation]"
eq "TASK-009-001" "task 009 is independent of task 008"                   -- task 009

echo "[--check]"
exits 3 "--check on a taken id exits 3"   -- task 008 --check TASK-008-005
exits 0 "--check on a free id exits 0"    -- task 008 --check TASK-008-006

echo "[usage]"
exits 2 "unknown bucket is a usage error" -- frobnicate
exits 2 "task without scope is an error"  -- task
exits 2 "cs with bad LANG is an error"    -- cs PYTHON

echo
echo "RESULT: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]

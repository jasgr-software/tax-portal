#!/usr/bin/env bash
# scripts/__test_fixtures__/validate-gates/removal-sweep-colon-path/weird:name.sh
#
# COLON-IN-PATH regression fixture consumer for check_removed_artifact_orphans (check 10).
# This file's name contains a literal colon. The buggy parse (${hit%%:*}) would
# mis-split the grep -rn hit line at the colon in the filename, yielding a truncated
# path ("weird") that has no recognized extension and falls through the case *)
# arm silently — the orphan is DROPPED and the gate reports PASS (false-negative).
#
# After the fix (sed-based parse-from-right), the full path "weird:name.sh" is
# extracted correctly, the ".sh" extension is recognized, and the gate FAILs
# and names the consumer. This test asserts the fixed behavior.
#
# CS-GEN-003: retro-012-017 / BRIEF-LOE-013 — colon-in-path regression

set -euo pipefail

# This line is the orphan consumer reference — literal path present in source.
echo ".implementation/tasks/PROGRESS.md"

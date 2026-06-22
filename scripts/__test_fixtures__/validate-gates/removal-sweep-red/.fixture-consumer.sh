#!/usr/bin/env bash
# scripts/__test_fixtures__/validate-gates/removal-sweep-red/.fixture-consumer.sh
#
# RED counterfactual fixture consumer for check_removed_artifact_orphans (check 10).
# Mirrors the PR #80 failure mode: a CONSTRUCTED path string that still references
# a removed artifact (.implementation/tasks/PROGRESS.md). Even though the path is
# assembled from a variable + literal suffix, the literal suffix is present in
# the source — git grep -F catches it.
#
# Mirrors orchestrate-state.sh:72 pattern:
#   : "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
#
# CS-GEN-003: retro-012-017 / BRIEF-LOE-013

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

# This line is the constructed-path consumer — the literal suffix is present
# in source even though it's assembled via variable expansion.
: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"

echo "PROGRESS_MD=${PROGRESS_MD}"

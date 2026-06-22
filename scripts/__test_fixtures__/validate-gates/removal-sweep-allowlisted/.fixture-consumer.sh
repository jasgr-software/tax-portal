#!/usr/bin/env bash
# scripts/__test_fixtures__/validate-gates/removal-sweep-allowlisted/.fixture-consumer.sh
#
# ALLOWLISTED-PASS fixture consumer for check_removed_artifact_orphans (check 10).
# Same constructed-path reference as the red fixture, but covered by the
# removal-sweep-allow.txt entry in this fixture dir → gate must PASS and echo
# the allowlist reason.
#
# CS-GEN-003: retro-012-017 / BRIEF-LOE-013

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
echo "PROGRESS_MD=${PROGRESS_MD}"

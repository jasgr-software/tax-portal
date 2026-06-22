#!/usr/bin/env bash
# scripts/__test_fixtures__/validate-gates/removal-sweep-missing-reason/.fixture-consumer.sh
#
# MISSING-REASON fixture consumer for check_removed_artifact_orphans (check 10).
# Has an allowlist entry covering this consumer but the reason field is EMPTY —
# gate must FAIL (a suppression must be documented, never silent).
#
# CS-GEN-003: retro-012-017 / BRIEF-LOE-013

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
echo "PROGRESS_MD=${PROGRESS_MD}"

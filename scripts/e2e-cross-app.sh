#!/usr/bin/env bash
# scripts/e2e-cross-app.sh — Cross-app Playwright e2e runner
#
# Runs the cross-app specs that exercise BOTH apps/portal AND apps/admin in a single
# test scenario (e.g. accountant edits template in admin → client signs in portal).
#
# Handles the local-stack-bringup-quirk: ADMIN_PORT may be remapped to 13001 when
# port 3001 is squatted by a neighbour process. This script detects the actual host
# port the tax-portal-admin container is mapped to and passes ADMIN_BASE_URL accordingly.
# If ADMIN_BASE_URL is already set in the environment (e.g. CI injects it), that value
# takes precedence (the detection logic is skipped).
#
# Usage:
#   pnpm e2e:cross-app
#
# Specs included:
#   apps/portal/e2e/specs/cross-app-redirect.spec.ts                    (AC-AUTH-010-* cross-app redirect matrix)
#   apps/portal/e2e/specs/onboarding-cross-app.spec.ts                  (AC-IDNT-007-03 edit→sign cross-surface loop)
#   apps/portal/e2e/specs/questionnaire-cross-app.spec.ts               (EPIC-006 admin author→portal completion loop)
#   apps/portal/e2e/specs/document-upload-cross-app.spec.ts             (EPIC-007 admin authors request → client fulfills)
#   apps/portal/e2e/specs/onboarding-completion-cross-app.spec.ts       (EPIC-008 client completes → admin In Progress + notification)
#   apps/portal/e2e/specs/returning-client-request.spec.ts              (EPIC-012 AC-DOOR-009-04 returning-client request → admin inbox)
#   apps/portal/e2e/specs/both-party-download-cross-app.spec.ts         (EPIC-013 AC-FILE-001-03/-04 both-party download round-trip)
#   apps/admin/e2e/specs/cross-app-redirect.spec.ts                     (AC-AUTH-010-01 admin cross-app redirect matrix)

set -euo pipefail

# ─── Detect ADMIN_BASE_URL ─────────────────────────────────────────────────────

if [ -z "${ADMIN_BASE_URL:-}" ]; then
  # Try to detect the actual host port from the running docker container.
  # This handles the documented local-stack-bringup-quirk where ADMIN_PORT=13001
  # is used when port 3001 is squatted by a neighbour project.
  DETECTED_PORT=$(docker inspect tax-portal-admin --format '{{(index (index .NetworkSettings.Ports "3001/tcp") 0).HostPort}}' 2>/dev/null || echo "")
  if [ -n "$DETECTED_PORT" ]; then
    export ADMIN_BASE_URL="http://localhost:${DETECTED_PORT}"
    echo "[e2e:cross-app] Detected admin container at ${ADMIN_BASE_URL} (port ${DETECTED_PORT})"
  else
    # Fall back to ADMIN_PORT env var or default 3001
    ADMIN_PORT="${ADMIN_PORT:-3001}"
    export ADMIN_BASE_URL="http://localhost:${ADMIN_PORT}"
    echo "[e2e:cross-app] Could not detect admin container port; using ADMIN_BASE_URL=${ADMIN_BASE_URL}"
  fi
else
  echo "[e2e:cross-app] Using ADMIN_BASE_URL=${ADMIN_BASE_URL} (from environment)"
fi

# ─── Run portal cross-app specs ───────────────────────────────────────────────

echo "[e2e:cross-app] Running portal cross-app specs..."
pnpm --filter portal exec playwright test \
  e2e/specs/cross-app-redirect.spec.ts \
  e2e/specs/onboarding-cross-app.spec.ts \
  e2e/specs/questionnaire-cross-app.spec.ts \
  e2e/specs/document-upload-cross-app.spec.ts \
  e2e/specs/onboarding-completion-cross-app.spec.ts \
  e2e/specs/returning-client-request.spec.ts \
  e2e/specs/both-party-download-cross-app.spec.ts

# ─── Run admin cross-app specs ────────────────────────────────────────────────

echo "[e2e:cross-app] Running admin cross-app specs..."
pnpm --filter admin exec playwright test \
  e2e/specs/cross-app-redirect.spec.ts

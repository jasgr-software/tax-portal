#!/usr/bin/env bash
# scripts/smoke-test.sh — Container smoke harness
#
# ADR-006: scripts/smoke-test.sh brings up the full stack and probes both apps.
# ADR-007: Each app has its own /healthz endpoint probed independently.
#
# Usage:
#   bash scripts/smoke-test.sh                  # Full smoke run
#   bash scripts/smoke-test.sh --data-plane-only # Data-plane only (SQL Server, Azurite, Mailhog)
#
# Exit codes:
#   0 — all probes passed
#   1 — one or more probes failed or stack did not come up healthy

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────────
PORTAL_URL="${PORTAL_APP_URL:-http://localhost:3000}"
ADMIN_URL="${ADMIN_APP_URL:-http://localhost:3001}"
MAX_WAIT_SECONDS="${SMOKE_MAX_WAIT:-120}"
PROBE_INTERVAL=5

DATA_PLANE_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--data-plane-only" ]] && DATA_PLANE_ONLY=true
done

# ─── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[smoke] $*"; }
fail() { echo "[smoke][FAIL] $*" >&2; exit 1; }

wait_for_service() {
  local name="$1"
  local check_cmd="$2"
  local start elapsed
  start=$(date +%s)

  log "Waiting for $name..."
  until eval "$check_cmd" &>/dev/null; do
    elapsed=$(( $(date +%s) - start ))
    if (( elapsed >= MAX_WAIT_SECONDS )); then
      fail "$name did not become healthy within ${MAX_WAIT_SECONDS}s"
    fi
    sleep "$PROBE_INTERVAL"
  done
  elapsed=$(( $(date +%s) - start ))
  log "$name healthy (${elapsed}s)"
}

probe_http() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"

  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" ]]; then
    log "  PASS  $name $url → HTTP $status"
    return 0
  else
    echo "[smoke][FAIL] $name $url → HTTP $status (expected $expected_status)" >&2
    return 1
  fi
}

# ─── Bring up the stack ────────────────────────────────────────────────────────
log "Starting compose stack..."
docker compose up -d

# ─── Wait for data-plane services ─────────────────────────────────────────────
wait_for_service "sqlserver" \
  "docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P \"\$SA_PASSWORD\" -No -Q 'SELECT 1' 2>/dev/null"

wait_for_service "azurite" \
  "nc -z localhost ${AZURITE_PORT:-10000}"

wait_for_service "mailhog" \
  "nc -z localhost ${MAILHOG_HTTP_PORT:-8025}"

log "Data-plane services are healthy."

if [[ "$DATA_PLANE_ONLY" == "true" ]]; then
  log "Data-plane-only mode — skipping app health probes."
  log "=== smoke PASS (data-plane) ==="
  exit 0
fi

# ─── Wait for app services ─────────────────────────────────────────────────────
# NOTE: Portal and Admin app services are added to compose in TASK-004.
# Until then, this section is skipped if the services don't exist in compose.
PORTAL_IN_COMPOSE=$(docker compose ps --services 2>/dev/null | grep -c "^portal$" || true)
ADMIN_IN_COMPOSE=$(docker compose ps --services 2>/dev/null | grep -c "^admin$" || true)

FAILED=0

if (( PORTAL_IN_COMPOSE > 0 )); then
  wait_for_service "portal (healthz)" \
    "curl -sf --max-time 5 ${PORTAL_URL}/healthz -o /dev/null"

  probe_http "portal /healthz" "${PORTAL_URL}/healthz" 200 || FAILED=1
  probe_http "portal /readyz"  "${PORTAL_URL}/readyz"  200 || FAILED=1
else
  log "Portal app service not yet in compose (added in TASK-004) — skipping portal probes."
fi

if (( ADMIN_IN_COMPOSE > 0 )); then
  wait_for_service "admin (healthz)" \
    "curl -sf --max-time 5 ${ADMIN_URL}/healthz -o /dev/null"

  probe_http "admin /healthz"  "${ADMIN_URL}/healthz"  200 || FAILED=1
  probe_http "admin /readyz"   "${ADMIN_URL}/readyz"   200 || FAILED=1
else
  log "Admin app service not yet in compose (added in TASK-004) — skipping admin probes."
fi

# ─── Run @smoke-tagged e2e (TASK-005: portal @smoke subset is now active) ─────
# @smoke subset = happy-path submit test (AC-DOOR-004-03).
# Requires: portal container healthy + DB seeded (pnpm db:seed run before this).
# Uses e2e:smoke (dedicated script) instead of --grep passthrough (avoids pnpm arg mangling).
if command -v pnpm &>/dev/null; then
  log "Running smoke-tagged e2e (portal @smoke subset)..."
  pnpm --filter portal e2e:smoke || FAILED=1
fi

# ─── Result ───────────────────────────────────────────────────────────────────
if (( FAILED > 0 )); then
  fail "One or more smoke probes failed — see output above."
fi

log "=== smoke PASS ==="
exit 0

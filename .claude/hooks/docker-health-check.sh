#!/usr/bin/env bash
# PostToolUse hook: after docker compose up, show container health status
sleep 3
echo "--- Container Status ---"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
unhealthy=$(docker compose ps --format "{{.Name}} {{.Status}}" 2>/dev/null | grep -iE 'unhealthy|Exit' || true)
if [ -n "$unhealthy" ]; then
  echo ""
  echo "WARNING: Unhealthy or exited containers detected:"
  echo "$unhealthy"
fi

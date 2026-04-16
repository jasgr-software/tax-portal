#!/usr/bin/env bash
# PreToolUse hook: warn before docker compose down -v (destroys volumes/data)
echo "WARNING: This will destroy all Docker volumes including database data."
echo "If this is intentional (smoke test, clean slate), proceed."

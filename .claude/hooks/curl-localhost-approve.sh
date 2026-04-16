#!/usr/bin/env bash
# PreToolUse hook: auto-approve curl commands targeting localhost
# Outputs JSON with permissionDecision=allow so user isn't prompted
command_input=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
if echo "$command_input" | grep -qE 'curl.*(localhost|127\.0\.0\.1)'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"curl to localhost is safe"}}'
  exit 0
fi

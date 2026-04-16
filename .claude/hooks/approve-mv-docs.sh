#!/usr/bin/env bash
# PreToolUse hook: auto-approve mv commands within docs/
command_input=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
if echo "$command_input" | grep -qE 'mv.*docs/'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"mv within docs/ is safe"}}'
  exit 0
fi

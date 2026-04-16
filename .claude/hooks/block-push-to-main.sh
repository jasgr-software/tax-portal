#!/usr/bin/env bash
# PreToolUse hook: block direct pushes to main branch
command_input=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
if echo "$command_input" | grep -qE 'git push.*(origin|upstream)?\s+main\b|git push.*(origin|upstream)?\s+master\b'; then
  echo "BLOCKED: Cannot push directly to main/master. Use a feature branch and create a PR." >&2
  exit 2
fi

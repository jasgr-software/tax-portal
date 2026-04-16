#!/usr/bin/env bash
# PreToolUse hook: block git commit on main branch
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "BLOCKED: Cannot commit directly to $branch. Create a feature branch first." >&2
  exit 2
fi

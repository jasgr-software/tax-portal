#!/usr/bin/env bash
# PreToolUse hook: show branch + commit count before git push
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
ahead=$(git rev-list --count "@{u}..HEAD" 2>/dev/null || echo "?")
echo "Pushing to branch: $branch ($ahead commits ahead)"

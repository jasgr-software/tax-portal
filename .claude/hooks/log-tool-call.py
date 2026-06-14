#!/usr/bin/env python3
"""PostToolUse hook (all tools): record tool-call distribution.

Captures every tool invocation (name, group, session) to
.claude/metrics/tool-calls.jsonl for later analysis of per-agent tool mix
and Bash-vs-dedicated-tool ratio. Complements log-tool-error.py (which
records only errors) and log-dispatch.py (which aggregates subagent
tool counts at dispatch boundaries).

Skips Agent (already captured by log-dispatch.py with richer data) and
Skill. Input content is intentionally not recorded — distribution is the
signal, not per-call argument details.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "tool-calls.jsonl"

SKIP_TOOLS = {"Agent", "Skill"}

# Group tools for anti-pattern detection (e.g. Bash-heavy agents when
# dedicated tools fit better per .implementation/ENGINE.md § Tool Hygiene).
TOOL_GROUPS = {
    "Bash": "bash",
    "Read": "file",
    "Edit": "file",
    "Write": "file",
    "NotebookEdit": "file",
    "Glob": "search",
    "Grep": "search",
    "WebFetch": "web",
    "WebSearch": "web",
    "TodoWrite": "plan",
    "ExitPlanMode": "plan",
    "EnterPlanMode": "plan",
}


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    tool_name = payload.get("tool_name", "")
    if tool_name in SKIP_TOOLS:
        return

    response = payload.get("tool_response") or {}
    is_error = bool(
        isinstance(response, dict)
        and (
            response.get("is_error")
            or response.get("error")
            or response.get("interrupted")
        )
    )

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "tool_name": tool_name,
        "tool_group": TOOL_GROUPS.get(tool_name, "other"),
        "is_error": is_error,
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

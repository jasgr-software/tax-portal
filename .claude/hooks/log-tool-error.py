#!/usr/bin/env python3
"""PostToolUse hook (all tools): record tool errors.

Skips Agent (covered by SubagentStop) and Skill. Filters to records where the
tool_response indicates an error. Truncates long inputs/errors to keep the
metrics file readable.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "tool-errors.jsonl"

SKIP_TOOLS = {"Agent", "Skill"}


def is_error(tool_name: str, response) -> bool:
    if isinstance(response, dict):
        if response.get("is_error"):
            return True
        if response.get("error"):
            return True
        if response.get("interrupted"):
            return True
    return False


def truncate(s, n: int = 200) -> str:
    if not isinstance(s, str):
        s = json.dumps(s, default=str)
    return s[:n]


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    tool_name = payload.get("tool_name", "")
    if tool_name in SKIP_TOOLS:
        return

    response = payload.get("tool_response")
    if not is_error(tool_name, response):
        return

    tool_input = payload.get("tool_input") or {}
    if tool_name == "Bash":
        input_summary = truncate(tool_input.get("command", ""))
    elif tool_name in ("Read", "Edit", "Write"):
        input_summary = truncate(tool_input.get("file_path", ""))
    elif tool_name in ("Glob", "Grep"):
        input_summary = truncate(tool_input.get("pattern", ""))
    else:
        input_summary = truncate(tool_input)

    if isinstance(response, dict):
        error_summary = truncate(
            response.get("error")
            or response.get("stderr")
            or response.get("content")
            or response
        )
    else:
        error_summary = truncate(response)

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tool_name": tool_name,
        "input_summary": input_summary,
        "error_summary": error_summary,
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

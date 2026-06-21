#!/usr/bin/env python3
"""PostToolUse hook (Edit|Write): snapshot task file state from .implementation/tasks/.

Records one JSONL line per edit to a task file. Skips templates and aggregator
files (PROGRESS.md, README.md, etc.). The report script computes state
transitions by sorting these records by timestamp.

Always exits 0.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "tasks.jsonl"

SKIP_FILES = {
    "README.md",
    "PROGRESS.md",
    "PROGRESS-ARCHIVE.md",
    "_TEMPLATE.md",
    "_BUG_TEMPLATE.md",
}
TASK_PATH_RE = re.compile(r"\.implementation/tasks/([^/]+\.md)$")
TASK_ID_RE = re.compile(
    r"^(?:TASK-\d{3}-\d{3}|BUG-\d{3}-\d{3}|RETRO-\d{3}|EP-(?:\d{3}|NEXT))"
)


def parse_field(text: str, key: str) -> str | None:
    """Extract a YAML front-matter field `key: value` (exact key, case-sensitive).

    After TASK-LOE-010-001 all task files carry YAML front-matter. This function
    reads the front-matter block (between the two --- markers at the top of the file)
    and returns the scalar value for the given key, or None if not found.

    The key must match exactly (snake_case front-matter keys). Empty values (`key:`
    or `key: —` or `key: -`) are returned as the raw string; callers that need to
    treat them as absent can check the value themselves.
    """
    # Read only the front-matter block (lines between the opening --- and closing ---)
    # to avoid false matches in body prose that contains `key: value` patterns.
    in_fm = False
    past_first_fence = False
    for line in text.splitlines():
        stripped = line.rstrip()
        if not past_first_fence:
            if stripped == "---":
                past_first_fence = True
                in_fm = True
            continue
        if in_fm:
            if stripped == "---":
                # Reached closing fence — stop searching
                break
            # Match `key: value` exactly at line start (YAML scalar)
            if stripped.startswith(f"{key}:"):
                rest = stripped[len(f"{key}:"):].strip()
                return rest if rest else ""
    return None


def task_id_from_filename(filename: str) -> str | None:
    m = TASK_ID_RE.match(filename)
    return m.group(0) if m else None


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    file_path = (
        (payload.get("tool_response") or {}).get("filePath")
        or (payload.get("tool_input") or {}).get("file_path", "")
    )
    if not file_path:
        return

    m = TASK_PATH_RE.search(file_path)
    if not m:
        return
    filename = m.group(1)
    if filename in SKIP_FILES:
        return
    task_id = task_id_from_filename(filename)
    if not task_id:
        return

    if not os.path.exists(file_path):
        return

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read(4096)
    except OSError:
        return

    # TASK-LOE-010-002: Re-keyed from old bold-field spellings (Status, Assigned to,
    # complexity-estimate, etc.) to YAML front-matter keys (status, assigned_to,
    # complexity_estimate, etc.) — same record shape, same consumer (metrics-report.py)
    # which already uses snake_case field names.
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "file_path": file_path,
        "status": parse_field(text, "status"),
        "complexity_estimate": parse_field(text, "complexity_estimate"),
        "complexity_actual": parse_field(text, "complexity_actual"),
        "started_at": parse_field(text, "started_at"),
        "completed_at": parse_field(text, "completed_at"),
        "assigned_to": parse_field(text, "assigned_to"),
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

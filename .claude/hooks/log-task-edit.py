#!/usr/bin/env python3
"""PostToolUse hook (Edit|Write): snapshot task file state from docs/tasks/.

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
TASK_PATH_RE = re.compile(r"docs/tasks/([^/]+\.md)$")
TASK_ID_RE = re.compile(
    r"^(?:TASK-\d{3}-\d{3}|BUG-\d{3}-\d{3}|RETRO-\d{3}|EP-(?:\d{3}|NEXT))"
)


def parse_field(text: str, key: str) -> str | None:
    """Extract `**Key**: value` (markdown bold) or `key: value` (plain). Case-insensitive."""
    m = re.search(rf"(?i)\*\*{re.escape(key)}\*\*\s*:\s*([^\n]+)", text)
    if m:
        return m.group(1).strip()
    m = re.search(rf"(?mi)^{re.escape(key)}\s*:\s*([^\n]+)$", text)
    if m:
        return m.group(1).strip()
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

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "file_path": file_path,
        "status": parse_field(text, "Status"),
        "complexity_estimate": parse_field(text, "complexity-estimate"),
        "complexity_actual": parse_field(text, "complexity-actual"),
        "started_at": parse_field(text, "started-at"),
        "completed_at": parse_field(text, "completed-at"),
        "assigned_to": parse_field(text, "Assigned to"),
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

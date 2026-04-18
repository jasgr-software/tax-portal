#!/usr/bin/env python3
"""Notification hook: record notifications and permission prompts.

Fires when Claude Code sends a notification to the user. The key signal
we're after is **permission prompts** — they directly measure tool-call
friction and validate whether `.claude/settings.json` allowlist additions
are landing.

Dumps the full payload (except transcript path) to
.claude/metrics/notifications.jsonl. A lightweight heuristic flags likely
permission prompts via keyword match in the message text; downstream
analysis can refine the classification if Claude Code's payload shape
changes.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "notifications.jsonl"

PERMISSION_KEYWORDS = ("permission", "needs your permission", "allow", "approve")


def truncate(s, n: int = 300) -> str:
    if s is None:
        return ""
    if not isinstance(s, str):
        s = json.dumps(s, default=str)
    return s[:n]


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    message = payload.get("message") or payload.get("text") or payload.get("title") or ""
    lower = message.lower() if isinstance(message, str) else ""
    is_permission_prompt = any(kw in lower for kw in PERMISSION_KEYWORDS)

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "hook_event_name": payload.get("hook_event_name"),
        "notification_type": payload.get("notification_type"),
        "message_summary": truncate(message),
        "is_permission_prompt": is_permission_prompt,
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

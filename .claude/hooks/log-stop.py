#!/usr/bin/env python3
"""Stop hook: record main-session pause events.

Fires when the main Claude Code session finishes a turn (stops talking
and waits for user input). Each stop is a potential pause — the higher
the stop count per session, the more user check-ins the session
required. This is the direct measurement surface for the § Autonomy
Pre-authorization rule in .implementation/ENGINE.md: if the rule is working, stops
per session should trend down over time.

Lightweight capture: session_id + timestamp + stop_reason. Transcript
parsing is deferred to metrics-report.py so the hook stays fast.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "stops.jsonl"


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": payload.get("session_id"),
        "stop_reason": payload.get("reason") or payload.get("stop_reason"),
        "hook_event_name": payload.get("hook_event_name"),
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

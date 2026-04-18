#!/usr/bin/env python3
"""SessionStart and SessionEnd hooks: record session boundaries and totals.

Invoked with one positional arg: "session_start" or "session_end".
On session_end, parses the main-session transcript to sum per-model tokens.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "sessions.jsonl"

EVENT = sys.argv[1] if len(sys.argv) > 1 else "unknown"


def sum_transcript(path: str) -> tuple[dict, int]:
    models: dict = {}
    count = 0
    if not path or not os.path.exists(path):
        return models, count
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            count += 1
            if msg.get("type") != "assistant":
                continue
            inner = msg.get("message", {}) or {}
            model = inner.get("model", "unknown")
            usage = inner.get("usage", {}) or {}
            bucket = models.setdefault(
                model,
                {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cache_read_input_tokens": 0,
                    "cache_creation_input_tokens": 0,
                },
            )
            for k in bucket:
                bucket[k] += int(usage.get(k, 0) or 0)
    return models, count


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        payload = {}

    record: dict = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": EVENT,
        "session_id": payload.get("session_id"),
    }

    if EVENT == "session_end":
        record["stop_reason"] = payload.get("reason") or payload.get("stop_reason")
        models, count = sum_transcript(payload.get("transcript_path", ""))
        record["models"] = models
        record["message_count"] = count

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass

#!/usr/bin/env python3
"""SubagentStop hook: extract dispatch metrics from the agent transcript.

Reads the SubagentStop payload from stdin, parses the transcript at
agent_transcript_path, and appends one JSONL record per dispatch to
.claude/metrics/dispatches.jsonl.

Always exits 0 — this is metrics capture, never a gate.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
METRICS_FILE = REPO_ROOT / ".claude" / "metrics" / "dispatches.jsonl"

TASK_ID_RE = re.compile(
    r"\b(?:TASK-\d{3}-\d{3}|BUG-\d{3}-\d{3}|RETRO-\d{3}|EP-(?:\d{3}|NEXT))\b"
)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return

    transcript_path = payload.get("agent_transcript_path") or payload.get("transcript_path", "")
    agent_type = payload.get("agent_type", "unknown")
    agent_id = payload.get("agent_id", "")
    if not transcript_path or not os.path.exists(transcript_path):
        return

    models: dict = {}
    message_count = 0
    tool_count = 0
    first_ts: str | None = None
    last_ts: str | None = None
    session_id: str | None = None
    git_branch: str | None = None
    first_user_text: str | None = None

    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            message_count += 1
            ts = msg.get("timestamp")
            if ts:
                if first_ts is None:
                    first_ts = ts
                last_ts = ts
            if session_id is None:
                session_id = msg.get("sessionId")
            if git_branch is None:
                git_branch = msg.get("gitBranch")

            mtype = msg.get("type")
            inner = msg.get("message", {}) or {}
            if mtype == "user" and first_user_text is None:
                content = inner.get("content", "")
                if isinstance(content, str):
                    first_user_text = content
                elif isinstance(content, list):
                    parts = [
                        p.get("text", "")
                        for p in content
                        if isinstance(p, dict) and p.get("type") == "text"
                    ]
                    if parts:
                        first_user_text = " ".join(parts)
            elif mtype == "assistant":
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
                content = inner.get("content", [])
                if isinstance(content, list):
                    tool_count += sum(
                        1
                        for b in content
                        if isinstance(b, dict) and b.get("type") == "tool_use"
                    )

    task_ids = sorted(set(TASK_ID_RE.findall(first_user_text or "")))

    duration_ms: int | None = None
    if first_ts and last_ts:
        try:
            t0 = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
            duration_ms = int((t1 - t0).total_seconds() * 1000)
        except ValueError:
            pass

    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "agent_id": agent_id,
        "agent_type": agent_type,
        "session_id": session_id,
        "git_branch": git_branch,
        "task_ids": task_ids,
        "duration_ms": duration_ms,
        "message_count": message_count,
        "tool_count": tool_count,
        "models": models,
    }

    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Never block

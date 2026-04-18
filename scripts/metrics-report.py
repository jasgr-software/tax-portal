#!/usr/bin/env python3
"""metrics-report.py — derive per-task metrics from .claude/metrics/*.jsonl.

Joins the four metric streams (dispatches, tasks, sessions, tool errors) into
a per-task summary. Outputs a markdown table to stdout by default, or JSON
with --json. Filter to one epic with --epic EP-NNN.

Usage:
  scripts/metrics-report.py
  scripts/metrics-report.py --epic EP-060
  scripts/metrics-report.py --json
  scripts/metrics-report.py --since 2026-04-01
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
METRICS_DIR = REPO_ROOT / ".claude" / "metrics"

# Per-million-token rates (USD). Approximate as of 2026-04 — verify against
# https://docs.anthropic.com/en/docs/about-claude/pricing before relying on
# cost figures. Cache write rate assumes 5-minute ephemeral TTL.
MODEL_RATES = {
    "claude-opus-4-7":   {"input": 15.00, "output": 75.00, "cache_read": 1.50,  "cache_write": 18.75},
    "claude-opus-4-6":   {"input": 15.00, "output": 75.00, "cache_read": 1.50,  "cache_write": 18.75},
    "claude-sonnet-4-6": {"input":  3.00, "output": 15.00, "cache_read": 0.30,  "cache_write":  3.75},
    "claude-sonnet-4-5": {"input":  3.00, "output": 15.00, "cache_read": 0.30,  "cache_write":  3.75},
    "claude-haiku-4-5":  {"input":  1.00, "output":  5.00, "cache_read": 0.10,  "cache_write":  1.25},
}


def load_jsonl(path: Path) -> list:
    if not path.exists():
        return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def model_rate(model_id: str):
    """Strip date suffix (claude-haiku-4-5-20251001 → claude-haiku-4-5)."""
    parts = model_id.split("-")
    base = "-".join(parts[:4]) if len(parts) >= 4 else model_id
    return MODEL_RATES.get(base) or MODEL_RATES.get(model_id)


def compute_cost(models: dict) -> float:
    total = 0.0
    for model_id, usage in models.items():
        rate = model_rate(model_id)
        if not rate:
            continue
        total += (usage.get("input_tokens", 0) / 1e6) * rate["input"]
        total += (usage.get("output_tokens", 0) / 1e6) * rate["output"]
        total += (usage.get("cache_read_input_tokens", 0) / 1e6) * rate["cache_read"]
        total += (usage.get("cache_creation_input_tokens", 0) / 1e6) * rate["cache_write"]
    return total


def to_int(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s == "—":
        return None
    try:
        return int(s)
    except ValueError:
        return None


def summarize(tasks_records: list, dispatches_records: list) -> list:
    # Group task transitions by task_id, sorted by ts
    task_history: dict = defaultdict(list)
    for r in tasks_records:
        if r.get("task_id"):
            task_history[r["task_id"]].append(r)
    for tid in task_history:
        task_history[tid].sort(key=lambda r: r.get("ts", ""))

    # Group dispatches by task_id (one dispatch can touch multiple tasks)
    task_dispatches: dict = defaultdict(list)
    for d in dispatches_records:
        for tid in d.get("task_ids") or []:
            task_dispatches[tid].append(d)

    summaries = []
    for tid, history in task_history.items():
        latest = history[-1]
        statuses = [r.get("status") for r in history if r.get("status")]

        # Rework: count of times we returned to in-progress after a non-initial state
        rework_count = 0
        prev = None
        for s in statuses:
            if s == "in-progress" and prev in ("review", "done"):
                rework_count += 1
            prev = s

        # Reopened-after-done: did status leave "done" at any point?
        reopened_after_done = False
        seen_done = False
        for s in statuses:
            if s == "done":
                seen_done = True
            elif seen_done and s != "done":
                reopened_after_done = True
                break

        # Earliest non-null Started-at, latest non-null Completed-at
        started_at = next(
            (r.get("started_at") for r in history if r.get("started_at") and r.get("started_at") != "—"),
            None,
        )
        completed_at = next(
            (r.get("completed_at") for r in reversed(history) if r.get("completed_at") and r.get("completed_at") != "—"),
            None,
        )
        # Fallback to JSONL timestamps if frontmatter missing
        if not started_at:
            started_at = next(
                (r["ts"] for r in history if r.get("status") == "in-progress"),
                None,
            )
        if not completed_at:
            completed_at = next(
                (r["ts"] for r in history if r.get("status") == "done"),
                None,
            )

        c_est = next(
            (to_int(r.get("complexity_estimate")) for r in history if to_int(r.get("complexity_estimate")) is not None),
            None,
        )
        c_act = next(
            (to_int(r.get("complexity_actual")) for r in reversed(history) if to_int(r.get("complexity_actual")) is not None),
            None,
        )
        drift = (c_act - c_est) if (c_est is not None and c_act is not None) else None

        # Aggregate dispatch data
        dispatches = task_dispatches.get(tid, [])
        active_work_ms = sum((d.get("duration_ms") or 0) for d in dispatches)
        models: dict = defaultdict(lambda: {
            "input_tokens": 0, "output_tokens": 0,
            "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
        })
        tool_count = 0
        agent_types = []
        for d in dispatches:
            for m, u in (d.get("models") or {}).items():
                for k, v in u.items():
                    models[m][k] += int(v or 0)
            tool_count += d.get("tool_count") or 0
            if d.get("agent_type"):
                agent_types.append(d["agent_type"])

        cost = compute_cost(dict(models))
        total_input = sum(u["input_tokens"] for u in models.values())
        total_output = sum(u["output_tokens"] for u in models.values())
        total_cache_read = sum(u["cache_read_input_tokens"] for u in models.values())
        total_cache_create = sum(u["cache_creation_input_tokens"] for u in models.values())
        total_billable_input = total_input + total_cache_create
        cache_hit_ratio = (total_cache_read / (total_cache_read + total_billable_input)) if (total_cache_read + total_billable_input) else 0

        # Wall clock from first transition to last
        wall_clock_ms = None
        if started_at and completed_at:
            try:
                t0 = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
                wall_clock_ms = int((t1 - t0).total_seconds() * 1000)
            except (ValueError, AttributeError):
                pass

        summaries.append({
            "task_id": tid,
            "current_status": latest.get("status"),
            "assigned_to": latest.get("assigned_to"),
            "agent_types": sorted(set(agent_types)),
            "started_at": started_at,
            "completed_at": completed_at,
            "wall_clock_ms": wall_clock_ms,
            "active_work_ms": active_work_ms,
            "complexity_estimate": c_est,
            "complexity_actual": c_act,
            "estimate_drift": drift,
            "rework_count": rework_count,
            "reopened_after_done": reopened_after_done,
            "dispatch_count": len(dispatches),
            "tool_count": tool_count,
            "models": dict(models),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "cache_hit_ratio": round(cache_hit_ratio, 3),
            "cost_usd": round(cost, 4),
        })
    return summaries


def fmt_ms(ms):
    if ms is None:
        return "—"
    if ms < 60_000:
        return f"{ms / 1000:.1f}s"
    if ms < 3_600_000:
        return f"{ms / 60_000:.1f}m"
    return f"{ms / 3_600_000:.1f}h"


def render_table(summaries: list) -> str:
    if not summaries:
        return "_No task records found in `.claude/metrics/tasks.jsonl`._\n"
    lines = []
    headers = ["task_id", "status", "est", "act", "drift", "rework", "active", "wall", "dispatches", "tokens", "cache%", "cost"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")
    for s in summaries:
        token_total = sum(sum(u.values()) for u in s["models"].values())
        cells = [
            s["task_id"],
            s["current_status"] or "—",
            str(s["complexity_estimate"]) if s["complexity_estimate"] is not None else "—",
            str(s["complexity_actual"]) if s["complexity_actual"] is not None else "—",
            f"{s['estimate_drift']:+d}" if s["estimate_drift"] is not None else "—",
            ("⚠ " + str(s["rework_count"])) if s["rework_count"] else "0",
            fmt_ms(s["active_work_ms"]),
            fmt_ms(s["wall_clock_ms"]),
            str(s["dispatch_count"]),
            f"{token_total:,}",
            f"{int(s['cache_hit_ratio']*100)}%",
            f"${s['cost_usd']:.4f}",
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def render_aggregate(summaries: list) -> str:
    if not summaries:
        return ""
    total_cost = sum(s["cost_usd"] for s in summaries)
    total_active = sum((s["active_work_ms"] or 0) for s in summaries)
    total_dispatches = sum(s["dispatch_count"] for s in summaries)
    total_tokens = sum(sum(sum(u.values()) for u in s["models"].values()) for s in summaries)

    with_complexity = [s for s in summaries if s["complexity_estimate"] is not None and s["complexity_actual"] is not None]
    rework_total = sum(s["rework_count"] for s in summaries)
    flips = sum(1 for s in summaries if s["reopened_after_done"])

    lines = ["", "## Aggregate", ""]
    lines.append(f"- **Tasks:** {len(summaries)} (with full complexity: {len(with_complexity)})")
    lines.append(f"- **Total cost:** ${total_cost:.2f}")
    lines.append(f"- **Total active agent time:** {fmt_ms(total_active)}")
    lines.append(f"- **Total dispatches:** {total_dispatches}")
    lines.append(f"- **Total tokens:** {total_tokens:,}")
    lines.append(f"- **Rework cycles:** {rework_total}")
    lines.append(f"- **Gate flips (reopened after done):** {flips}")
    if with_complexity:
        avg_drift = sum(s["estimate_drift"] for s in with_complexity) / len(with_complexity)
        lines.append(f"- **Avg estimate drift:** {avg_drift:+.2f}")
        # Per-agent drift
        per_agent: dict = defaultdict(list)
        for s in with_complexity:
            for at in s["agent_types"]:
                per_agent[at].append(s["estimate_drift"])
        if per_agent:
            lines.append("- **Per-agent estimate drift:**")
            for at, drifts in sorted(per_agent.items()):
                avg = sum(drifts) / len(drifts)
                lines.append(f"  - `{at}`: {avg:+.2f} (n={len(drifts)})")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--epic", help="Filter to one epic (e.g., EP-060 → matches TASK-060-* and BUG-060-*)")
    ap.add_argument("--since", help="Filter to tasks started on or after YYYY-MM-DD")
    ap.add_argument("--json", action="store_true", help="JSON output instead of markdown")
    args = ap.parse_args()

    tasks = load_jsonl(METRICS_DIR / "tasks.jsonl")
    dispatches = load_jsonl(METRICS_DIR / "dispatches.jsonl")
    summaries = summarize(tasks, dispatches)

    if args.epic:
        epic_num = args.epic.upper().replace("EP-", "").lstrip("0").rjust(3, "0")
        summaries = [s for s in summaries if f"-{epic_num}-" in s["task_id"]]
    if args.since:
        summaries = [s for s in summaries if (s.get("started_at") or "") >= args.since]

    summaries.sort(key=lambda s: s["task_id"])

    if args.json:
        print(json.dumps(summaries, indent=2, default=str))
        return 0

    title = "# Metrics Report"
    if args.epic:
        title += f" — {args.epic}"
    print(title)
    print()
    print(render_table(summaries))
    print(render_aggregate(summaries))
    return 0


if __name__ == "__main__":
    sys.exit(main())

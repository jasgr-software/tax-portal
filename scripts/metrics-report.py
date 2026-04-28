#!/usr/bin/env python3
"""metrics-report.py — derive per-task metrics from .claude/metrics/*.jsonl.

Joins the four metric streams (dispatches, tasks, sessions, tool errors) into
a per-task summary. Outputs a markdown table to stdout by default, or JSON
with --json. Filter to one epic with --epic EP-NNN.

Also produces rollup sections: per-epic, per-agent, monthly (from dispatch
timestamps when task records are sparse).

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

# Per-million-token rates (USD). Verified against
# https://platform.claude.com/docs/en/about-claude/pricing on 2026-04-26.
# Cache write rate is for the 5-minute ephemeral TTL tier (1.25x base input).
# Cache read rate is 0.1x base input price.
#
# Rate changes from previous version (verified 2026-04-26):
#   claude-opus-4-7: input $15→$5, output $75→$25, cache_read $1.50→$0.50, cache_write $18.75→$6.25
#   claude-opus-4-6: input $15→$5, output $75→$25, cache_read $1.50→$0.50, cache_write $18.75→$6.25
#   claude-sonnet-4-6, claude-sonnet-4-5, claude-haiku-4-5: unchanged
MODEL_RATES = {
    "claude-opus-4-7":   {"input":  5.00, "output": 25.00, "cache_read": 0.50,  "cache_write":  6.25},
    "claude-opus-4-6":   {"input":  5.00, "output": 25.00, "cache_read": 0.50,  "cache_write":  6.25},
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


def dispatch_tokens(d: dict) -> tuple[int, int, int, int]:
    """Return (input, output, cache_read, cache_create) totals for one dispatch."""
    inp = outp = cr = cc = 0
    for usage in (d.get("models") or {}).values():
        inp += int(usage.get("input_tokens", 0) or 0)
        outp += int(usage.get("output_tokens", 0) or 0)
        cr += int(usage.get("cache_read_input_tokens", 0) or 0)
        cc += int(usage.get("cache_creation_input_tokens", 0) or 0)
    return inp, outp, cr, cc


def cache_hit_pct(inp: int, outp: int, cache_read: int, cache_create: int) -> str:
    """Format cache-hit percentage as a string like '87%'."""
    _ = outp  # not used in denominator
    billable_input = inp + cache_create
    denom = cache_read + billable_input
    if denom == 0:
        return "—"
    return f"{int(cache_read / denom * 100)}%"


def epic_prefix(task_id: str) -> str:
    """Extract epic group from task_id.

    Examples:
      TASK-001-003 → EP-001
      BUG-001-002  → EP-001
      TASK-LOE-001 → LOE
      TASK-LOE-003 → LOE
    """
    parts = task_id.split("-")
    # TASK-NNN-NNN or BUG-NNN-NNN: parts[1] is the numeric epic
    if len(parts) >= 3 and parts[1].isdigit():
        return f"EP-{parts[1]}"
    # TASK-LOE-NNN or similar non-numeric: use the middle segment
    if len(parts) >= 3:
        return parts[1]
    return task_id


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


# ---------------------------------------------------------------------------
# Rollup helpers — built from both task summaries and raw dispatches.
# When tasks.jsonl is sparse or absent, dispatch-level data still yields
# the per-agent and monthly rollups. Per-epic rollup is task-id–driven and
# will show an empty table when no task records exist.
# ---------------------------------------------------------------------------

def _rollup_epic(summaries: list) -> dict:
    """Group task summaries by epic prefix → rollup dict keyed by epic label.

    Returns: {epic: {tasks, total_tokens, cache_read, billable_input, cost_usd, drifts[]}}
    """
    by_epic: dict = defaultdict(lambda: {
        "tasks": 0, "total_tokens": 0,
        "cache_read": 0, "billable_input": 0,
        "cost_usd": 0.0, "drifts": [],
    })
    for s in summaries:
        ep = epic_prefix(s["task_id"])
        g = by_epic[ep]
        g["tasks"] += 1
        for model_usage in s["models"].values():
            g["total_tokens"] += sum(model_usage.values())
            g["cache_read"] += int(model_usage.get("cache_read_input_tokens", 0) or 0)
            g["billable_input"] += (
                int(model_usage.get("input_tokens", 0) or 0)
                + int(model_usage.get("cache_creation_input_tokens", 0) or 0)
            )
        g["cost_usd"] += s["cost_usd"]
        if s["estimate_drift"] is not None:
            g["drifts"].append(s["estimate_drift"])
    return dict(by_epic)


def _rollup_agent(dispatches_records: list) -> dict:
    """Group all dispatches by agent_type.

    Returns: {agent_type: {dispatches, total_tokens, cache_read, billable_input, cost_usd}}
    """
    by_agent: dict = defaultdict(lambda: {
        "dispatches": 0, "total_tokens": 0,
        "cache_read": 0, "billable_input": 0,
        "cost_usd": 0.0,
    })
    for d in dispatches_records:
        atype = d.get("agent_type") or "unknown"
        g = by_agent[atype]
        g["dispatches"] += 1
        inp, outp, cr, cc = dispatch_tokens(d)
        g["total_tokens"] += inp + outp + cr + cc
        g["cache_read"] += cr
        g["billable_input"] += inp + cc
        g["cost_usd"] += compute_cost(d.get("models") or {})
    return dict(by_agent)


def _rollup_monthly(dispatches_records: list) -> dict:
    """Group all dispatches by YYYY-MM of their timestamp.

    Returns: {month: {dispatches, total_tokens, cost_usd}}
    Note: 'tasks' count is not available here — dispatch-level only.
    """
    by_month: dict = defaultdict(lambda: {
        "dispatches": 0, "total_tokens": 0, "cost_usd": 0.0,
    })
    for d in dispatches_records:
        ts = d.get("ts") or ""
        month = ts[:7]  # YYYY-MM
        if not month:
            month = "unknown"
        g = by_month[month]
        g["dispatches"] += 1
        inp, outp, cr, cc = dispatch_tokens(d)
        g["total_tokens"] += inp + outp + cr + cc
        g["cost_usd"] += compute_cost(d.get("models") or {})
    return dict(by_month)


def render_epic_rollup(summaries: list) -> str:
    """## Per-epic rollup table (task-id driven).

    Columns: epic | tasks | total_tokens | cache_hit% | cost_usd | avg_drift
    Sorted by cost descending.
    """
    lines = ["", "## Per-epic rollup", ""]
    if not summaries:
        lines.append("_No task records in `.claude/metrics/tasks.jsonl` — no per-epic data._")
        lines.append("")
        lines.append("> Per-epic rollup groups by task_id prefix (TASK-001-* → EP-001,")
        lines.append("> TASK-LOE-* → LOE). Populate tasks.jsonl via the log-task-edit.py hook.")
        return "\n".join(lines)

    by_epic = _rollup_epic(summaries)
    rows = sorted(by_epic.items(), key=lambda kv: kv[1]["cost_usd"], reverse=True)

    headers = ["epic", "tasks", "total_tokens", "cache_hit%", "cost_usd", "avg_drift"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")
    for ep, g in rows:
        denom = g["cache_read"] + g["billable_input"]
        ch = f"{int(g['cache_read'] / denom * 100)}%" if denom else "—"
        avg_drift = (
            f"{sum(g['drifts']) / len(g['drifts']):+.2f}" if g["drifts"] else "—"
        )
        cells = [
            ep,
            str(g["tasks"]),
            f"{g['total_tokens']:,}",
            ch,
            f"${g['cost_usd']:.4f}",
            avg_drift,
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def render_agent_rollup(dispatches_records: list) -> str:
    """## Per-agent rollup table (dispatch driven).

    Columns: agent_type | dispatches | total_tokens | cache_hit% | cost_usd
    Sorted by cost descending.
    """
    lines = ["", "## Per-agent rollup", ""]
    if not dispatches_records:
        lines.append("_No dispatch records found._")
        return "\n".join(lines)

    by_agent = _rollup_agent(dispatches_records)
    rows = sorted(by_agent.items(), key=lambda kv: kv[1]["cost_usd"], reverse=True)

    headers = ["agent_type", "dispatches", "total_tokens", "cache_hit%", "cost_usd"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")
    for atype, g in rows:
        denom = g["cache_read"] + g["billable_input"]
        ch = f"{int(g['cache_read'] / denom * 100)}%" if denom else "—"
        cells = [
            atype,
            str(g["dispatches"]),
            f"{g['total_tokens']:,}",
            ch,
            f"${g['cost_usd']:.4f}",
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def render_monthly_rollup(dispatches_records: list) -> str:
    """## Monthly rollup table (dispatch driven).

    Columns: month | dispatches | total_tokens | cost_usd
    Sorted by month ascending (chronological for review cadence).

    Note: 'tasks' count from task records is not mixed in here — dispatch-level
    only, since tasks.jsonl may be absent. This section serves the manual monthly
    review cadence per decision #4B.

    # TODO(future): once tasks.jsonl is consistently populated, join task
    # started_at[:7] here to add a 'tasks' column and replace 'dispatches'.
    """
    lines = ["", "## Monthly rollup", ""]
    lines.append("_(dispatch-level; month = dispatch timestamp YYYY-MM)_")
    lines.append("")
    if not dispatches_records:
        lines.append("_No dispatch records found._")
        return "\n".join(lines)

    by_month = _rollup_monthly(dispatches_records)
    rows = sorted(by_month.items())  # chronological

    headers = ["month", "dispatches", "total_tokens", "cost_usd"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join("---" for _ in headers) + "|")
    for month, g in rows:
        cells = [
            month,
            str(g["dispatches"]),
            f"{g['total_tokens']:,}",
            f"${g['cost_usd']:.4f}",
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def build_rollup_json(summaries: list, dispatches_records: list) -> dict:
    """Build the rollup data structures for --json output.

    Returns dict with keys: by_epic, by_agent, by_month.
    by_phase is omitted — phase data is not captured in dispatches.jsonl.
    See Implementation Notes in TASK-LOE-004 for the TODO.

    # TODO(future/by_phase): dispatches.jsonl does not include a 'phase' field.
    # To enable per-phase rollup: add 'phase' to the dispatch context in
    # .claude/hooks/log-dispatch.py (read it from PROGRESS.md or pass it via
    # the SA spawn prompt), then group here by d.get("phase").
    """
    by_epic_raw = _rollup_epic(summaries)
    by_epic = {}
    for ep, g in by_epic_raw.items():
        denom = g["cache_read"] + g["billable_input"]
        by_epic[ep] = {
            "tasks": g["tasks"],
            "total_tokens": g["total_tokens"],
            "cache_hit_pct": round(g["cache_read"] / denom, 3) if denom else None,
            "cost_usd": round(g["cost_usd"], 4),
            "avg_drift": (sum(g["drifts"]) / len(g["drifts"])) if g["drifts"] else None,
        }

    by_agent_raw = _rollup_agent(dispatches_records)
    by_agent = {}
    for atype, g in by_agent_raw.items():
        denom = g["cache_read"] + g["billable_input"]
        by_agent[atype] = {
            "dispatches": g["dispatches"],
            "total_tokens": g["total_tokens"],
            "cache_hit_pct": round(g["cache_read"] / denom, 3) if denom else None,
            "cost_usd": round(g["cost_usd"], 4),
        }

    by_month_raw = _rollup_monthly(dispatches_records)
    by_month = {
        month: {
            "dispatches": g["dispatches"],
            "total_tokens": g["total_tokens"],
            "cost_usd": round(g["cost_usd"], 4),
        }
        for month, g in sorted(by_month_raw.items())
    }

    return {
        "by_epic": by_epic,
        "by_agent": by_agent,
        "by_phase": None,  # not captured — see TODO above
        "by_month": by_month,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--epic", help="Filter to one epic (e.g., EP-060 → matches TASK-060-* and BUG-060-*)")
    ap.add_argument("--since", help="Filter to tasks started on or after YYYY-MM-DD")
    ap.add_argument("--json", action="store_true", help="JSON output instead of markdown")
    args = ap.parse_args()

    tasks = load_jsonl(METRICS_DIR / "tasks.jsonl")
    dispatches = load_jsonl(METRICS_DIR / "dispatches.jsonl")
    summaries = summarize(tasks, dispatches)

    # Apply filters to task summaries
    if args.epic:
        epic_num = args.epic.upper().replace("EP-", "").lstrip("0").rjust(3, "0")
        summaries = [s for s in summaries if f"-{epic_num}-" in s["task_id"]]
    if args.since:
        summaries = [s for s in summaries if (s.get("started_at") or "") >= args.since]

    summaries.sort(key=lambda s: s["task_id"])

    # For rollup sections: apply the same filters to dispatches when --since is
    # requested; --epic does not filter dispatches (most dispatches lack task_ids).
    filtered_dispatches = dispatches
    if args.since:
        filtered_dispatches = [d for d in dispatches if (d.get("ts") or "") >= args.since]

    if args.json:
        rollups = build_rollup_json(summaries, filtered_dispatches)
        output = {
            "tasks": summaries,
            "aggregate": {
                "task_count": len(summaries),
                "total_cost_usd": round(sum(s["cost_usd"] for s in summaries), 4),
                "total_dispatches": len(filtered_dispatches),
                "total_tokens": sum(
                    sum(sum(u.values()) for u in s["models"].values()) for s in summaries
                ),
            },
            **rollups,
        }
        print(json.dumps(output, indent=2, default=str))
        return 0

    title = "# Metrics Report"
    if args.epic:
        title += f" — {args.epic}"
    print(title)
    print()
    print(render_table(summaries))
    print(render_aggregate(summaries))
    print(render_epic_rollup(summaries))
    print(render_agent_rollup(filtered_dispatches))
    print(render_monthly_rollup(filtered_dispatches))
    return 0


if __name__ == "__main__":
    sys.exit(main())

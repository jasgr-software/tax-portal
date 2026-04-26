# TASK-LOE-004: Extend scripts/metrics-report.py with cost reporting rollups

**Epic**: chore/lights-out-enablement
**Status**: backlog
**Assigned to**: devops
**Updated-by**: sa
**Depends on**: none
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —
**Affected flows:** none (justification: chore touches metrics tooling, not user-facing behavior)
**Affected requirements:** none (justification: chore touches metrics tooling, not SRS requirements)
**Introduces-gate:** no
**Relevant ADRs:** none

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — Python script runs clean against existing `.claude/metrics/*.jsonl` files (no exceptions, valid output for both empty and non-empty datasets)
- [N/A] **Targeted e2e** — N/A (Python reporting script, no UI)
- [ ] **Security review** — verify no shell-out with user-controlled input; the script reads JSONL files only (no remote fetches, no eval)
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Dependency check first.** Read `.claude/metrics/dispatches.jsonl` schema. The current `metrics-report.py` already computes `cost_usd` per task (lines 61-71, 172) and prints `Total cost` in the aggregate section (line 266). The chore brief frames task 4 as "extend with cost reporting" but the **basic cost math already exists**. The actual gap is **rollups**: per-epic, per-agent, per-phase totals are not in the current report. The new work is producing those rollups, not introducing cost math.
- **Token capture is already in dispatches.jsonl** — verified by reading the existing `summarize()` function: it iterates `d.get("models")` per dispatch and accumulates per-model `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`. **No `log-task-edit.py` change is required.** Task spec scope reduces to `metrics-report.py` only.
- **Verify token-capture coverage.** Sample a recent dispatch from `.claude/metrics/dispatches.jsonl` and confirm a `models` block is present with non-zero counts. If token capture is missing or sparse, escalate to the SA — that would be a separate hook-update task, not in this scope.
- **Output format stability.** The existing markdown table format is consumed manually by the user; do not rename or reorder existing columns. Add new tables/sections; do not overwrite.
- **Numerical accuracy.** Verify the per-epic rollup matches the sum of the per-task `cost_usd` column for tasks matching the epic prefix. Spot-check one epic (the Lights-out chore tasks themselves once they land in the JSONL).

## Context

Decision #4B from the planning entry: **extend `scripts/metrics-report.py` with cost reporting columns. Manual monthly review cadence. No hard caps until baseline data justifies them.**

The chore brief flags a dependency check: "Need to verify what `.claude/metrics/tasks.jsonl` currently captures (token usage may or may not already be in the schema; if not, hook update may be required)."

**Dependency check result (verified in Plan):** Token usage is **not** in `tasks.jsonl` (which only captures task-file metadata snapshots), but **is** in `dispatches.jsonl` (which captures per-dispatch model usage). The existing `summarize()` function already joins these and computes `cost_usd` per task. The gap is **rollups**, not capture or computation.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/metrics-report.py` | Modify (add rollup sections) | devops |

## Tests to Write First

`metrics-report.py` does not currently have a test file. This task does **not** require adding one — it's a reporting script with deterministic input → output. Verification is via:

- [ ] Run `scripts/metrics-report.py` against current `.claude/metrics/*.jsonl` — output includes the new rollup sections (per-epic, per-agent, per-phase, monthly).
- [ ] Run `scripts/metrics-report.py --json` — JSON output includes the new rollup blocks.
- [ ] Run `scripts/metrics-report.py --epic LOE` — filtered output shows only Lights-out chore tasks (sanity check the existing filter still works after additions).
- [ ] Run with no metrics files (rename the directory temporarily) — script handles the empty case gracefully (existing behavior; just verify the additions don't break it).

If any rollup math feels non-obvious, add a Python docstring example on the function showing the expected input → expected output. Skip pytest scaffolding for this chore.

## Implementation Notes

### Three new rollup sections in markdown output

Add below the existing `## Aggregate` section:

1. **`## Per-epic rollup`** — table with columns: `epic | tasks | total_tokens | cache_hit% | cost_usd | avg_drift`. Group by extracting epic prefix from `task_id` (e.g., `TASK-001-003` → `EP-001`). For chore-style task IDs without numeric epic (`TASK-LOE-001`), group under the literal prefix (`LOE`).

2. **`## Per-agent rollup`** — table with columns: `agent_type | dispatches | total_tokens | cache_hit% | cost_usd`. Group by `agent_type` from dispatches. Useful for "which agents are token-hungry."

3. **`## Per-phase rollup`** — phase is not currently in dispatches.jsonl. **Skip this rollup if phase data is unavailable.** Note in the Work Log whether phase capture was found; if not, leave a `# TODO(future)` comment in the Python at the section's anchor with the work needed (add phase to dispatch context, then this rollup can be implemented). **Do not add phase capture in this task** — that would be a separate `log-dispatch.py` hook change, out of scope.

4. **`## Monthly rollup`** — table with columns: `month | tasks | total_tokens | cost_usd`. Group by `started_at[:7]` (YYYY-MM). Manual review cadence per decision #4B is monthly; this section directly serves that cadence.

### JSON output

The `--json` mode currently emits a list of per-task summaries. Wrap it in a top-level dict with keys `tasks`, `aggregate`, `by_epic`, `by_agent`, `by_phase`, `by_month`. **Breaking change to JSON consumers** — but there are no current JSON consumers (no script in the repo greps `metrics-report.py --json` output). Document this shape change in the Work Log so a future consumer knows.

### Cost rate verification

The `MODEL_RATES` dict at lines 29-35 has the rate table. **Verify against current Anthropic pricing before this task closes.** The comment at line 27 explicitly says "verify against https://docs.anthropic.com/en/docs/about-claude/pricing before relying on cost figures." Update rates if changed; document the rate-check date in the Work Log.

### Why no hook update

The chore brief flags the possibility of needing to augment `.claude/hooks/log-task-edit.py` to record per-dispatch token usage. **Verified in Plan: not needed.** Token capture lives in `log-dispatch.py` (the dispatch hook), not `log-task-edit.py` (the task-edit hook), and the existing schema in `dispatches.jsonl` already includes the `models` block with all four token counters. Reading `.claude/hooks/log-dispatch.py` lines 1-30 confirms the dispatch payload extracts `models` from the agent's response — the hook is already complete.

This narrows the task scope from "extend script + possibly hook" to "extend script only."

### Output ordering

Print order: existing `## Aggregate` first, then `## Per-epic rollup`, `## Per-agent rollup`, `## Monthly rollup`, then (if implemented) `## Per-phase rollup` last. Sort each table by cost descending so the most expensive items are at the top.

## Definition of Done

- [ ] `scripts/metrics-report.py` produces the 3-or-4 new rollup sections
- [ ] `--json` output includes the new keys
- [ ] Existing `--epic` and `--since` filters still work (regression check)
- [ ] Empty-metrics edge case still handled gracefully
- [ ] `MODEL_RATES` rate-check timestamp updated in the Work Log (rates verified or updated)
- [ ] Work Log includes a sample run output (markdown table, redacted if needed) showing the new sections appear

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

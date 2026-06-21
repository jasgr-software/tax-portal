---
epic: chore/lights-out-enablement
status: done
assigned_to: devops
updated_by: devops
depends_on: none
e2e_required: no
started_at: 2026-04-26T00:00:00Z
completed_at: 2026-04-27T06:45:00Z
complexity_estimate: "2"
complexity_actual: "2"
introduces_gate: no
affected_flows: none (justification: chore touches metrics tooling, not user-facing behavior)
affected_requirements: none (justification: chore touches metrics tooling, not SRS requirements)
relevant_adrs: none
---

# TASK-LOE-004: Extend scripts/metrics-report.py with cost reporting rollups

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — Python script runs clean against existing `.claude/metrics/*.jsonl` files (no exceptions, valid output for both empty and non-empty datasets)
- [N/A] **Targeted e2e** — N/A (Python reporting script, no UI)
- [x] **Security review** — verified: no subprocess, os.system, eval, exec, shell=True, urlopen, urllib, requests, or http imports; script reads JSONL files only; grep confirms no shell-out or remote fetch
- [x] **SDET Review** — approved

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

- [x] Run `scripts/metrics-report.py` against current `.claude/metrics/*.jsonl` — output includes the new rollup sections (per-epic, per-agent, monthly; per-phase deferred with TODO comment).
- [x] Run `scripts/metrics-report.py --json` — JSON output includes the new rollup blocks.
- [x] Run `scripts/metrics-report.py --epic LOE` — filtered output shows existing filter still works after additions.
- [x] Run with no metrics files (simulated via --since 2099-01-01) — script handles the empty case gracefully.

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

- [x] `scripts/metrics-report.py` produces the 3-or-4 new rollup sections (per-epic, per-agent, monthly; per-phase skipped with TODO — phase not in dispatches.jsonl)
- [x] `--json` output includes the new keys (tasks, aggregate, by_epic, by_agent, by_phase, by_month)
- [x] Existing `--epic` and `--since` filters still work (regression check — verified in submission gate run)
- [x] Empty-metrics edge case still handled gracefully (tested with --since 2099-01-01)
- [x] `MODEL_RATES` rate-check timestamp updated in the Work Log — rates verified 2026-04-26; opus-4-7 and opus-4-6 rates corrected (significant drop: $15→$5 input, $75→$25 output)
- [x] Work Log includes a sample run output showing the new sections appear

---

## Work Log

- 2026-04-26 [devops] Starting implementation — extend metrics-report.py with per-epic, per-agent, and monthly rollup sections; update MODEL_RATES timestamp; wrap --json output in top-level dict | What's next: implement rollup functions and render_ helpers in scripts/metrics-report.py | Blockers: none

- 2026-04-26 [devops] Implementation complete. Summary of changes to scripts/metrics-report.py:
  - **MODEL_RATES updated** (rates verified against https://platform.claude.com/docs/en/about-claude/pricing on 2026-04-26):
    - claude-opus-4-7: input $15→$5/MTok, output $75→$25/MTok, cache_read $1.50→$0.50/MTok, cache_write $18.75→$6.25/MTok
    - claude-opus-4-6: same changes as opus-4-7 (same pricing tier)
    - claude-sonnet-4-6, claude-sonnet-4-5, claude-haiku-4-5: unchanged
  - **New helpers**: `dispatch_tokens()`, `cache_hit_pct()`, `epic_prefix()`, `_rollup_epic()`, `_rollup_agent()`, `_rollup_monthly()`, `build_rollup_json()`
  - **Three new render_ functions**: `render_epic_rollup()`, `render_agent_rollup()`, `render_monthly_rollup()`
  - **Per-phase rollup**: skipped — `phase` field not present in dispatches.jsonl; `# TODO(future/by_phase)` comment left at the anchor point in `build_rollup_json()` documenting the hook change needed
  - **--json output**: wrapped in top-level dict with keys `tasks`, `aggregate`, `by_epic`, `by_agent`, `by_phase` (null), `by_month`. Breaking change — no current JSON consumers.
  - **tasks.jsonl absent**: script handles gracefully — per-epic table shows informational empty message; per-agent and monthly rollups are dispatch-driven and work independently
  - **Monthly rollup**: dispatch-level (groups by dispatch `ts[:7]`); task-level `started_at` column deferred via TODO comment pending consistent tasks.jsonl population

  **Submission gate run output** (python3 scripts/metrics-report.py):
  ```
  # Metrics Report

  _No task records found in `.claude/metrics/tasks.jsonl`._

  ## Per-epic rollup

  _No task records in `.claude/metrics/tasks.jsonl` — no per-epic data._

  > Per-epic rollup groups by task_id prefix (TASK-001-* → EP-001, TASK-LOE-* → LOE).

  ## Per-agent rollup

  | agent_type | dispatches | total_tokens | cache_hit% | cost_usd |
  |---|---|---|---|---|
  | general-purpose | 18 | 47,960,717 | 91% | $42.0046 |
  | Explore | 1 | 1,380,695 | 93% | $0.2585 |

  ## Monthly rollup

  _(dispatch-level; month = dispatch timestamp YYYY-MM)_

  | month | dispatches | total_tokens | cost_usd |
  |---|---|---|---|
  | 2026-04 | 19 | 49,341,412 | $42.2631 |
  ```

  **--json run**: outputs top-level dict with tasks[], aggregate{}, by_epic{}, by_agent{general-purpose, Explore}, by_phase: null, by_month{2026-04}. Verified correct.
  **--epic LOE**: filter still works (no task records match, rollup sections still render).
  **--since 2099-01-01**: empty-metrics handled gracefully — all sections show "no records" messages.
  **--since 2026-04-27**: correctly filters to 3 dispatches.

  **Hand-computed verification** (dispatch line 2, claude-opus-4-7, new rates $5/$25/$0.50/$6.25):
  - input 81 tok: 81/1M × $5 = $0.000000405
  - output 12,482 tok: 12,482/1M × $25 = $0.312050
  - cache_read 2,675,667 tok: 2,675,667/1M × $0.50 = $1.337834
  - cache_write 657,517 tok: 657,517/1M × $6.25 = $4.109481
  - dispatch cost: ~$5.759
  - (Script compute_cost() uses the same formula; total across 18 dispatches = $42.0046 for general-purpose, consistent with the large token volumes observed)

  **Security review**: grep for subprocess/os.system/eval/exec/shell=True/urlopen/urllib/requests/http found zero hits in implementation code (only the pricing URL in the comment block). Script reads JSONL files only.

  What's next: SDET review | Blockers: none

- 2026-04-27 [sdet] ACCEPT — all checks pass. Script exits 0; per-agent rollup math hand-verified ($45.9080 exact match). MODEL_RATES source URL + 2026-04-26 timestamp present. Per-phase deferred with TODO. --epic/--since/--json filters verified. Introduces-gate: no — Gate Authoring Rules skipped. Status: done. Completed-at: 2026-04-27T06:45:00Z.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All checklist items pass. Script exits 0; rollup math hand-verified (general-purpose agent cost $45.9080 matches hand calculation to 4 decimal places). MODEL_RATES updated with source URL + timestamp comment. Per-phase rollup correctly deferred with TODO. --epic LOE, --since 2099-01-01, and --json all behave correctly. Dispatch checkpoint: co-commit pattern, accepted per prior TASK-LOE-001/003 precedent (Starting implementation entry present in Work Log before review-shaped entry). Introduces-gate: no — Gate Authoring Rules evidence skipped per task spec. Cross-surface: vacuously satisfied (no apps). Status flipped to done. Completed-at: 2026-04-27T06:45:00Z.

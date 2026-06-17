# North Star — Scripted Orchestration

> **Purpose:** the long-term objective the `.orchestration/` work is moving toward, and the cadence for checking whether we're advancing. Re-read and score this **at the end of every delivery phase** (see § Per-phase evaluation). This doc is intentionally stable; the active plan lives in the per-increment design docs it links to.

## The objective

Replace the **LLM-conducted** orchestration Conductor with a **deterministic sequencer + pure-code gates + a small set of narrow, conservative, logged LLM gate-judges** for the residual *semantic* gates — migrated **strangler-style**, advancing on data, never trusting a path we haven't seen.

The Conductor today is an Opus-tier agent running a control flow that Phase 1 proved is a deterministic state machine. The objective is not "remove the LLM" — it is **put the intelligence inside the narrow gate nodes and make the composition between them dumb, explicit, and auditable.**

## Why (the load-bearing conclusions)

1. **Script-vs-agent and contract-erosion are one problem.** A script can't absorb variance; it *reveals* loose contracts instead of papering over them. Scripting **is** the erosion detector — an LLM Conductor hides drift by silently reinterpreting.
2. **Intelligence in the nodes, dumb composition between them.** Sequencing is a DAG; judgment belongs inside narrow gate evaluators.
3. **Re-derive from primary sources, never from ledger verdicts.** A recorded "✓" is a conclusion, not evidence. Every evaluator reads the source the agent read.
4. **Conservative bias.** False-pass lets bad work proceed (expensive, late); false-fail just halts (cheap, now). Evaluators default to FAIL/escalate when uncertain.
5. **Promotion is data-driven.** A gate graduates from `judge` to pure `code` only when the verdict log shows it returning the same answer at high confidence across many runs on a mechanical input.
6. **Never script an unexercised branch.** Branches that haven't fired in real runs default to halt-and-escalate, matching the Conductor's existing stop/defer discipline. We do not bake 4 near-identical runs in as if they were the whole space.

## Target end-state

```
deterministic sequencer (the DAG: Select → Gate → Compose → Implement → Review → Fix → Merge → Validate → Report)
  ├── pure-code gates        (globs, git/CI state, structured verdicts, file-structure checks)
  ├── narrow gate-judges      (typed I/O, conservative, logged — only where judgment is genuinely first made)
  └── halt-and-escalate       (anything outside codified cases → the user)
verdict log (.orchestration/runs/gate-log.jsonl)
  └── contract-erosion alarm + the promotion ledger (code vs judge, per gate, per run)
contracts-as-code
  └── build-brief validator + versioned gate input contracts; drift fails loud
```

The implementation engine stays a **swappable backend behind the build-brief contract** (`.orchestration/seed/sources.md`); none of this couples to `.implementation` internals.

## Migration path (strangler)

| Stage | What | Status |
| --- | --- | --- |
| **Increment 1 — Rails** | Persist the panel's structured verdict; gate-evaluator harness over primary sources; verdict log; typed gate-judge slot (no judge built). Control flow unchanged. | **Implemented** (branch `feat/orchestration-gate-rails`, 2026-06-17; test 11/11) — see [`INCREMENT-1-gate-rails.md`](./INCREMENT-1-gate-rails.md) |
| **Increment 2 — First judge** | Build the AC-testability gate-judge against the typed slot — validated on the first non-verbatim AC that appears. | Not started |
| **Increment 3 — Sequencer** | Deterministic sequencer takes the happy path from the agent; agent retained for halt-and-escalate cases. | Not started |
| **Ongoing — Promotion** | As the log proves a gate mechanical, move it `judge → code`. As a deferred branch fires and proves stable, codify it. | Continuous |

## Per-phase evaluation

At each delivery-phase close-out (the same moment `.planning/COVERAGE.md` is signed off), score advancement against the objective and record one line in § Advancement log:

1. **Did any deferred branch fire this phase?** (open `PQ` at gate, unresolvable blocker, gate deviation, non-verbatim AC.) If so — was it handled by halt-and-escalate, and does it now have enough data to codify?
2. **What does the verdict log say?** Any gate now eligible for `judge → code` promotion? Any `inputs_digest` drift (erosion alarm) fired?
3. **Did the contracts hold?** Build-brief schema stable? Any handoff that dropped something the agent silently absorbed?
4. **Next increment still the right next step?** Re-confirm or re-sequence the migration path above.

> Until the rails (increment 1) ship, this evaluation is a manual read of `.orchestration/STATE.md` + the phase retro. After increment 1, items 1–2 are answerable from `gate-log.jsonl`.

## Advancement log

| Phase | Date | Deferred branches fired | Promotions | Erosion alarms | Next step confirmed |
| --- | --- | --- | --- | --- | --- |
| Phase 1 (MVP) | 2026-06-17 | none (all AC verbatim; all `OD` pre-resolved; zero open `PQ`; 1 gate deviation EPIC-004, human-resolved) | n/a (rails not built) | n/a | Increment 1 — Rails |

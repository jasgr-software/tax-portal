# Orchestration Sources

> **This is the only file that couples the Conductor to a specific project and a specific set of engines.**
> The Conductor reads this file first to discover: where the **roadmap** lives (what to build next), which
> **implementation engine** turns a build brief into a merged PR, which **review/fix** commands harden the
> PR, and which **validate** capability writes acceptance back to the roadmap. Retarget the whole pipeline —
> a different roadmap source, a different implementation engine (e.g. open-swe instead of the in-repo IO) —
> by editing **this file only**. Nothing else in `.orchestration/` hard-codes a project path or an engine.
> Read-only to the Conductor.

## Roadmap source (what to build next — required)

- **type:** planning-layer
- **location:** `.planning/`
- **artifacts:**
  - `ROADMAP.md` — the phased plan; the epic table per phase + `depends_on` ordering (the selection input)
  - `EPIC-NNN-*.md` — the epic preparation documents (front-matter `id`, `status`, `slice`, `requirements`,
    `architecture`, `depends_on`, `open_questions`, `source`; body incl. *Out of scope* and — when present —
    *Acceptance scenarios* Given/When/Then). The brief-composition input.
  - `COVERAGE.md` — the per-AC ledger (`planned`/`verified`/`deferred`). The write-back target and the
    "is a `depends_on` epic actually delivered" check.
- **acceptance-unit:** `AC-<DOMAIN>-NNN-NN` — the unit the roadmap tracks and the brief carries.
- **ready predicate (an epic is selectable):** `status: planned` · `open_questions: []` · every `depends_on`
  epic is `delivered` · COVERAGE rows exist for its AC. (See `AGENT.md` § Select + Gate.)
- **note:** read-only. The Conductor never edits `.planning/` directly; the only roadmap mutation is via the
  **validate** capability below (the planning agent writes `COVERAGE.md`, not the main session).

## Implementation engine (brief → merged PR — required, swappable)

> The engine is a **backend behind the build-brief contract.** The Conductor composes a brief and hands it
> off; the engine plans, builds, validates, opens a PR, and (per its own rules) merges and finalizes. Swap
> engines by editing this block — the Conductor's lifecycle does not change.

- **default binding:** `.implementation/` (the in-repo Implementation Orchestrator)
- **invoke:** `/io <brief-path>` (the IO drives Plan → Dispatch → Audit → Review → Smoke → Validate →
  Close-prep → Close-finalize; the main session is the dispatch executor — see `.implementation/AGENT.md`)
- **brief contract (the interface):** `.implementation/_templates/build-brief.md` — front-matter `id`,
  `acceptance_criteria` (required), optional `methodology` / `acceptance_scenarios` / `source`; body
  *Scope* / *Out of scope* / *Acceptance criteria* / *Methodology & quality requirements* / *Constraints* /
  *References* / *Notes*.
- **brief output dir:** `.implementation/briefs/BRIEF-<NNN>-<slug>.md` (within main-session-writable scope)
- **completion signal:** the engine records the slice in `## Awaiting PR merge` of
  `.implementation/tasks/PROGRESS.md` with the PR URL; merge + Close-finalize are the engine's own
  autonomy (`.implementation/ENGINE.md` § Autonomy Ceiling, conditions a–d).
- **output contract the Conductor relies on:** a merged PR + a completion/handoff report naming which AC
  were satisfied (so the validate step has targets) + the green CI evidence (run id / SHA).
- **swap example:** to use an external engine, change `invoke:` to that engine's entry, point `brief
  contract` at the shape it consumes, and set how it signals completion. If the engine does not honor the
  build-brief shape above, the Conductor's Compose step targets the shape declared here.

## Review + fix (harden the opened PR — required)

- **review:** `/pr-review <N>` — the 3-lens advisory panel posts one consolidated `event=COMMENT` review
  (`.pr-review/AGENT.md`). Advisory; never blocks merge.
- **fix:** `/pr-fix <N>` — the bounded fixer loop addresses actionable findings and drives CI to green
  (`.pr-review/agents/fixer.md`). Invoked **only** when the panel posts blocker/major findings.

## Coverage write-back (acceptance → roadmap — required)

- **capability:** the Planning Agent's **validate** phase (`.planning/AGENT.md` § Validate)
- **invoke:** `/planning validate <epic-id> with CI evidence <run-id/SHA>` (interactive) — the planning
  agent consumes the merged-PR CI evidence, confirms AC↔test traceability, flips `COVERAGE.md` rows to
  `verified`, and rolls the epic `status` to `delivered` when all its in-scope AC are signed off.
- **note:** the Conductor **supplies evidence and requests** the write-back; the planning agent owns the
  `.planning/` edit. The Conductor never writes `COVERAGE.md` itself.

## What is deliberately NOT here

- **No re-implementation of the engine.** The Conductor sequences and gates; it does not plan tasks, write
  code, run submission gates, or merge — those belong to the engine and its own rules.
- **No new CI / branch-protection authority.** The Conductor consumes existing gates; it never authors them.

## Notes

- **A future project / engine retargets here.** Repoint `location:`/`invoke:` and the rest of
  `.orchestration/` is unchanged. This is the single project-coupling + engine-binding point.
- **Single source of pipeline truth** is `.orchestration/STATE.md` (the run ledger), not this file.

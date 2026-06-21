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

## Implementation engine (brief → merged PR — required)

> The engine is a backend behind the build-brief contract: the Conductor composes a brief and hands it off;
> the engine plans, builds, validates, opens a PR, and (per its own rules) merges and finalizes. To retarget
> a different engine, edit this block — the Conductor's lifecycle does not change.

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
- **retargeting:** point `invoke:` and `brief contract:` at another engine that consumes a brief and
  produces the same output contract; nothing outside this block changes.

## Code-standards review (audit the opened PR — required)

> A **project-aware** audit of the opened PR against `.code-standards/`, run **between Implement and Review**.
> Distinct from the panel: the `.pr-review/` lenses are project-agnostic and never read the catalogue — this is
> the separate, earlier path. **Skipped on the docs-only lane** (no application code to tag/violate — see
> `MERGE-POLICY.md`); run on the application-code lane.

- **invoke:** `/code-standards-review <N>` (interactive) — or the `.claude/agents/code-standards-review.md`
  subagent (batch / orchestrated). It audits the PR diff; it never edits the PR branch and never fixes violations.
- **verdict contract:** `pr-standards-verdict/v1` — HTML-comment-wrapped JSON the audit appends to its PR
  comment and returns; the Conductor captures it to `runs/PR-<N>-standards-verdict.json`. Fields: `verdict`
  (`approve`|`request-changes`), `fix_required` (= `violations.required > 0`), `violations` (`required`/
  `recommended`/`experimental`/`total`), `violated_keys`, `new_candidates`, `drafted`.
- **gate:** `bin/orchestrate-gates.sh --gate standards-decision --pr-standards-verdict <file>` derives
  run-fix/skip-fix (run iff any `required` violation) and fails on an inconsistent payload (erosion alarm).
- **fix routing:** the Fix phase runs `/pr-fix <N>` **once** if `(panel blocker+major > 0) OR (audit
  required > 0)` — one fixer pass consumes both comment sets.
- **new-standard drafts:** the audit may draft newly-discovered conventions as `experimental` standards
  (`by: agent`); they ride the run's docs-lane PR at close (additive, non-blocking).

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

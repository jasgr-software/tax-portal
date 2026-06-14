# Implementation Sources

> **This is the only file that couples the implementation layer to a specific project's inputs.**
> The Implementation Orchestrator reads this file first to discover *where the build brief lives* and which
> upstream layers (if any) are available as read-only reference. Retarget the layer for a different project —
> or a different orchestrator — by editing this file. Nothing else in `.implementation/` hard-codes a source
> path. Read-only to the agents.

## Build brief (required)

- **type:** build-brief
- **location:** `.implementation/briefs/BRIEF-<NNN>-*.md` (or any path the invoker passes at dispatch time)
- **shape:** `.implementation/_templates/build-brief.md` — front-matter `id`, `acceptance_criteria`,
  optional `methodology` / `acceptance_scenarios` / `source`; body Scope / Acceptance criteria / Methodology
  / Constraints / References.
- **acceptance-unit:** `AC-<NNN>-NN` — the unit the validation gate (SDET) tracks to pass/fail.
- **note:** the brief is **self-contained**. The team can plan, build, and validate from the brief alone.
  A brief may be produced by `.planning/`, authored ad-hoc, or emitted by an external orchestrator — the
  team does not care which.

## Upstream reference layers (optional, read-only)

Read these **only when the brief cites them** (via `source:` / `## References`) and the layer is present.
The team **degrades gracefully** when a declared source is absent — it never blocks on a missing upstream
layer, and it never edits one (it may *raise* a question back via `OPEN-QUESTIONS.md`).

- **requirements**
  - **type:** requirements-layer
  - **location:** `.requirements/`
  - **artifacts:** `REQ-<DOMAIN>-NNN.md` (one file per requirement; front-matter `id`, prose, acceptance criteria)
  - **use:** read a cited `REQ-` for context when the brief points at one. Product requirements are owned here,
    not by the team.
- **architecture**
  - **type:** architecture-layer
  - **location:** `.architecture/`
  - **artifacts:** `decisions/ADR-NNN-*.md`, `c4/L*-*.md`, `strategy/*.md`
  - **use:** read a cited `ADR-` as a binding design constraint. System architecture is owned here; the team
    never authors ADRs or edits the C4 model — it complies with them and raises open decisions upstream.
- **planning**
  - **type:** planning-layer
  - **location:** `.planning/`
  - **artifacts:** `EPIC-NNN-*.md`, `ROADMAP.md`, `COVERAGE.md`
  - **use:** when a brief is produced from a planning epic, the epic is the canonical producer of the brief's
    acceptance criteria and methodology (gherkin scenarios, TDD mandate, e2e/coverage targets). The team
    reports completion back (which AC were satisfied) for the planning layer to absorb into `COVERAGE.md`.

## Notes

- **Methodology is input, not policy.** Whether the build uses TDD, gherkin/BDD acceptance scenarios, e2e, or
  a coverage bar is declared in the brief's `methodology` block (canonically produced by `.planning/`). The
  engine is methodology-agnostic — it executes what the brief mandates and uses sensible defaults otherwise.
- **A future project retargets here.** Point `location:` at wherever briefs live; add or drop the optional
  upstream layers. The rest of `.implementation/` is portable.
- **Interchangeability.** Because the only required input is a self-contained brief, an external implementation
  orchestrator can be used instead of this layer — it simply needs to honor the build-brief contract (or this
  layer can be ignored entirely).

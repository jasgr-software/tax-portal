# `.planning/` — Standalone Delivery Planning

This folder is a **self-contained, workflow-agnostic description of *what to build next and in what
order*.** It is the product-owner counterpart to `.requirements/` (the **what** — requirements +
acceptance criteria) and `.architecture/` (the **how** — decisions, C4, strategy). This layer
decomposes those two sources into a **phased roadmap of vertically-sliced epics**, MVP-first, and tracks
every acceptance criterion from `planned` to signed off.

Like its siblings, this layer is **self-contained and workflow-agnostic.** Its agent both authors the
plan and offers a **validate capability** — confirming, from CI/test evidence, that an epic's acceptance
criteria are implemented — and **neither depends on any orchestration workflow.** A host multi-agent
workflow *may* invoke the agent (to plan the next phase, or to validate a finished epic before sign-off),
but those dispatch points are defined by that workflow in its own adapter, not here. There are no
`.implementation/tasks/`, sprints, build pipelines, or developer instructions in here — just the roadmap, the epics,
the acceptance coverage, and the agent that authors them.

## What's here

```
.planning/
├── README.md            # this file — lifecycle, schemas, conventions
├── AGENT.md             # the Planning Agent — canonical role definition (source of truth)
├── ROADMAP.md           # the living, phased plan (Phase 1 = MVP → … → full acceptance)
├── COVERAGE.md          # the acceptance ledger — one row per AC → epic → test binding → status
├── OPEN-QUESTIONS.md    # planning ambiguity ledger (PQ-NNN), each with a proposed default
├── personas/            # user archetypes — one file per actor (created on first authored persona)
│   └── <slug>.md
├── flows/               # targeted, lightweight per-slice user flows (created on first authored flow)
│   └── <slug>.md
├── _templates/          # copy-to-create shapes
│   ├── epic.md
│   ├── persona.md
│   ├── flow.md
│   └── open-question.md
├── seed/                # ingestion surface — read-only to the agent
│   ├── sources.md       # THE generalization knob — declares where the requirement/architecture sources live
│   └── intake.md        # raw planning intent + ad-hoc requirements
└── EPIC-NNN-<slug>.md   # one file per vertically-sliced epic, authored by the agent
                         #   (acceptance scenarios live INSIDE the epic — there is no .feature tree)
```

## Lifecycle

```
sources + seed  ──►  Planning Agent  ──►  ROADMAP · EPIC-NNN · COVERAGE   (+ OPEN-QUESTIONS.md)
(requirements + architecture     ingest → clarify         phased vertical slices; per-AC
 + raw planning intent)          → author → review        acceptance tracked to sign-off
```

1. **Sources + seed.** `seed/sources.md` declares where the requirements and architecture sources live;
   `seed/intake.md` carries raw planning intent and ad-hoc requirements. New planning intent is added to
   `seed/`; the agent reads it, never the other way around. The requirement/architecture sources
   themselves are read-only inputs.
2. **Agent run.** The Planning Agent ingests the sources, clarifies genuine planning ambiguities (asking
   you directly when interactive, or logging a `PQ-NNN` with a proposed default otherwise), authors/
   updates the epics, sequences them into roadmap phases, maintains the coverage ledger, **keeps the
   behavior contract (personas + flows) in sync with the epics it touched**, and self-reviews. See
   `AGENT.md`.
3. **Plan.** Each `EPIC-*.md` is a **preparation document** (not build instructions): the vertical slice,
   the AC it delivers, the architecture it must adhere to, and the per-AC automated-test sign-off
   contract. `ROADMAP.md` orders the epics into MVP-first phases.
4. **Acceptance.** `COVERAGE.md` maps every source AC to an epic (or marks it orphaned/deferred). The
   **validate** capability confirms — from CI/test evidence — that tagged tests pass, flips each AC to
   `verified`, and rolls an epic to `delivered` when all its AC are signed off.

**Incremental & additive.** Re-running the agent decomposes or updates only what changed; epics whose
`source:` did not change are left untouched. Coverage rows are never silently dropped. **Personas and
flows are first-class artifacts maintained the same way** — each run diffs them new/changed/unchanged
alongside the epics and updates the ones a touched epic affects, so the behavior contract never drifts
stale; unchanged ones are left exactly as-is.

## How to run the agent

- **Any executor:** point it at `.planning/AGENT.md` and have it follow that file. The role is fully
  defined there. (Per this project's decision, no Claude Code slash-command / subagent adapter is wired
  yet — the layer is invoked by reading `AGENT.md`. A host workflow may add a thin adapter later that
  only points here; behavior stays in `AGENT.md`.)
- **Interactive vs. batch:** with a live user present the agent asks clarifying questions directly; with
  no user reachable it degrades to **ledger-only** clarification — every ambiguity becomes a `PQ-NNN`
  with a proposed default instead of a question.
- **Validate dispatch:** an executor (or host workflow) hands the agent a target epic/AC set plus CI/
  test-result evidence; the agent runs phase 5 and returns the validation report. It consumes evidence —
  it never runs tests itself.

## Artifact formats

### Epic — `EPIC-NNN-<slug>.md`

Front matter carries planning state + the AC it owns + adherence + provenance (see `_templates/epic.md`):

```yaml
id: EPIC-001
title: Public front door
phase: 1                  # roadmap phase; Phase 1 = MVP
status: planned           # draft → clarifying → planned → delivered
slice: Anonymous visitor browses active services and submits an engagement request
requirements:             # the specific AC this epic delivers — a SUBSET of a REQ's AC is allowed
  - REQ-DOOR-001: [AC-DOOR-001-01, AC-DOOR-001-02, AC-DOOR-001-03]
architecture: [ADR-006, REQ-DOOR-004]
depends_on: []
source:
  - .requirements/REQ-DOOR-001.md
  - .architecture/decisions/ADR-006-monorepo.md
open_questions: []
```

Body sections: **Vertical slice**, **Requirements delivered**, **Architecture adherence**, **Acceptance
scenarios** (Given/When/Then per in-scope AC), **Traceability & sign-off contract**, **Out of scope**
(incl. AC split to other epics), **Links** (incl. the personas and flows it touches). `EPIC-001` is the
worked reference example.

### Roadmap — `ROADMAP.md`

A **living**, phased plan with an amendment-history block. Phase 1 is the MVP; each later phase is a
shippable vertical increment. Lists each phase's epics and their `depends_on` ordering.

### Coverage — `COVERAGE.md`

The acceptance ledger: **one row per AC** → epic → phase → test tag → status (`planned`/`verified`/
`deferred`) → evidence. Plus a **Split requirements** index (requirements whose AC span multiple epics),
an **Orphans** section (source AC not yet placed — the work remaining), and a **Deferred** section.

### Open question — `OPEN-QUESTIONS.md` entry

`PQ-NNN` with `Status` (open → resolved), `Affects` (the epic/requirement/phase it blocks), the
`Question`, a `Proposed default` (so planning is never blocked — except carve-out items), a `Resolution`,
and `Provenance`.

### Persona — `personas/<slug>.md`

A user archetype the product serves (see `_templates/persona.md`): the actor's role, goals, context,
pain points, and what they touch in the product. Authored **as the roadmap reaches an actor that has
none** — not an exhaustive upfront set. Filed by descriptive kebab-case slug (e.g.
`personas/jane-accountant.md`); the slug is its identity.

### User flow — `flows/<slug>.md`

A **targeted, lightweight** end-to-end flow (see `_templates/flow.md`): the actor, the trigger, the
happy-path steps through the stack, and the key alternate/error branches — scoped to the slice that
realizes it. Built out **incrementally as epics are authored** (a per-slice flow, not a product-wide
flow catalogue) and grown as later epics extend the same journey. Filed by descriptive kebab-case slug
(e.g. `flows/engagement-request.md`).

### Acceptance scenario — embedded in `EPIC-NNN-<slug>.md`

The behavior contract, written as **Given/When/Then** scenarios in the epic's *Acceptance scenarios*
section — one or more per in-scope AC, with the scenario title carrying the AC id it covers. **There is
no standalone `.feature` tree**: the scenarios live inside the epic and a build brief surfaces them into
its `acceptance_scenarios`. Whether the downstream `.implementation/` team binds them to executable
gherkin step definitions is that brief's optional, methodology-driven call — planning owns the scenario
*text*, not the binding.

## Conventions

**IDs**
- `EPIC-NNN` — epic. Zero-padded, globally unique, **never reused or renumbered**.
- `PQ-NNN` — planning open question, globally unique.
- Phases are `Phase 1` … `Phase N`; Phase 1 is always the MVP.
- `REQ-*` / `AC-*` / `ADR-*` ids are owned by the requirement and architecture sources — this
  layer **cites** them, it never mints them.

**Status**
- Epic `status:` — `draft` → `clarifying` → `planned` → `delivered`. An epic is `planned` only when no
  open question blocks it; `delivered` only when every in-scope AC is `verified` in `COVERAGE.md`.
- AC status (in `COVERAGE.md`) — `planned` → `verified` (passing tagged test) / `deferred`.

**The acceptance criterion is the unit of coverage.** Requirements split across epics at AC granularity.
A requirement is never "covered" when only some of its AC are placed; each remaining AC lives in another
epic, the Orphans section, or the Deferred section.

**Sign-off = a passing tagged test.** An AC is implemented only when an automated test **tagged with its
AC id** passes in CI. The agent verifies this from evidence in the validate phase; it never runs tests
and never signs off without evidence.

**Behavior contract — personas, targeted flows, epic-embedded scenarios.** Personas are authored as the
roadmap reaches an actor that needs one; user flows are **targeted and lightweight**, built out
**incrementally as epics are authored** rather than as an exhaustive upfront set; acceptance scenarios are
**Given/When/Then text inside the epic** (no `.feature` tree). The contract is **first-class and kept
current every run** — when an epic is added or changed, the agent creates or updates the affected personas
and flows in the same pass and keeps the epic ↔ persona ↔ flow cross-links live; it never leaves them
stale against a changed epic or source. Surfacing scenarios into a brief's `acceptance_scenarios` is
planning's job; **binding** them to executable gherkin is optional and brief-driven, done downstream in
`.implementation/` only when a brief sets `acceptance_format: gherkin`.

**What and in what order — never how.** This layer decides scope, slicing, and sequencing, and specifies
the test *contract*. The mechanisms that satisfy a slice (framework, schema, endpoints, components, test
code) live in `.architecture/` and the implementation. If you catch yourself writing how-to-build detail,
that belongs to a downstream layer.

## Escalation carve-out (always ask the user, never self-resolve)

Go-to-market / release-timing commitments, regulatory- or compliance-driven sequencing, and
business-model or scope-of-offering decisions are **escalation carve-outs**. For these the agent records a
`PQ-NNN` with **no** default and leaves the affected epic blocked — it never picks a default. Routine
planning choices (epic slug wording, ordering two independent epics within a phase, which phase a clearly
foundational slice lands in) are the agent's to resolve.

## Scope boundary

This folder owns **the roadmap, the epics, the acceptance coverage ledger, the planning open-questions
ledger, and the behavior contract** (personas, targeted user flows, and the epics' Given/When/Then
acceptance scenarios), plus the agent that produces them. It does **not** own product requirements
(those live in the requirements source, e.g. `.requirements/`), architecture decisions (the architecture
source, e.g. `.architecture/`), application code, tests, or executable gherkin step definitions. It
**reads and references** the sources and **specifies the behavior and test contract**; implementers write
the code and the tests, and CI is the independent test gate the validate phase consumes.

> **Migrated legacy note.** The pre-restructuring personas (4) and flows (6) were **migrated verbatim**
> from the retired `docs/requirements/{personas,flows}/` tree into `personas/` and `flows/` here (the
> `docs/` tree is retired; `.requirements/` OQ-011 is resolved as "absorbed by `.planning/`"). These
> migrated flows are **richer, product-wide legacy flows grandfathered in** — the **targeted, lightweight,
> per-slice** convention above governs *new* flows. As epics are (re)authored, the agent reconciles and
> updates these legacy artifacts so they stay current (see `AGENT.md` — personas/flows are first-class and
> maintained every run).

## Reusability

- **Generic / portable:** this folder structure, `AGENT.md`, these README conventions, `_templates/`
  (epic, persona, flow, open-question), all ID schemes, the five-phase methodology (ingest → clarify →
  author → self-review → validate), the ROADMAP/EPIC/COVERAGE artifact shapes, the persona/flow/
  acceptance-scenario behavior-contract shapes, and the **AC-id test-tag** traceability convention.
- **Project-specific:** the `seed/` content (especially `sources.md`, which names this project's
  requirement and architecture sources), the actual epics, the roadmap phases, and the coverage rows. A
  new project keeps the structure and conventions, repoints `sources.md`, and replaces the content — or,
  with no requirement/architecture layers at all, plans ad-hoc from `seed/intake.md` alone.

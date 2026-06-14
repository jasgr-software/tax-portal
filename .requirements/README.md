# `.requirements/` — Standalone Requirements

This folder is a **self-contained, workflow-agnostic description of what the product must do and why.**
It is readable and runnable by any executor — this repo's agents, the main session, or an external
tool — and has **zero dependency on any implementation or orchestration workflow.** There are no
epics, plans, tasks, sprints, build pipelines, or gherkin gates in here. Just requirements, their
acceptance criteria, the open questions still being resolved, and the agent that authors them.

## What's here

```
.requirements/
├── README.md            # this file — lifecycle, schemas, conventions
├── AGENT.md             # the Requirements Agent — canonical role definition (source of truth)
├── OPEN-QUESTIONS.md    # ambiguity ledger (OQ-NNN), each with a proposed default
├── _templates/          # copy-to-create shapes
│   ├── requirement.md
│   └── open-question.md
├── seed/                # ingestion surface — raw product intent (read-only to the agent)
│   ├── intake.md
│   └── SRS-snapshot.md
└── REQ-<DOMAIN>-NNN.md  # one file per requirement, authored by the agent
```

## Lifecycle

```
seed/  ──►  Requirements Agent  ──►  REQ-<DOMAIN>-NNN.md   (+ OPEN-QUESTIONS.md for ambiguities)
(intent)     ingest → clarify          one file per requirement,
             → author → review         testable acceptance criteria
```

1. **Seed.** Product intent lands in `seed/` — `intake.md` (raw) and `SRS-snapshot.md` (a richer
   pre-existing source). As the product grows, **new intent is added to `seed/`**. That is the only
   ingestion surface; the agent reads it, never the other way around.
2. **Agent run.** The Requirements Agent ingests the seed, clarifies genuine ambiguities (asking you
   directly when interactive, or logging an open question with a proposed default otherwise), authors
   one requirement file per requirement, and self-reviews. See `AGENT.md`.
3. **Requirements.** Each `REQ-*.md` states a **user need** and a **proposed solution** (the *what*,
   never the *how*) plus **acceptance criteria**. Refinement state lives in front matter.
4. **Open questions.** Anything unresolved is tracked in `OPEN-QUESTIONS.md` and linked from the
   affected requirement, which stays `clarifying` until answered.

**Incremental & additive.** Re-running the agent after new seed content adds or updates only what
changed; requirements whose source did not change are left untouched. Nothing is silently dropped.

## How to run the agent

- **In Claude Code (interactive — recommended):** `/requirements [optional scope, e.g. "AUTH domain"]`.
  Runs the agent inline in the main session so it can ask you clarifying questions and pause.
- **As a subagent (batch / non-interactive):** the `.claude/agents/requirements.md` form. It cannot
  hold a live conversation, so it degrades to **ledger-only** clarification — every ambiguity becomes
  an `OQ-NNN` with a proposed default instead of a question to you.
- **Any other executor:** point it at `.requirements/AGENT.md` and have it follow that file. The role
  is fully defined there; the Claude Code command and agent are thin adapters that only point back to it.

## Artifact formats

### Requirement — `REQ-<DOMAIN>-NNN.md`

Front matter carries **refinement state only** (see `_templates/requirement.md`):

```yaml
id: REQ-AUTH-001
title: Two authenticated roles
domain: AUTH
type: feature            # feature | constraint  (constraint = NFR; may carry one normative criterion)
status: accepted         # draft → clarifying → accepted
source:                  # seed provenance — drives incremental re-ingestion
  - seed/SRS-snapshot.md#REQ-AUTH-001
open_questions: []       # OQ-NNN ids blocking this requirement (empty when accepted)
```

Body sections: **User need**, **Proposed solution**, **Acceptance criteria** (prose bullets with
`AC-<DOMAIN>-NNN-NN` ids), **Links**. `REQ-AUTH-001.md` is the worked reference example.

### Open question — `OPEN-QUESTIONS.md` entry

`OQ-NNN` with `Status` (open → resolved), `Affects` (the requirements it blocks), the `Question`, a
`Proposed default` (so work is never blocked — except carve-out items), and a `Resolution`.

## Conventions

**IDs**
- `REQ-<DOMAIN>-NNN` — requirement. Domains: `AUTH`, `DOOR`, `ONBD`, `LIFE`, `FILE`, `MSG`, `DASH`,
  `IDNT`, `NFR`. Numbers are zero-padded, unique within domain, never reused.
- `AC-<DOMAIN>-NNN-NN` — acceptance criterion, numbered within its requirement.
- `OQ-NNN` — open question, globally unique.

**Status** (`status:`) — refinement maturity only: `draft` → `clarifying` → `accepted`. A requirement
is `accepted` only when no open question blocks it.

**What, not how.** Requirements describe outcomes, not mechanisms. No tech stack, schema, API shape, or
UI mechanics appears here — that is a downstream concern.

**No implementation tracking here (by design).** There are intentionally no per-AC test pointers, no
coverage status, and no plan links. Binding acceptance criteria to automated tests and tracking
implementation status is a **separate, later layer** that will sit on top of this one.

## Scope boundary

This folder owns **requirements + acceptance criteria + the open-questions ledger**, and the agent that
produces them. It does **not** own personas, user workflows, gherkin features, architecture decisions,
or any code. Personas and user flows live in `.planning/` (`.planning/personas/`, `.planning/flows/`),
which owns the behavior contract; architecture decisions live in `.architecture/`; the `docs/` tree has
been retired. Adding the implementation-tracking layer is a future pass.

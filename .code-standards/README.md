# `.code-standards/` — Standalone Code Standards

This folder is a **self-contained, workflow-decoupled catalogue of the project's code standards** —
its dos and don'ts — each one individually keyed, provenance-linked, and carrying a **maturity rating**
that signals its enforcement weight. It is readable and runnable by any executor — this repo's agents,
the main session, or an external tool — and has **zero dependency on any implementation or
orchestration workflow.** There are no epics, plans, tasks, or build pipelines in here. Just standards,
their ratings, the open questions still being resolved, and the agent that catalogues them.

It joins `.requirements/` (the *what*), `.architecture/` (the *how*), and `.planning/` (the
*what-next-and-in-what-order*) as a standalone agent-service layer (the *do's-and-don'ts*), and mirrors
their conventions so it is immediately recognizable.

## What's here

```
.code-standards/
├── README.md            # this file — lifecycle, schemas, conventions, consumption contract
├── AGENT.md             # the Code Standards Agent — canonical role definition (source of truth)
├── OPEN-QUESTIONS.md    # standards-ambiguity ledger (SQ-NNN), each with a proposed default
├── _templates/          # copy-to-create shapes
│   ├── standard.md
│   └── open-question.md
├── seed/                # ingestion surface (read-only to the agent)
│   ├── sources.md       # the ONLY project-coupling point — where standards are harvested from
│   └── intake.md        # raw standards intent
└── standards/           # one file per standard, authored by the agent
    ├── typescript/CS-TS-NNN-<slug>.md
    ├── sql/CS-SQL-NNN-<slug>.md
    ├── cross-cutting/CS-GEN-NNN-<slug>.md
    └── infra/CS-INFRA-NNN-<slug>.md
```

## Lifecycle

```
seed/  ──►  Code Standards Agent  ──►  CS-<LANG>-NNN-<slug>.md   (+ OPEN-QUESTIONS.md for ambiguities)
(sources    ingest → clarify           one file per standard,
 + intent)  → catalogue → rate         rated on the enforcement-weight ladder
            → self-review
```

1. **Seed.** `seed/sources.md` declares the harvest sources (the codebase, the ADRs, `CLAUDE.md`);
   `seed/intake.md` carries raw intent. New intent is added to `seed/`; the agent reads it, never the
   other way around.
2. **Agent run.** The agent ingests the sources, clarifies genuine ambiguities, catalogues one standard
   per rule, rates each at its current enforcement weight, and self-reviews. See `AGENT.md`.
3. **Standards.** Each `CS-*.md` states a **Rule** (a *pointer* to its owning ADR/`CLAUDE.md` section,
   not a copy), a **Rationale**, a mandatory **Verification** evidence hook, optional **Examples**, and a
   `rating`.
4. **Open questions.** Anything unresolved is tracked in `OPEN-QUESTIONS.md` (`SQ-NNN`) and linked from
   the affected standard.

**Incremental & additive.** Re-running the agent adds or updates only what changed; standards whose
source did not change are left untouched. Nothing is silently dropped or renumbered.

## How to run the agent

- **In Claude Code (interactive — recommended):** `/code-standards [optional scope, e.g. "SQL bucket"]`.
  Runs inline in the main session so it can ask you clarifying questions.
- **As a subagent (batch / non-interactive):** the `.claude/agents/code-standards.md` form. It cannot
  hold a conversation, so it degrades to **ledger-only** clarification — every ambiguity becomes an
  `SQ-NNN` with a proposed default.
- **Any other executor:** point it at `.code-standards/AGENT.md`. The role is fully defined there; the
  Claude Code command and agent are thin adapters that only point back to it.

**How to run the audit (review mode — see `AGENT.md` § 6. Audit):**

- **In Claude Code (interactive):** `/code-standards-review <PR#>` — runs only the Audit phase against the
  PR's diff and posts/returns the `pr-standards-verdict/v1` block.
- **As a subagent (batch / the orchestrated path):** the `.claude/agents/code-standards-review.md` form,
  invoked by the Conductor between Implement and Review (it supplies the diff). The subagent is scoped to
  write **only** under `.code-standards/`.

## Artifact formats

### Standard — `CS-<LANG>-NNN-<slug>.md`

Front matter (see `_templates/standard.md`):

```yaml
id: CS-TS-001
title: Request-scoped DB access only through the packages/db wrapper
language: typescript
polarity: do
rating: required          # experimental | recommended | required | deprecated  (= enforcement weight)
status: active            # active | superseded
verification: <how a reviewer confirms compliance — the evidence hook>
source:
  - ADR-003#2
related: [CS-TS-002, ADR-005]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — enforced by ESLint + RLS tests in CI" }
open_questions: []
```

Body sections: **Rule**, **Rationale**, **Verification** (mandatory), **Examples** (optional), **Links**.

### Open question — `OPEN-QUESTIONS.md` entry

`SQ-NNN` with `Status` (open → resolved), `Affects` (the standards it blocks), the `Question`, a
`Proposed default`, and a `Resolution`.

## Conventions

**IDs**
- `CS-<LANG>-NNN` — standard. `LANG` ∈ `TS`, `SQL`, `GEN`, `INFRA`. Numbers are zero-padded, **flat
  within the bucket**, unique within the bucket, never reused.
- `SQ-NNN` — standards open question, globally unique.

**Language buckets**

| LANG | Scope | Dir |
|------|-------|-----|
| `TS` | TypeScript/TSX — `apps/portal`, `apps/admin`, `packages/` | `typescript/` |
| `SQL` | Raw SQL — `db/migrations`, `db/policies`, predicates, temporal | `sql/` |
| `GEN` | Cross-cutting / language-agnostic — naming, commits, secrets, structure | `cross-cutting/` |
| `INFRA` | Dockerfiles, compose, GitHub workflows, shell scripts | `infra/` |

Tie-break: bucket by **where the violation shows up** (see `AGENT.md` § ID conventions).

**Rating ladder** — enforcement weight: `required` (must) → `recommended` (should) → `experimental`
(advisory), plus terminal `deprecated`. Standards are **born at their true rating**, not seeded low. The
**promote/demote process is defined** (see `AGENT.md` § Promote/demote criteria): the signal comes from
consumption, a machine run may only *propose* a move (`by: agent`), and a human *ratifies* it (`by: user`,
flipping the live `rating`). Most harvested standards are born at their terminal rating and never move.

**Pointer, not copy.** A standard's `Rule` cites the authority that owns it (`source:`) and states it in
one sentence; the binding text stays in the ADR/`CLAUDE.md`. Full rule text is authored here only for
conventions with no upstream home. This keeps the catalogue thin and rot-resistant.

**No consumption tracking here (by design).** There are intentionally no per-standard violation logs,
coverage status, or consumer-wiring fields *in the standard files*. The consumption signal lives in the
consumer (the brief that cites the key, the code that tags it, the SDET / review audit that checks it) — not
here. The catalogue stays a thin index of standards + their ratings.

## Consumption contract (wired)

This section is **how the keys are cited as evidence** across the delivery pipeline. The consumers below now
read the catalogue; the `.pr-review/` boundary at the end is the one place that deliberately does not.

- **The catalogue is an index over existing authority, not a replacement for it.** A `CS-*` key is the
  citable, rateable handle; the binding rule still lives in its `source:` ADR / `CLAUDE.md` section,
  which the `source:` resolves to.
- **Each standard's `verification` field is the evidence hook** — the concrete thing a reviewer checks.
- **Build briefs carry the applicable keys.** A brief's `code_standards:` lists the `CS-*` the slice must
  honor (selected by the buckets it touches + GEN); the implementation orchestrator threads each onto the
  tasks that touch its bucket, so implementation agents follow the established conventions.
- **Code and tests cite `CS-<LANG>-NNN` in comments**, exactly as they cite `ADR-NNN` today
  (e.g. `// CS-TS-001: request-scoped query via the packages/db wrapper`) — CS-GEN-003. The tag is the
  greppable evidence the standard was honored.
- **The SDET checks each cited key's `verification` hook** at review: a `required` standard that fails its
  check or is missing its tag is a rejection; `recommended`/`experimental` are advisory. The `rating` rung is
  the enforcement weight (`required` = must, `recommended` = should, `experimental` = advisory).
- **The Audit (review mode) audits an opened PR** against the catalogue before the PR-review panel runs: it
  emits a `pr-standards-verdict/v1` (violations by weight + violated keys), may draft newly-discovered
  conventions as `experimental` standards, and routes a `required` violation to the fixer. An invoker
  supplies the diff (see § How to run the audit); the audit itself stays workflow-decoupled.
- **Boundary — the `.pr-review/` lenses do NOT read this layer.** The three reviewer lenses are
  deliberately project-agnostic (they review on general engineering merit and read no project docs), so a
  standard that lives only here is invisible to them. Consumption is via the **project-aware** path:
  SDET / Overwatch / build briefs / code comments. A `CS-*` key is not enforced by the PR-review panel.

## Scope boundary

This folder owns **code standards + their ratings + the open-questions ledger**, and the agent that
produces them. It does **not** own requirements (`.requirements/`), architecture decisions
(`.architecture/`), the roadmap (`.planning/`), or any code. It **describes** standards harvested from
those sources; it never edits them. Consumers cite the keys (briefs, code comments, the SDET, the review
audit); the catalogue describes standards and rates them — it does not own the consumers.

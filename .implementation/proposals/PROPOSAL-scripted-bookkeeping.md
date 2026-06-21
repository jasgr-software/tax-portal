# Proposal: Move mechanical bookkeeping from agents to a task-state CLI

**Status:** Draft (for review)
**Scope:** `.implementation/**` (engine, phases, agent docs), `scripts/`, `package.json`
**Author:** main session
**Date:** 2026-06-21

---

## 1. Problem

The implementation engine currently splits task-state work across three layers, but
**only two of them are codified**:

| Concern | How it's done today | Codified? |
| --- | --- | --- |
| **Observe** edits (capture metrics) | `.claude/hooks/log-task-edit.py` → `.claude/metrics/` | ✅ scripted |
| **Validate** state (gate backstop) | `scripts/validate-gates.sh` (9 checks) | ✅ scripted |
| **Mutate** state (write the fields) | Agents hand-edit markdown | ❌ free-typed by LLM |

Every status transition, timestamp, complexity field, Work Log breadcrumb, PROGRESS.md
session-sweep, and `tasks/ → tasks/done/` move is performed by an LLM agent emitting an
exact-match `Edit` against markdown. The format is rigidly specified — and then *separately
re-validated* by `validate-gates.sh` — which is the tell that it's mechanical enough to script.

This is the answer to the originating question ("do agents do bookkeeping a script should
do?"): **yes**, and the engine already proves it by validating that bookkeeping with a script
after the fact. We're paying twice — once for the agent to type it, once for the script to
check the typing — and absorbing the error surface in between.

### Cost of the status quo

- **Error surface:** ISO-8601 timestamp typos, field-name drift (`Introduces-gate:` vs
  `Introduces-gate`), missed atomicity ("all N edits in one Edit call"), malformed
  deferred-gate annotations. `validate-gates.sh` exists *because* these happen — see
  `BUG-000-001`, `BUG-000-002`, `BUG-000-003` in `tasks/done/`, all of which are the validator
  itself miscalibrated against hand-typed evidence.
- **Token/latency spend:** an Opus/Sonnet turn to move a file or stamp `date -u`.
- **Instruction bloat:** ENGINE.md § Dispatch Checkpoint, § Task Metadata Contract, and the
  per-agent Workflow sections spend significant prose specifying exact edit choreography that
  a CLI signature would encode once.
- **Audit fidelity:** hand-edits produce *near*-uniform breadcrumbs; a CLI produces *exactly*
  uniform ones, which makes `validate-gates.sh` checks 5–7 (Work Log / e2e / CI evidence)
  simpler and stricter.

### Non-goals

- We are **not** removing agent judgment. Complexity ratings, RETRO classification, handoff
  prose, and AC-adequacy decisions stay with agents.
- We are **not** removing `validate-gates.sh`. It stays as defense-in-depth — a CLI that
  writes correctly *and* a validator that rejects malformed state are complementary.
- We are **not** auto-merging or auto-transitioning phases. Mutations are agent-invoked; the
  CLI just makes each invocation deterministic.

---

## 2. Design principle

> Agents **decide**; scripts **record**. Any state write whose content is fully determined by
> (a) the current file, (b) the clock, and (c) a small set of agent-supplied judgment values
> should be a CLI call, not a hand-authored `Edit`.

The agent still supplies the judgment inputs (`--complexity-estimate 3`, the Work Log prose,
the classification bucket). The CLI owns format, field names, timestamps, atomicity, ordering,
and idempotency.

---

## 3. Proposed CLI: `scripts/task.ts` (invoked as `pnpm task <cmd>`)

A single TypeScript entrypoint (run via `tsx`, matching `db-migrate.ts`/`db-seed.ts`
convention) with subcommands. Every subcommand is **idempotent** and **atomic** (write to temp,
rename), exits non-zero with a clear message on contract violation, and emits the same
breadcrumb format `validate-gates.sh` already greps for.

### 3.1 Commands

| Command | Replaces (today's hand-edit) | Agent-supplied judgment | CLI owns |
| --- | --- | --- | --- |
| `task start <ID> --complexity-estimate N [--note "..."]` | Developer Workflow step 1: flip `in-progress`, stamp `Started-at`, set `Complexity-estimate`, `Updated-by`, append "Starting implementation" breadcrumb | estimate, optional scope note | status transition legality, UTC timestamp, atomic multi-field write, breadcrumb format |
| `task review <ID> --complexity-actual N [--note "..."]` | Developer Workflow step 8: flip `review`, set `Complexity-actual`, breadcrumb | actual rating, note | same |
| `task log <ID> --role <tag> --did "..." --next "..." [--blockers "..."]` | Any Work Log breadcrumb | the three prose fields | `YYYY-MM-DD [role]` prefix, section layout |
| `task done <ID> [--note "..."]` | SDET Review step 6: tick SDET box, flip `done`, stamp `Completed-at`, breadcrumb | optional note | timestamp, transition legality (rejects if `Complexity-actual` empty — same rule as ENGINE § Task Metadata Contract) |
| `task reject <ID> --bug <BUG-ID> [--note "..."]` | SDET reject path | bug id, note | back-transition, BUG reference wiring |
| `task archive [--brief NNN \| --all-done]` | IO Close-prep: `mv tasks/TASK-*.md tasks/done/` for `Status: done` | which brief | move only `Status: done` files, leave open ones |
| `task verify [--brief NNN]` | thin wrapper over the relevant `validate-gates.sh` checks, scoped to one brief | — | pre-close gate check (fail fast before the IO declares close) |

### 3.2 Commands with a heavier lift (phase 2 — see §5)

| Command | Replaces | Notes |
| --- | --- | --- |
| `task phase-transition --to <phase> [--note ...]` | PHASES.md § Phase-transition reflex | **Replaced, not ported** (see §9): updates `phase` in `.implementation/state.json` and appends a structured event to `events.jsonl`. No prose sweep — there is no prose blob to move. |
| `task merge-checkpoint --pr <N> [--sha <sha>]` | IO Close-finalize: record PR URL + squash SHA + the awaiting-merge entry | Reads `gh pr view` / `git log` for URL+SHA so the agent doesn't transcribe them; writes the structured awaiting-merge record in `state.json`. Gate scorecard verdicts stay agent-supplied (they're judgments). |
| `task trace --brief NNN` | SDET/IO AC↔test ledger | Greps test files for `@AC-*` tags, tallies tiers into a structured map. Agent still writes the adequacy verdict. |
| `task report [--md]` | the human-readable PROGRESS.md view | Renders `state.json` + `events.jsonl` (+ task front matter) into a narrative on demand. Generated, never committed, never a source of truth (see §9). |
| `task post-merge --pr <N> [--bug <desc>]` | IO Close-finalize triage | On post-merge gate result: pass → clear the awaiting-merge record from `state.json`; fail → create `BUG-BBB-POST-NNN` (front matter scaffolded) and keep the record. The pass/fail verdict is agent-supplied; the file/record mechanics are the CLI's. |

### 3.3 Example: before / after

**Before** (developer, today) — a hand-authored multi-field Edit the agent must get exactly
right, then prose:

```
Edit TASK-009-002.md:
  **Status**: in-progress
  **Started-at**: 2026-06-21T14:03:00Z      ← agent types the clock
  **Complexity-estimate**: 3
  **Updated-by**: webapp-developer
  ...append Work Log breadcrumb in the exact YYYY-MM-DD [role] | What's next | Blockers form...
```

**After:**

```bash
pnpm task start TASK-009-002 --complexity-estimate 3 \
  --note "onboarding read model + server-side gate (portal)"
```

The CLI flips status, stamps the real UTC clock, sets `updated_by` from the required `--role`
(§10 Q3), appends the canonically-formatted breadcrumb, and refuses if `TASK-009-002` isn't
currently `backlog`/`in-progress` (catches double-starts).

### 3.4 Coverage of the originally-identified bookkeeping

This proposal began from an audit of 11 bookkeeping activities agents perform by hand. The map
below confirms each is either scripted here or deliberately left to agent judgment — nothing was
dropped on the way to the data-model changes:

| # | Bookkeeping activity | Home in this proposal | Scripted? |
| --- | --- | --- | --- |
| 1 | Task status + metadata field writes | `task start` / `review` / `done` | ✅ |
| 2 | Work Log breadcrumbs | `task log` | ✅ |
| 3 | Phase-transition / ledger sweep | `task phase-transition` + structured state (§9) | ✅ replaced |
| 4 | Task archival `tasks/ → tasks/done/` | `task archive` | ✅ |
| 5 | Completion/handoff report | `task report` renders state; **narrative prose stays agent** (§6) | ◑ partial by design |
| 6 | RETRO finding classification | **agent judgment** (§6) | — correctly not |
| 7 | PR/merge checkpoint recording | `task merge-checkpoint` | ✅ |
| 8 | Task metadata validation | `task verify` + front-matter schema | ✅ strengthened |
| 9 | AC ↔ test traceability ledger | `task trace` | ✅ |
| 10 | Post-merge bug triage | `task post-merge` | ✅ |
| 11 | Metrics aggregation | already scripted (`metrics-report.py`) | ✅ pre-existing |

**Reading of the map:** 8 of 11 fully scripted, 1 pre-existing, 1 partial-by-design (handoff
*narrative* is judgment; its structured inputs are rendered), 1 correctly left to agents (RETRO
classification). The front-matter + structured-state changes (Phase 0, §9) are not a detour from
scriptability — they are what makes items 1–4, 7–10 robustly scriptable instead of regex-scraped.

---

## 4. Why this is safe with the existing architecture

- **Observability is preserved — and gains free provenance.** `.claude/hooks/log-task-edit.py`
  fires on Claude's `Edit`/`Write` *tools*, so a raw hand-edit is still captured. A CLI write is
  an `fs.writeFile` from a `tsx` subprocess and does **not** trigger that hook, so the CLI
  **self-reports** its write to `.claude/metrics/` in the same record shape. The upshot
  (see §10 Q2): the two write paths are distinguishable in the metrics stream *by construction* —
  raw via the hook, CLI via self-report — giving a CLI-vs-raw adoption ratio without any
  in-file provenance mark.
- **`validate-gates.sh` becomes a backstop, not the primary guarantee.** Today it's the only
  thing standing between a typo and a bad merge. After this, the CLI prevents the typo and the
  validator catches the (now rare) hand-edit that bypassed the CLI. Belt and suspenders.
- **Hand-edits remain possible.** Nothing forbids an agent from editing markdown directly for
  the genuinely bespoke case. The CLI is the paved road, not a wall.

---

## 5. Rollout (incremental, low-risk)

**Phase 0 — migrate task/bug metadata to YAML front matter (prerequisite, scripted):**

Today the lifecycle fields are **inline markdown bold** (`**Status**: done`, `**Started-at**:
…`), which forces every consumer into fragile string-matching — `validate-gates.sh` runs 9
bespoke grep regexes, `.claude/hooks/log-task-edit.py` greps, and a CLI would have to do regex
surgery to rewrite them. This is also where hand-typing fails silently: e.g.
`TASK-006-002` ships with `Completed-at` (20:06:28Z) *before* `Started-at` (20:15:00Z) — a clock
inversion sitting in a `done` file right now.

Move the machine-managed scalar/list fields into real YAML front matter; keep all human prose
(Work Log, SDET review, Quality Gates, focus areas) in the markdown body:

```yaml
---
brief: BRIEF-006
status: done
started_at: 2026-06-18T20:15:00Z
completed_at: 2026-06-18T20:16:28Z
complexity_estimate: 3
complexity_actual: 3
acceptance_criteria: [AC-DASH-012-01, AC-DASH-012-02]
introduces_gate: no
e2e_required: no
---

# TASK-006-002: …
## Quality Gates …
## Work Log …
```

This structurally encodes the §6 judgment line (front matter = CLI-managed; body = agent
prose), turns read/write into `parse → mutate → serialize` in any language (no regex surgery),
and collapses validation from 9 grep checks to "parse block → validate against schema" — a
schema that can enforce `completed_at >= started_at` and catch the inversion above.

Steps:
0a. Write a one-shot migration (`scripts/migrate-task-frontmatter.ts`) that parses the existing
    bold-field blocks and emits front matter; run it over `tasks/` + `tasks/done/` + `_templates/`.
0b. Update `validate-gates.sh` field checks (1, 5–7) to parse front matter (via `yq` or by
    delegating those checks to the TS CLI's `verify`), and `log-task-edit.py` to read it.
0c. Update ENGINE.md § Task Metadata Contract, PHASES.md, and agent-doc prose to reference the
    front-matter keys instead of the `**Field**:` shape.

**Cost & caveat:** one-time breaking change to the on-disk format across dozens of files; done
as a scripted, reversible migration. GitHub renders bare front matter in a normal repo `.md` as
a horizontal rule + `key: value` text (not hidden — only Jekyll/wiki contexts prettify it), so
the top of each file is slightly less pretty in the GitHub UI; the human-read body is unaffected.

**Phase 1 — simple field/file mutations (the 80%):**
1. Add `scripts/task.ts` with `start`, `review`, `done`, `reject`, `log`, `archive`, `verify`.
2. Add `"task": "tsx scripts/task.ts"` to `package.json` scripts.
3. Unit-test against `scripts/__test_fixtures__/` (the fixture harness `validate-gates.sh`
   already uses) — assert idempotency, transition-legality rejections, timestamp format.
4. Update agent docs to call the CLI: `developer.md` Workflow steps 1 & 8, `sdet.md` Review
   step 6, ENGINE.md § Dispatch Checkpoint, PHASES.md § Close-prep. Keep the *contract* prose
   (what the fields mean) but replace the *choreography* prose with the CLI call.
5. Run a full slice through the new path; confirm `validate-gates.sh` still passes and
   `.claude/metrics/` still populates.

**Phase 2 — replace the prose ledger with structured state (see §9):**
6. Introduce `.implementation/state.json` (orchestration hot-state) + `.implementation/events.jsonl`
   (append-only history); migrate the four `## ` PROGRESS.md sections into `state.json`.
7. Add `phase-transition`, `merge-checkpoint`, `trace`, and `report`. Rewrite `validate-gates.sh`
   checks 3/8/9 (PROGRESS structure, awaiting-merge gate verdicts) to validate `state.json`'s
   schema instead of grepping markdown. Remove the PHASES.md phase-transition reflex and the
   ENGINE.md bounded-ledger rule (both obsolete — nothing accumulates to bound).
8. `state.json` writes go behind a `--dry-run` that prints the JSON diff for confirmation.

**Reversibility:** each phase is independently revertable. Phase 0/1 leave the safety net intact;
Phase 2 is the one breaking change to the orchestration-state shape and is gated behind its own
fixture coverage. If `task.ts` misbehaves, agents fall back to hand-edits and the schema check
still catches malformed state.

---

## 6. What explicitly stays with agents (the judgment line)

- Complexity **ratings** (the numbers) — honest estimation is the whole point of the metric.
- RETRO **finding classification** (`gated-path-fix` / `ungated-fix` / `acknowledged`).
- Handoff/completion **prose** ("what shipped", risk notes).
- AC-coverage **adequacy** verdicts (the CLI builds the table; the agent signs it off).
- Gate **scorecard verdicts** (PASS/FAIL is a judgment from evidence, not a transcription).

The CLI never decides any of these — it only records the agent's decision in canonical form.

---

## 7. Estimated impact

- **Removes** ~the bulk of edit-choreography prose from 4 docs (ENGINE, PHASES, developer,
  sdet), replacing it with CLI signatures.
- **Eliminates** the class of bugs that produced `BUG-000-001/002/003` (format-mismatch
  between hand-typed evidence and the validator).
- **Cuts** an LLM turn per status transition down to a deterministic CLI call.
- **Keeps** every existing safety net (metrics hook, gate validator) intact and arguably
  strengthens them (uniform input).

---

## 8. Context-management dimension

The §3 commands cover the **write** side of bookkeeping. The larger, often-overlooked win is
the **read** side: today agents pull whole markdown files into context to extract a handful of
facts, and the engine already treats context as a scarce, managed resource. A scripted task
layer is the natural place to make those reads **bounded and structured** instead of
whole-file.

### 8.1 What the engine already does (and where it's reactive)

| Existing mechanism | Where | Nature |
| --- | --- | --- |
| `/compact` request at Plan start | `ENGINE.md` § Phase 0 (lines 121–122) | **Reactive** — user-driven, fires after context is already heavy |
| Bounded-ledger rule (NORTH-STAR #7) | `ENGINE.md` (lines 328–335) | **Discipline** — relies on the IO to sweep prose to `PROGRESS-ARCHIVE.md` each transition. **§9 *fulfills* #7's cold-derivable contract** and retires this manual workaround (structured state can't accumulate prose). |
| `Impl: io` to "preserve context" | `PHASES.md` (line 15) | **Heuristic** — IO absorbs small tasks rather than spawning |
| Spawn-prompt context delivery | `PHASES.md` (line 4) | **Manual** — IO hand-packs each subagent's context from large source files |

The pattern: context management is a *first-class goal* but is currently enforced by agent
discipline (remember to sweep, remember to compact, remember to pack tightly). The CLI can
convert several of these from "remember to" into "mechanically so."

### 8.2 Add the read/query side to the CLI

Bounded **projections** so agents stop reading whole files:

| Command | Returns | Replaces (today's context cost) |
| --- | --- | --- |
| `task show <ID> [--fields status,complexity-actual,...]` | just the metadata block | reading the entire task file to check one field |
| `task list --brief NNN [--status review]` | a compact table of IDs + status | opening every task file to find what's in `review` |
| `task next [--brief NNN]` | the next actionable task id + one-line scope | scanning the tasks dir |
| `task summary --brief NNN` | computed rollup (counts by status, open gates, missing-metadata flags) | IO re-reading every task at phase boundaries to recompute state |
| `task progress` | the `## Current initiative` hot-state **only** | reading PROGRESS.md including the session-entry tail |
| `task brief-context <ID>` | the exact bounded bundle a subagent needs (task spec + cited ACs + cited `CS-*`) | IO copy-pasting from large source files into the spawn prompt |

`task brief-context` is the highest-leverage item: it makes the IO's spawn-prompt packing a
**deterministic projection** rather than a manual gather, which shrinks both the IO's working
context *and* what each subagent receives — directly reinforcing `PHASES.md:4`.

### 8.3 The bounded-ledger *workaround* is retired by fulfilling #7 (see §9, §11)

The original draft proposed a `ledger-check` budget gate to police PROGRESS.md hot-state size.
The §9 decision to make state **structured** is the better move — it doesn't *remove*
NORTH-STAR conclusion #7, it **satisfies it**:

- A fixed-shape, cold-derivable `state.json` object **cannot accumulate prose** — it *is* the
  "durable, bounded, cold-derivable contract" #7 calls for. So the **manual bounded-ledger
  house-rule** (a workaround for prose accretion) and the proposed `ledger-check` both become
  unnecessary — #7 is met structurally, not policed by discipline (this is also what dissolves Q6).
- History lives in append-only `events.jsonl` + git, queried by slice — never loaded whole — so
  the `PROGRESS-ARCHIVE.md` "thin index" sweep disappears too.
- `task history --slice <X>` resolves a slice to its durable artifacts (PR/sha/`HANDOFF-NNN`)
  from `events.jsonl`, not by reading an archive.

### 8.4 Net effect on context

- **Reads shrink from whole-file to field-level.** A status check costs a CLI line, not a
  full task file in the window.
- **Spawn prompts get smaller and more uniform** (`task brief-context`), reducing context for
  both IO and every subagent it dispatches.
- **The prose ledger stops being a context leak — by removing it**, not by policing its size.
  Structured state is read in bounded projections; the narrative is rendered on demand (`task
  report`) only when a human asks.
- **`/compact` stays as the backstop**, but should fire far less often because the steady-state
  read footprint is lower by construction.

This dovetails with the write-side plan: the same `scripts/task.ts` owns the canonical *write*
format, the bounded *read* projections, and the structured state store — one source of truth.
Recommend adding the read commands in **Phase 1** alongside the writes (read-only, low-risk),
and the state store + `phase-transition`/`report` in **Phase 2**.

---

## 9. Agent-first state model (replaces the human-readable ledger)

**Decision:** the source of truth for orchestration state is **structured data optimized for
agents**, not a hand-curated human-readable narrative. A human view is *generated on demand* from
that data; it is never the source of truth and is never hand-edited. This dissolves Q4 (there is
no prose sweep to automate) and Q6 (a fixed-shape state object can't bloat, so there is no
hot-state budget to police).

### 9.1 One fact, one home

The markdown ledger's failure mode was duplication that drifted. The model is strict about where
each fact lives:

| State | Lives in | Form |
| --- | --- | --- |
| Per-task lifecycle (status, timestamps, complexity, ACs) | task/bug **front matter** (Phase 0) | source of truth; not duplicated anywhere |
| Active bugs | derived from **bug-file front matter** | a *query*, not a stored list |
| Orchestration hot-state (current brief/phase/slice; awaiting-PR-merge records w/ PR·sha·gate verdicts; open retro action items) | `.implementation/state.json` | the only genuinely orchestration-level facts |
| History (phase/slice/merge events) | append-only `.implementation/events.jsonl` | bounded-by-nature, queryable; **git log is the authoritative deep history** |
| Human narrative view | generated via `pnpm task report [--md]` | ephemeral; never committed, never a source of truth |

### 9.2 What this removes

- **PROGRESS.md** as a curated narrative ledger → replaced by `state.json` + on-demand `report`.
- **PROGRESS-ARCHIVE.md** + the phase-transition prose sweep → replaced by `events.jsonl`.
- The **manual bounded-ledger house-rule** (NORTH-STAR #7's workaround) and any `ledger-check`
  budget → retired; #7's cold-derivable contract is instead *fulfilled* structurally (§8.3, §11).
- The IO's prose-curation beat → replaced by inspecting a **structured state diff** at each
  transition (more reliable oversight than re-reading prose, not less).

### 9.3 What this preserves

- **Rationale capture.** Prose entries sometimes recorded *why* (e.g. "deferred X because Y").
  That becomes a `note`/`rationale` **field** on the relevant structured record (a task deferral,
  an awaiting-merge entry, a retro item) — facts *and* reasoning, both structured, neither as a
  free-floating blob.
- **Oversight.** The IO/user still reviews state at each transition — via `task summary` / the
  `state.json` diff (and `task report` when a human wants the narrative).
- **Cross-session resumability.** A resuming agent reads `state.json` (current) + recent
  `events.jsonl` instead of parsing a prose tail.

### 9.4 Cost

Phase 2 is the one breaking change to the orchestration-state shape: it rewrites `validate-gates.sh`
checks 3/8/9 to validate `state.json`'s schema and removes the ENGINE.md bounded-ledger rule and
the PHASES.md phase-transition reflex. Scoped to `.implementation/**` + `scripts/` + the
`.claude/` hook — all main-session-owned. Gated behind its own fixture coverage and `--dry-run`.

---

## 10. Open questions for the reviewer

1. **`task.ts` vs `task.sh`? — RESOLVED: TypeScript, on YAML front matter (see Phase 0).**
   The deciding factor moved from language to *format*: migrating lifecycle fields to YAML front
   matter (Phase 0) makes read/write a structured parse/serialize in any language, so the choice
   rests on vitest-testability and `--json` for the read commands (§8.2) — both favor TS. TS also
   matches `db-migrate`/`db-seed`/`demo-stage` mutation tooling. (`validate-gates.sh` stays bash
   but gains a `yq`/CLI-delegated field check.)
2. **Enforce CLI use / add a provenance signature? — RESOLVED: enforce *format* only; no
   in-file provenance.** `validate-gates.sh` (post-Phase-0, a schema check) validates that the
   front-matter block is well-formed — legal status enum, `complexity_actual ∈ 1..5`,
   `completed_at >= started_at` — and a well-formed hand-edit passes. The CLI wins by being
   easier than getting the schema right by hand, not by mandate; requiring a CLI signature in the
   file would recreate the brittle string-coupling behind the `BUG-000-001/002/003` class.
   **Adoption is still measurable for free** (§4): raw edits are captured by the Edit/Write hook,
   CLI writes self-report to `.claude/metrics/`, so the CLI-vs-raw ratio is observable without
   polluting the file. Revisit a hard CLI-mandate only if that ratio stays high after a slice or
   two — "format-only" is the default philosophy, not a temporary stance.
3. **`--role` source? — RESOLVED: required flag, validated against the roster; no env fallback,
   no inference.** Each agent knows its own role, so `--role` is free and makes the metrics
   record + Work Log breadcrumb self-documenting. Env fallback is unreliable (shell state doesn't
   persist between Bash calls per CLAUDE.md, so it'd have to be re-exported every call).
   Inferring from the task's `assigned_to` is wrong in the cases that matter — the SDET writes the
   `done` transition on a developer's task, the IO writes `Impl: io` tasks — and per-command
   defaults break on the "or IO" path. The CLI rejects any value outside the known set
   (`webapp-developer`, `devops`, `sdet`, `overwatch`, `io`) so a typo fails loudly instead of
   drifting the tag.
4. **PROGRESS.md sweep automation? — RESOLVED (dissolved): no human-readable ledger as source of
   truth.** Per §9, orchestration state becomes structured (`state.json` + `events.jsonl`),
   optimized for agents; the human narrative is generated on demand (`task report`). There is no
   prose sweep to automate. Oversight moves to the structured state diff at each transition.
5. **Output format for read commands (§8.2)? — RESOLVED: default compact text/tables (token-
   cheap, readable by agent *and* human); `--json` opt-in for programmatic callers.** The
   agent-first lens (§9) does *not* argue for default JSON: JSON's structural overhead (braces,
   quotes, repeated keys) costs more context tokens than a compact table carrying the same facts,
   and agents parse tables fine — so the token-optimal default *is* compact text, which happens to
   be human-readable too. `--json` is for callers that will *parse* the output (e.g. the IO
   assembling a spawn prompt). Exception: `task brief-context` defaults to the **paste-ready
   markdown bundle** (its consumer almost always pastes it into a spawn prompt), with `--json`
   available. So: compact-text default everywhere, `--json` opt-in, `brief-context` paste-ready.
6. **`ledger-check` budget? — RESOLVED (dissolved):** §9's structured state has fixed shape and
   cannot accumulate prose, so there is no hot-state budget to police and no `ledger-check` gate.
   `/compact` remains the backstop; steady-state read footprint is low by construction.

---

## 11. Relationship to the NORTH-STAR program

This proposal is the **implementation-layer instance of the same thesis** that
`.orchestration/design/NORTH-STAR.md` pursues for the Conductor: *script-vs-agent and
contract-erosion are one problem; scripting is the erosion detector* (NORTH-STAR conclusion #1).
NORTH-STAR makes the **orchestration** layer deterministic; this makes the **implementation**
layer's bookkeeping deterministic. The conclusions transfer directly:

| NORTH-STAR conclusion | How this proposal honors it |
| --- | --- |
| **#1** scripting reveals loose contracts | front-matter schema + `verify` surface drift instead of papering over typos (the `BUG-000-00x` class) |
| **#2** intelligence in the nodes, dumb composition | §6 judgment line — agents decide, scripts record |
| **#3** re-derive from primary sources, never from ledger verdicts | §9 one-fact-one-home; "active bugs" is a query; git is authoritative history |
| **#5/#6** data-driven promotion; never script an unexercised branch | rollout scripts only the **exercised** mechanical paths; judgment + unexercised branches stay agent-owned, codified later as they prove stable |
| **#7** durable, **bounded, cold-derivable** contract per seam | §9 `state.json`/`events.jsonl` **fulfills** #7 structurally (correcting an earlier draft that said it *removed* #7) |

**It does not literally fold into the NORTH-STAR doc — by NORTH-STAR's own rule.** Line 40 there
keeps the implementation engine a *swappable backend behind the build-brief contract*: the
sequencer must not couple to `.implementation` internals. So this is a **sibling effort**, not a
sub-item of the orchestration migration. The decoupling is preserved because `.implementation`
scripts **its own** internals here; orchestration still treats it as a black box.

**Precedent to mirror, not reinvent.** NORTH-STAR's Increment-3 Phase-2 already shipped the
analogous "bookkeeping derivers" one layer up — `orchestrate-state.sh` (derive `pr`/`merge_sha`/
AC-count/review-counts from primary sources) and `id-alloc.sh` (cross-layer next-free-id). The
`task.ts` CLI should follow their conventions (derive-from-source, one scripted command per
mechanical step, structured verdicts) so the two layers share idioms.

**Tracking.** Registered in NORTH-STAR.md § Migration path → *Cross-layer extension —
implementation-engine bookkeeping (designated next)*, status **design complete; build pending**.

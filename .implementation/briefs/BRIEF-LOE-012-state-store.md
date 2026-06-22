---
id: BRIEF-LOE-012
title: Phase 2 — structured state store (state.json + events.jsonl) + the five heavier task.ts commands
status: ready
acceptance_criteria:
  - id: AC-LOE-012-01
    text: "`.implementation/state.json` (orchestration hot-state) and `.implementation/events.jsonl` (append-only history) exist with a documented schema. A one-shot migration lifts all four current PROGRESS.md sections (`## Current initiative`, `## Awaiting PR merge`, `## Active bugs`, `## Open retro action items`) into the store with NO fact lost — proven by round-trip: `task report --md` over the migrated store reproduces every fact the pre-migration PROGRESS.md carried. `state.json` and `events.jsonl` are committed; the rendered report is not. Per the §9 one-fact-one-home rule, `## Active bugs` becomes a QUERY over bug-file front matter, not a stored list."
  - id: AC-LOE-012-02
    text: "`task phase-transition --to <phase> --role <r> [--note]` sets `phase` in `state.json` AND appends a structured event to `events.jsonl` atomically (temp + rename); rejects an unknown/illegal phase non-zero; `--dry-run` prints the JSON diff and writes nothing. Replaces the PHASES.md § Phase-transition reflex — there is no prose sweep, because there is no prose blob to move."
  - id: AC-LOE-012-03
    text: "`task merge-checkpoint --pr <N> --role <r> [--sha]` DERIVES the PR URL + squash SHA from `gh pr view` / `git log` (the agent never transcribes them) and writes the structured awaiting-merge record (PR · sha · gate-verdict slots) to `state.json`. The gate scorecard PASS/FAIL verdicts remain AGENT-SUPPLIED inputs (judgments), recorded verbatim — never computed by the CLI."
  - id: AC-LOE-012-04
    text: "`task post-merge --pr <N> --role <r> [--bug <desc>]` applies the agent-supplied post-merge verdict: pass → clears the awaiting-merge record from `state.json`; fail → scaffolds a `BUG-BBB-POST-NNN` task file (front matter via `task-frontmatter.ts`) AND keeps the record. The pass/fail verdict and bug description are agent inputs; only the file/record mechanics are the CLI's."
  - id: AC-LOE-012-05
    text: "`task trace --brief NNN` greps the test tree for `@AC-*` tags and tallies them into a structured per-AC tier map (unit/integration/e2e/tier-3). The CLI builds the table; the AC-adequacy verdict stays agent-supplied (the agent signs off; the CLI never decides coverage is sufficient)."
  - id: AC-LOE-012-06
    text: "`task report [--md]` renders `state.json` + `events.jsonl` (+ task front matter) into a human-readable narrative ON DEMAND. The output is never committed and is never read back as a source of truth (proposal §9 — generated view, not ledger). Default compact text; `--md` for the GitHub-readable form."
  - id: AC-LOE-012-07
    text: "`scripts/validate-gates.sh` checks 3 (`check_progress_md_structure`) and 9 (`check_pr_awaiting_merge_gate_verdicts`) are re-pointed from grepping PROGRESS.md markdown to validating the `state.json` SCHEMA (legal phase enum; well-formed awaiting-merge records carrying their gate-verdict slots; record-level invariants e.g. no clock inversion). A malformed `state.json` fails loudly. **Check 8 (`check_pr_body_quad_review`) is PR-body, NOT PROGRESS-coupled — leave it untouched** (corrects the parent proposal's '3/8/9')."
  - id: AC-LOE-012-08
    text: "The retired prose-ledger machinery is removed with no dangling references: ENGINE.md § Bounded-ledger rule and PHASES.md § Phase-transition reflex are deleted (both obsolete — structured state cannot accrete prose), the ENGINE § PROGRESS.md structure contract is replaced by the state.json schema contract, PROGRESS.md itself is removed from the repo (replaced by on-demand `task report --md`), and no remaining doc/agent prose points at the deleted sections or the old `## ` PROGRESS structure."
  - id: AC-LOE-012-09
    text: "An end-to-end slice driven through the new path (`phase-transition` across phases → `merge-checkpoint` → `post-merge`, with a `trace` and a `report` render) leaves the store well-formed: `validate-gates.sh` green, `.claude/metrics/` still populated, and a simulated cross-session resume reconstructs the working context from `state.json` + recent `events.jsonl` alone (no prose tail). Demonstrated by an integration test over fixtures (no live slice required)."
methodology:
  tdd: optional
  acceptance_format: prose
  e2e: optional
  coverage_target: none
  extra_gates:
    - "every state.json write is idempotent + atomic (temp + rename); re-running a settled transition is a clean no-op, never a corrupting double-write"
    - "every state.json write supports --dry-run that prints the JSON diff and writes nothing"
    - "the migration round-trip is validated by a REAL JSON-Schema validator (independent oracle), not a lenient re-implementation of the same parse — the Phase-0 YAML-blocker lesson generalized to JSON (see RETRO-LOE-010 / validation-oracle-independent-of-code)"
    - "validate-gates.sh green over any tree the CLI mutates (the backstop still holds); the end-to-end slice verifies with validate-gates.sh (independent gate), not just the CLI's own logic"
source:
  - "ratification: .implementation/proposals/PROPOSAL-scripted-bookkeeping-phase2.md (the build contract — §2 what ships, §3 deliverables, §5 ACs, §7 ratified decisions)"
  - "design: .implementation/proposals/PROPOSAL-scripted-bookkeeping.md (§3.2 heavier commands, §5 Phase 2 rollout steps 6–8, §9 agent-first state model, §6 judgment line)"
  - "design: .orchestration/design/NORTH-STAR.md (§ Cross-layer extension; conclusion #7 — durable/bounded/cold-derivable contract this store FULFILLS)"
code_standards:
  - "CS-INFRA-004 (recommended) — engine tooling scripts carry zero runtime npm dependencies"
  - "CS-GEN-003 (recommended) — cite the governing authority (proposal § / ADR) in code/test comments"
---

# BRIEF-LOE-012 — Phase 2: structured state store + the heavier task commands

> Engine-tooling chore (epic `chore/lights-out-enablement`). The **third and final build phase** of the ratified
> scripted-bookkeeping initiative, building directly on Phase 1 (`BRIEF-LOE-011`, merged `8ec1f5a`). Now that the
> `pnpm task` CLI owns per-task lifecycle writes over YAML front matter, replace the **hand-curated PROGRESS.md
> prose ledger** with a **cold-derivable structured state store** (`state.json` + `events.jsonl`) and add the five
> commands that read/write it. This is the one breaking change to the orchestration-state shape in the whole
> initiative — gated behind fixtures + `--dry-run`, independently revertable. Successor to `BRIEF-LOE-011`.
> **Ratified 2026-06-22** — `PROPOSAL-scripted-bookkeeping-phase2.md`.

## Scope

Implement **Phase 2** per the ratification proposal §2/§3 and the parent proposal §3.2 + §5 (steps 6–8) + §9:

1. **State store**
   - `.implementation/state.json` — orchestration HOT-STATE ONLY: current brief/phase/slice; awaiting-PR-merge
     records (PR · sha · gate verdicts); open retro action items. Rationale is a `note`/`rationale` FIELD on the
     relevant record, never a free-floating blob (§9.3).
   - `.implementation/events.jsonl` — append-only phase/slice/merge history, bounded-by-nature, queried by slice;
     **git log stays the authoritative deep history**. Committed (§7 decision 1).
   - A one-shot migration that lifts the four current PROGRESS.md sections into `state.json`, then renders
     `report` to prove round-trip parity. **PROGRESS.md is then removed from the repo** (§7 decision 2) —
     `task report --md` is its on-demand replacement. Single atomic migrate-and-re-point PR (§7 decision 3).
2. **`scripts/task.ts`** — add the 5 subcommands (proposal §3.2), each idempotent + atomic (temp + rename),
   non-zero exit with a clear message on contract violation, and a `--dry-run` that prints the `state.json` JSON
   diff and writes nothing:
   - `phase-transition --to <phase> --role <r> [--note]`
   - `merge-checkpoint --pr <N> --role <r> [--sha]`
   - `post-merge --pr <N> --role <r> [--bug <desc>]`
   - `trace --brief NNN`
   - `report [--md]`
3. **`scripts/validate-gates.sh`** — re-point checks **3** (`check_progress_md_structure`) and **9**
   (`check_pr_awaiting_merge_gate_verdicts`) from grepping PROGRESS.md to validating the `state.json` schema.
   **Check 8 (`check_pr_body_quad_review`) is out of scope — leave it untouched.**
4. **Doc retirements** — delete ENGINE.md § Bounded-ledger rule (~line 328) and PHASES.md § Phase-transition
   reflex (~line 59); replace ENGINE § PROGRESS.md structure contract with the `state.json` schema contract;
   sweep any agent-doc / ENGINE / PHASES prose that references the old `## ` PROGRESS sections or the prose sweep.
5. **`.claude/hooks/log-task-edit.py`** — extend so state writes self-report consistently (parent §4 provenance
   model; no new in-file marks).
6. **Tests** under `scripts/__test_fixtures__/` (the harness `validate-gates.sh` already uses): the 5 commands,
   the schema validator, the migration round-trip, and the AC-09 end-to-end fixture slice.

**Build on the Phase-0/1 substrate — do not re-implement.** Bug-file scaffolding for `post-merge` goes through
`scripts/task-frontmatter.ts`; the 5 commands extend the existing `scripts/task.ts` entrypoint (13 commands
already live). Match the `orchestrate-state.sh` / `id-alloc.sh` derive-from-source precedent one layer up
(proposal §11): derive PR/sha/AC-counts from primary sources, one scripted command per mechanical step.

## Out of scope

- **Any change to per-task lifecycle writes** (Phase 1) or the YAML front-matter format (Phase 0) — untouched.
- **`validate-gates.sh` check 8** (`check_pr_body_quad_review`) — PR-body, not PROGRESS-coupled. Do not edit it.
- **The judgment line** (proposal §6) — gate scorecard verdicts, AC-adequacy sign-off, complexity ratings, RETRO
   classification, and handoff/completion PROSE stay agent-owned. `report` renders the structured INPUTS of a
   handoff; the narrative is still agent-authored.
- **Auto-merge / auto-phase-transition** (proposal § non-goals) — every mutation stays agent-invoked.
- Application/product code (`apps/**`, `packages/**`, `prisma/**`, `db/**`).

## Acceptance criteria

- **AC-LOE-012-01..09** — as in the front-matter block above (state store + lossless migration; the five
  commands with atomicity/idempotency/`--dry-run`; derive-from-source for PR/sha; the `validate-gates.sh` 3 & 9
  re-point with check 8 untouched; the prose-ledger retirement with no dangling refs; the end-to-end slice with
  cross-session-resume reconstruction).

## Methodology & quality requirements

- Test against `scripts/__test_fixtures__/` with vitest (auto-discovered by `pnpm test`'s `vitest run scripts`).
  Cover, at minimum: idempotent re-run + `--dry-run` of each state write; illegal/unknown-phase rejection;
  `merge-checkpoint` deriving URL+SHA from a fake `gh`/`git` fixture (not transcribed); `post-merge` both branches
  (clear-on-pass; scaffold-`BUG-BBB-POST-NNN`-and-keep on fail); `trace` tier tally over `@AC-*` fixtures;
  `report` round-trip parity against the pre-migration PROGRESS.md; the AC-09 end-to-end slice + cross-session
  resume reconstruction.
- **Independent oracle (HARD gate).** The migration round-trip / schema check must be validated by a REAL
  JSON-Schema validator, not a lenient re-implementation of the same parse. This is the Phase-0 YAML-blocker
  lesson generalized to JSON (see `RETRO-LOE-010` / [[validation-oracle-independent-of-code]]): a lenient
  re-impl of the check is itself a "ledger verdict." Bake the schema-validator oracle in as a standing
  regression test.
- **Idempotency + atomicity + `--dry-run`** are hard extra gates: temp-file + `fs.renameSync`; re-running a
  settled transition is a clean no-op; `--dry-run` previews the JSON diff and writes nothing.
- Run `validate-gates.sh` green over any fixture tree the CLI mutates, and have the end-to-end slice verify with
  `validate-gates.sh` (the independent gate), not just the CLI's own logic. No e2e (engine tooling, no UI).

## Constraints

- **Agents decide; scripts record (proposal §2/§6).** The CLI owns the state schema/format/timestamps/atomicity/
  ordering/idempotency. It NEVER decides a judgment: gate PASS/FAIL verdicts, AC-adequacy, complexity numbers,
  RETRO classification, and handoff prose are agent-supplied inputs recorded verbatim or stay entirely with the agent.
- **One fact, one home (§9.1).** No fact is duplicated across `state.json` and a markdown file. `## Active bugs`
   is a QUERY over bug front matter, not a stored list. Deep history is git; `events.jsonl` is the queryable slice
   index; `state.json` is hot-state only.
- **`--role` required + roster-validated** on every state-mutating command (`{webapp-developer, devops, sdet,
   overwatch, io}`); no env fallback, no inference — same rule as Phase 1.
- **Generated view is never a source of truth (§9).** `task report` output is never committed and never read
   back. PROGRESS.md is deleted, not regenerated-and-committed (a committed generated file is a drift magnet).
- **Reuse `task-frontmatter.ts`; zero new runtime npm dependency (CS-INFRA-004, recommended).** Prefer a Node
   built-in / vendored JSON-Schema check over a third-party validator; if a dep is genuinely required (e.g. a
   schema validator), justify it in the Work Log against the zero-dep ethos of `db-migrate.ts`/Phase 0/1.
- **Cite authority in comments (CS-GEN-003)** — `// DECISION:` / proposal-section refs at non-obvious choices.

## Code standards

- **CS-INFRA-004** (`recommended`) — `scripts/task.ts` additions are engine tooling: import only Node built-ins +
   sibling scripts; no third-party package unless justified in the Work Log.
- **CS-GEN-003** (`recommended`) — cite the governing proposal section / ADR in code + test comments.

## References

- `PROPOSAL-scripted-bookkeeping-phase2.md` — the ratification + build contract (§2 what ships, §3 deliverables,
   §4 risk/reversibility, §5 the ACs this brief carries, §7 ratified decisions).
- `PROPOSAL-scripted-bookkeeping.md` §3.2 (heavier commands), §5 Phase 2 (rollout steps 6–8), §9 (agent-first
   state model — one-fact-one-home, what's removed/preserved), §6 (judgment line), §11 (NORTH-STAR relationship +
   the `orchestrate-state.sh`/`id-alloc.sh` derive-from-source precedent to mirror).
- Prior art: `BRIEF-LOE-010`/`-011` (Phases 0/1 — the front-matter format, `task-frontmatter.ts`, and the
   existing `task.ts` entrypoint this extends), `.orchestration/scripts/orchestrate-state.sh` + `id-alloc.sh` (the
   structured-state derivers one layer up to mirror), and `scripts/db-migrate.ts` (pure-function + thin-`main()` +
   atomic-write convention).

## Notes

- Suggested decomposition (the IO owns the final split) under `TASK-LOE-012-*`, epic
  `chore/lights-out-enablement`, `Assigned to: devops`, SDET-reviewed, reviewed merge lane:
  **(1)** the state store + schema + the one-shot migration + the JSON-Schema oracle test (the breaking change,
  isolated and proven first); **(2)** the 5 `task.ts` commands (`phase-transition`/`merge-checkpoint`/`post-merge`/
  `trace`/`report`) with `--dry-run`, idempotency, derive-from-source; **(3)** the `validate-gates.sh` 3 & 9
  re-point + doc retirements (ENGINE bounded-ledger, PHASES reflex, PROGRESS.md removal) + the AC-09 end-to-end
  slice + cross-session-resume test.
- **Reviewed-lane reminder for the eventual PR:** Phases 0 and 1 each had the `/pr-review` panel catch what
  internal gates missed (Phase 0's YAML blocker — `RETRO-LOE-010`). For this slice the analogous trap is the
  **migration losing a fact** or the **schema check being a lenient re-impl** — make the round-trip oracle a REAL
  JSON-Schema validator over the migrated store, and assert the migration is lossless by diffing `report --md`
  against the pre-migration PROGRESS.md content, not by trusting the CLI's own serialize.
- **PROGRESS.md removal is irreversible-in-place** — the IO/SDET must confirm the round-trip parity test is green
  BEFORE the migration task deletes PROGRESS.md (git history is the recovery path, but the brief's contract is
  "no fact lost" proven, not assumed).
- `metrics-report.py` reads `.claude/metrics/` — confirm state-write self-reports flow through it unchanged.

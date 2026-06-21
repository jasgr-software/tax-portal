---
id: BRIEF-LOE-011
title: Phase 1 — task.ts CLI (write mutations + bounded read projections) over YAML front matter
status: ready
acceptance_criteria:
  - id: AC-LOE-011-01
    text: "`scripts/task.ts` (run as `pnpm task <cmd>`) provides the write subcommands `start`, `review`, `done`, `reject`, `log`, `archive`, `verify`. Each is idempotent and atomic (temp + rename), reads/writes lifecycle fields ONLY through the Phase-0 `scripts/task-frontmatter.ts` module (no re-implemented YAML parsing), and exits non-zero with a clear message on any contract violation (illegal transition, missing required judgment input, malformed result)."
  - id: AC-LOE-011-02
    text: "Each write subcommand OWNS format/timestamp/ordering/atomicity: it stamps the real UTC clock (never a sentinel), sets `updated_by` from a required `--role` validated against the roster, appends the canonically-formatted Work Log breadcrumb `validate-gates.sh` greps for, and serializes front-matter keys in canonical order. A task mutated by the CLI passes `scripts/validate-gates.sh` with identical verdicts to a correctly hand-edited one."
  - id: AC-LOE-011-03
    text: "Transition legality is enforced from the current on-disk state: `start` requires `backlog`/`in-progress` (rejects double-start), `review` requires `in-progress`, `done` requires `review` AND a non-empty `complexity_actual` in 1..5 (rejects otherwise — same rule as ENGINE § Task Metadata Contract), `reject` back-transitions `review`→`in-progress` wiring a `--bug` ref, `archive` moves only `status: done` files to `tasks/done/`. No subcommand auto-merges or auto-transitions a phase."
  - id: AC-LOE-011-04
    text: "`--role` is a required flag on every write subcommand, validated against the roster (`webapp-developer`, `devops`, `sdet`, `overwatch`, `io`); an unknown/absent role exits non-zero. No env fallback, no inference from `assigned_to` (the SDET writes `done` on a developer's task; the IO writes its own tasks)."
  - id: AC-LOE-011-05
    text: "Every CLI write SELF-REPORTS to `.claude/metrics/` in the same record shape the `log-task-edit.py` Edit/Write hook emits (`ts, task_id, file_path, status, complexity_estimate, complexity_actual, started_at, completed_at, assigned_to`), because a `tsx` `fs.writeFile` does NOT trigger that hook. No double-count. This makes the CLI-vs-raw-edit adoption ratio observable (proposal §4/§10 Q2) without any in-file provenance mark."
  - id: AC-LOE-011-06
    text: "The read/query subcommands `show <ID> [--fields ...]`, `list --brief NNN [--status ...]`, `next [--brief NNN]`, `summary --brief NNN`, `progress`, and `brief-context <ID>` return BOUNDED projections (not whole files). Default output is compact text/tables; `--json` is opt-in for programmatic callers; `brief-context` defaults to a paste-ready markdown bundle. Read commands never mutate."
  - id: AC-LOE-011-07
    text: "The judgment line holds: the CLI RECORDS agent-supplied values (complexity numbers, the Work Log prose, the bug id, the optional note) but NEVER computes or decides a judgment (complexity ratings, RETRO classification, handoff prose, AC-adequacy, gate verdicts). `done` does not invent `complexity_actual`; it requires it present or supplied."
  - id: AC-LOE-011-08
    text: "Docs reference the CLI as the paved road WITHOUT dropping any contract semantics: `agents/developer.md` Workflow steps 1 & 8, `agents/sdet.md` Review/atomic-close step, ENGINE.md § Dispatch Checkpoint, and PHASES.md § Close-prep call the `pnpm task …` commands; the field-meaning / who-writes-when / rejection-rule prose stays intact. `validate-gates.sh` remains the backstop — a correct hand-edit still passes (the CLI is the paved road, not a wall)."
  - id: AC-LOE-011-09
    text: "An end-to-end slice driven entirely through the CLI (`start` → `log` → `review` → `done` → `archive`, across the developer/SDET roles) leaves the task well-formed: `validate-gates.sh` green and `.claude/metrics/` populated with the self-reported records. Demonstrated by an integration test over fixtures (no live slice required)."
methodology:
  tdd: optional
  acceptance_format: prose
  e2e: optional
  coverage_target: none
  extra_gates:
    - "every write subcommand is idempotent (re-running the same transition is a no-op or a clear no-op exit, never a corrupting double-write)"
    - "validate-gates.sh green over any tree the CLI mutates (the backstop still holds)"
    - "CLI-write metrics self-report parity: a CLI write and the equivalent hand-edit produce the same .claude/metrics/ record"
source:
  - "design: .implementation/proposals/PROPOSAL-scripted-bookkeeping.md (§2 design principle, §3 commands, §5 Phase 1, §6 judgment line, §8.2 read commands, §10 Q1/Q2/Q3/Q5 resolutions)"
  - "design: .orchestration/design/NORTH-STAR.md (§ Cross-layer extension — conclusions #1/#2/#3/#7)"
code_standards:
  - "CS-INFRA-004 (recommended) — engine tooling scripts carry zero runtime npm dependencies"
  - "CS-GEN-003 (recommended) — cite the governing authority in code/test comments"
---

# BRIEF-LOE-011 — Phase 1: `task.ts` CLI over YAML front matter

> Engine-tooling chore (epic `chore/lights-out-enablement`). The **second build phase** of the ratified
> scripted-bookkeeping initiative, building directly on Phase 0 (`BRIEF-LOE-010`, merged `2b8944a`): now that
> task/bug lifecycle fields live in YAML front matter, replace the **hand-authored multi-field `Edit`** that
> agents perform for every status transition with a **deterministic CLI** that owns format, timestamps,
> atomicity, ordering, and idempotency. Successor to `BRIEF-LOE-010`.

## Scope

Implement **Phase 1** per `PROPOSAL-scripted-bookkeeping.md` §3 + §5 (Phase 1) + §8.2:

1. **`scripts/task.ts`** (run via `tsx`, exposed as `pnpm task <cmd>` in `package.json`) with:
   - **Write subcommands** (proposal §3.1): `start <ID> --role <r> --complexity-estimate N [--note]`,
     `review <ID> --role <r> --complexity-actual N [--note]`, `done <ID> --role <r> [--note]`,
     `reject <ID> --role <r> --bug <BUG-ID> [--note]`, `log <ID> --role <r> --did "…" --next "…" [--blockers "…"]`,
     `archive [--brief NNN | --all-done]`, `verify [--brief NNN]` (a thin wrapper over the relevant
     `validate-gates.sh` / `task-frontmatter.ts verifyFrontMatter` checks, scoped to one brief).
   - **Read/query subcommands** (proposal §8.2): `show <ID> [--fields …]`, `list --brief NNN [--status …]`,
     `next [--brief NNN]`, `summary --brief NNN`, `progress`, `brief-context <ID>`.
2. **`package.json`** — add `"task": "tsx scripts/task.ts"`.
3. **Unit/integration tests** under `scripts/__test_fixtures__/` (the harness `validate-gates.sh` already uses):
   assert idempotency, transition-legality rejections, timestamp format, `--role` validation, metrics
   self-report parity, and the read-projection shapes. Plus the AC-LOE-011-09 end-to-end fixture slice.
4. **Docs** — update `agents/developer.md` (Workflow steps 1 & 8), `agents/sdet.md` (Review / atomic-close
   step), ENGINE.md (§ Dispatch Checkpoint), PHASES.md (§ Close-prep) to call the CLI as the paved road,
   preserving the *contract* prose (what fields mean, who writes when, rejection rules) and replacing only the
   *edit-choreography* prose.

**Reuse the Phase-0 module — this is the point.** All front-matter read/write goes through
`scripts/task-frontmatter.ts` (`parseFrontMatter`, `serializeFrontMatter`, `verifyFrontMatter`, `FIELD_MAP`).
This gives the Phase-0 schema verifier its **first production consumer** (the PR #74 over-engineering lens
flagged it as test-only — wiring `task.ts` + `verify` onto it closes that, and the docs/comments claiming a
production consumer become true). Do not re-implement YAML parsing.

## Out of scope

- **Phase 2 entirely:** `.implementation/state.json` / `events.jsonl`, and the heavier commands
  `phase-transition`, `merge-checkpoint`, `trace`, `report`, `post-merge` (proposal §3.2/§9). No replacement of
  the PROGRESS.md prose ledger — `progress` here is a **read projection** of the existing PROGRESS.md hot-state,
  not a new store.
- Any change to field **semantics**, the gate logic, or the lifecycle write-ownership (e.g. `completed_at`
  stays SDET-authored — the CLI's `done` is the mechanism the SDET uses, invoked with `--role sdet`).
- **Removing or weakening `validate-gates.sh`** — it stays as the defense-in-depth backstop. Hand-edits remain
  possible; the CLI is the paved road, not a mandate (proposal §4, §10 Q2).
- Auto-merge / auto-phase-transition (proposal § non-goals).
- Application/product code (`apps/**`, `packages/**`, `prisma/**`, `db/**`).

## Acceptance criteria

- **AC-LOE-011-01..09** — as in the front-matter block above (write subcommands + atomicity/idempotency;
  format/timestamp/breadcrumb ownership; transition legality; `--role` validation; metrics self-report;
  bounded read projections; the judgment line; docs-as-paved-road with the backstop intact; the end-to-end
  CLI-driven slice).

## Methodology & quality requirements

- Test against `scripts/__test_fixtures__/` with vitest (auto-discovered by `pnpm test`'s `vitest run scripts`).
  Cover, at minimum: idempotent re-run of each transition; each illegal-transition rejection (double-start;
  `done` with empty/out-of-range `complexity_actual`; unknown `--role`); UTC-timestamp format; the
  metrics-record parity (CLI write vs the hand-edit hook record for the same file); each read command's bounded
  projection (`--json` and default text); the AC-09 end-to-end fixture slice.
- **Idempotency + atomicity** are hard extra gates: temp-file + `fs.renameSync`; re-running a settled
  transition is a clean no-op, never a corrupting double-write.
- Run `validate-gates.sh` green over any fixture tree the CLI mutates. No e2e (engine tooling, no UI).

## Constraints

- **Agents decide; scripts record (proposal §2/§6).** The CLI owns format/field-names/timestamps/atomicity/
  ordering/idempotency. It NEVER decides a judgment: complexity numbers, RETRO classification, handoff prose,
  AC-adequacy, and gate scorecard verdicts are agent-supplied inputs or stay entirely with the agent.
- **`--role` required + roster-validated (§10 Q3)** — no env fallback (shell state doesn't persist between Bash
  calls), no inference from `assigned_to`. Reject any value outside `{webapp-developer, devops, sdet, overwatch, io}`.
- **Format-only enforcement / no in-file provenance (§10 Q2)** — a well-formed hand-edit still passes
  `validate-gates.sh`; the CLI wins by being easier than getting the schema right by hand, not by mandate. Do
  NOT stamp a CLI signature into the file. Adoption is measured via the metrics self-report (AC-05), not in-file.
- **Output format (§10 Q5)** — compact text/tables default (token-cheap, human- and agent-readable); `--json`
  opt-in; `brief-context` defaults to the paste-ready markdown bundle (its consumer pastes it into a spawn prompt).
- **Reuse `task-frontmatter.ts`; zero new runtime npm dependency (CS-INFRA-004, recommended)** — match the
  zero-dep ethos of `db-migrate.ts`/`db-seed.ts`/Phase 0. If a dep is genuinely required, justify it in the
  Work Log.
- **Cite authority in comments (CS-GEN-003)** — `// DECISION:` / proposal-section refs at non-obvious choices.

## Code standards

- **CS-INFRA-004** (`recommended`) — `scripts/task.ts` is engine tooling: import only Node built-ins + sibling
  scripts (`./task-frontmatter`); no third-party YAML/CLI-arg package unless justified.
- **CS-GEN-003** (`recommended`) — cite the governing proposal section / ADR in code + test comments.

## References

- `PROPOSAL-scripted-bookkeeping.md` §2 (design principle), §3.1/§3.3 (write commands + before/after example),
  §5 Phase 1 (rollout steps), §6 (judgment line), §8.2 (read commands), §10 Q1/Q2/Q3/Q5 (resolved decisions),
  §11 (NORTH-STAR relationship + the `orchestrate-state.sh`/`id-alloc.sh` derive-from-source precedent to mirror).
- Prior art: `BRIEF-LOE-010` / `TASK-LOE-010-*` (Phase 0 — the front-matter format + `task-frontmatter.ts`
  module this CLI consumes), and `scripts/db-migrate.ts` (the pure-function + thin-`main()` + atomic-write
  convention to mirror).

## Notes

- Suggested decomposition (the IO owns the final split) under `TASK-LOE-011-*`, epic
  `chore/lights-out-enablement`, `Assigned to: devops`, SDET-reviewed, reviewed merge lane:
  **(1)** the write CLI (`start`/`review`/`done`/`reject`/`log`/`archive`/`verify`) + `--role` validation +
  metrics self-report + transition-legality, on the `task-frontmatter.ts` module; **(2)** the read/query
  projections (`show`/`list`/`next`/`summary`/`progress`/`brief-context`); **(3)** the doc rewrites
  (developer/sdet/ENGINE/PHASES) + the AC-09 end-to-end CLI-driven slice integration test.
- **Reviewed-lane reminder for the eventual PR:** Phase 0's `/pr-review` panel caught a blocker every internal
  gate missed (see `RETRO-LOE-010` / [[validation-oracle-independent-of-code]]). For this slice the analogous
  trap is **transition-legality / metrics-parity** asserted only against the CLI's own logic — make the metrics
  self-report test compare against the REAL `log-task-edit.py` hook output (the independent oracle), not a
  re-implementation, and have the end-to-end slice test verify with `validate-gates.sh` (the independent gate),
  not just the CLI's own `verify`.
- `metrics-report.py` is the downstream consumer of `.claude/metrics/` — confirm the CLI self-reported records
  flow through it unchanged (it reads the snake_case front-matter keys post-Phase-0).

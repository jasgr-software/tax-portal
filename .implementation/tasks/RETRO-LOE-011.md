# RETRO-LOE-011 — Phase 1: `task.ts` CLI (write mutations + bounded read projections) over YAML front matter

> Engine-tooling chore (epic `chore/lights-out-enablement`). The second build phase of the ratified
> scripted-bookkeeping initiative. Brief: `.implementation/briefs/BRIEF-LOE-011-task-cli.md`.
> Branch: `brief-loe-011-task-cli`. `Brief-type:` document/chore · `Brief-deploys:` no.
> Successor to Phase 0 (`BRIEF-LOE-010`, merged `2b8944a` / PR #74).

## What shipped

The hand-authored multi-field `Edit` agents performed for every lifecycle transition is replaced by a
deterministic **`pnpm task <cmd>`** CLI that owns format, timestamps, atomicity, ordering, and idempotency —
built **on** the Phase-0 `scripts/task-frontmatter.ts` module (its first production consumer, closing the PR #74
over-engineering finding). Agents decide; the CLI records (proposal §2/§6). `validate-gates.sh` stays the
unchanged required backstop — a correct hand-edit still passes, so the CLI wins by being easier, not by mandate
(proposal §4/§10 Q2). No NEW required gate was introduced.

Concretely:

- **`scripts/task.ts`** (run via `tsx`, exposed as `pnpm task`) — a zero-runtime-dep CLI (Node built-ins +
  `./task-frontmatter` only; CS-INFRA-004) with a pure-function + thin-`main()` + `isMain`-guard shape mirroring
  `db-migrate.ts`:
  - **7 write subcommands** — `start` / `review` / `done` / `reject` / `log` / `archive` / `verify`. Each is
    atomic (temp + `fs.renameSync`), idempotent (re-running a settled transition is a clean no-op, never a
    corrupting double-write or duplicate breadcrumb), enforces transition legality from on-disk state, requires
    a roster-validated `--role`, and self-reports to `.claude/metrics/` in the exact `log-task-edit.py` record
    shape (a `tsx fs.writeFile` does not trigger that hook). All front-matter I/O routes through
    `task-frontmatter.ts` — no re-implemented YAML. `verify` delegates to `verifyFrontMatter`.
  - **6 read projections** — `show` / `list` / `next` / `summary` / `progress` / `brief-context`. Strictly
    read-only (no mutation, no metrics write); compact-text default, `--json` opt-in, `brief-context` a
    paste-ready markdown bundle. `progress` projects the real PROGRESS.md `## Current initiative` hot-state (a
    read projection, not a new store — Phase-2 `state.json`/`events.jsonl` stayed fenced out).
- **`scripts/task.test.ts` + `scripts/__test_fixtures__/task/**`** — 172/172 scripts vitest (up from Phase-0's
  baseline; +63 write, +46 read, +2 in -003), including the AC-05 real-hook metrics-parity test, the 4 read-only
  invariants, and the AC-09 end-to-end fixture slice.
- **`package.json`** — adds `"task": "tsx scripts/task.ts"`.
- **4 quad-review workflow docs rewritten** to call `pnpm task …` as the paved road, every contract semantic
  preserved verbatim and the "hand-edit still passes the backstop" escape intact: `agents/developer.md`
  steps 1 & 8, `agents/sdet.md` step 6/7, ENGINE.md § Dispatch Checkpoint, PHASES.md § Close-prep + exit
  conditions. **A 5th workflow doc** (`agents/sdet.md` step 6, a second edit) was amended at Close-prep — see
  the cmdDone-scope advisory disposition below.

## 9-AC ↔ task ↔ evidence map

| AC            | Text (abbrev.)                                                              | Task(s) | Evidence |
| ------------- | --------------------------------------------------------------------------- | ------- | -------- |
| AC-LOE-011-01 | Write subcommands idempotent + atomic; FM I/O only via `task-frontmatter.ts`; non-zero on violation | -001 | `cmdStart/Review/Done/Reject/Log/Archive/Verify` tests; `atomicWriteFile` temp+rename; `cmdVerify → verifyFrontMatter` |
| AC-LOE-011-02 | CLI owns format/timestamp/ordering/atomicity; real UTC clock; canonical breadcrumb; CLI-vs-hand-edit parity | -001 | real-`Date().toISOString()` (no sentinel) test; `formatBreadcrumb`; `validate-gates.sh` identical verdicts |
| AC-LOE-011-03 | Transition legality from on-disk state (double-start no-op; `done` needs `complexity_actual ∈ 1..5`; archive moves only `done`) | -001 | per-transition legality + rejection tests |
| AC-LOE-011-04 | `--role` required + roster-validated; no env fallback; no `assigned_to` inference | -001 | "Role validation (AC-LOE-011-04)" describe block |
| AC-LOE-011-05 | Metrics self-report parity vs the REAL `log-task-edit.py` hook (independent oracle) | -001 (+ BUG-001 fix) | "Metrics self-report parity vs real log-task-edit.py hook" — `delta===1` hard, counterfactual reproduced |
| AC-LOE-011-06 | Bounded read projections; compact-text default + `--json`; `brief-context` paste-ready; never mutate | -002 | 6 read describe blocks; 4 read-only invariant tests; `progress` real-oracle test |
| AC-LOE-011-07 | Judgment line: CLI records agent values, never decides; `done` never invents `complexity_actual` | -001 | "cmdDone — the judgment line (AC-LOE-011-07)" describe block |
| AC-LOE-011-08 | Docs reference the CLI as paved road WITHOUT dropping contract semantics; backstop intact | -003 (+ Close-prep sdet.md fix) | `git diff` of the 4 (now 5) workflow files — choreography-only changes; SDET diff analysis |
| AC-LOE-011-09 | End-to-end CLI-driven slice (`start→log→review→done→archive`) leaves task well-formed; `validate-gates.sh` green + metrics populated | -003 | "AC-LOE-011-09 … verified by validate-gates.sh" test (44ms PASS); counterfactual: corrupted fixture → exit 1 |

## Headline lesson — the independent-oracle trap appeared THREE times this slice, caught each time

The load-bearing carry-over from RETRO-LOE-010 / [[validation-oracle-independent-of-code]] is: **a validation
oracle must be independent of the code under test, not a re-implementation of it.** The brief baked that rule
into its Notes for this slice. It paid off three times — the trap surfaced on every place a verdict could have
been self-graded, and was caught each time **because the brief pre-stated the independent oracle**:

1. **Metrics-parity (AC-05, -001).** The first cut asserted CLI-record parity against an `extractFrontMatter()`
   re-implementation (the test fixture sat outside the hook's path-confinement, so the REAL `log-task-edit.py`
   silently wrote nothing and the test fell back). **Caught at SDET review → BUG-LOE-011-001** → fixed to stage
   a pid-unique fixture under the REAL `.implementation/tasks/`, exercise the real hook, assert `delta === 1`
   hard, and reproduce a counterfactual. The oracle is now the real downstream consumer.
2. **Read-only projection fidelity (AC-06, -002).** The `progress` projection asserts against the REAL
   `extractCurrentInitiativeSection(fixtureContent)` and a fixture deliberately carrying a session-entry tail to
   catch over-projection — not a hand-rebuilt copy. The 4 read-only invariants assert real before/after mtime +
   metrics-line count, not a claim.
3. **AC-09 end-to-end slice (-003).** The e2e slice asserts well-formedness via the INDEPENDENT
   `bash scripts/validate-gates.sh --fixture-dir <tree>` (exit 0), NOT the CLI's own `verify`. SDET independently
   constructed a corrupted fixture (`complexity_actual: —`) and confirmed the gate reds it (exit 1) — proving the
   gate is specific, not vacuous.

The mechanism worked because the **brief**, not the implementer, named the independent oracle up front. That is
the reusable conclusion: when a slice builds a tool that grades work, the brief must pre-specify the oracle
that grades the tool, independent of the tool's own logic.

## Advisory dispositions (this slice)

- **-002 `cmdBriefContext` read-only-invariant gap (SDET advisory, non-blocking) → RESOLVED in -003.** At -002
  review the SDET noted `cmdBriefContext` was demonstrably write-free (only `fs.readFileSync` in its body) but
  not in the invariant-test describe block. -003 folded in a `cmdBriefContext` read-only-invariant test.
  **Disposition: resolved.**
- **sdet.md `cmdDone`-scope overstatement (SDET advisory at -003, non-blocking) → RESOLVED at Close-prep.**
  `sdet.md` step 6 originally said `pnpm task done` "ticks the SDET Review box, fills `**Decision**: approved`" —
  but `cmdDone` delivers only the **mechanical** close (status→done, `completed_at`, `updated_by`, breadcrumb);
  ticking the box and writing the `**Decision**:` line are **SDET judgment** (the -003 SDET ticked them manually).
  **Resolution:** amended `sdet.md` step 6 (Close-prep, IO-authored per ENGINE § Main Session Rules) to split the
  mechanical close (`cmdDone` does) from the judgment (SDET still ticks the box + writes the `**Decision**:`
  prose). **`cmdDone` was deliberately NOT extended** to fabricate the Decision prose — keeping `scripts/` out of
  a needless re-review and keeping the judgment line clean (the CLI never decides). This 5th workflow-file edit
  joins the quad-review + user-LGTM set at the PR. `validate-gates.sh` re-confirmed green after the edit.
  **Disposition: resolved.**

## Process notes

- **Workflow-file user-LGTM obligation.** The PR touches **5** quad-review-governed workflow files
  (`agents/developer.md`, `agents/sdet.md`, `ENGINE.md`, `PHASES.md`) — `sdet.md` was edited twice (the -003
  doc rewrite + the Close-prep cmdDone-scope fix). Per ENGINE § Autonomy Ceiling 3(c) the PR **must not
  auto-merge**; it requires an explicit user `LGTM` / `/approve` comment. Recorded prominently in
  `## Awaiting PR merge` and the PR package.
- **CLI dogfooded at Close-prep.** `pnpm task archive --brief LOE-011` moved the 4 done files; the -003 SDET used
  `pnpm task done … --role sdet` for the atomic close. The paved road is exercised by the slice that builds it.
- **Branch carries zero commits.** All slice work is uncommitted in the working tree at Close-prep — the main
  session stages + commits the named files (see HANDOFF / PR package). This is expected: agents write code, the
  main session owns git.

## Retro finding classification (concrete gate failures only)

- **BUG-LOE-011-001 (metrics-parity oracle fallback) — `gated-path-fix`, RESOLVED in-slice.** The one concrete
  gate finding this slice: a self-grading oracle on the load-bearing producer test. Caught at SDET review, fixed
  on the same branch, re-reviewed, closed `done`. The fix rides this PR. Headline lesson above.

No other finding clears the retro promotion bar (concrete quality-gate failure). All other observations are
carried in PROGRESS.md `## Open retro action items` unchanged.

## Gate scorecard

1. Per-task submission gates — **3/3 PASS** (+ BUG-001 fix gate)
2. SDET Review — **3/3 approved** (-001 after one reject+fix; -002, -003 first-pass; BUG-001 closed)
3. Overwatch Audit — N/A folded (no mid-dispatch risk signal; engine-tooling slice, IO design scan covers integration)
4. IO Design scan — **PASS** (see below)
5. Container Smoke — **PASS** (engine-tooling shape: `validate-gates.sh` green over the real tree AND the AC-09 mutated fixture tree — the independent gate over real + mutated state is this slice's deploy-layer proof)
6. SDET Acceptance-validation — **PASS** (AC-01..09 all traced to passing tests/evidence)
7. SDET CI gate — **PASS** (lint + type-check clean; 172/172 scripts vitest)
8. Post-merge CI — **PENDING** (Close-finalize, after merge)
9. Post-merge staging smoke — **N/A** (`brief_deploys: no`)

### IO Design scan verdict (gate 4)

Read the integrated working-tree diff (`git diff` + untracked `scripts/task.ts` / `task.test.ts` / fixtures).
**PASS.** The slice honors BRIEF-LOE-011: (a) `pnpm task` is a paved-road convenience over `task-frontmatter.ts`
— no NEW required gate, `validate-gates.sh` unchanged as the backstop, and every workflow doc preserves the
"a correct hand-edit still passes" escape; (b) the judgment line held — the CLI records agent-supplied values
and never decides (`cmdDone` requires `complexity_actual`, never invents it; the Close-prep fix deliberately
declined to make `cmdDone` author the `**Decision**:` prose); (c) Phase-2 scope (`state.json`/`events.jsonl`,
the heavier commands) stayed fenced out — `progress` is a read projection of existing hot-state, not a new
store; (d) no product-code creep — zero changes under `apps/**`/`packages/**`/`prisma/**`/`db/**`;
`package.json` adds only the `task` script.

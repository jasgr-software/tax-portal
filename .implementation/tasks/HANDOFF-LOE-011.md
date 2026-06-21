# HANDOFF-LOE-011 — Phase 1: `task.ts` CLI over YAML front matter

> For the upstream producer (the scripted-bookkeeping initiative / `chore/lights-out-enablement`) to absorb.
> Brief: `.implementation/briefs/BRIEF-LOE-011-task-cli.md`. Branch: `brief-loe-011-task-cli`.
> `Brief-type:` document/chore · `Brief-deploys:` no. Successor to Phase 0 (`BRIEF-LOE-010` / PR #74 / `2b8944a`).

## Outcome

All 9 acceptance criteria satisfied and exercised through the delivered `pnpm task` CLI. The hand-authored
multi-field lifecycle `Edit` is now a deterministic CLI over the Phase-0 `task-frontmatter.ts` module (its
first production consumer). `validate-gates.sh` remains the unchanged required backstop — no NEW required gate.

## AC ↔ evidence table

| AC            | Satisfied by | Independent evidence |
| ------------- | ------------ | -------------------- |
| AC-LOE-011-01 | `scripts/task.ts` write subcommands | per-transition idempotency/atomicity/legality tests; `cmdVerify → verifyFrontMatter` |
| AC-LOE-011-02 | CLI format/timestamp/breadcrumb/ordering ownership | real-UTC-clock test (no sentinel); `validate-gates.sh` identical verdicts CLI-vs-hand-edit |
| AC-LOE-011-03 | on-disk transition legality | double-start no-op, `done`-needs-`complexity_actual∈1..5`, archive-only-`done` tests |
| AC-LOE-011-04 | `--role` roster validation | "Role validation (AC-LOE-011-04)" describe block |
| AC-LOE-011-05 | metrics self-report | parity vs the REAL `log-task-edit.py` hook — `delta===1` hard + counterfactual (BUG-LOE-011-001 fix) |
| AC-LOE-011-06 | 6 read projections | bounded-projection + 4 read-only-invariant + `progress` real-oracle tests |
| AC-LOE-011-07 | the judgment line | "cmdDone — the judgment line" — `done` rejects empty/out-of-range `complexity_actual`, never invents |
| AC-LOE-011-08 | 5 workflow docs call `pnpm task …` | `git diff` choreography-only; every contract semantic + backstop escape preserved |
| AC-LOE-011-09 | end-to-end CLI slice | "AC-LOE-011-09 … verified by validate-gates.sh" test PASS; corrupted-fixture counterfactual → exit 1 |

## Validation summary

- **lint** PASS · **type-check** PASS · **scripts vitest** 172/172 PASS
- **`validate-gates.sh`** ALL CHECKS PASSED over the real tree (Smoke part 1) AND green over the AC-09 mutated
  fixture tree, with the corrupted-fixture counterfactual reding it (Smoke part 2 — the independent gate over
  real + mutated state is the deploy-layer proof for this engine-tooling slice).

## What the producer should know

- **Phase 0's module now has a production consumer.** `task-frontmatter.ts` is wired into `pnpm task` (writes)
  and `pnpm task verify` (schema check). The PR #74 "test-only / over-engineered" lens finding is closed.
- **`validate-gates.sh` is unchanged and still required.** The CLI is the paved road, not a wall — a correct
  hand-edit still passes the backstop. Adoption is observable via the metrics self-report (AC-05), not an in-file
  provenance mark.
- **Phase 2 remains out of scope** — `state.json` / `events.jsonl` and the heavier commands
  (`phase-transition` / `merge-checkpoint` / `trace` / `report` / `post-merge`) are the next phase. `progress`
  here is a read projection of the existing PROGRESS.md hot-state, not a new store.
- **Carried advisory (resolved):** the -002 `cmdBriefContext` read-only-invariant gap (resolved in -003) and the
  sdet.md `cmdDone`-scope overstatement (resolved at Close-prep by amending sdet.md step 6, NOT by extending
  `cmdDone`). See RETRO-LOE-011 § Advisory dispositions.

## ⚠️ Merge gate

This PR touches **5 quad-review-governed workflow files** (`agents/developer.md`, `agents/sdet.md` [edited
twice], `ENGINE.md`, `PHASES.md`). Per ENGINE § Autonomy Ceiling 3(c) it **must not auto-merge** — it requires
an explicit user `LGTM` / `/approve` comment. Reviewed merge lane: Standards audit → `/pr-review` panel → fix →
resolve threads → **user LGTM** → merge on green required CI (`lint-and-typecheck` + `security-scan`). No
`--admin`, no branch-protection toggle.

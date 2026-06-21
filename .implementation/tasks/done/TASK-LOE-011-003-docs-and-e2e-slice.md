---
brief: BRIEF-LOE-011
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-LOE-011-002
impl: developer
e2e_required: "no"
started_at: 2026-06-21T21:53:52Z
completed_at: 2026-06-21T22:08:08.246Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-LOE-011-08, AC-LOE-011-09]
upstream_refs: none
code_standards: [CS-GEN-003 (recommended)]
---

# TASK-LOE-011-003: docs-as-paved-road rewrites + AC-09 end-to-end CLI-driven slice integration test

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm test` (scripts vitest) pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — engine tooling, no UI; brief sets `e2e: optional` → N/A
- [x] **Security review** — integration test fixtures confined to the harness tree; no live `tasks/` mutation
- [x] **SDET Review** — approved

## SDET Review focus areas

- **AC-09 end-to-end slice — verify with the INDEPENDENT gate, not the CLI's own `verify` (brief Notes).** The
  integration test drives a fixture task entirely through the CLI (`start` → `log` → `review` → `done` →
  `archive`, across developer + SDET roles) and MUST assert the result with `scripts/validate-gates.sh` green
  over the mutated fixture tree (the independent backstop) AND `.claude/metrics/` populated with the
  self-reported records — NOT merely `task verify`. A test that only calls the CLI's own `verify` to check its
  own output is the exact trap RETRO-LOE-010 flagged (validation oracle must be independent of the code).
- **Docs preserve contract semantics (AC-08).** The rewrites to `agents/developer.md` (Workflow steps 1 & 8),
  `agents/sdet.md` (Review / atomic-close step), `ENGINE.md` (§ Dispatch Checkpoint), `PHASES.md` (§ Close-prep)
  must replace ONLY the edit-choreography prose with the `pnpm task …` call — the field-meaning / who-writes-when
  / rejection-rule / atomic-ordering prose stays intact. Grep-confirm: the Task Metadata Contract semantics
  (SDET rejects empty/out-of-range `complexity_actual`; `completed_at` SDET-authored; `--role` who-writes-when)
  survive verbatim. `validate-gates.sh` remains described as the backstop — a correct hand-edit still passes.
- **WORKFLOW-FILE QUAD-REVIEW (load-bearing governance — see Implementation Notes):** `agents/developer.md`,
  `agents/sdet.md`, `ENGINE.md`, `PHASES.md` are quad-review-governed workflow files (ENGINE § Main Session
  Rules). The developer DRAFTS the edits inside this slice; the four-lens quad review (IO + SDET + Overwatch,
  two lenses each) is owed at the slice's review/Close-prep, and the eventual PR carries the workflow-file change
  through the reviewed lane. The SDET is one of the four lenses — apply both the workflow-content lens and the
  model-behavior lens (`model-behavior-notes.md`) to these doc edits.
- **CS-GEN-003**: cite the governing proposal section in the integration-test comments.

## Context

Third and closing task of BRIEF-LOE-011. Two deliverables: (1) the **docs-as-paved-road** rewrites that point
the four engine docs at the `pnpm task …` commands while preserving every contract semantic (AC-08); (2) the
**AC-09 end-to-end CLI-driven slice integration test** that proves a task driven entirely through the CLI leaves
well-formed state, verified by the independent `validate-gates.sh` gate (not the CLI's own `verify`). Depends on
TASK-LOE-011-001 (write CLI) and -002 (read projections). Satisfies AC-LOE-011-08 + -09.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.implementation/agents/developer.md` | Modify | Workflow step 1 (`task start …`) and step 8 (`task review …`) call the CLI; preserve the field-meaning + honest-estimation + rejection-rule prose. **Quad-review workflow file.** |
| `.implementation/agents/sdet.md` | Modify | Review / atomic-close step calls `task done …` (`--role sdet`) / `task reject …`; preserve `completed_at`-SDET-authored + complexity-rejection prose. **Quad-review workflow file.** |
| `.implementation/ENGINE.md` | Modify | § Dispatch Checkpoint references `task start …` for the pre-implementation atomic edit; preserve the atomic-ordering rationale + enforcement prose. **Quad-review workflow file.** |
| `.implementation/PHASES.md` | Modify | § Close-prep references `task archive …` / `task verify …`; preserve the consistency-gate + archive obligations. **Quad-review workflow file.** |
| `scripts/task.test.ts` | Modify | Added the AC-09 e2e describe block (`start→log→review→done→archive`, validate-gates.sh assertion, metrics assertion) and the `cmdBriefContext` read-only invariant test. |
| `scripts/__test_fixtures__/task/TASK-E2E-001-e2e-slice-fixture.md` | Create | Dedicated fixture task for the AC-09 e2e slice (starts in `backlog`, driven to `done`). |
| `scripts/__test_fixtures__/task/PROGRESS-e2e-fixture.md` | Create | PROGRESS.md fixture for the e2e fixture tree (all 5 required sections for validate-gates.sh check 3). |

## Implementation Notes

- **Docs (AC-08, proposal §5 Phase 1 step 4):** rewrite ONLY the edit-choreography prose to call the CLI; keep
  the *contract* prose. Concrete bindings:
  - `developer.md` step 1 → `pnpm task start <ID> --role <r> --complexity-estimate N [--note "…"]`; step 8 →
    `pnpm task review <ID> --role <r> --complexity-actual N [--note "…"]`. Keep the "honest 1–5 before reading
    impl notes" + "SDET rejects empty/out-of-range `complexity_actual`" semantics.
  - `sdet.md` atomic-close step → `pnpm task done <ID> --role sdet [--note "…"]` (and `task reject … --bug …`).
    Keep "`completed_at` is SDET-authored", the complexity-actual hard gate, and the atomic-close obligation.
  - `ENGINE.md § Dispatch Checkpoint` → the pre-implementation atomic edit is `pnpm task start …`. Keep the
    "why a rule, not a convention" rationale + the SDET enforcement that rejects a missing pre-implementation
    Work Log entry.
  - `PHASES.md § Close-prep` → archival is `pnpm task archive --brief NNN`; pre-close check is `pnpm task verify
    --brief NNN`. Keep the consistency-gate + RETRO/HANDOFF obligations.
  - **`validate-gates.sh` stays the backstop (do not weaken it):** the docs must keep stating a correct hand-edit
    still passes — the CLI is the paved road, not a wall (proposal §4, §10 Q2). Do NOT stamp a CLI provenance
    signature into any file.
- **AC-09 end-to-end test (proposal §5 Phase 1 step 5):** drive a fixture task through the full lifecycle via
  the CLI's exported functions (or a spawned `tsx` process) across the developer and SDET roles, then assert:
  (1) `bash scripts/validate-gates.sh --fixture-dir <tree>` exits 0 / ALL CHECKS PASSED over the mutated tree
  (the INDEPENDENT gate — not `task verify`); (2) the metrics file is populated with the self-reported records
  for each write. This closes the brief Notes' "independent gate / independent oracle" requirement.
- **WORKFLOW-FILE GOVERNANCE (record for Close-prep):** the four doc files are quad-review-governed (ENGINE §
  Main Session Rules). This task DRAFTS the edits as part of the slice's gated deliverable; the IO records the
  quad-review obligation at Close-prep, and the eventual PR carries them through the reviewed lane. This is a
  known engine convention being honored, not an upstream/architectural open question.
- **Out of scope:** any change to field semantics, gate logic, or write-ownership; Phase-2 docs (no
  `state.json`/`events.jsonl` / phase-transition-reflex removal — that is Phase 2).

## Tests to Write First

- [ ] **AC-09 e2e slice:** `start`(role devops)→`log`→`review`→`done`(role sdet)→`archive` over a fixture task — expected: task lands in `tasks/done/`, well-formed
- [ ] After the e2e slice: `bash scripts/validate-gates.sh --fixture-dir <tree>` → exit 0, ALL CHECKS PASSED (independent gate) — expected: green
- [ ] After the e2e slice: `.claude/metrics/` (test-scoped path) holds the self-reported records for each write — expected: populated
- [ ] doc grep: `agents/developer.md` step 1 & 8 reference `pnpm task` AND retain the complexity-estimate/rejection prose — expected: both present
- [ ] doc grep: `sdet.md` atomic-close references `task done --role sdet` AND retains `completed_at`-SDET-authored prose — expected: both present
- [ ] doc grep: `ENGINE.md` Dispatch Checkpoint references `task start` AND retains the atomic-ordering rationale — expected: both present
- [ ] doc grep: `PHASES.md` Close-prep references `task archive`/`task verify` AND retains the consistency-gate prose — expected: both present
- [ ] doc grep: all four docs still state `validate-gates.sh` is the backstop / a correct hand-edit passes — expected: present (no CLI mandate)

## Definition of Done

- [ ] AC-LOE-011-08 satisfied (docs call the CLI as paved road; all contract semantics preserved; backstop intact)
- [ ] AC-LOE-011-09 satisfied (end-to-end CLI-driven slice green via `validate-gates.sh` + metrics populated)
- [ ] Lint + type-check + build pass; `pnpm test` (scripts vitest) green
- [ ] The four workflow-file edits are recorded as carrying the quad-review obligation (noted in Work Log for Close-prep)
- [ ] Authority cited in integration-test comments (CS-GEN-003)

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-21 [sdet] Marking done — APPROVED: AC-09 independent gate (validate-gates.sh --fixture-dir) confirmed non-vacuous; AC-08 docs semantics intact; 172/172 pass; workflow-file quad-review SDET lens applied | What's next: archive | Blockers: none
- 2026-06-21 [devops] Starting implementation — AC-08: 4-doc choreography rewrites; AC-09: e2e CLI-driven slice integration test with validate-gates.sh independent gate + metrics assertion | What's next: create fixture task file + PROGRESS.md for e2e test tree, then write AC-09 test, then do doc rewrites | Blockers: none
- 2026-06-21 [devops] Implementation complete — AC-09: added e2e describe block to scripts/task.test.ts driving TASK-E2E-001 through start→log→review→done→archive via CLI functions; assert validate-gates.sh --fixture-dir exits 0 with ALL CHECKS PASSED (independent gate, not CLI verify); assert 4 metrics records populated with correct status progression; also added cmdBriefContext read-only invariant test. AC-08: rewrote choreography prose in developer.md steps 1&8, sdet.md step 6 & reject path, ENGINE.md § Dispatch Checkpoint, PHASES.md § Close-prep to call pnpm task CLI; all contract semantics preserved (honest-estimate warning, SDET rejection rule, completed_at SDET-authored, validate-gates.sh backstop statement, hand-edit still passes). Created TASK-E2E-001-e2e-slice-fixture.md and PROGRESS-e2e-fixture.md fixture files. Gate results: pnpm lint PASS, pnpm type-check PASS, pnpm build PASS, pnpm test 172/172 PASS (was 170, +2 new), bash scripts/validate-gates.sh ALL CHECKS PASSED. NOTE: the 4 workflow-file edits (developer.md, sdet.md, ENGINE.md, PHASES.md) carry the quad-review obligation (ENGINE § Main Session Rules) — the eventual PR must go through the IO+SDET+Overwatch quad review before merge. CS-GEN-003 honored: governing AC ids and proposal sections cited in test comments. | What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: AC-09 independent gate confirmed non-vacuous (validate-gates.sh --fixture-dir exits 1 on deliberately corrupted fixture; exits 0 on well-formed CLI-driven slice). AC-08 all four workflow docs: CLI call replaces choreography prose only; all contract semantics preserved; paved-road escape (hand-edit still passes) present in every file. 172/172 tests pass. Workflow-file quad-review SDET lens applied (both workflow-content and model-behavior). ADVISORY: sdet.md step 6 overstates cmdDone's scope — CLI delivers 3 of the 5 close steps (status/completed_at/breadcrumb); SDET Review checkbox and Decision section require a manual follow-up edit after running the CLI. IO to amend sdet.md at Close-prep or extend CLI to cover all 5 steps. Raised as a non-blocking Close-prep item.

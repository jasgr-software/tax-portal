# RETRO-LOE-013 — Cross-layer removal-sweep gate

> Slice retro for `BRIEF-LOE-013`. Engine/CI-tooling chore, epic `chore/lights-out-enablement`.
> Branch: `brief-LOE-013-removal-sweep-gate`. `brief_type: quality`, `brief_deploys: no`.
> **Headline:** this gate operationalizes the BRIEF-LOE-012 PR #80 lesson — the orphan-after-removal failure
> (a removed artifact whose cross-layer executable consumer was never re-pointed) is now caught at **task-time**
> by `validate-gates.sh` check 10, instead of slipping to **review-time** where only the `/pr-review` panel
> caught it. **Closes retro-012-017.**

## What shipped

- **`scripts/validate-gates.sh` check 10 (`check_removed_artifact_orphans`)** — 316 lines added, **0 deleted**;
  checks 1–9 untouched (check 8 byte-identical, MD5 `ba4ef4fb…`). Diff-based, un-forgettable detection
  (`git diff --diff-filter=D -M --name-only <base>...HEAD`, rename-aware); fixture-mode `.removed_files`
  manifest mirroring the checks-4/8 `.changed_files` harness; SKIP-not-FAIL when no diff base / empty removal
  set; classify-don't-guess (executable file-type → FAIL naming `path:line`; `.md`-only → ALLOWED by rule);
  reason-mandatory allowlist; `--removed-files` CLI flag for fixture/PR-context override; `set -euo pipefail`
  preserved with `git grep` exit-1-on-no-match guarded; zero new npm dependency.
- **`.implementation/removal-sweep-allow.txt`** — the committed allowlist (6 entries), each binding
  removed-artifact + consumer-path + a mandatory free-text reason; an empty reason is itself a gate FAILURE.
- **6 fixtures** under `scripts/__test_fixtures__/validate-gates/` — red (constructed-path consumer),
  allowlisted, doc-only, missing-reason, skip, basename-safe.
- **`scripts/validate-gates.test.ts` Suite 8** — 8 new tests (now 47/47 total; 292/292 across `scripts/`).
- **`.implementation/ENGINE.md` § Removal Sweep** — the standing rule binding every removal task across EVERY
  layer (`.implementation/`/`.orchestration/`/`.planning/`/`apps/`/`packages/`/`scripts/`/`.github/`…), naming
  the as-implemented check + allowlist exactly; states it closes retro-012-017. (Workflow-file edit.)

## 6-AC ↔ task ↔ evidence map

| AC | Task | Evidence |
| --- | --- | --- |
| AC-LOE-013-01 (diff-based detect + fixture manifest + SKIP) | TASK-001 | check 10 @ `validate-gates.sh:761`; real tree → `SKIP (no removed files in diff)`; skip fixture → clean SKIP |
| AC-LOE-013-02 (sweep + classify exec-fail/doc-allow) | TASK-001 | red fixture → exit 1 names `.fixture-consumer.sh:21`; doc-only fixture → PASS; basename-safe fixture → PASS (no explosion) |
| AC-LOE-013-03 (reason-mandatory allowlist) | TASK-001 | allowlisted fixture → PASS+reason; missing-reason fixture → FAIL |
| AC-LOE-013-04 (main stays green) | TASK-001 | `--removed-files <PROGRESS.md>` over real tree → **exit 0, ALL CHECKS PASSED**, 14 allowlisted hits echoed |
| AC-LOE-013-05 (Gate Authoring 3 items + PR #80 red fixture) | TASK-001 | Work Log Items 1–3; counterfactual exit 1 names consumer; SDET reproduced independently |
| AC-LOE-013-06 (standing rule; checks 1–9 untouched) | TASK-002 | ENGINE.md § Removal Sweep; check 8 MD5 identical; 316 add / 0 del |

## Two SDET-adjudicated judgment calls

1. **Path-primary ONLY (basename signal dropped entirely) → ACCEPTABLE.** The brief asked for
   "path-primary, basename secondary/noise-bounded." The developer dropped the basename signal outright,
   documenting a `// DECISION:` at `validate-gates.sh:735` with an explicit false-negative acknowledgment.
   SDET adjudication: acceptable for the documented failure mode — `git grep -F` on the repo-relative path
   catches the literal suffix whether raw or inside a constructed-path/variable-expansion form
   (`${REPO_ROOT}/.implementation/tasks/PROGRESS.md`), which IS the canonical PR #80 pattern. A pure
   basename-only reference (`PROGRESS.md` with no path context) is a known, documented false-negative; the
   alternative (basename-secondary) risks catastrophic false-positive explosion for common names
   (`index.ts`, `page.tsx`). Path-primary-only is the right call; the tradeoff is documented, not hand-waved.
2. **Self-referential allowlist entries (the gate bootstrapping itself) → ACCEPTABLE with noted smell.**
   The gate's own source (`validate-gates.sh` self-doc comments) and test file (`validate-gates.test.ts`
   test-input strings) reference the canonical removed path and so appear as executable hits — allowlisted
   with legitimate non-empty reasons. SDET declined to widen the exclusion set: adding `scripts/` or
   `*.test.ts` to the exclusions would create a *new silent-suppression class* with no documented reason —
   worse than explicit reasoned entries. A one-time bootstrapping artifact, to watch as real removals
   accumulate. **Carried forward as retro-013-001** (the ratio watch).

## Gate scorecard

| # | Gate | Verdict | Detail |
| --- | --- | --- | --- |
| 1 | Per-task submission gates | **PASS** (2/2) | both tasks `done`, gate boxes ticked, Work Log evidence present |
| 2 | SDET Review | **PASS** (2/2 approved) | both approved; Gate Authoring 3 items verified; counterfactual independently reproduced |
| 3 | Overwatch Audit | **PASS** | engine-tooling slice; no scope creep (316 add / 0 del, no product code); audit folded into Review (no risk signals) |
| 4 | IO Design scan | **PASS** | diff adds check 10 only; checks 1–9 untouched (check 8 MD5 identical); diff-based/un-forgettable; classify-don't-guess; allowlist only ADDS reason-bearing suppressions; SKIP-not-FAIL; file-level scope boundary noted in-code; zero new dep |
| 5 | Container Smoke | **PASS** | engine tooling, no container — the independent gate over real tree + the red counterfactual fixture is this slice's deploy-layer proof: real tree → ALL CHECKS PASSED; red fixture → exit 1 names consumer; AC-04 → exit 0 |
| 6 | SDET Acceptance-validation | **PASS** (6/6 AC) | every AC-LOE-013-01..06 traced to a passing test/evidence (see map above) |
| 7 | SDET CI gate | **PASS** | lint ✓ type-check ✓ build ✓; validate-gates.test.ts 47/47; scripts/ 292/292 |
| 8 | Post-merge CI | **GREEN** | `da285f3`: CI run 27975425885 success + CodeQL 27975421131 success; required checks (lint-and-typecheck, security-scan, test-portal, test-admin) pass; validate-gates.sh on merged main ALL CHECKS PASSED (check 10 SKIP — no removals). See Post-Merge Addendum. |
| 9 | Post-merge staging smoke | **N/A** | `brief_deploys: no` |

## Design-scan verdict

**PASS.** The integrated working-tree diff (`.implementation/ENGINE.md`, `state.json`,
`scripts/validate-gates.sh`, `scripts/validate-gates.test.ts` + 6 untracked fixtures + the allowlist + 2 task
files) honors the brief and its constraints: the gate ADDS check 10 and touches nothing in checks 1–9
(check 8 byte-verified); detection is diff-based and un-forgettable (not task-declared); the verdict is
deterministic (file-type + explicit allowlist, no intent heuristics); the allowlist only ADDS reason-bearing
suppressions; the check SKIPs (never falsely PASSes or hard-errors) when no diff base exists; the file-level
scope boundary is noted in-code so the next person knows it is deliberate; zero new npm dependency; no
product-code creep. No fix-forward task required.

## Retro findings (classified)

Per ENGINE.md § Retro Finding Classification, only concrete quality-gate failures clear the promotion bar.
**There were zero gate failures this slice** — both judgment calls were adjudicated ACCEPTABLE, all gates
passed on first verification. The findings below are **observations** (no action item, no rule change) carried
in `state.json openRetroItems` for visibility:

- **retro-013-001 (gate-design, observation):** self-referential allowlist-ratio watch — if the
  non-orphan/self-referential allowlist ratio worsens as real removals accumulate, revisit widening the
  exclusion set (with a documented rationale, since exclusions are a silent-suppression class). One-time
  bootstrapping artifact; ACCEPTABLE now.
- **retro-013-002 (observation):** file-level-only scope boundary — symbol/section/field-level removal
  detection is a deliberate deferred extension, documented in-code (`validate-gates.sh:704-707`) and in
  ENGINE.md. Tracked so a future symbol-orphan incident has a recorded starting point.

**retro-012-017 → RESOLVED** by this slice (re-categorized `acknowledged` in `state.json`, resolution recorded
in its note). The gate + the ENGINE standing rule together make the cross-layer-orphan failure un-silent.

## Rule sunset (ENGINE.md § Rule Sunset)

Carried sunset candidate **retro-012-009** (Autonomy Ceiling item 2 `--no-verify` clause + the
`PushNotification` spam-loop guard, untriggered 3+ slices) was not exercised this slice either. **Recommendation:
keep** — both are low-cost safety rails guarding credential/automation hazards that have not yet occurred
*because* the rails exist; this is an engine-tooling slice that did not stress them. Re-surface at the next
feature slice's retro.

## Notes

- This slice ran the full IO lifecycle with the **state store** (`state.json` + `events.jsonl`) as the ledger —
  PROGRESS.md is retired (not recreated). Phase transition to Close-prep recorded via `pnpm task
  phase-transition`; the independent oracle `validateState()` (check 3) caught two schema violations during the
  retro-item edit (a non-enum `category` and `additionalProperties` fields) — exactly the
  validate-with-the-real-parser discipline from RETRO-LOE-010. Fixed within the schema; gate green.
- The slice closing PR's awaiting-merge record (with the four `gateVerdicts` slots) is created at
  Close-finalize / PR-open via `pnpm task merge-checkpoint`, which DERIVES the PR URL + squash SHA from
  gh/git — not fabricated at Close-prep. Gates 1–7 PASS are recorded here in the scorecard.

## Post-review refinement (retro-013-001 fix)

**Concern addressed:** retro-013-001 (self-referential allowlist — 6 of 10 entries were test scaffolding).

**Root-cause fix applied to PR #83:** the allowlist grew to 10 entries because the real-tree `git grep` had
no exclusions for test infrastructure. The fix adds two pathspec exclusions to the real-repo `git grep`
branch ONLY (NOT the fixture-mode `grep -rn` branch, where `scripts/__test_fixtures__/` IS the scan
target):

1. `':!scripts/__test_fixtures__'` — test fixtures are test DATA for the gate, not live consumers.
2. `':!*.test.ts' ':!*.spec.ts'` — test files reference removed paths as string literals; a real removal
   that breaks a test surfaces at test-time, not via this gate.

Additionally, the `validate-gates.sh` self-doc comment examples that used the literal removed-artifact path
(`.implementation/tasks/PROGRESS.md`) were reworded to use a generic placeholder (`<removed-artifact-path>`),
eliminating that source of self-referential hits.

**Allowlist pruned: 10 entries → 4 genuine `.orchestration/` retentions** (the `orchestrate-state.sh`,
`orchestrate-gates.sh`, `sequence.sh`, `sequence.test.sh` backward-compat no-op entries). These are real
cross-layer consumers; they remain in the allowlist.

**AC-04 re-verified:** `bash scripts/validate-gates.sh --removed-files <PROGRESS.md>` → ALL CHECKS PASSED;
allowlisted echoes show ONLY the 4 genuine `.orchestration/` entries. No test scaffolding in the echoed output.

**Fixture-mode invariant preserved:** all 7 removal-sweep fixtures produce identical verdicts — `removal-sweep-red`
still exits 1 and names the consumer; `removal-sweep-colon-path` still names `weird:name.sh`. The exclusions
are strictly scoped to the real-repo `git grep` branch and cannot leak into fixture mode.

**Tests:** 293/293 pass (scripts/ suite). Check 8 byte-unchanged confirmed.

## Post-Merge Addendum (Close-finalize 2026-06-22)

> PR **#83** squash-merged to `main` as **`da285f3`** (`feat(tooling): BRIEF-LOE-013 — cross-layer
> removal-sweep gate (validate-gates.sh check 10), closes retro-012-017 (#83)`), branch deleted.

### Reviewed-lane outcome (application-code lane — `scripts/` is gated)

- **Standards-review audit → APPROVE** (0 violations). The audit machine-proposed an **experimental
  `CS-INFRA-006`** ("gate check SKIP-not-FAIL on optional input" — the discipline that lets check 10 and
  check 8 SKIP cleanly when their input is absent rather than FAIL or falsely PASS) and **left it unratified
  and uncommitted** at `.code-standards/standards/infra/CS-INFRA-006-gate-check-skip-not-fail-on-optional-input.md`
  (untracked). Per `.code-standards/` governance (machine proposes `by: agent` / human ratifies `by: user`)
  it stays unratified — tracked as **retro-013-003**. Not ratified at finalize.
- **`/pr-review` panel → advisory APPROVE** (0 blocker / 0 major; **2 minor + 3 nit**). The lead
  **empirically reproduced the colon-in-path false-negative** in the check's path parse.
- **`/pr-fix` (commit `b5a7733`)** fixed the 2 minors (colon-safe path parse + dead `_exec_exts`) and the
  option-injection nit, added a `weird:name.sh` regression fixture, and resolved 3 review threads.
- **Post-review allowlist-hygiene refinement (commit `b442a9e`, user-directed).** The `/pr-fix` had grown
  the allowlist to **10 entries (6 self-referential)** to pass AC-04 by allowlisting the gate's OWN test
  scaffolding. The refinement: (1) excluded `scripts/__test_fixtures__/` + `*.test.ts`/`*.spec.ts` from the
  **REAL-tree sweep ONLY** (fixture mode untouched — red fixtures still red); (2) reworded the self-doc
  comments to a generic `<removed-artifact-path>` placeholder; (3) pruned the allowlist back to the **4
  genuine `.orchestration/` retentions** only (the legacy `--progress-md` no-op flag in
  `orchestrate-state.sh` / `orchestrate-gates.sh` / `sequence.sh` / `sequence.test.sh`). **Why it matters:**
  the allowlist now means "intentional cross-layer retentions," **not** a test-scaffolding dumping ground —
  every remaining entry is a real consumer with a real reason. 48/48 + 293/293 tests, CI green. This is the
  source fix for **retro-013-001** (re-categorized `acknowledged` / resolved).

### Gate 8 — Post-merge CI — **GREEN**

- Merge commit `da285f3`. CI run **`27975425885`** = completed/**success**; CodeQL run **`27975421131`** =
  completed/**success** — both on `da285f3`.
- Required checks on PR #83 all `pass`: `lint-and-typecheck`, `security-scan`, `test-portal`, `test-admin`.
- `bash scripts/validate-gates.sh` on merged `main` → **ALL CHECKS PASSED (0 failures)**; check 10
  (`check_removed_artifact_orphans`) **SKIPs cleanly** (no removed files in the push diff — nothing to sweep),
  which is the gate's own SKIP-not-FAIL discipline working on the slice that introduced it.

### Gate 9 — Post-merge staging smoke — **N/A** (`brief_deploys: no`).

### Post-merge triage — **CLEAN**

Zero `BUG-LOE-013-POST-*` files; CI green. No post-merge defects.

### State-store finalize (dogfooded the new commands)

The Close-finalize ledger writes used the new BRIEF-LOE-012 state-store commands (each previewed `--dry-run`
first): `pnpm task phase-transition --to Close-finalize`; `pnpm task merge-checkpoint --pr 83` (DERIVED the
PR URL + squash SHA `da285f3` from gh/git — not agent-typed — with the four `gateVerdicts` slots recorded as
agent-supplied inputs: gates 1–7 PASS, gate 8 GREEN, gate 9 N/A); `pnpm task post-merge --pr 83` (PASS branch
→ awaiting-merge record **cleared**). After the writes: `validate-gates.sh` stays **green** over the mutated
`state.json` (check 3 schema PASS, check 9 awaiting-merge PASS); `pnpm task report --md` renders the finalized
slice with **`## Awaiting PR merge — _None active._`**.

### Headline lesson

**The gate built to catch orphan-after-removal had to avoid sweeping its OWN test fixtures.** The fix was a
**real-tree-vs-fixture-mode sweep-scope distinction** — the real-repo `git grep` branch excludes the test
harness by pathspec, while fixture mode (where the harness IS the scan target) is untouched. The
`/pr-review` panel (which reproduced the colon false-negative) **and** the user-directed allowlist-hygiene
refinement together kept the allowlist meaningful: it is a registry of intentional cross-layer retentions,
not a suppression dumping ground. This **closes the retro-012-017 loop** (the BRIEF-LOE-012 cross-layer
orphan-after-removal MAJOR is now an un-forgettable task-time gate) **and demonstrates the new gate working
cleanly on its own slice's merge** (check 10 SKIP on no-removal diff).

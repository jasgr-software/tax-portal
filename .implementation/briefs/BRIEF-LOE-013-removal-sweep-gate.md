---
id: BRIEF-LOE-013
title: Cross-layer removal-sweep gate — catch orphaned consumers of a removed artifact at task-time
status: ready
acceptance_criteria:
  - id: AC-LOE-013-01
    text: "`scripts/validate-gates.sh` gains a new check (`check_removed_artifact_orphans`, Check 10) that detects files REMOVED on the branch via `git diff --diff-filter=D -M --name-only <base>...HEAD` (rename-aware via `-M`, so a moved file is NOT a false removal). It resolves the diff base the same way the existing changed-files checks do (checks 4 & 8), and in fixture mode reads the removed-files list from a `.removed_files` manifest under `$FIXTURE_DIR` (mirroring the existing `.changed_files` harness). When no diff base / removal set is resolvable (e.g. a plain push with no PR context), the check SKIPs cleanly with a clear message — mirroring check 8's `SKIP (--pr-body not supplied)` behavior — never a false PASS or a hard error."
  - id: AC-LOE-013-02
    text: "For each removed file, the check sweeps the POST-removal tree for live references (the repo-relative path is the primary, precise signal; the basename is a secondary signal) via `git grep`, and CLASSIFIES each hit by consumer type. A reference in an EXECUTABLE consumer (`.sh`, `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.py`, `.yml`, `.yaml`, and `package.json`) is a candidate ORPHAN and FAILS the gate loudly, naming the consumer `path:line`. A reference that survives ONLY in documentation (`.md`) is ALLOWED (historical pointers in RETRO/HANDOFF/archive are legitimate and permanent). The removed file's own path, `.git/`, `node_modules/`, and the test-fixtures dir are excluded from the sweep."
  - id: AC-LOE-013-03
    text: "An allowlist manifest (`.implementation/removal-sweep-allow.txt`, committed) lets a removal task declare an INTENTIONAL retained executable reference. Each entry binds a removed artifact + a consumer path + a MANDATORY free-text reason. An executable hit that matches an allowlist entry is downgraded to PASS with its reason echoed in the check output; a non-allowlisted executable hit FAILS. An allowlist entry missing its reason is itself a gate FAILURE — an allowlist entry is a documented decision, never a silent suppression (the judgment-line ethos: the suppression is an agent input, recorded with its rationale)."
  - id: AC-LOE-013-04
    text: "Introducing the gate does NOT red the current `main`. The intentional retained `.orchestration/` references to the already-removed `PROGRESS.md` (the legacy `--progress-md` no-op flag + `PROGRESS_MD` var in `orchestrate-state.sh` / `orchestrate-gates.sh`, kept by `/pr-fix babeaf0` with an explicit 'no longer reads it' comment) are reconciled — either allowlisted with a reason, or confirmed doc-only — so `bash scripts/validate-gates.sh` over real `main` (with `PROGRESS.md` in the removed set) is ALL CHECKS PASSED. This is the proof the classification + allowlist correctly separate live orphans from intentional/historical references."
  - id: AC-LOE-013-05
    text: "Gate Authoring Rules (the check is a new required gate → `introduces_gate: yes`): the Work Log carries the three evidence items — (1) a green run of the named check over the real tree, (2) the named code path the gate catches (an executable consumer of a removed file), and (3) a COUNTERFACTUAL fixture that REDs the gate. The canonical red fixture reproduces the BRIEF-LOE-012 PR #80 failure: a removed file (e.g. a stand-in `PROGRESS.md`) with an un-repointed `.sh` consumer still reading it → the gate exits non-zero and names the consumer. A sibling fixture where the only surviving references are docs OR allowlisted → PASS."
  - id: AC-LOE-013-06
    text: "The removal-sweep obligation is documented as a standing rule: ENGINE.md (and/or the removal-task Definition-of-Done guidance) states that any task REMOVING a shared artifact (a file) must pass `check_removed_artifact_orphans`, re-point every executable consumer across EVERY layer (not just the owning layer's docs), and record any intentional retained reference in `removal-sweep-allow.txt` with a reason. This closes retro-012-017. The check is part of the same `validate-gates.sh` run CI already invokes (no separate CI wiring needed); it does not touch checks 1–9 (check 8 especially stays byte-unchanged)."
methodology:
  tdd: optional
  acceptance_format: prose
  e2e: optional
  coverage_target: none
  extra_gates:
    - "the gate must separate LIVE executable consumers (fail) from intentional/historical references (allow) with near-zero false positives over the real main — proven by AC-04 (main stays green); a gate that reds legitimate historical .md pointers is unusable and is a rejection"
    - "the sweep token strategy must catch the BRIEF-LOE-012 PR #80 failure mode (a constructed-path consumer like `${REPO_ROOT}/.implementation/tasks/PROGRESS.md`) — the canonical red fixture must reproduce it (AC-05); a strategy that misses a constructed-path string reference is a rejection"
    - "common-basename safety: removing a commonly-named file (e.g. `index.ts`) must NOT explode into thousands of basename false-positives — the path-primary/basename-secondary design (or an equivalent guard) must keep the basename signal from drowning the check; the SDET reviews the false-positive/false-negative balance explicitly"
    - "validate-gates.sh stays green over any fixture tree, and the new check runs in both real-tree and fixture mode under the existing harness (same run/report plumbing as checks 1–9)"
source:
  - "retro item: .implementation/state.json openRetroItems[retro-012-017] (gate-design — the BRIEF-LOE-012 /pr-review panel MAJOR, orphan-after-removal; the recommendation to add a repo-wide removal-sweep gate)"
  - "precedent: scripts/validate-gates.sh checks 4 (check_gated_path_accountability) + 8 (check_pr_body_quad_review) — the existing changed-files manifest + diff-base + SKIP harness this check mirrors"
  - "the originating failure: RETRO-LOE-012.md Post-Merge Addendum (the two .orchestration/ live consumers — orchestrate-state.sh do_derive_pr, orchestrate-gates.sh gate_engine_clear via sequence.sh — that the in-task sweep missed and /pr-fix babeaf0 re-pointed)"
code_standards:
  - "CS-INFRA-003 (required) — any new/edited shell script carries `set -euo pipefail` (validate-gates.sh already does; preserve it)"
  - "CS-INFRA-004 (recommended) — zero new runtime npm dependency; the check is pure bash + git, no new tooling"
  - "CS-GEN-003 (recommended) — cite the governing authority (retro-012-017 / this brief) in the check + test comments"
---

# BRIEF-LOE-013 — Cross-layer removal-sweep gate

> Engine/CI-tooling chore (epic `chore/lights-out-enablement`). A focused gate-design follow-up that closes
> **retro-012-017**, the gate-design action item carried out of BRIEF-LOE-012. The BRIEF-LOE-012 `/pr-review`
> panel caught a MAJOR the in-task gates missed: the PROGRESS.md doc-retirement sweep was scoped to the 5
> `.implementation/` docs the owning task knew about, but `PROGRESS.md` had **live `.orchestration/` consumers**
> (`orchestrate-state.sh do_derive_pr`, `orchestrate-gates.sh gate_engine_clear` via `sequence.sh`) that still
> hard-read the deleted file. The owning layer's docs were swept; the cross-layer executable consumers were not.
> This brief adds the gate that would have caught it at task-time instead of review-time.

## Scope

Add **one new check** to `scripts/validate-gates.sh` — `check_removed_artifact_orphans` (Check 10) — plus its
fixtures, its allowlist mechanism, and the standing-rule documentation:

1. **Detect removals (diff-based — the chosen detection model).** From the branch diff (`git diff
   --diff-filter=D -M --name-only <base>...HEAD`, rename-aware), compute the set of files removed on this branch.
   Resolve `<base>` the way checks 4 & 8 already resolve changed files; in fixture mode read a `.removed_files`
   manifest under `$FIXTURE_DIR` (mirror the `.changed_files` pattern). SKIP cleanly when no base/removal set is
   resolvable (mirror check 8's SKIP). **Diff-based, not task-declared** — the whole point is to catch what a
   task FORGOT to sweep, so detection cannot itself depend on the task declaring the removal.
2. **Sweep + classify.** For each removed file, `git grep` the post-removal tree for live references
   (repo-relative path = primary/precise; basename = secondary). Classify hits: executable consumers
   (`.sh`/`.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`/`.py`/`.yml`/`.yaml`/`package.json`) → candidate orphan → **FAIL**,
   naming `path:line`; doc-only references (`.md`) → **ALLOWED** (historical pointers are legitimate and
   permanent). Exclude the removed file itself, `.git/`, `node_modules/`, and the fixtures dir.
3. **Allowlist escape hatch.** `.implementation/removal-sweep-allow.txt` (committed) — each entry = removed
   artifact + consumer path + a **mandatory reason**. An allowlisted executable hit → PASS (reason echoed); a
   non-allowlisted executable hit → FAIL; an allowlist entry with no reason → FAIL. The allowlist is how a
   removal legitimately retains an executable reference (e.g. the `.orchestration/` legacy `--progress-md`
   no-op flag) without disabling the gate.
4. **Reconcile current `main` (AC-04).** Add `PROGRESS.md` to the canonical removed set in a fixture (or run the
   check over real main with PROGRESS.md treated as removed) and confirm the gate is GREEN — the intentional
   `.orchestration/` retained references are allowlisted-with-reason or confirmed doc-only. This is the live
   proof the live-vs-historical classification works.
5. **Document the standing rule (AC-06).** ENGINE.md / removal-task DoD: any task removing a shared artifact
   must pass this check, re-point cross-layer executable consumers, and allowlist intentional retentions with a
   reason.
6. **Fixtures** under `scripts/__test_fixtures__/` + tests in `scripts/validate-gates.test.ts`: the red
   counterfactual (removed file + live `.sh` consumer), the allowlisted-PASS case, the doc-only-PASS case, and
   the SKIP case.

## Out of scope

- **Symbol/section/field-level removal detection.** This gate is **file-level** (the documented PR #80 failure
  mode was a file deletion, and file deletes are deterministic + low-noise). Removed exported symbols, doc
  sections, or config keys are a deliberate future extension, not this slice. Note the boundary in the check
  comment so the next person knows file-level is intentional, not an oversight.
- **`validate-gates.sh` checks 1–9** — do not modify them. **Check 8 (`check_pr_body_quad_review`) stays
  byte-unchanged.** This brief ADDS check 10; it re-points nothing.
- **Auto-fixing orphans.** The gate detects and fails; re-pointing the consumer is the removing task's job
  (as `/pr-fix babeaf0` did for PR #80). The CLI records/detects; it never silently rewrites a consumer.
- Application/product code (`apps/**`, `packages/**`, `prisma/**`, `db/**`).

## Acceptance criteria

- **AC-LOE-013-01..06** — as in the front-matter block above (diff-based detection with fixture manifest + SKIP;
  sweep-and-classify with executable-fail / doc-allow; the reason-mandatory allowlist; current main stays green;
  the Gate Authoring three-evidence-items with the PR #80 red fixture; the standing-rule documentation closing
  retro-012-017).

## Methodology & quality requirements

- Test against `scripts/__test_fixtures__/` with the existing `validate-gates.test.ts` harness. Cover, at minimum:
  the red counterfactual (removed file with a live `.sh` consumer → non-zero, names it); allowlisted-PASS; an
  entry-missing-reason → FAIL; doc-only-reference → PASS; the SKIP-on-no-base case; and AC-04 (main green).
- **Gate Authoring Rules (HARD, `introduces_gate: yes`).** The Work Log MUST carry the three evidence items
  (green run + named check step; the named code path the gate catches; the counterfactual that reds it). The
  canonical counterfactual reproduces the PR #80 orphan (a constructed-path consumer reading a removed file).
- **False-positive discipline (HARD extra gate).** The gate must not red legitimate historical `.md` references
  or the intentional `.orchestration/` retentions (AC-04). The SDET reviews the false-positive/false-negative
  balance explicitly — including the common-basename explosion risk (deleting `index.ts` must not flag thousands).
- `validate-gates.sh` green over any fixture tree it runs against; the new check uses the same run/report
  plumbing as checks 1–9. No e2e (engine tooling, no UI).

## Constraints

- **Detection cannot depend on task self-declaration.** The removal set comes from the git diff, not a task
  field — a task that forgets to declare a removal is the exact failure being fixed; the gate must be
  un-forgettable. The allowlist is the only declared input, and it only ADDS suppressions (each with a reason),
  never gates which removals are checked.
- **Classify, don't guess.** Live-consumer vs historical-pointer is decided by file-type classification +
  the explicit allowlist, not by heuristics about intent. A `.md` hit is allowed by rule; an executable hit is
  failed unless allowlisted-with-reason. This keeps the verdict deterministic and reviewable.
- **Zero new runtime npm dependency (CS-INFRA-004).** Pure bash + `git grep` + `git diff`. `set -euo pipefail`
  preserved (CS-INFRA-003, required). Cite retro-012-017 / this brief at the check + test (CS-GEN-003).
- **The gate is advisory-to-the-author, enforced-at-CI.** It runs inside the existing `validate-gates.sh` CI
  invocation; adding check 10 is sufficient wiring. Confirm it degrades to SKIP (not FAIL) where no diff base
  exists so a plain push to main does not spuriously red.

## Code standards

- **CS-INFRA-003** (`required`) — preserve `set -euo pipefail` in `validate-gates.sh`.
- **CS-INFRA-004** (`recommended`) — no new runtime dependency; bash + git only.
- **CS-GEN-003** (`recommended`) — cite retro-012-017 / this brief in the check + test comments.

## References

- `retro-012-017` in `.implementation/state.json` (`openRetroItems`) — the originating gate-design item.
- `RETRO-LOE-012.md` § Post-Merge Addendum — the PR #80 orphan-after-removal MAJOR, the two `.orchestration/`
  consumers, and the `/pr-fix babeaf0` re-point (the failure this gate prevents from recurring).
- `scripts/validate-gates.sh` checks 4 (`check_gated_path_accountability`) + 8 (`check_pr_body_quad_review`) —
  the existing changed-files manifest + diff-base + SKIP harness to mirror; and the `$FIXTURE_DIR` / `.changed_files`
  fixture convention.
- `.orchestration/bin/orchestrate-state.sh` + `orchestrate-gates.sh` — the post-`/pr-fix` state carrying the
  intentional retained `--progress-md` / `PROGRESS_MD` references that AC-04 must reconcile (allowlist-with-reason
  or doc-only).

## Notes

- **Suggested decomposition (the IO owns the final split)** under `TASK-LOE-013-*`, epic
  `chore/lights-out-enablement`, `Assigned to: devops`, SDET-reviewed, reviewed merge lane. Likely **one task**
  (the check + allowlist + fixtures + Gate Authoring evidence + AC-04 reconciliation + the ENGINE rule) — it is
  cohesive and the allowlist/classification/fixtures are interdependent. The IO may split the ENGINE
  standing-rule doc edit into a second task if it prefers to isolate the workflow-file change.
- **Reviewed-lane reminder.** This edits `scripts/validate-gates.sh` (application-code scope → reviewed lane:
  Standards audit → `/pr-review` → fix → resolve threads). If it also edits `ENGINE.md` (a quad-review workflow
  file) for the standing rule (AC-06), that adds the **user-LGTM gate** (Autonomy Ceiling 3(c)) → MUST NOT
  auto-merge. The IO/SDET flag this at Close-prep.
- **The analogous trap for THIS slice** (the lesson Phases 0–2 keep teaching): the gate's own
  validation being a lenient re-impl of its sweep. Make the red fixture a REAL un-repointed consumer that the
  check actually fails on (exit non-zero, names the consumer) — not a self-satisfied assertion that the sweep
  ran. The counterfactual must red the gate, per the Gate Authoring Rules.
- **Common-basename guard.** Call out (and test) the deleting-`index.ts`-style case: a path-primary sweep with a
  noise-bounded basename signal, so a commonly-named removal does not produce a wall of false positives. The SDET
  must see this addressed, not hand-waved.

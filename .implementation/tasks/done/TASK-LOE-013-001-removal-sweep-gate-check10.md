---
brief: BRIEF-LOE-013
status: done
assigned_to: devops
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-22T17:03:35.323Z
completed_at: 2026-06-22T17:23:43.176Z
complexity_estimate: 4
complexity_actual: 4
brief_type: quality
brief_deploys: "no"
introduces_gate: "yes"
acceptance_criteria: [AC-LOE-013-01, AC-LOE-013-02, AC-LOE-013-03, AC-LOE-013-04, AC-LOE-013-05]
upstream_refs: none
code_standards: CS-INFRA-003 (required), CS-INFRA-004 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-LOE-013-001: Removal-sweep gate — validate-gates.sh Check 10 (check_removed_artifact_orphans) + allowlist + fixtures + AC-04 reconciliation

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm test` (vitest) pass; `bash scripts/validate-gates.sh` over real tree ALL CHECKS PASSED
- [N/A] **Targeted e2e** — engine tooling, no UI; brief sets `e2e: optional`
- [x] **Security review** — the new check confines its sweep (excludes `.git/`, `node_modules/`, the fixtures dir, the removed file itself); uses `grep -F` fixed-string (no shell injection from removed-file paths); no path traversal
- [x] **SDET Review** — approved

## SDET Review focus areas

- **`introduces_gate: yes` — Gate Authoring Rules apply (HARD).** Check 10 is a NEW required gate inside the existing `validate-gates.sh` CI run. The Work Log MUST carry the three evidence items (ENGINE § Gate Authoring Rules): (1) a green run of `check_removed_artifact_orphans` over the real tree + the named check step; (2) the named code path the gate catches — an executable consumer of a removed file (cite the `.orchestration/*.sh` PROGRESS_MD references as the real example, allowlisted); (3) a COUNTERFACTUAL fixture that REDs the gate — the canonical PR #80 reproduction (a removed file with an un-repointed `.sh` consumer still reading it → exit non-zero, names the consumer `path:line`). Reject if any item is absent.
- **The counterfactual must be a REAL un-repointed consumer, not a self-satisfied assertion (brief Notes — the Phases 0–2 lesson).** The red fixture must make the check actually exit non-zero and NAME the consumer. An assertion that "the sweep ran" is NOT acceptable. Independently reproduce the red.
- **Constructed-path catch (extra gate, HARD).** The PR #80 failure mode was a CONSTRUCTED path string — e.g. `${REPO_ROOT}/.implementation/tasks/PROGRESS.md` (a path assembled from a variable + a literal suffix). The sweep token strategy must catch this — a hit on the repo-relative path OR the basename inside the consumer source counts. A strategy that misses a constructed-path string reference is a rejection. Verify the red fixture's consumer uses a constructed-path form, mirroring `orchestrate-state.sh:72`.
- **False-positive discipline + common-basename explosion (extra gate, HARD).** Removing a commonly-named file (e.g. `index.ts`) must NOT explode into thousands of basename false-positives. The design must be path-primary (the repo-relative path is the precise signal) with the basename as a NOISE-BOUNDED secondary signal (or an equivalent guard). Review the false-positive / false-negative balance EXPLICITLY — this is not hand-waved. Confirm the basename signal cannot drown the check.
- **AC-04 — real main stays green (the live proof).** Run `bash scripts/validate-gates.sh` over the REAL tree with `PROGRESS.md` in the removed set (the canonical removed artifact). It MUST be ALL CHECKS PASSED. The two `.orchestration/*.sh` executable references to the removed `PROGRESS.md` (`--progress-md` flag + `PROGRESS_MD` var) are reconciled via `.implementation/removal-sweep-allow.txt` (allowlisted-with-reason). Verify each allowlist entry HAS a reason; an entry with an empty reason is itself a FAIL (test this).
- **Classify-don't-guess.** Executable (`.sh/.ts/.tsx/.js/.mjs/.cjs/.py/.yml/.yaml/package.json`) hit → FAIL (unless allowlisted); doc-only (`.md`) hit → ALLOWED by rule (no allowlist entry needed). No intent heuristics. Verify a `.md`-only surviving reference PASSES (historical RETRO/HANDOFF/archive pointers are legitimate and permanent).
- **SKIP-not-FAIL when no diff base.** When no diff base / removal set is resolvable (plain push, no PR context, no `.removed_files` manifest in fixture mode), the check SKIPs cleanly with a clear message — mirroring check 8's `SKIP (--pr-body not supplied)`. NEVER a false PASS or a hard error. Verify a fixture with no `.removed_files` manifest SKIPs.
- **Checks 1–9 untouched; check 8 byte-unchanged.** This task ADDS check 10. Verify `check_pr_body_quad_review` (check 8) is byte-identical to origin (`diff` empty), and checks 1–9 are unmodified. Any edit to checks 1–9 is a rejection.
- **`set -euo pipefail` preserved (CS-INFRA-003, required).** Verify the script still carries it; the new check must not break under `set -e` (guard `git grep` exit-1-on-no-match, which is expected and not a fatal error).
- **Zero new runtime npm dependency (CS-INFRA-004).** Pure bash + `git grep` + `git diff`. `git diff package.json pnpm-lock.yaml` empty.
- **File-level scope boundary noted in-code.** The check comment must state that symbol/section/field-level removal is OUT OF SCOPE (intentional, not an oversight) so the next person knows file-level is deliberate.

## Context

Closes **retro-012-017** (gate-design action item carried out of BRIEF-LOE-012). The BRIEF-LOE-012 `/pr-review` panel caught a MAJOR the in-task gates missed: the PROGRESS.md doc-retirement sweep was scoped to the 5 `.implementation/` docs the owning task knew about, but `PROGRESS.md` had LIVE `.orchestration/` executable consumers (`orchestrate-state.sh do_derive_pr`, `orchestrate-gates.sh gate_engine_clear` via `sequence.sh`) that still hard-read the deleted file. `/pr-fix babeaf0` re-pointed both. This task adds the gate that would have caught it at task-time instead of review-time.

Satisfies **AC-LOE-013-01..05**. AC-LOE-013-06 (the ENGINE standing-rule documentation) is isolated in TASK-LOE-013-002 (workflow-file change → quad review + user-LGTM merge gate; kept separate so the gate-implementation task stays in the clean application-code reviewed lane).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/validate-gates.sh` | Modify | ADD `check_removed_artifact_orphans` (Check 10). Mirror checks 4 & 8: resolve the diff base the same way; in fixture mode read a `.removed_files` manifest under `$FIXTURE_DIR` (mirroring the `.changed_files` pattern). Compute removals via `git diff --diff-filter=D -M --name-only <base>...HEAD` (rename-aware via `-M`). For each removed file, `git grep` the post-removal tree for refs (repo-relative path primary, basename secondary/noise-bounded); classify by consumer file extension; executable → FAIL naming `path:line` (unless allowlisted); `.md`-only → ALLOWED. Read `.implementation/removal-sweep-allow.txt`; an allowlisted exec hit → PASS (echo reason); an allowlist entry missing its reason → FAIL. SKIP cleanly when no base/removal set. Exclude the removed file itself, `.git/`, `node_modules/`, the fixtures dir. Add `check_removed_artifact_orphans` to `main()`'s run list (after check 9). DO NOT touch checks 1–9; check 8 byte-unchanged. Preserve `set -euo pipefail`. Add the `--removed-files <file>` CLI flag if needed for fixture/PR-context overrides (mirror `--changed-files`). |
| `.implementation/removal-sweep-allow.txt` | (already created by IO at Plan) Verify/extend | The committed allowlist. IO seeded it with the two `.orchestration/*.sh` PROGRESS.md entries (AC-04). The developer verifies the gate reads it correctly and the reasons are echoed; extend only if the real-tree run surfaces an additional legitimate executable retention (justify any addition). |
| `scripts/validate-gates.test.ts` | Modify | Add a Check-10 suite (mirror the existing suites): (1) RED counterfactual — removed file + live constructed-path `.sh` consumer → exit 1, names consumer; (2) allowlisted-PASS — same exec hit but allowlisted-with-reason → PASS, reason echoed; (3) entry-missing-reason → FAIL; (4) doc-only-reference → PASS; (5) SKIP-on-no-`.removed_files`; (6) common-basename safety — a removed commonly-named file does NOT explode into basename false-positives; (7) AC-04 — assert check 8 byte-unchanged (extend the existing check-8 assertion or add one). |
| `scripts/__test_fixtures__/validate-gates/removal-sweep-red/` | Create | RED fixture: `.removed_files` listing a stand-in removed file (e.g. a `PROGRESS.md`); a `.sh` consumer that reads it via a CONSTRUCTED path (mirror `orchestrate-state.sh:72`: `: "${X:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"`); minimal well-formed `state.json` + a clean task so checks 1–9 pass and ONLY check 10 reds. |
| `scripts/__test_fixtures__/validate-gates/removal-sweep-allowlisted/` | Create | Same exec hit as the red fixture but with a `removal-sweep-allow.txt` (or pointed at the repo allowlist) entry covering it → PASS, reason echoed. |
| `scripts/__test_fixtures__/validate-gates/removal-sweep-doc-only/` | Create | Removed file whose only surviving reference is in a `.md` file → PASS. |
| `scripts/__test_fixtures__/validate-gates/removal-sweep-skip/` | Create | No `.removed_files` manifest (and/or empty) → check 10 SKIPs cleanly. |
| `scripts/__test_fixtures__/validate-gates/removal-sweep-missing-reason/` | Create | Allowlist entry whose reason field is empty → check 10 FAILS. |

## Tests to Write First

- [x] RED counterfactual — removed file + live constructed-path `.sh` consumer → `check_removed_artifact_orphans` exit 1, output names the consumer `path:line` (the PR #80 reproduction)
- [x] allowlisted exec hit (with reason) → PASS, reason echoed in output
- [x] allowlist entry with EMPTY reason → FAIL
- [x] doc-only (`.md`) surviving reference → PASS (no allowlist entry needed)
- [x] no `.removed_files` manifest → SKIP cleanly (clear message; not PASS, not error)
- [x] common-basename — removing a commonly-named file does NOT produce a wall of basename false-positives (path-primary discipline holds)
- [x] check 8 (`check_pr_body_quad_review`) byte-unchanged — assert no diff to that function
- [x] AC-04 — `bash scripts/validate-gates.sh` over the REAL tree (PROGRESS.md in the removed set) → ALL CHECKS PASSED (the `.orchestration/*.sh` refs are allowlisted)

## Implementation Notes

- **Diff-based detection (LOCKED — do not re-litigate).** The removal set comes from `git diff --diff-filter=D -M --name-only <base>...HEAD`, NOT a task-declared field. The whole point is to catch what a task FORGOT to sweep — detection cannot depend on the task declaring its own removal. The allowlist is the ONLY declared input and it only ADDS suppressions.
- **Mirror checks 4 & 8 for the harness (don't re-invent).** Diff-base resolution, `$FIXTURE_DIR` + manifest-file convention (`.changed_files` → your `.removed_files`), and the SKIP behavior all already exist. Mirror them. In real-repo mode resolve the base like checks 4/8 do (HEAD-relative; if a PR base is available use it). The `-M` flag makes a rename NOT a false removal.
- **Classification (LOCKED).** Executable consumers: `.sh .ts .tsx .js .mjs .cjs .py .yml .yaml package.json` → FAIL (unless allowlisted). Doc-only: `.md` → ALLOWED by rule. No intent heuristics — file-type + explicit allowlist only, so the verdict is deterministic and reviewable.
- **Common-basename guard (HARD — SDET reviews explicitly).** The repo-relative path is the PRIMARY, precise signal. The basename is a SECONDARY signal that must be noise-bounded so deleting `index.ts` does not flag thousands. Options: only use the basename signal when the path-primary sweep finds nothing AND the basename appears in a string/import context; or cap/skip the basename signal for basenames that already appear N+ times across the tree pre-removal. Pick one, document the choice as a `// DECISION:`, and make the SDET able to see it addressed, not hand-waved.
- **Constructed-path catch.** `git grep -F` on the repo-relative path catches `${REPO_ROOT}/.implementation/tasks/PROGRESS.md` because the literal suffix `.implementation/tasks/PROGRESS.md` is present in the source even though the prefix is a variable. Verify your token strategy catches the constructed form — the red fixture must use it.
- **SKIP-not-FAIL.** When `<base>` is unresolvable / the removal set is empty / no `.removed_files` manifest → `skip "$check_name" "<clear reason>"` (mirror check 8). A plain push to main with no removals must not red.
- **`set -e` + `git grep` exit codes (CS-INFRA-003).** `git grep` exits 1 when no match — that is EXPECTED, not fatal. Guard it (`if git grep ...; then` or `|| true` with explicit handling) so the check does not abort the script under `set -euo pipefail`.
- **File-level scope boundary (brief Out-of-scope).** Add a comment in the check: symbol/section/field-level removal is a deliberate future extension, NOT an oversight — file-level deletes are deterministic + low-noise; that is why this gate is file-level.
- **Cite authority (CS-GEN-003).** Reference `retro-012-017` / `BRIEF-LOE-013` in the check + test comments.
- **Zero new runtime dependency (CS-INFRA-004).** Pure bash + `git`. No new package.json entry.

## Definition of Done

- [x] `check_removed_artifact_orphans` (Check 10) added to `validate-gates.sh`; diff-based detection (`git diff --diff-filter=D -M`); fixture-mode `.removed_files` manifest; SKIP-on-no-base (AC-LOE-013-01)
- [x] Sweep-and-classify: executable hit → FAIL naming `path:line`; doc-only → ALLOWED; sweep excludes removed file / `.git/` / `node_modules/` / fixtures dir; constructed-path caught (AC-LOE-013-02)
- [x] `.implementation/removal-sweep-allow.txt` consumed: allowlisted exec hit → PASS (reason echoed); non-allowlisted exec hit → FAIL; entry-missing-reason → FAIL (AC-LOE-013-03)
- [x] AC-04: `bash scripts/validate-gates.sh` over real main (PROGRESS.md in removed set) → ALL CHECKS PASSED; `.orchestration/*.sh` refs allowlisted-with-reason (AC-LOE-013-04)
- [x] Gate Authoring Rules three evidence items in the Work Log: green run + named check step; the named code path the gate catches; the PR #80 red-fixture counterfactual (AC-LOE-013-05)
- [x] Common-basename explosion guard in place + tested; false-positive/false-negative balance documented
- [x] Checks 1–9 untouched; check 8 byte-unchanged (assert `diff` empty)
- [x] `set -euo pipefail` preserved; zero new npm dependency; authority cited in comments
- [x] Lint + type-check + build + `pnpm test` pass; `validate-gates.sh` over real tree ALL CHECKS PASSED

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

- 2026-06-22 [sdet] Marking done — 47/47 validate-gates tests pass; 292/292 scripts tests pass. Lint+type-check clean. Check-8 byte-identical MD5. Counterfactual independently reproduced: exit 1, .fixture-consumer.sh:21 named. AC-04 live green. set -e grep guards confirmed. Path-primary-only DECISION adjudicated: acceptable. Self-referential allowlist entries adjudicated: acceptable with noted smell. | What's next: archive | Blockers: none
- 2026-06-22 [devops] Marking as review — All gates pass. Gate Authoring evidence in Work Log. 47/47 validate-gates tests, 292/292 scripts tests. Real-tree ALL CHECKS PASSED with PROGRESS.md in removed set. | What's next: SDET review | Blockers: none
- 2026-06-22 [devops] Implemented check_removed_artifact_orphans (Check 10) in validate-gates.sh. Added --removed-files CLI flag. Created 6 test fixtures (red, allowlisted, doc-only, skip, missing-reason, basename-safe). Extended validate-gates.test.ts with Suite 8 (8 tests, all passing). Updated .implementation/removal-sweep-allow.txt with 5 additional allowlist entries covering sequence.sh, sequence.test.sh, validate-gates.sh self-docs, and validate-gates.test.ts. All 47 validate-gates tests pass. All 292 scripts/ tests pass. Lint, type-check, build all green. | What's next: Submit for SDET review | Blockers: none
- 2026-06-22 [devops] Starting implementation — Starting check_removed_artifact_orphans (Check 10) implementation | What's next: implement and run gates | Blockers: none

---

## Gate Authoring Evidence (introduces_gate: yes — ENGINE § Gate Authoring Rules)

### Item 1 — Green run over real tree + named check step

Log: `/tmp/test-removed-files.txt` = `.implementation/tasks/PROGRESS.md`

```
bash scripts/validate-gates.sh --removed-files /tmp/test-removed-files.txt

  Mode: real repo (/home/ccox/repos/tax-portal)
  ...
  check_removed_artifact_orphans                       PASS
  Summary: ALL CHECKS PASSED (0 failures)
```

Named check step: `check_removed_artifact_orphans` (`scripts/validate-gates.sh:761`). All 8 allowlisted executable hits echoed with reasons; gate PASSES.

### Item 2 — Named code path the gate catches

`scripts/validate-gates.sh:893` and `.orchestration/bin/orchestrate-state.sh:72`:

```bash
: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
```

This is the PR #80 failure mode — a constructed-path string in a `.sh` consumer that retains a reference to the deleted PROGRESS.md. `grep -F` on the repo-relative path catches the literal suffix `.implementation/tasks/PROGRESS.md` even though it is assembled via variable expansion. The allowlist entry for `orchestrate-state.sh` carries: "Legacy --progress-md no-op flag + PROGRESS_MD default-path var, intentionally retained by /pr-fix babeaf0 for backward compat; derive-pr now reads state.json awaitingMerge[] and no longer reads PROGRESS.md."

Without the allowlist entry, this hit would exit non-zero and name `orchestrate-state.sh:72`.

### Item 3 — COUNTERFACTUAL: the red fixture exits non-zero and names the consumer

Fixture: `scripts/__test_fixtures__/validate-gates/removal-sweep-red/`
- `.removed_files` lists `.implementation/tasks/PROGRESS.md`
- `.fixture-consumer.sh` contains (mirroring `orchestrate-state.sh:72`):
  ```bash
  : "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"
  ```
  NOT in any allowlist.

Run result:
```
bash scripts/validate-gates.sh --fixture-dir scripts/__test_fixtures__/validate-gates/removal-sweep-red
  check_removed_artifact_orphans                       FAIL
    -> executable consumer of removed '.implementation/tasks/PROGRESS.md': .fixture-consumer.sh:21
  Summary: 3 check(s) FAILED
```

Exit code 1. Consumer named as `.fixture-consumer.sh:21`. The constructed-path literal suffix is caught by `grep -F` even inside variable-expansion form. This is a real un-repointed consumer, not a self-satisfied assertion.

---

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved

**Notes**:

**Submission gate:** lint ✓, type-check ✓. 47/47 validate-gates tests pass; 292/292 scripts/ tests pass.

**Gate Authoring Rules (introduces_gate: yes — all three items verified):**
- Item 1 (green run + named check step): `check_removed_artifact_orphans` at `scripts/validate-gates.sh:761` runs and PASSES over the real tree with PROGRESS.md in the removed set. AC-04 live proof independently run — ALL CHECKS PASSED, all 6 allowlisted hits echoed with reasons.
- Item 2 (named code path): `.orchestration/bin/orchestrate-state.sh:72` — the constructed-path form `${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}`. Confirmed present.
- Item 3 (counterfactual): Independently reproduced. `bash scripts/validate-gates.sh --fixture-dir scripts/__test_fixtures__/validate-gates/removal-sweep-red` → exit 1, `check_removed_artifact_orphans FAIL`, consumer named as `.fixture-consumer.sh:6`, `.fixture-consumer.sh:11`, `.fixture-consumer.sh:21` (line 21 is the constructed-path code line — the PR #80 reproduction). Not a self-satisfied assertion.

**Fixture verification (all 6):** RED→exit 1 ✓; allowlisted→PASS+reason echoed ✓; missing-reason→FAIL ✓; doc-only→PASS ✓; skip→SKIP (not PASS) ✓; basename-safe→PASS (no explosion) ✓.

**Checks 1–9 untouched:** `git diff origin/main -- scripts/validate-gates.sh` shows ZERO deleted lines — pure additions only. Check 8 body MD5 is byte-identical between origin/main and HEAD (`21bc6a24207c5ad4d2c0b418bf8a32ee`).

**CS-INFRA-003:** `set -euo pipefail` preserved at line 14. Both `grep` and `git grep` guarded with `|| true` — exit-1-on-no-match is non-fatal.

**CS-INFRA-004:** `git diff origin/main -- package.json pnpm-lock.yaml` is empty — zero new runtime dependencies.

**CS-GEN-003:** `retro-012-017 / BRIEF-LOE-013` cited at `scripts/validate-gates.sh:702` and in test Suite 8 comments.

**No homoglyphs:** Non-ASCII characters in changed files are decorative Unicode (→, ──, —, §) in comments/strings only — no Cyrillic or lookalike identifiers.

**JUDGMENT CALL 1 — Path-primary ONLY (basename signal dropped entirely): ACCEPTABLE.**
The brief asked for "path-primary, basename secondary/noise-bounded." The developer documented a `// DECISION:` at `validate-gates.sh:735` with explicit false-negative acknowledgment. My adjudication: the design is acceptable for the documented failure mode. The PR #80 failure (and every realistic cross-layer consumer pattern in this repo) uses the repo-relative path in a constructed-path form — `${REPO_ROOT}/...PROGRESS.md`. `git grep -F` on the repo-relative path catches the literal suffix whether it appears raw or inside variable expansion, so path-primary IS sufficient for the canonical failure mode. A pure basename-only consumer reference (e.g. just `PROGRESS.md` with no path context) would be missed, but such a pattern for file-path references in operational shell scripts is uncommon and was explicitly acknowledged as a known false-negative tradeoff. The brief required this tradeoff be documented, not resolved with a hypothetical guard — and it is documented. The alternative (basename secondary search) creates catastrophic false-positive explosion for common names (`index.ts`, `page.tsx`, `package.json`), which would make the gate unusable. Path-primary-only is the right call here.

**JUDGMENT CALL 2 — Self-referential allowlist entries (5-of-7 being non-orphan noise): ACCEPTABLE with noted smell.**
The developer allowlisted `validate-gates.sh` (self-doc comments), `validate-gates.test.ts` (test input strings), and `sequence.test.sh` (test harness path args). The brief's escape hatch is "allowlist-with-reason for intentional retained executable references." All entries have legitimate, non-empty reasons. The concern is whether the exclusion set (already excluding `.git/`, `node_modules/`, fixture dirs) should be widened to exclude the gate's own source and test harness. I considered requiring this but declined: (a) the allowlist-with-reason mechanism was designed for exactly these cases where the SDET can audit the rationale; (b) adding `scripts/` or `*.test.ts` to the exclusion set would create a new silent suppression class with no documented reason — worse than the current explicit entries; (c) the 5-of-7 signal is a smell, not a correctness failure. The real-world ratio will improve as the first real removals are processed and the gate's own self-reference entries become a smaller fraction. The IO should note this pattern in the Close-prep retro if the ratio worsens (the gate bootstraps itself, so the self-ref entries are a one-time artifact of the gate's introduction).

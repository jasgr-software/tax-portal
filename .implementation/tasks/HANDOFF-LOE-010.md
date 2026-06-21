# HANDOFF-LOE-010 — completion / acceptance-evidence traceability

> Brief: `.implementation/briefs/BRIEF-LOE-010-task-frontmatter-migration.md` · Branch:
> `brief-loe-010-task-frontmatter-migration` · `Brief-deploys:` no · Reviewed merge lane (mixed/app-code PR).
> Methodology: `tdd: optional`, `acceptance_format: prose`, `e2e: optional`, `coverage_target: none`.

## Outcome

All six acceptance criteria (AC-LOE-010-01..06) **satisfied and exercised**. Both brief extra-gates
(idempotent run-twice no-op; `validate-gates.sh` green over the migrated tree) **pass**. The slice delivers
the YAML front-matter format cutover with identical-verdict consumers and format-only doc updates; zero
product-code (`apps/**`/`packages/**`/`prisma/**`/`db/**`) change.

## AC ↔ evidence (which test/run proves each AC)

| AC | Evidence (test / run that proves it) |
| -- | ------------------------------------- |
| **AC-LOE-010-01** — idempotent migration, zero value/body loss | `scripts/migrate-task-frontmatter.test.ts` (round-trip value-preservation + body-preservation + both header variants + bug + templates); **idempotency run-twice no-op** verified live at Close-prep: `npx tsx scripts/migrate-task-frontmatter.ts` over the already-migrated tree → `Changed: 0 / Skipped: 89`, working-tree md5 unchanged before/after (`/tmp/migrate-rerun-loe010.log`). |
| **AC-LOE-010-02** — every `tasks/**`+`_templates/` file well-formed FM; body byte-preserved | `migrate-task-frontmatter.test.ts` byte-identical-body assertions; the committed 88-file tree rewrite (86 in `tasks/done/` after LOE-010 archive + `_templates/task.md`+`bug.md` + migrated fixtures), every file opens with a `---` front-matter block (spot-confirmed; gate parses all). |
| **AC-LOE-010-03** — schema enum/range/clock; surfaces TASK-006-002 inversion | `scripts/task-frontmatter.ts` `verifyFrontMatter()` unit coverage in the test suite; live diagnostic proof at Close-prep: `npx tsx scripts/task-frontmatter.ts --verify .implementation/tasks` reports `TASK-006-002 … clock inversion — completed_at (2026-06-18T20:06:28Z) is BEFORE started_at (2026-06-18T20:15:00Z)` (surfaced, not silently passed). |
| **AC-LOE-010-04** — `validate-gates.sh` reads FM, identical verdicts, rejects malformed | `scripts/validate-gates.test.ts` full fixture suite (clean all-pass; done-missing-complexity/no-worklog/ci-evidence variants keep verdicts; malformed-frontmatter fixture → exit 1); **Defect-A counterfactual** `done-quoted-timestamps` → PASS, `done-bad-timestamp` → FAIL; live `bash scripts/validate-gates.sh` → **exit 0, ALL CHECKS PASSED** over the real migrated tree (`/tmp/vg-loe010-close.log`, re-confirmed post-archive `/tmp/vg-loe010-postarchive.log`). |
| **AC-LOE-010-05** — `log-task-edit.py` reads FM, keeps metrics record shape | `log-task-edit.py` `parse_field()` reads the FM block keyed on snake_case; metrics-parity suite (Suite 4) decoupled onto stable fixture `scripts/__test_fixtures__/frontmatter/TASK-TEST-INPROGRESS-001-parity-fixture.md`, all 6 parity assertions (status / assigned_to / complexity_estimate / started_at ISO / completed_at empty-sentinel / record-shape field-name alignment) pass; `metrics-report.py` field names already aligned (no change). Part of the **75/75** scripts/ vitest. |
| **AC-LOE-010-06** — docs reference FM keys; no doc hand-writes relocated bold fields | TASK-LOE-010-003 grep-clean reproduction: zero live relocated-bold-field instructions across ENGINE.md, PHASES.md, AGENT.md, developer.md, sdet.md, overwatch.md; `_templates/task.md`+`bug.md` open with FM, body sections + field guidance intact; semantics (SDET rejection rules, Dispatch-Checkpoint ordering, who-writes-when) preserved verbatim. |

## Aggregate gate evidence (the three-item pointer)

1. **`bash scripts/validate-gates.sh` → exit 0, `ALL CHECKS PASSED (0 failures)`** over the real migrated
   tree (`/tmp/vg-loe010-close.log`; re-confirmed after the comment fix `/tmp/vg-loe010-postcomment.log` and
   after the archive move `/tmp/vg-loe010-postarchive.log`).
2. **`pnpm test` (scripts/ vitest) → 75/75 passed (3 files), 0 failed** (`/tmp/scripts-test-loe010-close.log`).
3. **Idempotent run-twice no-op** → `Changed: 0 / Skipped: 89`, working tree byte-identical
   (`/tmp/migrate-rerun-loe010.log`).

## Fix-forward note

TASK-LOE-010-004 (fix-forward) restored AC-LOE-010-04/-05 after the IO design-scan/Smoke backstop caught two
defects the per-task SDET reviews missed (quoted-timestamp false-reject; self-referential metrics-parity
fixture). Both SDET-verified; the slice was held at Review until both backstops were green. Full detail in
`RETRO-LOE-010.md § The one gate deviation that mattered`.

## Pre-existing non-regression

`SmtpEmailProvider → Mailhog integration` fails without Mailhog — pre-existing, not introduced by this slice
(no email code path touched). Not a gate rejection.

## Independent verification owned by the PR

The CI gate (`lint-and-typecheck` + `security-scan`, required) on the opened PR is the slice's independent
verification. This slice's local backstops are green; CI confirmation is gate 8 (post-merge).

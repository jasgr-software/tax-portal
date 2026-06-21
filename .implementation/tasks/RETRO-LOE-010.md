# RETRO-LOE-010 — Phase 0: task/bug lifecycle fields → YAML front matter

> Engine-tooling chore (epic `chore/lights-out-enablement`). The first build phase of the ratified
> scripted-bookkeeping initiative. Brief: `.implementation/briefs/BRIEF-LOE-010-task-frontmatter-migration.md`.
> Branch: `brief-loe-010-task-frontmatter-migration`. `Brief-type:` chore/tooling · `Brief-deploys:` no.

## What shipped

The on-disk task/bug format was converted from inline bold lifecycle fields (`**Status**: done`) to YAML
front matter, and the two machine consumers were taught to read the new form with identical verdicts. This
is the format cutover that lets later phases `parse → mutate → serialize` structured fields instead of
regex-scraping bold markdown (Phase 1 = `task.ts` CLI; Phase 2 = `state.json`/`events.jsonl` — both out of
scope here).

Concretely:

- **`scripts/migrate-task-frontmatter.ts`** — a one-shot, idempotent, zero-runtime-dep migration. Relocates
  the contiguous leading lifecycle header block into a real YAML front-matter block via a hand-rolled
  scalar/list serializer (no `js-yaml`/`yaml`/`yq` added), handling both current (`Brief`/`Assigned to`) and
  legacy (`Epic`/`Affected flows`) header variants, with atomic temp-write+rename and path-confinement. Body
  prose (Work Log, SDET review, Quality Gates, focus areas, inline `**Decision**:`/`**Notes**:` labels) is
  byte-preserved. Re-running is a no-op (a file already opening with `---` is detected and skipped).
- **`scripts/task-frontmatter.ts`** — the schema/verify library: field-map, `parseFrontMatter`,
  `verifyFrontMatter` (status enum; `complexity_estimate`/`complexity_actual ∈ 1..5` or empty;
  `completed_at >= started_at`), plus a `--verify <dir>` diagnostic CLI.
- **88-file tree rewrite** committed as one reviewable transform (82 `tasks/done/` + `_templates/` task.md +
  bug.md + the validate-gates fixtures; the four LOE-010 task files were authored directly in front-matter
  form and join `done/` at archive).
- **`scripts/validate-gates.sh`** — checks 1/5–7 read the front-matter block (awk-extracted), with the TS
  library as the authoritative schema parser invoked separately by the malformed-frontmatter gate and the
  full verify CLI. Identical verdicts on valid files; malformed front matter rejected.
- **`.claude/hooks/log-task-edit.py`** — `parse_field()` reads the front-matter block keyed on snake_case
  keys; metrics record shape unchanged; `metrics-report.py` needs no change.
- **Docs** — ENGINE.md § Task Metadata Contract, PHASES.md, AGENT.md, developer.md, sdet.md, overwatch.md,
  and `_templates/{task,bug}.md` reference front-matter keys; format-only, contract semantics intact;
  grep-clean of live bold-field instructions.

## 6-AC ↔ task map

| AC            | Text (abbrev.)                                                         | Task(s)        | Status |
| ------------- | ---------------------------------------------------------------------- | -------------- | ------ |
| AC-LOE-010-01 | Idempotent one-shot migration, zero value/body loss                    | -001           | ✅ done |
| AC-LOE-010-02 | Every `tasks/**`+`_templates/` file well-formed FM; body byte-preserved | -001           | ✅ done |
| AC-LOE-010-03 | Schema enforces enum/range/clock; surfaces TASK-006-002 inversion       | -001           | ✅ done |
| AC-LOE-010-04 | `validate-gates.sh` reads FM, identical verdicts, rejects malformed     | -002, -004(fix) | ✅ done |
| AC-LOE-010-05 | `log-task-edit.py` reads FM, keeps metrics record shape                 | -002, -004(fix) | ✅ done |
| AC-LOE-010-06 | Docs reference FM keys; no doc hand-writes relocated bold fields         | -003           | ✅ done |

Extra gates (brief `methodology.extra_gates`): **idempotent run-twice no-op** — confirmed (re-run changed 0,
skipped 89, working tree byte-identical); **`validate-gates.sh` green over the migrated tree** — confirmed
(exit 0, ALL CHECKS PASSED).

## The one gate deviation that mattered — design-scan/Smoke backstop caught two defects the per-task SDET reviews missed

The per-task SDET reviews approved -001/-002/-003 (each `done`), but the **IO design-scan + backstop re-run**
(Review/Smoke) surfaced **two genuine gate defects** that the per-task reviews missed:

- **Defect A — `validate-gates.sh` false-rejected the quoted-timestamp scalar form.** `_check_done_metadata_fm()`
  required an unquoted `^started_at: [0-9]{4}-…`; the migration legitimately emits a quoted scalar
  (`started_at: "…"`) on some files (e.g. -003). A well-formed file was false-rejected — an **AC-LOE-010-04
  identical-verdict violation**.
- **Defect B — the metrics-parity test pinned to a live task file** (TASK-LOE-010-002 itself), so the SDET's
  own correct atomic close (writing `completed_at` + flipping to `done`) reddened a self-referential fixture —
  an **AC-LOE-010-05 test-stability defect**.

**Why the per-task reviews missed them:** the SDET ran the suite mid-review, *before* its own close edit
populated -002's `completed_at`; and the quoted-timestamp form existed only on -003, reviewed in the same
batch before its own close-edit shape settled. Both defects were latent precisely because the per-task review
window pre-dated the close edits that exposed them.

**Resolution — fix-forward, not revert.** TASK-LOE-010-004 batched both fixes (broaden the bash ISO grep to
tolerate an optional surrounding quote, mirroring the existing `complexity_*` `"?` tolerance without relaxing
the ISO shape; replace the self-referential fixture with a stable dedicated in-tree fixture). SDET-verified:
quoted-`done` PASSES, non-ISO FAILS (Defect-A counterfactual); metrics-parity decoupled onto
`TASK-TEST-INPROGRESS-001-parity-fixture.md` with all 6 AC-05 assertions intact; 75/75 scripts/ vitest.

**Classification (Overwatch retro buckets):** `process-gap` — the per-task review window structurally cannot
see the post-close shape of the very file being closed; the design-scan/Smoke backstop is the correct net and
it held. **Not a `missed-requirement`** (the AC were correctly decomposed) and **not a `flaky-gate`** (both
defects were deterministic and real). The lesson reinforces keeping the IO design-scan + independent backstop
re-run as a non-negotiable gate distinct from per-task SDET review — exactly the layered-net the engine
prescribes. No rule change recommended; the existing gate caught it.

## Thesis-confirming note — a real stale-ledger drift surfaced during this build

While building this slice, a **stale ledger entry** was found in PROGRESS.md: the former `## Awaiting PR merge`
entry for BRIEF-009/EPIC-009 was never cleared by Close-finalize even though PR #71 had merged and PR #73 had
validated it (OQ-003). It was a dangling hand-maintained ledger artifact, not an in-flight slice — caught only
by human re-reading. **This is exactly the failure mode Phase 2's structured state model (`state.json` +
`events.jsonl`) is designed to auto-clear:** merge/validate events would mechanically retire the awaiting-merge
record, leaving no possibility of a stale prose entry surviving. A real drift, in the real ledger, during the
very slice that lays the format groundwork for eliminating that class of drift — a direct, unsolicited
confirmation of the scripted-bookkeeping thesis. Recorded for the Phase-1/Phase-2 design.

## Pre-existing non-regression (noted, not a defect)

`SmtpEmailProvider → Mailhog integration` fails when Mailhog is not running. Confirmed pre-existing and
**not introduced by this slice** — BRIEF-LOE-010 touches no email code path. Not a rejection at any gate.

## Advisory resolution

SDET flagged a stale Gate-Authoring comment block at `scripts/validate-gates.sh` (~line 111) still describing
the OLD unquoted pattern. **Resolved at Close-prep by folding a one-line comment fix directly** (doc-grade
comment correction inside a gated file; keeps the shipped Gate-Authoring evidence comment consistent with the
`"?`-tolerant code it documents). Gate re-run green (exit 0) after the edit. Not carried as a follow-up.

## Rule-sunset / carried observations

No new rule-sunset recommendation from this slice. The cross-surface-parity sunset counter is unaffected
(engine-tooling slice, no `apps/portal`/`apps/admin` surface in scope). Carried project-wide observations
(clock-source inversion `ungated-fix`, etc.) are untouched by this chore and remain in PROGRESS.md § Open
retro action items.

## Post-Merge Addendum (Close-finalize, 2026-06-21)

**Merged:** PR **#74** → `main` via squash + delete-branch (reviewed lane; no `--admin`, no protection toggle).
Squash commit **`2b8944a`** (`chore(engine): BRIEF-LOE-010 — migrate task/bug lifecycle fields to YAML front
matter (Phase 0) (#74)`). `Brief-deploys: no`.

**Reviewed-lane outcome.** Standards-review audit **PASS** (0 violations; 2 new experimental INFRA standards
drafted, pending human ratification — not carried on this PR). `/pr-review` panel verdict: request-changes
(advisory) — 1 blocker + 2 major + 4 minor + 1 nit. `/pr-fix` addressed all 9 findings (hardened `needsQuoting`
+ escaping; added a `--reserialize` path; re-serialized the corpus; added the YAML-validity oracle test; fixed
the quoted-`complexity_actual` metrics regression). 10 review threads resolved; fix commits squashed into
`2b8944a`.

**Gate 8 — post-merge CI — GREEN.** Main CI run `27916242291` `success` (lint-and-typecheck, security-scan,
test-portal, test-admin); CodeQL on main green; `bash scripts/validate-gates.sh` on merged main → exit 0, ALL
CHECKS PASSED. Independently re-verified: **89/89 migrated files parse as valid YAML, 0 invalid; complexity
fields are bare integers**. **Gate 9 — N/A** (`Brief-deploys: no`). **Zero post-merge bugs** (no
`BUG-LOE-010-POST-*`).

## The headline retro learning — the YAML-validity oracle gap (a gate-design finding)

**What happened.** The `/pr-review` panel caught a **blocker** that *all four prior gates missed*: **39 of 90
migrated files (43%) were not valid YAML.** The migration's `needsQuoting` heuristic omitted YAML-significant
cases (values needing quoting/escaping that it left bare), so those front-matter blocks were syntactically
invalid to a real parser — yet every preceding gate passed them green:

- the **developer submission gate** (`validate-gates.sh`),
- **SDET per-task review** (×2, -002/-003 and -004),
- the **IO design-scan + Smoke backstop** (which *did* catch two other real defects — Defects A/B above — but
  not this one),
- and **CI** (`lint-and-typecheck` + `security-scan`).

**Root cause — the oracle was not independent of the code under test.** Every one of those gates validated the
front matter with a **quote-tolerant line scanner** (`awk`/`grep` key-extraction, the same forgiving parsing the
runtime consumers use). None of them ran the corpus through a **real YAML parser**. The migration's output and
all its validators shared the same lenient parsing assumptions, so a whole class of invalidity was structurally
invisible: the test oracle and the code under test had a common blind spot. The `/pr-review` lens, reasoning from
first principles ("the target format is a real parser's input — is it actually valid to that parser?"), was the
first checker not sharing that blind spot.

**Durable, generalizable lesson.** **A format migration whose target is a real parser's input must be validated
with that real parser — not with the same lenient scanner the consumers use.** The validation oracle must be
**independent of the code under test**; when the producer and all its checkers share a parsing shortcut, they
share its blind spots, and "all gates green" certifies only internal self-consistency, not external correctness.
The fix the panel forced is exactly the right shape: an **oracle test that shells to python3 + PyYAML over every
file** — a genuinely independent parser. **The gap is now closed as a standing regression test** (the YAML oracle
ships in `2b8944a`), so this can never silently recur on the corpus.

**Classification (Overwatch buckets): `process-gap`** — specifically a *validation-oracle gap*: the gate set
lacked an independent-parser check for a parser-targeted migration. **Not `flaky-gate`** (the invalidity was
deterministic and reproducible). **Not `missed-requirement`** (the AC were correctly decomposed; AC-02 even says
"well-formed FM" — the defect was that "well-formed" was checked by a scanner that couldn't actually tell). The
remediation rode the PR via `/pr-fix` and is now permanent. **No new engine rule mandated**, but recorded as a
reusable gate-design heuristic: *for any migration/serialization whose output feeds a real parser, the
acceptance oracle must use that real parser, independent of the serializer's own assumptions.*

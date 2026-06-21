---
brief: BRIEF-LOE-010
epic: chore/lights-out-enablement
status: done
assigned_to: devops
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-21T18:01:16Z
completed_at: 2026-06-21T19:30:00Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: advisory
acceptance_criteria: [AC-LOE-010-01, AC-LOE-010-02, AC-LOE-010-03]
upstream_refs: "none (design source: `PROPOSAL-scripted-bookkeeping.md` §5 Phase 0, §9.1, §10 Q1/Q2 — proposals are main-session design docs, not an upstream `.requirements`/`.architecture`/`.planning` layer)"
code_standards: "none (brief `code_standards: []`)"
---





# TASK-LOE-010-001: Front-matter migration script + schema/verify module

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm test` (vitest run scripts) pass
- [N/A] **Targeted e2e** — N/A (engine tooling, no UI; brief `methodology.e2e: optional`)
- [x] **Security review** — migration only rewrites local `.md` files in `.implementation/tasks/**` + `_templates/`; no network, no shell-out, no `eval`; path-confined writes (refuses to touch anything outside the two roots); atomic temp-write+rename so a crash can't leave a half-written file
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Round-trip / value-preservation is the headline gate.** Verify the migration loses **zero** field values and **zero** body bytes. The strongest check: for a representative sample (≥1 current-variant task, ≥1 legacy-`Epic`/`Affected flows` task, ≥1 bug, the `_templates/` files), assert the body after the front-matter block is **byte-identical** to the original body below its header block (only the leading `**Field**:` header block is removed; everything from the first `---`/`## ` onward is untouched).
- **Header-block anchoring (critical correctness risk).** The migration must relocate **only** the contiguous leading lifecycle header block (the `**Key**: value` lines between the H1 `# TASK-…`/`# BUG-…` title and the first `---` or `## ` section). It must **NOT** sweep inline bold fields that live in body prose — `**Decision**:`, `**Notes**:`, `**Attempt count**:`, `**Blockers**:`, `**What was done**:`, `**Reviewer**:`, `**Raised by/at**:`, `**Root cause**:`, the one-off `**AC-AUTH-013-01**:` / `**CS-GEN-001**:` style labels, etc. Confirm a fixture whose Work Log/SDET-Review contains a `**Decision**: reject` line keeps that line in the body verbatim.
- **Both header variants handled.** Current (`Brief`/`Assigned to`/`Acceptance criteria:` with trailing `:` inside the bold or after) AND legacy (`Epic`/`Affected flows`/`Affected requirements`/`Relevant ADRs`) must both map. Note the two bold-punctuation shapes in the corpus: `**Status**: done` (colon outside bold) and `**Introduces-gate:** yes` / `**Acceptance criteria:** …` (colon inside bold) — the parser must accept both.
- **Idempotency.** Running the migration on an already-migrated file is a **no-op** (a file that already opens with a `---` YAML front-matter block is detected and skipped, not double-wrapped). Verify by running twice and diffing — second run produces zero changes.
- **Schema surfaces the known inversion.** `TASK-006-002` has `completed_at` (20:06:28Z) **before** `started_at` (20:15:00Z). The schema `verify` must **flag** this (not silently pass). Confirm the verify reports it as a violation with a clear message naming the file + the inverted pair.
- **Zero new runtime npm dependency.** `yq` is not on PATH and no YAML lib is installed (verified at Plan). The migration + verify must parse/emit front matter with a small hand-rolled serializer/parser in TS (matching the zero-dep ethos of `db-migrate.ts`/`db-seed.ts`) OR justify any dep in the Work Log. Do not add `js-yaml`/`yaml` without recording why a hand-rolled scalar/list block (which is all the schema needs) was insufficient.

## Context

Phase 0 of the scripted-bookkeeping initiative (`PROPOSAL-scripted-bookkeeping.md` §5). Today task/bug
lifecycle fields are inline markdown bold (`**Status**: done`), forcing every consumer (`validate-gates.sh`'s
9 grep checks, `log-task-edit.py`'s regex) into fragile string-matching — and letting clock inversions ship
silently (TASK-006-002). This task converts the on-disk format to YAML front matter so later phases
`parse → mutate → serialize` instead of regex-surgery, and so validation collapses to "parse block → validate
against schema." This task is the **producer** (migration + schema); TASK-LOE-010-002 makes the consumers
(`validate-gates.sh`, the metrics hook) read the new form; TASK-LOE-010-003 updates the docs.

**Migration window is ideal:** all 82 task files are in `tasks/done/`; there are **no open `TASK-*.md`** in
`tasks/` right now (only BUG/HANDOFF/PROGRESS/RETRO + this slice's own TASK-LOE-010-* files). Run the migration
over `tasks/`, `tasks/done/`, and `_templates/`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/migrate-task-frontmatter.ts` | create | One-shot, idempotent migration. Exports pure functions (`parseHeaderBlock`, `toFrontMatter`, `migrateFileContent(text): {changed, output}`) + a CLI entrypoint that walks the three roots, writes via temp+rename, prints a per-file changed/skipped summary. Run via `tsx`. |
| `scripts/task-frontmatter.ts` | create | The schema/verify library: the field-mapping table (bold-key → fm-key + type), `parseFrontMatter(text)`, and `verifyFrontMatter(fm): Violation[]` enforcing the §9.1/§5-Phase-0b schema — legal `status` enum, `complexity_estimate`/`complexity_actual ∈ 1..5` or empty, `completed_at >= started_at` when both present. Imported by both the migration and (in -002) the validate delegate. *(May be folded into migrate-task-frontmatter.ts if cleaner; keep the verify independently importable for -002.)* |
| `scripts/migrate-task-frontmatter.test.ts` | create | Vitest: idempotency (run-twice no-op), value preservation (round-trip a known current-variant + a legacy-variant file), body preservation (byte-identical body), header-block anchoring (a `**Decision**:` in body stays in body), schema rejection (inverted-clock + bad-status fixtures flagged). |
| `scripts/__test_fixtures__/frontmatter/**` | create | Fixture inputs/expected: a current-variant task, a legacy-`Epic` task, a bug, an inverted-clock fixture, a bad-status fixture, an already-migrated (front-matter-leading) fixture for the idempotency assertion. |
| `package.json` | modify | Add `"migrate:frontmatter": "tsx scripts/migrate-task-frontmatter.ts"` to `scripts` (matches the `db:migrate`/`demo:stage` tsx convention). `pnpm test` already globs `vitest run scripts`, so the new `.test.ts` is auto-discovered — no test-script change needed. |
| **`.implementation/tasks/**` + `_templates/`** | modify (generated) | The committed tree-rewrite output of running the migration once. Commit as part of this task's diff (per brief: "commit the tree change as a single reviewable diff"). This includes this slice's own `TASK-LOE-010-00*` files — run the migration **last**, after they exist, so they convert too. |

## The field-mapping contract (binding reference)

Relocate these leading-header keys into front matter (left = observed bold-header key, right = front-matter key):

| Bold header key | FM key | Form |
| --- | --- | --- |
| `Brief` | `brief` | scalar |
| `Epic` (legacy) | `epic` | scalar |
| `Status` | `status` | enum: `backlog\|in-progress\|review\|done\|needs-user-direction` |
| `Assigned to` | `assigned_to` | scalar |
| `Updated-by` | `updated_by` | scalar |
| `Depends on` | `depends_on` | scalar |
| `Impl` | `impl` | enum: `developer\|io` |
| `E2e-required` | `e2e_required` | scalar (`yes`/`no`) |
| `Started-at` | `started_at` | ISO 8601 or empty |
| `Completed-at` | `completed_at` | ISO 8601 or empty |
| `Complexity-estimate` | `complexity_estimate` | 1..5 or empty |
| `Complexity-actual` | `complexity_actual` | 1..5 or empty |
| `Introduces-gate` | `introduces_gate` | enum: `yes\|no\|advisory` |
| `Acceptance criteria` | `acceptance_criteria` | list (split CSV-ish; preserve `none — <justification>` as a single scalar when not a clean list) |
| `Upstream refs` | `upstream_refs` | list or scalar |
| `Code standards` | `code_standards` | list or scalar |
| `Brief-type` | `brief_type` | enum: `feature\|quality\|document\|hotfix` |
| `Brief-deploys` | `brief_deploys` | scalar (`yes`/`no`) |
| `Found in` (bug) | `found_in` | scalar |
| `Category` (bug) | `category` | scalar |
| `Severity` (bug) | `severity` | enum: `critical\|major\|minor` |
| `Affected flows` (legacy) | `affected_flows` | scalar |
| `Affected requirements` (legacy) | `affected_requirements` | scalar |
| `Relevant ADRs` (legacy) | `relevant_adrs` | scalar |

**One-fact-one-home (§9.1):** a key moves to front matter **or** stays in the body — never both. The
inline-comment `<!-- … -->` hints attached to template fields move/drop with their field (they document the
field; if a field relocates, its hint can relocate as a YAML comment or be dropped — record the choice as a
`// DECISION:`). **Do not** relocate any `**Key**:` that appears inside a `## ` section or the Work Log /
SDET Review / Attempt Log — those are body prose.

**Survey before writing** (brief mandate): the corpus has ~84 files; grep the leading-header keys across
`tasks/done/` to confirm the mapping table is complete before running the destructive rewrite. Any header key
not in the table above must be surfaced (don't silently drop it) — extend the table or record why it stays.

## Tests to Write First

- [ ] `migrateFileContent` on a current-variant task → front matter has all mapped keys; body byte-identical below header
- [ ] `migrateFileContent` on a legacy-`Epic`/`Affected flows` task → `epic`/`affected_flows` keys present
- [ ] `migrateFileContent` on a bug file → `found_in`/`category`/`severity` mapped
- [ ] `migrateFileContent` is idempotent — second pass on output returns `{changed: false}`, output identical
- [ ] body-anchoring — a fixture with `**Decision**: reject` in `## SDET Review` keeps that line in the body
- [ ] `verifyFrontMatter` flags the TASK-006-002-style inverted clock (`completed_at < started_at`)
- [ ] `verifyFrontMatter` flags an illegal `status` and an out-of-range `complexity_actual`
- [ ] `verifyFrontMatter` passes a well-formed block (the identical-verdict guarantee -002 depends on)

## Implementation Notes

- Mirror `db-migrate.ts` structure: exported pure functions + a thin CLI `main()` guarded by
  `import.meta` / direct-run check so the test file can import the pure functions without side effects.
- Atomic write: write to `<file>.tmp` then `fs.renameSync` — never a partial in-place rewrite.
- Front-matter emission: stable key order (use the mapping-table order above) so the diff is deterministic and
  reviewable. Empty fields emit as `key:` with empty value (or omit — record the `// DECISION:` and keep it
  consistent with what -002's verify expects for "empty where lifecycle permits").
- The migration's committed tree-rewrite is large but mechanical; the reviewable signal is the **script + its
  tests**, plus a spot-check of a few converted files. Keep the script's logic the unit of review.

## Definition of Done

- [ ] `scripts/migrate-task-frontmatter.ts` + schema/verify exist, unit-tested, lint/type-check/build/test green
- [ ] Migration run over `tasks/` + `tasks/done/` + `_templates/`; tree-rewrite committed in this diff
- [ ] Idempotency proven (run-twice no-op) in a test AND demonstrated in the Work Log (second run = 0 changed)
- [ ] Value + body preservation proven by round-trip tests
- [ ] Schema flags TASK-006-002 inversion (capture the verify output in the Work Log)
- [ ] AC-LOE-010-01/-02/-03 satisfied

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-21 [devops] Starting implementation — migrate-task-frontmatter.ts + schema/verify module + test fixtures | What's next: survey task corpus for all header keys, write pure functions + tests, run migration | Blockers: none
- 2026-06-21 [devops] Implementation complete. Submission gate results below. | What's next: SDET review | Blockers: none
- 2026-06-21 [sdet] APPROVED — all six focus areas independently verified; 46/46 tests re-run green; idempotency second run confirmed (Changed: 0 / Skipped: 88); TASK-006-002 clock inversion surfaced by independent tsx verify run; AC-LOE-010-01/-02/-03 satisfied. Status: done.

**Submission gate results:**
- `pnpm lint` — PASS (zero warnings)
- `pnpm type-check` — PASS (zero errors)
- `pnpm build` — PASS (portal + admin build clean)
- `pnpm test` — PASS: 46 tests, 2 test files (26 new + 20 existing db-migrate.test.ts). All green.

**Files created:**
- `scripts/task-frontmatter.ts` — schema/verify library (FIELD_MAP, parseFrontMatter, serializeFrontMatter, extractFrontMatter, verifyFrontMatter)
- `scripts/migrate-task-frontmatter.ts` — one-shot idempotent migration (parseHeaderBlock, migrateFileContent, migrateFileContentWithMeta, runMigration, CLI main)
- `scripts/migrate-task-frontmatter.test.ts` — 26 Vitest tests covering all ACs
- `scripts/__test_fixtures__/frontmatter/` — 6 fixture files (current-variant, legacy-epic, bug-variant, inverted-clock, bad-status, already-migrated, body-anchoring)
- `package.json` — added `"migrate:frontmatter": "tsx scripts/migrate-task-frontmatter.ts"`

**Migration run (first pass):**
- 88 files changed (TASK-*/BUG-* in tasks/, tasks/done/, _templates/)
- RETRO-*, HANDOFF-*, PROGRESS* excluded (DECISION: not lifecycle files; have body-prose bold fields only)

**Idempotency proof (second run):**
```
Changed: 0
Skipped: 88
```
Second run produced zero changes — proven.

**TASK-006-002 clock inversion verify output:**
```
verifyFrontMatter output:
  VIOLATION [clock.inversion]: TASK-006-002-admin-template-management-ui.md: clock inversion — completed_at (2026-06-18T20:06:28Z) is BEFORE started_at (2026-06-18T20:15:00Z)
```
Schema correctly flags the known inversion — AC-LOE-010-03 satisfied.

**Corpus survey findings:**
- Known FIELD_MAP keys: all 24 fields from the task spec mapping table covered
- Additional corpus keys found and added: Task, Fixes, Reviewer, Quad-review, Found by, Filed by, Found during, Raised by, Raised at, Filed at, Blocks, Owner, Reported by, Resolved by, Fixed-by, Files changed, Origin, Disposition
- Zero unknown keys remaining after survey + FIELD_MAP extension

**DECISION (inline-comment hints):** Comments `<!-- ... -->` stripped from header-block values during migration. They serve as author hints, not machine data. Body prose is byte-preserved.

**DECISION (RETRO/HANDOFF exclusion):** Migration filters to only `TASK-*.md`, `BUG-*.md`, `task.md`, `bug.md`. RETRO and HANDOFF files contain bold fields as body prose (not lifecycle header blocks) and have no lifecycle metadata to migrate.

**Zero new runtime deps:** hand-rolled scalar/list YAML serializer+parser in task-frontmatter.ts. No js-yaml/yaml/gray-matter added.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All six SDET focus areas independently verified. AC-LOE-010-01/-02/-03 confirmed satisfied.

Round-trip / value + body preservation (Focus area 1): current-variant, legacy-epic, bug-variant, and body-anchoring fixtures all pass the representative-sample check. The `body is byte-identical below the header block` test asserts the body sections survive verbatim (Quality Gates, Work Log, SDET Review sections). The migrated TASK-006-002 in `tasks/done/` confirmed independently: `**Decision**: approved` at line 132 in body, untouched.

Header-block anchoring (Focus area 2): the `body-anchoring.input.md` fixture has `**Decision**: reject`, `**Notes**:`, `**Attempt count**:`, `**Blockers**:`, `**Reviewer**:`, `**Root cause**:` all inside `## SDET Review` (after the `---` separator). The test `**Decision**: reject inside SDET Review stays in the body verbatim` passes (body contains all six fields; front-matter block contains none of them). Independently confirmed on the real migrated TASK-006-002 done file: `grep -n "^\*\*Decision\*\*"` returns line 132, which is body prose.

Both header variants + both bold-colon shapes (Focus area 3): legacy `Epic`/`Affected flows`/`Affected requirements`/`Relevant ADRs` mapped via the legacy-epic fixture test (all four keys confirmed in front matter). Both bold-colon shapes (`**Status**: done` and `**Introduces-gate:** yes`) confirmed by the `colon-inside-bold and colon-outside-bold are both parsed` test. Corpus survey extended FIELD_MAP with 18 additional keys found in done/ (Task, Fixes, Reviewer, Quad-review, Found by/Filed by, Found during, Raised by/at, Filed at, Blocks, Owner, Reported by, Resolved by, Fixed-by, Files changed, Origin, Disposition) — zero unknown keys remaining. The second run produced `Changed: 0 / Skipped: 88` with zero warnings.

Idempotency (Focus area 4): independently reproduced — `pnpm migrate:frontmatter` second run: `Changed: 0 / Skipped: 88`; `git diff --stat` shows no new changes (only the developer's committed tree-rewrite in the unstaged working tree, unchanged by the second run).

Schema surfaces the known TASK-006-002 inversion (Focus area 5): independently exercised `verifyFrontMatter` against the actual migrated `.implementation/tasks/done/TASK-006-002-admin-template-management-ui.md` via tsx script. Output: `VIOLATION [clock.inversion]: TASK-006-002-admin-template-management-ui.md: clock inversion — completed_at (2026-06-18T20:06:28Z) is BEFORE started_at (2026-06-18T20:15:00Z)`. AC-LOE-010-03 satisfied.

Zero new runtime npm dependency (Focus area 6): `grep js-yaml\|gray-matter\|\"yaml\"` in `package.json` returns nothing. Only `migrate:frontmatter` script added. Hand-rolled scalar/list parser/serializer confirmed in `task-frontmatter.ts` (zero imports of external YAML libraries).

DECISION soundness (Focus area 7): (a) Inline-comment hints `<!-- … -->` stripped only from header-block field values — body prose is byte-preserved (confirmed by body-anchoring tests). (b) RETRO-*/HANDOFF-* exclusion is correct — both file types verified to start with H1 body titles and contain no lifecycle header blocks (confirmed by reading RETRO-009.md and HANDOFF-009.md heads). Empty-field representation: dash sentinel `—` maps to empty via `isEmptyOrDash()` which recognizes `""`, `"—"`, and `"-"`; bare `key:` emits as empty string — both forms recognized as "empty where lifecycle permits" in verifyFrontMatter. Consistent with -002's verify needs.

Gate evidence (46/46 tests, independently re-run): `pnpm test` — 46 pass, 0 fail, 2 test files (`db-migrate.test.ts` + `migrate-task-frontmatter.test.ts`). Lint PASS, type-check PASS (both independently re-run). `Introduces-gate: advisory` — three-item Gate Authoring evidence not required on -001 (lands on -002).

Pre-implementation Work Log entry: present (`2026-06-21 [devops] Starting implementation —` as first Work Log entry, before the implementation-complete entry). Complexity-actual: 4 (valid 1–5). Started-at: 2026-06-21T18:01:16Z, Completed-at: 2026-06-21T19:30:00Z (>= started_at). All required task-spec fields present in front matter. All Quality Gate boxes ticked or [N/A]. No findings.

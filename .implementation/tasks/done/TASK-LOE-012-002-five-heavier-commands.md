---
brief: BRIEF-LOE-012
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-LOE-012-001
impl: developer
e2e_required: "no"
started_at: 2026-06-22T14:04:56.000Z
completed_at: 2026-06-22T14:36:46.000Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: advisory
acceptance_criteria: [AC-LOE-012-02, AC-LOE-012-03, AC-LOE-012-04, AC-LOE-012-05, AC-LOE-012-06]
upstream_refs: none
code_standards: "CS-INFRA-004 (recommended), CS-GEN-003 (recommended)"
---

# TASK-LOE-012-002: the 5 heavier task.ts commands (phase-transition / merge-checkpoint / post-merge / trace / report)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — engine tooling, no UI; brief sets `e2e: optional`
- [x] **Security review** — derive-from-source uses `gh`/`git` safely (no shell injection from PR args); `--role` roster-validated; path-confinement on bug-file scaffold
- [x] **SDET Review** — approved

## SDET Review focus areas

- **The judgment line (proposal §6 — HARD constraint).** The CLI RECORDS; it NEVER decides. Verify: `merge-checkpoint` gate-scorecard verdicts are AGENT-SUPPLIED inputs recorded verbatim (never computed); `post-merge` pass/fail and the bug description are agent inputs; `trace` builds the tier table but the AC-adequacy verdict stays agent-supplied (the CLI never decides coverage is sufficient). A command that computes a judgment is a rejection.
- **Derive-from-source, no transcription (AC-LOE-012-03).** `merge-checkpoint` must DERIVE the PR URL + squash SHA from `gh pr view` / `git log` — the agent never transcribes them. Verify via a fake `gh`/`git` fixture that the values come from the tool output, not from a flag the agent typed. Mirror the `orchestrate-state.sh` / `id-alloc.sh` derive-from-source precedent (proposal §11).
- **`--role` required + roster-validated** on every state-MUTATING command (`phase-transition`, `merge-checkpoint`, `post-merge`) — same Phase-1 rule, `{webapp-developer, devops, sdet, overwatch, io}`, no env fallback, no inference. `trace` and `report` are read projections (no `--role` mutation requirement, mirror the Phase-1 read commands).
- **Atomicity / idempotency / `--dry-run` (HARD extra gates).** Every `state.json` write: temp + `fs.renameSync`; re-running a settled transition is a clean no-op (exit 0, no corrupting double-write); `--dry-run` prints the JSON diff and writes nothing. Verify each mutating command on both paths.
- **`phase-transition` rejects illegal/unknown phases non-zero** (AC-LOE-012-02) against the schema enum from TASK-LOE-012-001. The append to `events.jsonl` + the `state.json` `phase` set are atomic together.
- **`post-merge` fail branch** scaffolds `BUG-BBB-POST-NNN` front matter THROUGH `task-frontmatter.ts` (not a re-implemented YAML writer) AND keeps the awaiting-merge record; pass branch clears the record. Verify both branches.
- **`report` is a generated view, never a source of truth (§9).** Its output is never committed and never read back. Verify the command only READS `state.json` + `events.jsonl` (+ front matter) and writes nothing to the repo.

## Context

Second step of BRIEF-LOE-012. Adds the five heavier `pnpm task` subcommands on top of the store from TASK-LOE-012-001, extending the existing `scripts/task.ts` entrypoint (13 commands already live — do not fork a new CLI). Each mutating command is idempotent + atomic with a `--dry-run` JSON-diff preview; PR/sha/AC-counts are derived from primary sources.

Satisfies **AC-LOE-012-02..06** (brief Notes, suggested split item 2).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/task.ts` | Modify | Add `phase-transition` / `merge-checkpoint` / `post-merge` / `trace` / `report` as exported pure functions + dispatch cases in `parseArgs` + `main`; extend usage text. Import the store helpers from TASK-LOE-012-001. |
| `scripts/task.test.ts` | Modify | Vitest over `scripts/__test_fixtures__/`: idempotent re-run + `--dry-run` of each state write; illegal/unknown-phase rejection; `merge-checkpoint` deriving URL+SHA from a fake `gh`/`git` fixture (not transcribed); `post-merge` both branches; `trace` tier tally over `@AC-*` fixtures; `report` renders without committing. |
| `scripts/__test_fixtures__/trace/unit-file.test.ts` | Create | `@AC-*`-tagged fixture for `trace` unit tier tally. |
| `scripts/__test_fixtures__/trace/e2e/e2e-file.spec.ts` | Create | `@AC-*`-tagged fixture for `trace` e2e tier tally. |

## Tests to Write First

- [x] `phase-transition --to <legal>` sets `phase` + appends an event atomically — expected: both written; `--dry-run` previews only
- [x] `phase-transition --to <illegal>` — expected: non-zero exit, clear message, nothing written
- [x] `phase-transition` re-run to the same settled phase — expected: clean no-op, exit 0
- [x] `merge-checkpoint --pr N` derives URL+SHA from the fake `gh`/`git` fixture — expected: record carries the derived values, NOT a transcribed flag
- [x] `merge-checkpoint` gate verdicts are recorded verbatim from agent input — expected: CLI does not compute them
- [x] `post-merge --pr N` (pass) — expected: clears the awaiting-merge record
- [x] `post-merge --pr N --bug "<desc>"` (fail) — expected: scaffolds `BUG-BBB-POST-NNN` via `task-frontmatter.ts` AND keeps the record
- [x] `trace --brief NNN` tallies `@AC-*` tags into a per-AC tier map (unit/integration/e2e/tier-3) — expected: structured table; no adequacy verdict computed
- [x] `report` and `report --md` render state — expected: human-readable narrative; nothing written to the repo
- [x] every mutating command on `--dry-run` — expected: JSON diff printed, tree unchanged

## Implementation Notes

- **Extend, do not fork.** These are cases 14–18 on the existing `task.ts` dispatch. Reuse `atomicWriteFile`, `validateRole`/`VALID_ROLES`, `nowIso`, `findRepoRoot`, the store helpers from -001, and `task-frontmatter.ts` for the `post-merge` bug scaffold.
- **`--dry-run` parsing:** add a `--dry-run` flag to `parseArgs` (boolean) and thread it through the mutating commands. On dry-run, compute the new state, diff against current, print the diff, return without writing.
- **Derive-from-source (§11).** `merge-checkpoint` shells `gh pr view <N> --json url` and `git log` (or `git rev-parse`) for the squash sha — mirror how `orchestrate-state.sh`/`id-alloc.sh` derive. Make the `gh`/`git` calls injectable so the test can substitute a fixture shim (no live network). Guard against shell injection from the `--pr` arg (numeric-validate it).
- **Judgment line (§6):** gate verdicts, the post-merge pass/fail call, the bug description, and `trace`'s adequacy sign-off are agent INPUTS. The CLI records them verbatim or builds the table — it never decides them. `// DECISION:` this boundary at each command (CS-GEN-003).
- **Metrics self-report:** mutating state writes should self-report consistently with the Phase-1 `appendMetricsRecord` path so `.claude/metrics/` stays populated (confirmed unchanged by `metrics-report.py` — coordinate with TASK-LOE-012-003's hook extension). State writes are not task-file edits; keep the provenance model (parent §4) — no new in-file marks.
- **Zero new runtime npm dependency (CS-INFRA-004); cite authority (CS-GEN-003).**

## Definition of Done

- [x] All 5 commands implemented on the existing `task.ts` entrypoint; usage text extended (AC-LOE-012-02..06)
- [x] Every state write idempotent + atomic; `--dry-run` previews the JSON diff and writes nothing
- [x] `merge-checkpoint` derives PR URL + sha from `gh`/`git` (agent never transcribes); gate verdicts recorded verbatim
- [x] `post-merge` both branches correct (clear-on-pass; scaffold-BUG-and-keep-on-fail via `task-frontmatter.ts`)
- [x] `trace` builds the tier map; adequacy verdict stays agent-supplied
- [x] `report [--md]` renders on demand; output never committed, never read back as truth
- [x] The judgment line holds: no command computes a judgment
- [x] Lint + type-check + build + `pnpm test` pass; zero new runtime npm dependency (or justified)

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-22 [devops] Starting implementation — 5 heavier task.ts commands | What's next: TDD the commands + run gates | Blockers: none
- 2026-06-22 [devops] Implemented all 5 commands (phase-transition, merge-checkpoint, post-merge, trace, report) in scripts/task.ts; 50 new tests in task.test.ts (129 total pass); state-store.test.ts 50 tests pass; lint green; zero new deps confirmed; judgment line DECISION comments at each command | What's next: SDET review | Blockers: none
- 2026-06-22 [sdet] Reviewed + REJECTED — BUG-LOE-012-001 | Two hard blockers: (1) Cyrillic homoglyph chars in sdет* identifiers across state-store.ts/task.ts/task.test.ts — schema-level data integrity hazard; (2) +9 new tsc errors under tsconfig.scripts.json (baseline 24 → 33). All other hard gates pass. | What's next: developer fixes sdет* → sdet* (ASCII) across all 3 files + fixes 9 new tsc errors; re-submits | Blockers: see BUG-LOE-012-001
- 2026-06-22 [devops] Fixed SDET rejection (BUG-LOE-012-001): Cyrillic sdет→ASCII sdet across 4 files (state-store.ts 18 occurrences, task.ts 21, task.test.ts 9, state-store.test.ts 6) incl. JSON schema keys + serialization paths; removed unused crypto import; added discriminant guards before .fm access in task.test.ts L2377/2876/2877; added null guard at task.ts L1026; fixed exactOptionalPropertyTypes in Phase-2 parseArgs switch cases (--to/--pr/--container-smoke/--sdet-*); tsc-scripts errors: 33 → 22 (below 24 baseline, no regression); vitest 179/179 pass; lint + type-check PASS; zero new deps | What's next: SDET re-review | Blockers: none
- 2026-06-22 [sdet] Re-reviewed + approved (attempt 1 fixes verified) | Homoglyph grep: python3 byte-pattern `sd\xd0\xb5\xd1\x82` finds ZERO hits in all 4 files; ASCII `sdetValidation`/`sdetCiGate`/`sdetQualityAudit` confirmed in schema property arrays (state-store.ts:275,279-281), interface (task.ts:111-113), serialization, and test assertions (task.test.ts:2731-2733, state-store.test.ts:209-211) — on-disk ASCII key contract holds; tsc-scripts: 22 errors (below 24 baseline, no new error types vs baseline; 3 pre-existing baseline errors fixed by this task); vitest 179/179; pnpm lint + pnpm type-check PASS; zero new deps; all prior PASS gates re-confirmed | What's next: dispatch TASK-LOE-012-003 | Blockers: none

## Attempt Log

**Attempt count**: 2 (fix attempt 2026-06-22 — BUG-LOE-012-001: Cyrillic sdет→sdet in 4 files + cleared 9 new tsc errors back to 22 (below 24 baseline))

## SDET Review

**Decision**: approved (re-review 2026-06-22, attempt 1 fixes verified)

**Notes**:

**Re-review — both BUG-LOE-012-001 blockers resolved:**

**Blocker 1 fix verified — Cyrillic homoglyphs eliminated:**
`python3` byte-pattern search for `sd\xd0\xb5\xd1\x82` across all 4 files returns ZERO hits. ASCII `sdetValidation`/`sdetCiGate`/`sdetQualityAudit` confirmed in every critical path: JSON Schema `required` arrays and property definitions (`state-store.ts:275,279-281`), `GateVerdictSlots` interface (`task.ts:111-113`), `serializeState` and `renderReport` serialization paths, and test fixture + assertion strings (`task.test.ts:2731-2733`, `state-store.test.ts:209-211`). On-disk ASCII key contract holds across schema, serialization, and tests.

**Blocker 2 fix verified — tsc-scripts error count 33 → 22 (below 24 baseline):**
Re-stashed the two tracked modified files (only `task.ts` + `task.test.ts` are tracked; `state-store.ts` + `state-store.test.ts` are untracked new files); confirmed baseline is 24 errors; unstashed and confirmed branch is 22 errors. Net delta = -2 (improvement). All 22 remaining errors are structural `exactOptionalPropertyTypes`/`undefined` propagation errors — the same pre-existing pattern from Phase-1 code — no new error types introduced. Three baseline errors were actually fixed by this task (unused crypto import, two `.fm` discriminant guards, one null guard).

**All prior PASS gates re-confirmed unregressed after rename:**
- `pnpm lint` PASS; `pnpm type-check` PASS
- `npx vitest run scripts/task.test.ts scripts/state-store.test.ts`: 179/179 PASS
- Zero new runtime npm dependencies (`git diff HEAD -- package.json pnpm-lock.yaml` empty)
- Judgment line (§6 HARD): PASS — `// DECISION:` boundary comments present at all 5 new commands; gate verdicts, pass/fail, bug description, and adequacy verdict are agent inputs, not computed
- Derive-from-source (AC-LOE-012-03): PASS — `ghPrViewUrl`/`gitRevParse` injectable shims confirmed; `DERIVE-FROM-SOURCE` test at `task.test.ts:2688` asserts `prUrl`/`squashSha` come from shim, not agent flags; numeric PR guard present
- `--role` required + roster-validated: PASS on all three mutating commands; `trace`/`report` read-only (no `--role` requirement)
- Atomicity / idempotency / `--dry-run`: PASS unchanged
- `phase-transition` rejects illegal phases non-zero: PASS unchanged
- `post-merge` both branches: PASS unchanged
- `report` read-only (§9): PASS unchanged

**Original rejection decision:** rejected — BUG-LOE-012-001 (2026-06-22, attempt 1)

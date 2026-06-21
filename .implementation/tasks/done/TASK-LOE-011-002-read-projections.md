---
brief: BRIEF-LOE-011
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-LOE-011-001
impl: developer
e2e_required: "no"
started_at: 2026-06-21T21:30:20Z
completed_at: 2026-06-21T23:55:00Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: no
acceptance_criteria: [AC-LOE-011-06]
upstream_refs: none
code_standards: ["CS-INFRA-004 (recommended)", "CS-GEN-003 (recommended)"]
---

# TASK-LOE-011-002: `scripts/task.ts` read/query projections (show/list/next/summary/progress/brief-context)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm test` (scripts vitest) pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — engine tooling, no UI; brief sets `e2e: optional` → N/A
- [x] **Security review** — read-only commands never mutate any file; `<ID>`/`--brief` inputs confined to the repo task tree (no traversal)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Read commands never mutate.** Verify every read/query subcommand is strictly read-only — no `fs.writeFile`,
  no rename, no metrics record (metrics self-report is a write-side concern). A read command that touches disk
  state is a rejection.
- **Bounded projections, not whole files (AC-06).** `show`/`list`/`next`/`summary`/`progress` return a bounded
  slice (a field set, a compact table, a rollup), NOT the entire file dumped. `progress` projects ONLY the
  `## Current initiative` hot-state from PROGRESS.md, not the session-entry tail.
- **Output contract (§10 Q5):** compact text/tables default (token-cheap); `--json` opt-in for programmatic
  callers; `brief-context` defaults to the paste-ready markdown bundle (its consumer pastes it into a spawn
  prompt), `--json` available. Confirm both modes are tested for at least the representative commands.
- **Reuse `task-frontmatter.ts`** for all front-matter reads (`extractFrontMatter`/`parseFrontMatter`); reuse
  the -001 loading/arg-parsing helpers. No re-implemented YAML parse.
- **CS-INFRA-004**: zero new runtime npm dependency. **CS-GEN-003**: cite authority at non-obvious choices.

## Context

Second task of BRIEF-LOE-011. Adds the bounded read/query side (proposal §8.2) to `scripts/task.ts` so agents
stop pulling whole markdown files into context to extract a handful of facts. Depends on TASK-LOE-011-001 (same
file; reuses its front-matter loading + arg-parsing helpers). Satisfies AC-LOE-011-06. The `brief-context`
projection is the highest-leverage item — it makes the IO's spawn-prompt packing a deterministic projection.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/task.ts` | Modify | Add the 6 read/query subcommands + the `--json`/compact-text rendering. Keep all front-matter reads on `./task-frontmatter`. |
| `scripts/task.test.ts` | Modify | Add read-projection tests: each command's bounded projection in default (compact text) and `--json` mode; `progress` projects only `## Current initiative`; `brief-context` emits the paste-ready bundle; assert no mutation occurs. |
| `scripts/__test_fixtures__/task/**` | Modify | Extend fixtures as needed for the read scenarios (a brief with several tasks across statuses; a `PROGRESS.md` fixture for `progress`). |
| `scripts/__test_fixtures__/task/TASK-RD-001-001-backlog-read-fixture.md` | Create | Fixture: BRIEF-RD-001 backlog task (for list/next/summary/brief-context tests). |
| `scripts/__test_fixtures__/task/TASK-RD-001-002-inprogress-read-fixture.md` | Create | Fixture: BRIEF-RD-001 in-progress task. |
| `scripts/__test_fixtures__/task/TASK-RD-001-003-review-read-fixture.md` | Create | Fixture: BRIEF-RD-001 review task. |
| `scripts/__test_fixtures__/task/PROGRESS-fixture.md` | Create | Fixture: PROGRESS.md with ## Current initiative + session tail (for progress test). |
| `scripts/__test_fixtures__/task/BRIEF-RD-001-read-projection-test.md` | Create | Fixture: brief file with structured AC YAML (for brief-context AC text extraction test). |

## Implementation Notes

- **Read/query subcommand surface (proposal §8.2):**
  - `show <ID> [--fields status,complexity-actual,…]` → just the requested metadata fields (default: the
    lifecycle block), not the whole file.
  - `list --brief NNN [--status review …]` → a compact table of IDs + status (+ optional status filter).
  - `next [--brief NNN]` → the next actionable task id + a one-line scope.
  - `summary --brief NNN` → computed rollup: counts by status, open gates, missing-metadata flags.
  - `progress` → the `## Current initiative` hot-state ONLY (not the session-entry tail).
  - `brief-context <ID>` → the bounded bundle a subagent needs (task spec + cited ACs + cited `CS-*`); **defaults
    to a paste-ready markdown bundle**, `--json` available.
- **Output format (§10 Q5):** compact text/tables is the default everywhere (token-cheap, human- and
  agent-readable); `--json` is opt-in for callers that will parse; `brief-context` defaults to paste-ready
  markdown.
- **Strictly read-only:** no write, no rename, no metrics self-report. These commands derive from the on-disk
  front matter (and PROGRESS.md for `progress`) — one fact, one home (NORTH-STAR #3, derive-from-source).
- **Out of scope:** the write subcommands (-001); the doc rewrites + AC-09 end-to-end test (-003); Phase-2.

## Tests to Write First

- [ ] `show TASK-… --fields status,complexity_actual` → returns only those fields — expected: bounded output, no full-file dump
- [ ] `list --brief LOE-011 --status backlog` → compact table of matching IDs only — expected: filtered table
- [ ] `next --brief LOE-011` → the next actionable task id + one-line scope — expected: single actionable item
- [ ] `summary --brief LOE-011` → counts-by-status rollup + missing-metadata flags — expected: computed rollup
- [ ] `progress` → projects only `## Current initiative`, excludes the session-entry tail — expected: bounded hot-state
- [ ] `brief-context TASK-…` (default) → paste-ready markdown bundle (spec + cited ACs + cited CS-*) — expected: markdown bundle; `--json` → structured object
- [ ] `--json` mode for a representative read command → valid parseable JSON — expected: structural parity with compact text
- [ ] any read command run twice → no file/metrics mutation between runs — expected: read-only invariant holds

## Definition of Done

- [x] AC-LOE-011-06 satisfied and tested (bounded projections; default compact text + `--json`; `brief-context` paste-ready; never mutates)
- [x] Lint + type-check + build pass
- [x] `pnpm test` (scripts vitest) green
- [x] All front-matter reads route through `scripts/task-frontmatter.ts`; reuses -001 helpers (no duplication)
- [x] Zero new runtime npm dependency (CS-INFRA-004); authority cited (CS-GEN-003)

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-21 [devops] Starting implementation — 6 read/query subcommands (show/list/next/summary/progress/brief-context) + dual-mode output + tests | What's next: implement read commands in task.ts, add fixtures, write tests | Blockers: none
- 2026-06-21 [devops] Implementation complete — added 6 read subcommands + rendering + 46 new tests (170 total, 170 pass); validate-gates.sh ALL CHECKS PASSED; lint/type-check/build green; read-only invariant asserted; progress oracle tests against REAL extractCurrentInitiativeSection output; brief-context resolves ACs from brief YAML + CS texts from .code-standards/ | What's next: SDET review | Blockers: none
- 2026-06-21 [sdet] APPROVED — read-only invariant verified (static + empirical + 4 invariant tests); projection fidelity confirmed (real oracle for progress, bounded show default, live brief-context from real sources); 170/170 pass including -001 metrics-parity real-hook test; validate-gates.sh ALL CHECKS PASSED | What's next: IO dispatches TASK-LOE-011-003 | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All three primary axes confirmed.

**Headline (read-only invariant):** Independently verified via (a) static code inspection — zero `appendMetricsRecord`, `atomicWriteFile`, `fs.writeFile`, `fs.renameSync`, or `appendFileSync` calls in any of the 6 read subcommand bodies (lines 977–1969 of task.ts); (b) live empirical before/after check — `tasks.jsonl` line count unchanged at 1010 and task file mtime unchanged after running `pnpm task show` and `pnpm task progress` live; (c) 4 invariant tests exercising mtime + metrics-count before/after across show/list/next/summary/progress — all pass. Advisory note: `cmdBriefContext` is not covered by the invariant describe block, but is demonstrably write-free (only `fs.readFileSync` in its body).

**Projection fidelity:** The `progress` oracle test at L1632 asserts `result.hotState === extractCurrentInitiativeSection(fixtureContent)` — the real function on the real fixture, not a hand-rebuilt copy. The `PROGRESS-fixture.md` deliberately carries session-tail entries ("IO Plan" / "IO Dispatch" after `---`) which the test confirms are excluded. `show` default returns exactly the 8 LIFECYCLE_FIELDS (no full-file dump). `brief-context` resolves AC-LOE-011-06 text from the BRIEF-LOE-011 YAML and CS-INFRA-004/CS-GEN-003 rule text from the real `.code-standards/` files — confirmed live via `pnpm task brief-context TASK-LOE-011-002`.

**No write-side regression:** 170/170 tests pass including the real `log-task-edit.py` hook metrics-parity test from -001 (hard `delta === 1` assertion, no fallback path). `validate-gates.sh` ALL CHECKS PASSED. `pnpm lint` and `pnpm type-check` both green.

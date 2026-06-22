# RETRO-LOE-012 — Phase 2: structured state store (`state.json` + `events.jsonl`)

> Engine-tooling slice, epic `chore/lights-out-enablement`. The **third and final build phase** of the ratified
> scripted-bookkeeping initiative (`PROPOSAL-scripted-bookkeeping-phase2.md`). Successor to `BRIEF-LOE-011`
> (Phase 1, merged `8ec1f5a`). This is the one breaking change to the orchestration-state shape: it **removed
> the hand-curated `PROGRESS.md` prose ledger** and cut bookkeeping over to a cold-derivable structured store.
> Branch: `brief-LOE-012-state-store`. Status at write: **Close-prep complete; awaiting PR (expected #80) + user LGTM.**

## What shipped

1. **The state store** — `.implementation/state.json` (orchestration hot-state: brief/phase/slice/branch,
   awaiting-merge records with the 4 gate-verdict slots, open retro items) + `.implementation/events.jsonl`
   (append-only phase/slice/merge history). Both committed; `task report` output is never committed (§9
   generated-view-not-ledger).
2. **A vendored, zero-dependency JSON-Schema oracle** (`validateState()` in `scripts/state-store.ts`) — a
   separate code path from the serializer, proven to RED a deliberately-malformed fixture. The Phase-0
   YAML-blocker lesson (RETRO-LOE-010 / validation-oracle-independent-of-code) generalized to JSON.
3. **A lossless one-shot migration** from `PROGRESS.md` → `state.json`, proven by a **rendered-report-vs-pre-migration-PROGRESS.md diff** (not a self-serialize round-trip). `## Active bugs` became a QUERY over BUG-\*
   front matter (§9.1 one-fact-one-home) — NOT copied into `state.json`.
4. **The 5 heavier `task.ts` commands** — `phase-transition` / `merge-checkpoint` / `post-merge` / `trace` /
   `report`, each idempotent + atomic (temp + `fs.renameSync`), `--dry-run` JSON-diff preview, `--role`
   roster-validated on every mutating command. `merge-checkpoint` DERIVES PR URL + squash SHA from
   `gh pr view` / `git rev-parse` (the agent never transcribes them).
5. **`validate-gates.sh` checks 3 & 9 re-pointed** from grepping `PROGRESS.md` markdown to validating the
   `state.json` schema via the independent oracle (through tsx wrappers `state-store-validate.ts` /
   `state-store-validate-awaiting.ts`). **Check 8 (`check_pr_body_quad_review`) left byte-unchanged** —
   corrects the parent proposal's "3/8/9" → only 3 & 9.
6. **Doc retirements with zero dangling refs** — ENGINE § Bounded-ledger rule + PHASES § Phase-transition
   reflex deleted; ENGINE § PROGRESS.md structure contract replaced by the state.json schema contract; the
   sweep across ENGINE/PHASES/AGENT/sdet/overwatch is clean. **`PROGRESS.md` removed from the repo** (gated on
   the round-trip-parity test being green first); `PROGRESS-ARCHIVE.md` kept as a FROZEN historical pointer.
7. **`log-task-edit.py` extended** for state-write provenance (`.claude/metrics/state-writes.jsonl`); no
   in-file watermarks on `state.json`; `metrics-report.py` reads `.claude/metrics/` unchanged.

## The 9-AC ↔ task ↔ evidence map

| AC | Task | Evidence (verified at Close-prep) |
| --- | --- | --- |
| **AC-LOE-012-01** store + lossless migration; bugs = QUERY | -001 | `state.json` + `events.jsonl` exist; migration round-trip proven by rendered-report-vs-PROGRESS.md diff; `state.json` carries no `bugs`/`activeBugs` list (grep PASS); 50/50 tests. |
| **AC-LOE-012-02** `phase-transition` atomic + `--dry-run`; illegal-phase reject | -002 | Dogfooded live: `Dispatch → Close-prep` recorded; `--dry-run` previewed diff + event, wrote nothing; idempotent re-run = clean no-op; illegal-phase test rejects non-zero. |
| **AC-LOE-012-03** `merge-checkpoint` DERIVES URL+SHA | -002 | `cmdMergeCheckpoint` shells `ghPrViewUrl`/`gitRevParse` shims; `DERIVE-FROM-SOURCE` test asserts values come from the shim, not flags; gate verdicts recorded verbatim. |
| **AC-LOE-012-04** `post-merge` pass clears / fail scaffolds BUG | -002 | Both branches tested: pass clears the record; fail scaffolds `BUG-BBB-POST-NNN` via `task-frontmatter.ts` AND keeps the record. |
| **AC-LOE-012-05** `trace` tier tally; adequacy stays agent-supplied | -002 | `cmdTrace`/`renderTrace` build the per-AC unit/integration/e2e/tier-3 map over `@AC-*` fixtures; no adequacy verdict computed. |
| **AC-LOE-012-06** `report [--md]` on-demand, never committed | -002 | Dogfooded: `report --md` rendered the Close-prep state correctly; output is read-only, never written to the repo. |
| **AC-LOE-012-07** checks 3 & 9 re-pointed to schema; check 8 untouched | -003 | Counterfactual independently reproduced (malformed state REDs check 3 + check 9, exit 1); `check_pr_body_quad_review` byte-identical to main (`diff` empty). |
| **AC-LOE-012-08** prose-ledger retired, zero dangling refs, PROGRESS.md removed | -003 | Grep sweep of all 5 docs → zero refs; `PROGRESS.md` ABSENT; `validate-gates.sh` ALL CHECKS PASSED with it gone. |
| **AC-LOE-012-09** end-to-end slice + cross-session resume | -003 | Suite 10 (8 tests) green; resume test reads ONLY `state.json` + `events.jsonl` (asserts PROGRESS.md absent), reconstructs full context; independent gate green over mutated tree; `.claude/metrics/` populated. |

## Headline lesson — the independent-oracle ethos, vindicated twice

**The SDET's independent homoglyph + tsc-baseline check caught a defect the tests passed straight through**
(BUG-LOE-012-001). TASK-LOE-012-002 shipped three field identifiers with **Cyrillic homoglyphs** —
`sdетValidation` / `sdетCiGate` / `sdетQualityAudit` (Cyrillic `ет` = U+0435 U+0442, not ASCII `et`) —
contaminating the JSON Schema property arrays, the serialization paths, AND the test assertions. **The 179
tests all passed** because they shared the same Cyrillic keys end-to-end: the test asserted that
Cyrillic-keyed JSON round-trips, not that ASCII keys are used. Any downstream tool expecting ASCII
`sdetValidation` would have silently missed the field, and the schema would have rejected a correctly-named
one. The SDET caught it with two checks **outside the test loop**: a byte-level `grep -Pn "[^\x00-\x7F]"`
homoglyph sweep and a `tsconfig.scripts.json` tsc-baseline delta (33 vs. 24). This is a direct vindication of
the brief's HARD independent-oracle gate — a validator that shares the producing code's assumptions is itself a
"ledger verdict." The same ethos is baked into the slice's own permanent regression: `validateState()` is a
separate code path from `serializeState()`, proven to RED a malformed fixture.

**Process note:** the homoglyph also slipped because `pnpm type-check` covers only `apps/**` + `packages/**` —
`scripts/` is gated by the secondary `npx tsc --noEmit -p tsconfig.scripts.json`, which the developer's
submission-gate evidence did not run. Carried to advisory below.

## Gate scorecard

| # | Gate | Verdict |
| --- | --- | --- |
| 1 | Per-task submission gates | **PASS** (3/3 tasks; submission-gate evidence in each Work Log / SDET re-run) |
| 2 | SDET Review | **PASS** (3/3 approved; -002 after one rejection → BUG-LOE-012-001 resolved) |
| 3 | Overwatch Audit | **PASS** (advisory; no blocking findings — see dispositions) |
| 4 | IO Design scan | **PASS** (see verdict below) |
| 5 | Container Smoke gate | **PASS** — `validate-gates.sh` ALL CHECKS PASSED over the **real tree with PROGRESS.md ABSENT**; clean + all-pass fixtures green (exit 0); malformed-state and clock-inversion counterfactuals both RED (exit 1). For this engine-tooling slice (no UI, `brief_deploys: no`), the independent gate over real + mutated state IS the deploy-layer proof. |
| 6 | SDET Acceptance-validation gate | **PASS** — all 9 ACs traced to passing tests/evidence (table above). |
| 7 | SDET CI gate | **PASS** — `pnpm lint` ✓, `pnpm type-check` ✓, `npx vitest run` **226/226** ✓. |
| 8 | Post-merge CI | **PENDING** (post-merge — Close-finalize). |
| 9 | Post-merge staging smoke | **N/A** — `brief_deploys: no`. |

## IO Design-scan verdict (gate 4) — PASS

Read the integrated working-tree diff (2,151 insertions / 513 deletions across 12 tracked files + the new
scripts/fixtures). All six design invariants hold:

- **The CLI RECORDS, never DECIDES** — the judgment line held across all 5 commands. `// DECISION:` comments at
  `phase-transition` (structural validation, not judgment), `merge-checkpoint` (gate verdicts AGENT-SUPPLIED,
  recorded verbatim; `null` = not-yet-recorded), `post-merge` (pass/fail + bug description are agent inputs),
  and `trace` (renders the tier map verbatim, adds no adequacy verdict). No command computes a judgment.
- **One-fact-one-home (§9.1)** — `active-bugs` is a QUERY, not stored in `state.json` (grep PASS; `report`
  renders the "Active bugs are a QUERY" line). No fact duplicated across the store and a markdown file.
- **Check 8 fenced out** — `check_pr_body_quad_review` byte-identical to main.
- **PROGRESS.md deletion gated on round-trip parity** — -003 deleted it only after -001's parity test was green.
- **No product-code creep** — zero changes under `apps/**`, `packages/**`, `prisma/**`, `db/**` (grep NONE).
- **Zero new runtime npm dep** — `git diff HEAD -- package.json pnpm-lock.yaml` empty (CS-INFRA-004 honored).

## Carried-item closures delivered by this slice

- **[metric-integrity, retro-012-014 — CLOSED structurally] `Completed-at`/`Started-at` clock inversion.** The
  long-carried `ungated-fix` (9th+ project-wide recurrence) is now structurally enforced: check 9's
  record-level no-inversion invariant REDs any `createdAt > lastUpdated` awaiting-merge record (counterfactual
  reproduced by the SDET, exit 1). **This slice's own 4 task/bug files are the first-ever clean set** — every
  `completed_at >= started_at`, verified at the Consistency gate. The structural enforcement closes the
  *awaiting-merge-record* inversion class. **Residual (narrowed):** the original recurrence was developer
  agents writing `Completed-at` on *task files* in a later session against an earlier `Started-at`; that is a
  task-front-matter concern (`validate-gates.sh` check 1 `check_task_file_completion` / a developer-doc rule),
  not state.json. Recommend a follow-up amends `.implementation/agents/developer.md` to prohibit developer
  writes to task `Completed-at` (SDET-authored only) — tracked as advisory below, NOT slice-blocking.
- **[gate-design, retro-012-016 — MOOT] `check_work_log_content` PROGRESS-coupling.** PROGRESS.md is removed
  and checks 3/9 are re-pointed to the schema, so the PROGRESS-coupled brittleness of that check is moot. (The
  `"Starting implementation"` literal-grep wording brittleness on *task-file* Work Logs is a separate, still-open
  observation — see advisory.)

## Advisory dispositions (observations — not slice-blocking, no gate failure)

- **[process — NEW, from BUG-LOE-012-001] `scripts/` outside the canonical `pnpm type-check` gate.** The
  homoglyph + 9 tsc errors slipped the developer submission gate because `pnpm type-check` covers only
  `apps/**` + `packages/**`; `scripts/` needs the secondary `npx tsc --noEmit -p tsconfig.scripts.json`.
  **Recommend:** add the scripts tsc check (and a `grep -Pn "[^\x00-\x7F]"` homoglyph sweep on `scripts/`) to
  the submission-gate command set for engine-tooling tasks. `ungated-fix` candidate; route to a future
  ungated/CI change. Not promoted here (the SDET's independent checks caught it — the safety net held).
- **[metric-integrity — retro-012-014 residual] developer task-file `Completed-at` writes.** As above — amend
  `developer.md` to prohibit developer writes to task `Completed-at`; fold in the `Updated-by: sdet`-on-close
  sister finding. Quad-review workflow-file doc edit; rides a future ungated change.
- **[gate-design — retro-012-016 residual] `check_work_log_content` `"Starting implementation"` literal grep.**
  Broaden to a synonym set or publish the exact phrase. ENGINE/CI-tooling backlog; not slice-blocking.
- **[rule-sunset — retro-012-009] Autonomy-Ceiling `--no-verify` clause + `PushNotification` spam-loop guard.**
  Flagged as sunset candidates (untriggered 3+ slices). **Recommendation: KEEP both** — they are
  load-bearing safety rails (credential-bypass prevention; alert-fatigue prevention) whose value is in *never*
  triggering, not in firing. Not the kind of rule the sunset process should remove. Re-surface only if a
  reviewer disagrees.
- **Pre-existing carried infra/CI/demo/e2e items** (retro-012-001..013, 015) are **out of this slice's scope**
  (engine tooling touched no `apps/`/`packages/`/`infra/` code). They survive in `state.json` `openRetroItems`,
  correctly migrated from PROGRESS.md, and carry forward unchanged to the next product slice.

## Notes for the next slice / Conductor

- **The bookkeeping ledger is now `state.json` + `events.jsonl`.** Future IO invocations resume from
  `pnpm task report` (or read `state.json` directly), NOT PROGRESS.md (gone). `task report --md` is the
  on-demand human-readable view — never commit its output.
- **`merge-checkpoint` runs AFTER the PR is opened** (it derives the URL + squash SHA from `gh`/`git`). The
  awaiting-merge record for PR #80 + its gate-verdict slots land at that point; it cannot be hand-fabricated.
- **Scripted-bookkeeping initiative is now Phase 0+1+2 complete** — the full `pnpm task` CLI owns per-task
  lifecycle (Phase 1) AND orchestration state (Phase 2). Next strangler advancement: evaluate per the
  scripted-orchestration North Star at the next phase boundary.

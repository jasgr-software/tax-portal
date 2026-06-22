# HANDOFF-LOE-012 — Phase 2: structured state store (`state.json` + `events.jsonl`)

> Completion/handoff report for `BRIEF-LOE-012`. Engine-tooling slice, epic `chore/lights-out-enablement`.
> The third and final build phase of the scripted-bookkeeping initiative — replaces the hand-curated
> `PROGRESS.md` prose ledger with a cold-derivable structured store + 5 heavier `task.ts` commands.
> Branch: `brief-LOE-012-state-store`. `brief_deploys: no`.

## Status

**Close-prep complete.** Gates 1–7 PASS; gate 8 (post-merge CI) pending; gate 9 N/A (`brief_deploys: no`).
Awaiting: PR (expected **#80**) → Standards audit → `/pr-review` panel → fix → resolve threads → **user LGTM**
→ merge on green required CI. Then re-invoke the IO for Close-finalize.

## AC ↔ evidence table

| AC | Behavior | Evidence | Verdict |
| --- | --- | --- | --- |
| AC-LOE-012-01 | Store + lossless migration; bugs = QUERY | `state.json` + `events.jsonl` exist; rendered-report-vs-PROGRESS.md diff lossless; no bug list stored (grep PASS); 50/50 tests | ✅ |
| AC-LOE-012-02 | `phase-transition` atomic + `--dry-run`; illegal-phase reject | Dogfooded `Dispatch → Close-prep`; `--dry-run` wrote nothing; idempotent no-op; illegal-phase rejects non-zero | ✅ |
| AC-LOE-012-03 | `merge-checkpoint` DERIVES URL+SHA | Injectable `gh`/`git` shims; derive-from-source test asserts no transcription; verdicts recorded verbatim | ✅ |
| AC-LOE-012-04 | `post-merge` pass clears / fail scaffolds BUG | Both branches tested; BUG scaffolded via `task-frontmatter.ts`; record kept on fail | ✅ |
| AC-LOE-012-05 | `trace` tier tally; adequacy agent-supplied | Per-AC unit/integration/e2e/tier-3 map over `@AC-*` fixtures; no adequacy verdict computed | ✅ |
| AC-LOE-012-06 | `report [--md]` on-demand, never committed | Rendered Close-prep state correctly; read-only | ✅ |
| AC-LOE-012-07 | Checks 3 & 9 → schema; check 8 untouched | Malformed-state counterfactual REDs check 3 + 9 (exit 1); check 8 byte-identical to main | ✅ |
| AC-LOE-012-08 | Prose ledger retired; zero dangling refs; PROGRESS.md removed | Grep sweep of 5 docs → zero refs; PROGRESS.md ABSENT; `validate-gates.sh` ALL CHECKS PASSED | ✅ |
| AC-LOE-012-09 | End-to-end slice + cross-session resume | Suite 10 (8 tests) green; resume reads only `state.json` + `events.jsonl`; gate green over mutated tree; metrics populated | ✅ |

## Independent verification run at Close-prep (numbers)

- `pnpm lint` → PASS · `pnpm type-check` → PASS
- `npx vitest run scripts/state-store.test.ts scripts/task.test.ts scripts/validate-gates.test.ts` → **226/226 PASS**
- `bash scripts/validate-gates.sh` (real tree, PROGRESS.md ABSENT) → **ALL CHECKS PASSED (0 failures)**
- Counterfactuals: malformed-state fixture → exit 1; clock-inversion fixture → exit 1; clean + all-pass → exit 0
- Consistency gate: 4 done files, all `complexity_actual = 4 ∈ 1..5`, **zero clock inversion** (first-ever clean set)
- No product-code creep (zero `apps/`/`packages/`/`prisma/`/`db/`); zero new runtime npm dep

## The merge gate (READ BEFORE MERGING)

**This PR MUST NOT auto-merge.** It edits 5 quad-review workflow files (`ENGINE.md`, `PHASES.md`, `AGENT.md`,
`agents/sdet.md`, `agents/overwatch.md`) → **user-LGTM gate, Autonomy Ceiling 3(c)** — merge only after the
user posts an `LGTM` / `/approve` comment on the PR. It also touches `scripts/` (application-code scope) → the
**full reviewed lane**: code-standards Standards audit → `/pr-review` panel → `/pr-fix` → resolve threads →
user LGTM → merge on green **required** CI (`lint-and-typecheck` + `security-scan`). **No `--admin`, no
`enforce_admins` toggle, no protection relaxation.**

## Close-finalize checklist (post-merge, next IO invocation)

1. Confirm PR #80 merged (squash).
2. `pnpm task merge-checkpoint --pr 80 --role io` — derives URL + squash SHA, records the awaiting-merge entry
   with gate-verdict slots (containerSmoke=PASS, sdetValidation=PASS, sdetCiGate=PASS, sdetQualityAudit=PASS).
   *(May also be run at PR-open time to populate `awaitingMerge` before merge — IO's call.)*
3. Verify post-merge CI green (gate 8).
4. `pnpm task post-merge --pr 80 --role io` (pass) — clears the awaiting-merge record.
5. Append the `## Post-Merge Addendum` to `RETRO-LOE-012.md`.
6. Gate 9 N/A (`brief_deploys: no`).

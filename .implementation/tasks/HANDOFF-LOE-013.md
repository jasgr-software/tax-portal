# HANDOFF-LOE-013 — Cross-layer removal-sweep gate (validate-gates.sh check 10)

> Completion/handoff report for `BRIEF-LOE-013`. Engine/CI-tooling chore, epic `chore/lights-out-enablement`.
> A focused gate-design follow-up that **closes retro-012-017** — the gate-design action item carried out of
> BRIEF-LOE-012. Operationalizes the PR #80 lesson (orphan-after-removal) so a removal task that forgets to
> sweep a cross-layer executable consumer is caught at **task-time**, not review-time.
> Branch: `brief-LOE-013-removal-sweep-gate`. `brief_deploys: no`.

## Status

**Close-prep complete.** Gates 1–7 PASS; gate 8 (post-merge CI) pending; gate 9 N/A (`brief_deploys: no`).
Awaiting: PR → code-standards Standards audit → `/pr-review` panel → `/pr-fix` → resolve threads → **user LGTM**
→ merge on green required CI. Then re-invoke the IO for Close-finalize.

## AC ↔ evidence table

| AC | Behavior | Evidence | Verdict |
| --- | --- | --- | --- |
| AC-LOE-013-01 | Diff-based removal detection (`git diff --diff-filter=D -M`, rename-aware); fixture `.removed_files` manifest; SKIP-not-FAIL on no base | check 10 at `validate-gates.sh:761`; real tree → `SKIP (no removed files in diff)`; skip fixture → clean SKIP; 47/47 tests | ✅ |
| AC-LOE-013-02 | Sweep post-removal tree (path-primary); classify executable→FAIL (names `path:line`) vs `.md`-only→ALLOWED; excludes removed file/`.git`/`node_modules`/fixtures | red fixture → exit 1 names `.fixture-consumer.sh:21`; doc-only fixture → PASS; Suite 8 | ✅ |
| AC-LOE-013-03 | Reason-mandatory allowlist (`.implementation/removal-sweep-allow.txt`); allowlisted exec hit→PASS (reason echoed); empty reason→FAIL | allowlisted fixture → PASS + reason; missing-reason fixture → FAIL; AC-04 echoes 14 allowlisted hits | ✅ |
| AC-LOE-013-04 | Introducing the gate does NOT red current main; `.orchestration/` retained refs reconciled (allowlisted-with-reason) | `validate-gates.sh --removed-files <PROGRESS.md>` over **real tree** → ALL CHECKS PASSED (exit 0); all exec hits allowlisted | ✅ |
| AC-LOE-013-05 | Gate Authoring three evidence items; canonical PR #80 red fixture (constructed-path consumer) reds the gate | Work Log Items 1–3; red fixture exit 1 names consumer; SDET independently reproduced | ✅ |
| AC-LOE-013-06 | Standing rule documented (ENGINE.md § Removal Sweep); cross-layer scope; closes retro-012-017; part of same CI run; checks 1–9 untouched (check 8 byte-unchanged) | ENGINE.md § Removal Sweep; check 8 MD5 `ba4ef4fb…` identical to origin/main; 316 additions / 0 deletions to validate-gates.sh | ✅ |

## Independent verification run at Close-prep (numbers)

- `pnpm lint` → PASS · `pnpm type-check` → PASS · `pnpm build` → PASS
- `npx vitest run scripts/validate-gates.test.ts` → **47/47 PASS**
- `npx vitest run scripts/` → **292/292 PASS**
- `bash scripts/validate-gates.sh` (real tree) → **ALL CHECKS PASSED** (check 10 `SKIP — no removed files in diff`)
- Counterfactual: `--fixture-dir …/removal-sweep-red` → **exit 1**, names `.fixture-consumer.sh:6/:11/:21` (line 21 = the constructed-path `${REPO_ROOT}/.implementation/tasks/PROGRESS.md` form)
- AC-04 live proof: `--removed-files <PROGRESS.md>` over real tree → **exit 0, ALL CHECKS PASSED**, 14 allowlisted hits echoed with reasons
- check 8 (`check_pr_body_quad_review`) **byte-identical** to origin/main (MD5 `ba4ef4fb00165fbc0a0cd72a5bd55926`); validate-gates.sh diff = 316 add / 0 del
- Consistency gate: 2 done files, `complexity_actual` 4 & 1 (∈ 1..5), **zero clock inversion** (completed_at ≥ started_at on both)
- Zero new runtime npm dep (`package.json`/`pnpm-lock.yaml` diff empty); no product-code creep (`apps/`/`packages/`/`prisma/`/`db/` all clean)

## The merge gate (READ BEFORE MERGING)

**This PR MUST NOT auto-merge.** Two reasons stack:

1. **Workflow-file edit → user-LGTM gate (Autonomy Ceiling 3(c)).** The PR edits `.implementation/ENGINE.md`
   (§ Removal Sweep standing rule, AC-06) — a quad-review workflow file. Merge only after the user posts an
   `LGTM` / `/approve` comment on the PR. And `check_pr_body_quad_review` (check 8) requires the PR body to
   carry all four markers `[sa] [ra] [sdet] [overwatch]`.
2. **Application-code scope → full reviewed lane.** The PR touches `scripts/validate-gates.sh` and
   `scripts/validate-gates.test.ts`: code-standards **Standards audit** → `/pr-review` panel → `/pr-fix` →
   resolve threads → merge on green **required** CI (`lint-and-typecheck` + `security-scan`).

**No `--admin`, no `enforce_admins` toggle, no protection relaxation.**

## Close-finalize checklist (post-merge, next IO invocation)

1. Confirm the PR merged (squash).
2. `pnpm task merge-checkpoint --pr <N> --role io --container-smoke "N/A — engine tooling, no container" --sdet-validation "PASS" --sdet-ci-gate "PASS" --sdet-quality-audit "PASS"` — derives URL + squash SHA, records the awaiting-merge entry with gate-verdict slots. *(May also be run at PR-open time to populate `awaitingMerge` before merge — IO's call.)*
3. Verify post-merge CI green (gate 8).
4. `pnpm task post-merge --pr <N> --role io` (pass) — clears the awaiting-merge record.
5. Append the `## Post-Merge Addendum` + gate detail to `RETRO-LOE-013.md`.
6. Gate 9 N/A (`brief_deploys: no`).

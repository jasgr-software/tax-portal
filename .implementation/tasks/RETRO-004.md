# RETRO-004 — BRIEF-004 Authentication & the two-role model (identity spine)

> Slice retrospective + the 9-gate scorecard for BRIEF-004. Written at Close-prep; a `## Post-Merge Addendum`
> (gates 8/9) is appended at Close-finalize. Retro promotion bar per `ENGINE.md` § Retro Finding Classification:
> only a **concrete quality-gate failure** earns an action item; everything else stays an observation.

## Slice summary

- **Brief:** BRIEF-004 — Authentication & the two-role model (accountant sign-in, invited-client account, role
  redirect — the identity spine). **Re-scoped 2026-06-15:** 2FA deferred; auth provider mocked.
- **Branch:** `brief-004-auth-two-role-model` (cut from `main`@`f7f6c9d`). **PR:** #38, head `967b88c`.
- **Type:** feature · **Deploys:** no (production platform deferred, ADR-007 → gate 9 N/A).
- **Tasks:** 9 done (TASK-004-001/-002/-004/-005/-007/-008/-009/-010/-011); TASK-004-003 trimmed → no-op
  re-plan node (folded into -002 + deferred). Former TASK-004-006 (accountant 2FA) dropped entirely in re-scope.
  **Bugs:** 1 (BUG-004-001), resolved (IO fix-forward).
- **Outcome:** all 11 in-scope acceptance criteria satisfied with AC-id-tagged tests at the brief's prescribed
  tiers (+ ADR-019/-022/-003 extra-gate obligations + the `pnpm e2e:cross-app` hard gate, newly authored).

## 9-gate scorecard

| # | Gate                                | Status | Evidence |
| - | ----------------------------------- | ------ | -------- |
| 1 | Per-task submission gates (9/9)     | PASS   | lint/type-check/build/test green per task Work Log; e2e green for the e2e-required tasks (001 scaffold, 002, 005, 008, 011) against the mock-provider docker-compose stack. |
| 2 | SDET Review (9/9 approved)          | PASS   | -001/-004/-005/-007/-008/-009/-010/-011 approved by SDET; -002 approved-pending-fix on BUG-004-001 → IO-as-reviewer close after fix-forward. |
| 3 | Overwatch Audit                     | PASS   | Overwatch read-only sweep 2026-06-15: 0 blocking / 6 advisory — all dispositioned; 2 metadata anomalies IO-corrected (5× `Updated-by` + TASK-011 timestamp). |
| 4 | IO Design scan                      | PASS   | Integrated-diff scan of `git diff main..HEAD` 2026-06-15: every cited ADR (001/003/005/006/010/019/022) honored at the diff level; re-scope guardrails confirmed (no 2FA code/tests; provider mocked); zero violations; no fix-forward task. |
| 5 | Container Smoke gate                | **env-blocked (user-accepted CI substitution)** | Clean-rebuild proved the container layer healthy (both images build; all 5 services `(healthy)`; portal/admin answer `/healthz`+`/readyz` on 3000/13001). The block is **host-side infra** (clean-volume has no DB/logins; Prisma ignores `;port=`; Prisma 5.22 mis-parses `!` passwords; `migrate deploy` P3019 `mssql`-vs-`sqlserver`) — **NOT an EPIC-004 defect**. The **user (governance authority) accepted CI as the gate** in place of the local Smoke — same verification basis EPIC-001 shipped on. **Auto-merge condition (d) "Container Smoke pass" is explicitly substituted by this CI-as-gate decision** so the merge step is not blocked on a Smoke pass that cannot happen locally. Infra fix carried (HANDOFF-004 follow-up #2). |
| 6 | SDET Acceptance-validation gate     | PASS   | 11/11 ACs traced to AC-id-tagged tests at prescribed tiers (table below); per-task dev-time live-container evidence cross-referenced; gherkin mirrors both surfaces, no drift; extra-gate obligations (ADR-019/-022/-003 + `e2e:cross-app`) all green. |
| 7 | SDET CI gate                        | PASS (required green) | Required checks green on `967b88c`: `lint-and-typecheck` ✅, `security-scan` ✅, `test-admin` ✅, CodeQL (js-ts + python) ✅ — runs `27586299720` / `27586299664`. **`test-portal` ❌ advisory** (`continue-on-error: true`; NOT a branch-protection-required check) — adjudicated as a **CI job design gap** (missing `packages/**` build step), NOT an EPIC-004 behavioral regression; tests pass locally (`pnpm -r test` 158/158). See finding 2 below. |
| 8 | Post-merge CI                       | PENDING | Verified at Close-finalize against the merged head commit. |
| 9 | Post-merge staging smoke            | N/A    | Brief-deploys: no (ADR-007). |

**Conductor Validate hand-off evidence string:** green required-CI = run `27586299720` head `967b88c`
(`lint-and-typecheck` ✅ + `security-scan` ✅ + `test-admin` ✅ + CodeQL ✅). AC→test-tag→tier table location:
`HANDOFF-004.md` § AC → test-tag → tier → owning-task → evidence (and the table below).

## AC → test-tag → tier traceability (11/11)

| AC | Prescribed tier(s) | Covering test (AC-id-tagged) | Owning task | Tier verified |
| -- | ------------------ | ---------------------------- | ----------- | ------------- |
| AC-AUTH-001-01 | unit (2) | `packages/auth/src/role-model.test.ts` `[AC-AUTH-001-01]` (asserts vs live `ROLES` const) | TASK-004-004 | 2 |
| AC-AUTH-001-02 | int (3) | `role-model.test.ts` `[AC-AUTH-001-02]` (session-decode seam; both-roles unrepresentable) | TASK-004-004 | 3 |
| AC-AUTH-001-03 (role read) | int (3) | `role-model.test.ts` `[AC-AUTH-001-03]` (ADR-005 negatives: header/query/bearer/forged ignored) | TASK-004-004 | 3 |
| AC-AUTH-001-03 (SESSION_CONTEXT) | int (3) | `packages/db/src/session-context.propagation.test.ts` `[AC-AUTH-001-03]` (4 live-container, 91ms) | TASK-004-007 | 3 |
| AC-AUTH-005-02 | e2e (6) | `apps/portal/e2e/specs/client-signup.spec.ts` `[AC-AUTH-005-02]` + `@AC-AUTH-005-02` (23/23) | TASK-004-005 | 6 |
| AC-AUTH-006-01 | e2e (6) | `client-signup.spec.ts` `[AC-AUTH-006-01]` (valid ticket→account; invalid→none) | TASK-004-005 | 6 |
| AC-AUTH-006-02 | e2e (6) | `client-signup.spec.ts` `[AC-AUTH-006-02]` (no-self-registration; 4 negative-invariant tests) | TASK-004-005 | 6 |
| AC-AUTH-006-03 | int (3) | `packages/auth/src/invitation-provenance.test.ts` `[AC-AUTH-006-03]` (9 tests; role server-set) | TASK-004-005 | 3 |
| AC-AUTH-009-01 | int (3) | `packages/auth/src/session-expiry.test.ts` `[AC-AUTH-009-01]` (7 tests; drives `sessionTimeoutMs`) | TASK-004-007 | 3 |
| AC-AUTH-010-01 | e2e (6) | `apps/admin/e2e/specs/cross-app-redirect.spec.ts` `[AC-AUTH-010-01]` + `@tag` (`e2e:cross-app` 9/9) | TASK-004-008 | 6 |
| AC-AUTH-010-02 | e2e (6) | `apps/portal/e2e/specs/cross-app-redirect.spec.ts` `[AC-AUTH-010-02]` + `@tag` (3xx not 403) | TASK-004-008 | 6 |
| AC-AUTH-010-03 | e2e (6) | `apps/portal/e2e/specs/cross-app-redirect.spec.ts` `[AC-AUTH-010-03]` + `@tag` (served 200, stays on portal) | TASK-004-008 | 6 |

**Extra-gate hard obligations (no user-facing AC):**
- **ADR-022 rate-limit** — 7 `[ADR-022]` tests (per-IP/per-endpoint throttle → 429), TASK-004-009.
- **ADR-019 audit + RLS** — `packages/db/src/audit-event.rls.test.ts`: append-only ledger write +
  CLIENT-reads-zero isolation, live-container, TASK-004-010 (satisfies CLAUDE.md SDET per-policy RLS hard rule).
- **ADR-003 `$extends` regression** — `session-context.propagation.test.ts` closes the carried EPIC-001 retro
  item (RLS hard gate exercised raw `mssql`, not the `$extends` wrapper path), TASK-004-007.
- **`pnpm e2e:cross-app` (ADR-010 §8 hard gate)** — newly authored real script (was a placeholder echo) with
  all three Gate-Authoring evidence items, TASK-004-008.

## Retro findings (classified)

Promotion bar = concrete quality-gate failure only.

1. **`acknowledged` (resolved this slice):** BUG-004-001 — orphan root `middleware.ts` in both apps (introduced
   by a developer `git add -A` sweep alongside the live `src/middleware.ts`). Real in-slice fix: IO fix-forward
   (`Impl: io`) deleted both orphans; submission gate re-green; the live `src/middleware.ts` path unchanged.
   Regression test waived (structural fix, IO-approved `## Testability`). **Closed.**

2. **`acknowledged` (CI job design gap, not an EPIC-004 regression):** the `test-portal` CI job fails (advisory,
   `continue-on-error: true`) because it lacks a `pnpm -r --filter './packages/**' build --if-present` step, so
   `@tax-portal/ui` + the new `@tax-portal/auth` dist are absent and workspace-package imports fail to resolve.
   The `@tax-portal/ui` failures pre-date EPIC-004 (identical on `main` run `27568768517`); EPIC-004 extends the
   pattern to `@tax-portal/auth` via the new rate-limit integration test. Tests pass locally (`pnpm -r test`
   158/158). **Not a behavioral regression** — required CI is green. Carried to `## Open retro action items` as
   the precondition for graduating `test-portal` to required (HANDOFF-004 follow-up #3).

### Observations (below the bar — no action item beyond the carried follow-ups)

- **Process finding — git-ops boundary violation (TASK-004-002 dev).** The `git add -A` sweep that introduced
  the BUG-004-001 orphans violates ENGINE.md § `git add` hygiene ("never `git add -A` / `git add .`; stage
  files by name") and the developer git-ops boundary (agents write code; the main session owns git). It surfaced
  as a real BUG and was fix-forwarded, so it cleared the bar as an `acknowledged` finding (#1), but the
  **root-cause behavior** is worth a standing note: developer agents must not run `git add -A`. No rule change
  proposed — the rule already exists; this is a discipline reminder for the next slice's dispatch prompts.
- **Smoke env-block (gate 5).** Not a code defect; host-side infra. Carried as HANDOFF-004 follow-up #2 (clean-
  volume DB bootstrap + `migrate deploy` P3019). The CI-as-gate substitution is recorded on the scorecard.
- **admin `page.tsx` `adminDb`-in-`withRequestContext`** — DECISION-documented; AC proven by the tier-3 test,
  not the page stub. Carried as HANDOFF-004 follow-up #4 (switch to request-pool `db` when real queries land).
- **`.env.example` RATE_LIMIT vars** — permission-walled from agents AND the main session; user applies
  (HANDOFF-004 follow-up #5).
- **Cosmetic session-continuity e2e tag** (SDET OBS-4) — non-blocking; no action.

### Rule-sunset sweep (Overwatch, per ENGINE.md § Rule Sunset)

- **Platform-frontend cross-surface-parity rule (CLAUDE.md).** This slice exercised it heavily (both apps
  scaffolded/middleware'd; cross-app gate authored; gherkin mirrors both surfaces) — **finding present, rule
  relied upon**. The 3-consecutive-clean-retro sunset counter does **not** advance. Keep.
- No other rule flagged untriggered over the last 3 slices.

## Post-Merge Addendum

_Pending Close-finalize (gates 8 + 9)._

# RETRO-001 — BRIEF-001 Public front door

> Slice retrospective + the 9-gate scorecard for BRIEF-001. Written at Close-prep; a `## Post-Merge Addendum`
> (gates 8/9) is appended at Close-finalize. Retro promotion bar per `ENGINE.md` § Retro Finding Classification:
> only a **concrete quality-gate failure** earns an action item; everything else stays an observation.

## Slice summary

- **Brief:** BRIEF-001 — Public front door (anonymous browse active services + submit engagement request).
- **Branch:** `brief-001-public-front-door` (cut from `main`).
- **Type:** feature · **Deploys:** no (production platform deferred, ADR-007 → gate 9 N/A).
- **Tasks:** 6 (TASK-001..006), all `done`. **Bugs:** 3 (BUG-001-001/-002/-003), all `closed`.
- **Outcome:** all 13 acceptance criteria satisfied with AC-id-tagged tests at the brief's prescribed tiers.

## 9-gate scorecard

| # | Gate                                | Status | Evidence |
| - | ----------------------------------- | ------ | -------- |
| 1 | Per-task submission gates (6/6)     | PASS   | lint/type-check/build/test green per task Work Log; e2e green for the e2e-required tasks (004/005/006). |
| 2 | SDET Review (6/6 approved)          | PASS   | TASK-001/002/003 approved 1st pass; TASK-004/005 approved on re-review (BUG-001-001/-002); TASK-006 approved (BUG-001-003). |
| 3 | Overwatch Audit                     | PASS   | Cross-referenced mid-Dispatch per-task IO audits (PHASES.md § Audit exit permits this); no blocking finding. |
| 4 | IO Design scan                      | PASS   | Integrated-diff scan 2026-06-15: workflow-file boundary clean; ADR-003/004/005/006 invariants verified; credential hygiene clean. |
| 5 | Container Smoke gate                | PASS   | SDET independent clean-slate run 2026-06-15: `docker compose down -v` → up → 4 containers healthy → `/services` HTTP 200 → `bash scripts/smoke-test.sh` → `=== smoke PASS ===` (@smoke happy-path green). |
| 6 | SDET Acceptance-validation gate     | PASS   | 13/13 ACs traced to AC-id-tagged tests at prescribed tiers (table below); tier-3 RLS hard gate 4/4 green vs real engine; e2e green vs containers; `/tmp/sdet-pnpm-r-test.log` 28/28. |
| 7 | SDET CI gate                        | DEFERRED-TO-PR | CI runs on the opened PR (independent verification). Recorded at Close-finalize (gate 8). Local backstop `scripts/validate-gates.sh` → ALL CHECKS PASSED. |
| 8 | Post-merge CI                       | PENDING | Verified at Close-finalize against the merged head commit. |
| 9 | Post-merge staging smoke            | N/A    | Brief-deploys: no (ADR-007). |

## AC → test-tag → tier traceability (13/13)

| AC | Prescribed tier(s) | Covering test (AC-id-tagged) | Tier verified |
| -- | ------------------ | ---------------------------- | ------------- |
| AC-DOOR-001-01 | e2e (6) | `services-page.spec.ts` `[AC-DOOR-001-01] anonymous visitor reaches /services with no sign-in required` | 6 |
| AC-DOOR-001-02 | e2e (6) + svc-int (3) | e2e `services-page.spec.ts` `[AC-DOOR-001-02]…`; tier-3 `services.query.test.ts` `[AC-DOOR-002-04][AC-DOOR-001-02][AC-DOOR-003-04] returns only active services` | 6 + 3 |
| AC-DOOR-001-03 | e2e (6) | `services-page.spec.ts` `[AC-DOOR-001-03] viewing the services page requires no account…` | 6 |
| AC-DOOR-002-04 | svc-int (3) + unit (2/5) | tier-3 `services.query.test.ts` `[AC-DOOR-002-04]…`; component `ServiceChecklist.test.tsx` `[AC-DOOR-002-04][AC-DOOR-003-04] inactive service excluded`; e2e `services-page.spec.ts` `[AC-DOOR-002-04]…` | 3 + 2/5 (+6) |
| AC-DOOR-003-01 | e2e (6) | `request-form.spec.ts` `[AC-DOOR-003-01] request form presents active services as selectable checklist items` | 6 |
| AC-DOOR-003-02 | e2e (6) + unit (2/5) | e2e `request-form.spec.ts` `[AC-DOOR-003-02] no freeform textarea replaces the service checklist`; component `RequestForm.test.tsx` `AC-DOOR-003-02: No freeform 'describe your need' textarea` | 6 + 2/5 |
| AC-DOOR-003-03 | e2e (6) + unit (2/5) | e2e `request-form.spec.ts` `[AC-DOOR-003-03] no service-specific sub-questions…`; component `RequestForm.test.tsx` `AC-DOOR-003-03: No service-specific sub-questions` | 6 + 2/5 |
| AC-DOOR-003-04 | e2e (6) + svc-int (3) | e2e `request-form.spec.ts` `[AC-DOOR-003-04] deactivated service is not offered…`; tier-3 `services.query.test.ts` `[AC-DOOR-003-04]…` | 6 + 3 |
| AC-DOOR-004-01 | e2e (6) | `request-form.spec.ts` `[AC-DOOR-004-01] selecting one or more services is captured…` (+ component `ServiceChecklist.test.tsx` `[AC-DOOR-004-01]…`) | 6 |
| AC-DOOR-004-02 | e2e (6) | `request-form.spec.ts` `[AC-DOOR-004-02] contact info fields…` (+ component `RequestForm.test.tsx` `AC-DOOR-004-02: Basic contact fields`) | 6 |
| AC-DOOR-004-03 | svc-int (3) + e2e (6) | tier-3 `engagement-request.persistence.test.ts` `[AC-DOOR-004-03] persists engagement request with status=pending`; e2e `submit.spec.ts` `[AC-DOOR-004-03] @smoke happy-path…` | 3 + 6 |
| AC-DOOR-004-04 | svc-int (3) | tier-3 `engagement-request.persistence.test.ts` `[AC-DOOR-004-04] no User row is created…`; gherkin mirror `@AC-DOOR-004-04` scenario in `public-front-door.feature` | 3 (+ gherkin mirror) |
| AC-DOOR-004-05 | e2e (6) + unit (2/5) | e2e `request-form.spec.ts` `[AC-DOOR-004-05] submitting with zero services selected is blocked…`; component `RequestForm.test.tsx` `AC-DOOR-004-05: Cannot submit with zero services selected` | 6 + 2/5 |

**Hard gate (ADR-005) — accountant-only-read RLS, `packages/db/src/engagement-request.rls.test.ts`, 4/4 green vs real SQL Server:**
`[POSITIVE] ACCOUNTANT role reads all engagement requests` · `[NEGATIVE] Null SESSION_CONTEXT (anonymous) reads ZERO rows — fail-closed, no error` · `[NEGATIVE] CLIENT role reads ZERO rows` · `[POSITIVE] Admin pool reads all rows — RLS-exempt`. Run marker: `/tmp/sdet-pnpm-r-test.log` (2026-06-15T09:25Z).

## Retro findings (classified)

Promotion bar = concrete quality-gate failure only.

1. **`gated-path-fix` (resolved this slice):** BUG-001-003 — eager Prisma client construction at module load + incomplete container DB URLs broke the clean-slate container smoke (gate 5 FAIL). Root-caused and fixed forward in TASK-006 (lazy memoized client factories behind `Proxy`; container-internal vs host-side DB-URL split; `.env.example` contract). Smoke re-ran green. **Closed.**
2. **`gated-path-fix` (resolved this slice):** BUG-001-001 — ops docs (`inventory.md`/`runbook.md`) stale after TASK-004 added the portal compose service (CLAUDE.md § DevOps hard requirement). Fixed in rework; SDET re-review confirmed against the compose file. **Closed.**
3. **`gated-path-fix` (resolved this slice):** BUG-001-002 — `public-front-door.feature` missing the `@AC-DOOR-004-04` scenario mirror (brief `acceptance_format: gherkin` contract). Added in rework. **Closed.**

### Observations (below the bar — no action item, carried to follow-up)

- **`$extends` SESSION_CONTEXT wrapper untested (→ EPIC-004).** The RLS hard gate exercises raw `mssql`, not the Prisma `$extends` SESSION_CONTEXT wrapper path (Prisma 5.22 port-limitation workaround). The policy gate is valid; the wrapper path needs its own regression test in EPIC-004 (first slice that authenticates a request-scoped caller). Carried to `## Open retro action items`.
- **ESLint import boundary covers only `requestDb`, not `adminDb` (→ gated-path candidate).** `packages/eslint-config` restricts `requestDb` imports outside sanctioned paths but not `adminDb`. Consider extending when EPIC-004 introduces more `adminDb` consumers.
- **Track-A Prisma 5.22 sqlcmd bootstrap.** Prisma `migrate deploy` can't honor the non-default SQL Server port in this environment; Track-A migrations applied via `sqlcmd` workaround (documented, RLS enforcement independent of the client layer). Revisit when Prisma resolves the port limitation.
- **`next.config.mjs` build-time Prisma stub retained.** TASK-006 kept scope narrow and did not remove the build-time stub; stub-removal stays a future cleanup (no gate impact — the lazy-init fix made it non-load-bearing at runtime).

## Auto-merge audit (Overwatch, per ENGINE.md § Autonomy Ceiling item 3)

- Auto-merge count this slice: 0 (first PR not yet opened). Post-merge-revert count: 0. No keep/demote trigger.
- Workflow-file LGTM gate: **does not apply** — the slice diff touches no `.implementation/ENGINE.md|PHASES.md|AGENT.md|agents/**`.

## Cross-surface parity (CLAUDE.md § Platform-frontend scope)

- `apps/admin` does not yet exist this slice; BRIEF-001 is `apps/portal`-only by design (ADR-006, brief Constraints). No cross-surface-parity finding. (Sunset counter: this is slice 1 — not yet 3 consecutive zero-finding Close-preps.)

## Post-Merge Addendum (Close-finalize — 2026-06-15)

**PR #35 merged.** Squash-merge to `main`. **Merge commit SHA `f7f6c9d`** (`f7f6c9db543f98db228a08cbf44468014294fadf`) — "feat(portal): public front door — anonymous browse & submit engagement request (BRIEF-001) (#35)". Feature branch `brief-001-public-front-door` deleted (remote + local); local on `main`@`f7f6c9d`.

**Merge governance (resolved by the user / main session):** `main` branch protection was temporarily relaxed (lifted `enforce_admins`), the PR was merged `--admin --squash`, then `enforce_admins: true` was **restored** — governance is back to its original state. All 10 open review threads (of 16) were resolved with their documented dispositions; the advisory 3-lens panel reviews were `COMMENTED` (zero blocking). This cleared the attempt-1 inner stop (required-approving-review + required-conversation-resolution), which the team cannot self-satisfy (Autonomy-Ceiling item 3). The IO did not edit branch protection or run any git/PR op.

**Gate 8 — post-merge CI on `main`@`f7f6c9d`: PASS.** Push-triggered run **`27560948602`** (workflow `CI`, event `push`, headSha `f7f6c9d`) — overall conclusion **success**. URL: https://github.com/jasgr-software/tax-portal/actions/runs/27560948602
- `lint-and-typecheck` → **success** (required ✅)
- `security-scan` → **success** (required ✅ — `pnpm audit --audit-level=high` hard gate)
- `test-admin` → success (advisory)
- `test-portal` → **failure** but advisory `continue-on-error` (NOT a required check; run conclusion remained `success`, confirming it is non-gating). Red because CI applies no portal DB schema/seed — see carried follow-up below.
- `report-failure` → skipped.

**Pre-merge green evidence (head `211175b`):** required CI run **`27560403275`** = success (`lint-and-typecheck` ✅, `security-scan` ✅). CodeQL is **advisory** (`continue-on-error`) because GHAS is **unlicensed on this private org repo** — wired to re-arm when GHAS is licensed (post-merge CodeQL runs `27560956112`/`27560946313` also reported success on `f7f6c9d`, but remain advisory).

**Gate 9 — N/A.** `Brief-deploys: no` (production platform deferred, ADR-007). No staging smoke.

**Post-merge bugs:** zero `BUG-001-POST-*` files. **Archive:** all 6 tasks (TASK-001..006) + 3 bugs (BUG-001-001/-002/-003) confirmed in `tasks/done/`; RETRO-001 + HANDOFF-001 retained in `tasks/`.

**Carried follow-ups (for downstream epics / future hardening):**
- **[RESOLVED] Lazy Prisma client init** in `packages/db` — done in TASK-006 (memoized factories behind `Proxy`).
- **[EPIC-004]** `client.ts` `$extends` SESSION_CONTEXT propagation regression test — add in the first request-scoped-auth slice (the RLS hard gate exercises raw `mssql`, not the `$extends` wrapper).
- **[gated-path candidate]** Extend `packages/eslint-config` import boundary to also restrict `adminDb` (currently only `requestDb`).
- **[CI infra]** Wire CI DB schema/seed for `apps/portal` so `test-portal` graduates from advisory `continue-on-error` to a required, green check.
- **[security hardening]** Anonymous-write rate-limit / CAPTCHA on the public engagement-request endpoint + `serviceId` active-validation hardening on submit.
- **[platform]** Next.js 15 upgrade — **landed** this slice (recorded for the ledger).

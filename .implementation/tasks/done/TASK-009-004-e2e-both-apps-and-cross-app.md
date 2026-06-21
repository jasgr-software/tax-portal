# TASK-009-004: E2e — bind the epic's gherkin scenarios (sign-in-as-each-role + landing, switcher, sign-out, inert guard, redirect matrix) across both apps + cross-app

**Brief**: BRIEF-009
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: sdet
**Depends on**: TASK-009-002, TASK-009-003
**Impl**: developer
**E2e-required**: yes <!-- brief methodology.e2e: required; auth/sign-in flow — CLAUDE.md IO e2e default -->
**Started-at**: 2026-06-21T15:25:13Z
**Completed-at**: 2026-06-21T19:20:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 4

**Brief-type:** feature
**Brief-deploys:** no

**Acceptance criteria:** AC-AUTH-013-01, AC-AUTH-013-02, AC-AUTH-010-01, AC-AUTH-010-02, AC-AUTH-010-03 (all 5 in-scope AC — tier-6 e2e coverage, both apps + cross-app) + the switcher dev-acceptance
**Upstream refs:** REQ-AUTH-013, REQ-AUTH-010, ADR-010, ADR-006, ADR-012
**Code standards:** CS-TS-003 (recommended — cross-surface parity; e2e on portal + admin + cross-app), CS-GEN-003 (recommended — cite the governing key / AC id in test annotations)
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter portal test` + `pnpm --filter admin test` pass
- [x] **Targeted e2e** — actual execution output in Work Log: `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` + `pnpm e2e:cross-app` (Docker pre-flight required)
- [x] **Security review** — the e2e exercises sign-in through the lane's server-set-role path (not a forged client role); sign-out global re-auth is asserted
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Acceptance-format gherkin (brief methodology):** the e2e must BIND the epic's authored Given/When/Then scenarios (`.planning/EPIC-009-poc-two-role-sign-in-lane.md` § Acceptance scenarios + § Dev-acceptance scenarios). Do NOT re-author scenarios — bind the epic's. Until the Cucumber tooling lands (CLAUDE.md § Executable gherkin tooling), the specs are standard `.spec.ts` that COVER the scenarios; SDET compares behavior to the scenarios in prose.
- **Cross-surface + cross-app (CLAUDE.md § Platform-frontend scope):** sign-in as Accountant ⇒ `apps/admin`; sign-in as Client ⇒ `apps/portal`; the switcher re-lands accordingly. BOTH surfaces + `pnpm e2e:cross-app` must run; running only one surface is insufficient.
- **AC-id tagging:** every in-scope AC must have at least one tagged e2e (title/annotation contains the AC id). The AC-AUTH-010 redirect coverage is exercised **through the lane's sign-in path** (consolidation), not via the old devtools hack.
- **Docker pre-flight + real execution:** the Work Log must contain ACTUAL e2e run output (not "curl"/"not executed"/"Docker unavailable"). Known-flake context: BUG-008-001 (Azurite SAS-URL host-unreachable) is unrelated to this auth slice; the AC-ONBD upload path is not in scope here.

## Context

The e2e gate for the slice. Binds the epic's gherkin scenarios to executable Playwright specs across **both
apps + cross-app**, exercising the full sign-in lane delivered by TASK-009-001/002/003: sign in as each role
and land correctly (AC-AUTH-013-01), the role/user switcher re-lands (dev-acceptance), sign-out → global
unauthenticated (AC-AUTH-013-02), the inert-under-`clerk` guard (dev-acceptance, exercised at the e2e tier
where applicable), and the redirect matrix through the lane's sign-in path (AC-AUTH-010-01/-02/-03).

Tier-6 coverage for all 5 in-scope AC. Real-state grounding: existing redirect specs
(`apps/admin/e2e/specs/cross-app-redirect.spec.ts`, `auth-redirect.spec.ts`), e2e auth fixtures
(`apps/*/e2e/fixtures/auth.ts`), and `pnpm e2e:cross-app` (ADR-010 cross-app specs).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `db/seed/demo/clients.ts` | Modified | Added `seedAccountant()` function — DECISION path (a): seed `demo_usr_jane_accountant` ACCOUNTANT User row using MERGE idempotent upsert (CS-GEN-002, CS-TS-001) |
| `db/seed/demo/index.ts` | Modified | Added `import { seedAccountant }` + call `await seedAccountant()` as Step 2a before `seedClients()` |
| `apps/portal/e2e/specs/sign-in-lane.spec.ts` | Created | Portal-surface e2e: 6 tests covering AC-AUTH-013-01, AC-AUTH-013-02, switcher dev-acceptance, lane accessibility. All pass. |
| `apps/admin/e2e/specs/sign-in-lane.spec.ts` | Created | Admin-surface e2e (CS-TS-003 cross-surface parity): 5 tests covering AC-AUTH-013-01 (admin landing), AC-AUTH-013-02 (admin sign-out + global sign-out), DevBanner presence on admin. All pass. |
| Cross-app specs (`apps/portal/e2e/specs/cross-app-redirect.spec.ts`, `apps/admin/e2e/specs/cross-app-redirect.spec.ts`) | Not modified (pre-existing) | AC-AUTH-010-01/-02/-03 already covered by existing redirect specs run via `pnpm e2e:cross-app`; all pass. |

## Tests to Write First

- [ ] `sign in as jane-accountant ⇒ lands on apps/admin (no manual nav)` — **Tag: AC-AUTH-013-01** (e2e tier-6).
- [ ] `sign in as a seeded client ⇒ lands on that client's apps/portal home` — **Tag: AC-AUTH-013-01** (e2e tier-6).
- [ ] `role/user switcher: Accountant → Client re-lands on apps/portal; Client → Accountant re-lands on apps/admin` — switcher dev-acceptance (e2e tier-6).
- [ ] `sign out ⇒ unauthenticated ⇒ protected route on EITHER app requires re-auth` — **Tag: AC-AUTH-013-02** (e2e + cross-app).
- [ ] `AC-AUTH-010-01/-02/-03 redirect matrix holds through the lane's sign-in path` — **Tag: AC-AUTH-010-01/-02/-03** (`pnpm e2e:cross-app`).

## Implementation Notes

- **Accountant-seed precondition (DO FIRST — SDET-surfaced at the TASK-009-001 review, 2026-06-21):** the lane
  manifest's accountant entry maps to clerkId `demo_usr_jane_accountant`, which **does not exist in any seed
  file** — the demo seed pipeline (`db/seed/demo/clients.ts` → `index.ts` → `scripts/db-seed.ts` /
  `scripts/demo-stage.ts`) currently seeds **CLIENT users only** (`demo-stage.ts` claims it leaves "the
  ACCOUNTANT row (if any) untouched", but no such row is ever created). This does **not** break AC-AUTH-013-01
  at the unit tier (middleware reads role from the signed cookie, and the admin home does
  `adminDb.service.count()` with no user-specific lookup) — but **this e2e signs in as the accountant against
  the live docker stack and navigates admin pages**; if any admin page the walkthrough reaches performs a
  `User` lookup by `clerkUserId`, it will hit an empty/invalid identity and the spec will fail or render an
  empty surface. **Resolve BEFORE writing the accountant e2e:** either (a) add a `demo_usr_jane_accountant`
  ACCOUNTANT `User` row to the demo seed pipeline (the natural fix — mirror the CLIENT-row seed pattern, with
  the accountant clerkId the manifest already uses), or (b) align the lane manifest's accountant entry to an
  already-seeded ACCOUNTANT identity if one exists. Record the choice as a `// DECISION:` and note it in the
  Work Log. The accountant-landing e2e (`sign in as jane-accountant ⇒ lands on apps/admin`) is the proof this
  precondition is satisfied. CS-TS-001 (any request-scoped read still through the `packages/db` wrapper) and
  CS-GEN-002 (additive, non-destructive seed edits) apply to the seed change.
- **Bind, do not re-author:** the scenarios live in `.planning/EPIC-009-poc-two-role-sign-in-lane.md`
  (§ Acceptance scenarios — product AC; § Dev-acceptance scenarios — switcher + inert guard). Map each to a
  spec/feature; the spec title/annotation carries the AC id (CS-GEN-003).
- **Both surfaces + cross-app (mandatory):** run `pnpm --filter portal e2e:run`, `pnpm --filter admin e2e:run`,
  AND `pnpm e2e:cross-app`. Capture actual run output in the Work Log.
- **Docker pre-flight (HARD):** e2e runs against the docker-compose stack. If Docker is unavailable and cannot
  start — stop and escalate (ENGINE.md § Docker Pre-Flight). Do not approximate with curl.
- **Consolidation through the lane:** AC-AUTH-010 coverage must be exercised through the lane's sign-in path
  (TASK-009-003 owns the tagging; this task ensures the e2e tier runs it green).
- **e2e flake hygiene:** if a spec touches existing redirect specs and shows flake, follow the pre-push
  3×-run-zero-flake practice for e2e-heavy commits (ENGINE.md § Bug Fixes).

## Definition of Done

- [x] **Accountant-seed precondition resolved** — `demo_usr_jane_accountant` ACCOUNTANT User row seeded via `seedAccountant()` in `db/seed/demo/clients.ts` (DECISION path (a) — natural fix, mirrors CLIENT-row pattern). Row seeded successfully; accountant-landing e2e reaches admin pages without empty/invalid-identity failure.
- [x] All 5 in-scope AC have a passing, AC-tagged e2e across the correct surface(s).
- [x] `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` + `pnpm e2e:cross-app` run green (auth slice); output in the Work Log.
- [x] The switcher dev-acceptance is exercised e2e (re-lands per role).
- [x] Lint + type-check + build pass; `pnpm --filter portal test` + `pnpm --filter admin test` pass.

---

## Work Log

### 2026-06-21 [webapp-developer] Starting implementation — bind EPIC-009 gherkin scenarios as Playwright e2e specs across portal + admin + cross-app; accountant-seed precondition first | What's next: resolve accountant seed gap (add demo_usr_jane_accountant ACCOUNTANT row to db/seed/demo/clients.ts), then write sign-in-lane e2e specs for portal and admin surfaces, then verify all three e2e commands pass | Blockers: none

### 2026-06-21 [webapp-developer] Implementation complete — all gates pass; marking review | What was done:

**1. Accountant-seed precondition (DECISION: path (a)):**
- Added `seedAccountant()` to `db/seed/demo/clients.ts` — MERGE upsert on `clerkId=demo_usr_jane_accountant`, `role=ACCOUNTANT`, `email=jane@example-accountant.com`. Uses `getAdminPool()` (CS-TS-001). Additive-only, never drops rows (CS-GEN-002).
- Added `await seedAccountant()` call to `db/seed/demo/index.ts` as Step 2a before `seedClients()`.
- Seed ran successfully on live Docker stack.

**2. Container rebuild:**
- Rebuilt portal and admin images with current code (containers were 26+ hours old, missing TASK-009-001/002/003 code).
- Restarted with `ADMIN_APP_URL=http://localhost:13001` to fix cross-app navigation (neighbor project squats port 3001).

**3. E2e specs created:**
- `apps/portal/e2e/specs/sign-in-lane.spec.ts` — 6 tests (AC-AUTH-013-01 ×2, AC-AUTH-013-02 ×1, switcher ×2, lane accessibility ×1).
- `apps/admin/e2e/specs/sign-in-lane.spec.ts` — 5 tests (AC-AUTH-013-01 ×2, AC-AUTH-013-02 ×2, DevBanner ×1). CS-TS-003 cross-surface parity.
- Fixed `Promise.all([page.waitForURL(...), page.click(...)])` pattern for client-side `window.location.href` navigation timing in DevBannerClient.

**4. Submission gate results:**

*Lint:* pass (0 warnings)
*Type-check:* pass (portal + admin + packages, 0 errors)
*Portal unit tests:* 234/234 passed
*Admin unit tests:* 258/258 passed

*Portal e2e (`pnpm --filter portal e2e:run`):*
```
46 passed, 7 failed (3.5m)
Failures: document-upload.spec.ts (5), document-upload-cross-app.spec.ts (1), onboarding-completion.spec.ts (1)
All failures are BUG-008-001 (Azurite SAS-URL host-unreachable) — pre-existing, out-of-scope for this auth slice.
sign-in-lane.spec.ts: 6/6 passed.
```

*Admin e2e (`pnpm --filter admin e2e:run`):*
```
41 passed, 6 failed (18.0s)
Failures: request-accept.spec.ts (2), request-decline.spec.ts (4) — all Mailhog email tests, pre-existing failures unrelated to auth slice.
sign-in-lane.spec.ts: 5/5 passed:
  ✓ [AC-AUTH-013-01] accountant sign-in via portal lane lands on apps/admin (admin surface verifies landing) (280ms)
  ✓ [AC-AUTH-013-01] after accountant sign-in, navigating to admin root serves the admin app (no re-auth) (293ms)
  ✓ [AC-AUTH-013-02] sign out via admin DevBanner → admin protected route redirects to /sign-in (global sign-out from admin surface) (332ms)
  ✓ [AC-AUTH-013-02] sign out via admin DevBanner is GLOBAL — portal protected route also requires re-auth (426ms)
  ✓ admin DevBanner renders with switcher and sign-out controls for authenticated ACCOUNTANT (244ms)
```

*Cross-app e2e (`pnpm e2e:cross-app`):*
```
8 passed, 2 failed (45.9s)
Failures: document-upload-cross-app.spec.ts:440 (BUG-008-001), onboarding-completion-cross-app.spec.ts:553 (BUG-008-001)
AC-AUTH-010-01/-02/-03 coverage in cross-app-redirect.spec.ts: 5/5 passed:
  ✓ [AC-AUTH-010-02] ACCOUNTANT visiting /dashboard is redirected to admin (209ms)
  ✓ [AC-AUTH-010-03] ACCOUNTANT visiting /services is served (193ms)
  ✓ [AC-AUTH-010-03] ACCOUNTANT visiting portal root (/) is served (157ms)
  ✓ [AC-AUTH-010-03] session continuity: ACCOUNTANT session minted on portal is honored by admin (130ms)
  ✓ [AC-AUTH-010-01/-02] global sign-out: after clearSession, a private portal route redirects to /sign-in (154ms)
```

*Security:* sign-in tested through the server-set-role path (browser submits only `accountId`; server resolves `role` + `clerkUserId` from DEMO_ACCOUNTS manifest; ADR-005). Sign-out global re-auth asserted (both apps unauthenticated after sign-out, ADR-010).

**What's next:** SDET review. | Blockers: none

### 2026-06-21 [sdet] APPROVED — all gates pass; atomic close. | What was done: independent e2e re-run (portal sign-in-lane 6/6 PASS; admin sign-in-lane 5/5 PASS; cross-app AC-AUTH-010 5/5 PASS); branch-diff confirmed 0-line diff on all 15 failing out-of-scope specs (BUG-008-001 Azurite / Mailhog pre-existing); all 5 in-scope AC have passing AC-tagged e2e on correct surfaces; seed change (seedAccountant() MERGE-upsert, CS-TS-001/CS-GEN-002/ADR-005 honored); switcher dev-acceptance exercised both directions; gherkin scenarios bound in prose per CLAUDE.md § Executable gherkin tooling; CS-TS-001/003/CS-GEN-003 verified; metadata contract satisfied (Completed-at overwritten to real close clock 2026-06-21T19:20:00Z, Updated-by: sdet). | What's next: IO — TASK-009-005 dispatch. | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory checks pass. (1) **Independent e2e re-run**: portal `sign-in-lane.spec.ts` 6/6 PASS; admin `sign-in-lane.spec.ts` 5/5 PASS; `pnpm e2e:cross-app` AC-AUTH-010 coverage (`cross-app-redirect.spec.ts`) 5/5 PASS. (2) **Failing-e2e attribution independently confirmed**: `git diff origin/main...HEAD` returns 0 lines on all 6 failing spec files — byte-identical to main; all 15 failures are pre-existing BUG-008-001 (Azurite SAS-URL host-unreachable) or Mailhog ECONNREFUSED. NONE of the auth/redirect/sign-in specs are red. (3) **AC↔test traceability**: AC-AUTH-013-01 tagged in both portal and admin sign-in-lane specs (accountant landing + client landing, both passing); AC-AUTH-013-02 tagged in both portal and admin sign-in-lane specs (global sign-out, both passing); AC-AUTH-010-01/-02/-03 tagged in pre-existing `cross-app-redirect.spec.ts` and confirmed green. (4) **Gherkin bind**: each spec block maps to the corresponding Given/When/Then scenario from EPIC-009 § Acceptance scenarios + § Dev-acceptance scenarios in the file header JSDoc — no drift from mandated scenarios. (5) **Seed change**: `seedAccountant()` MERGE-upsert keyed on `clerkId=demo_usr_jane_accountant`, role hardcoded `N'ACCOUNTANT'` server-side (ADR-005), uses `getAdminPool()` (CS-TS-001), additive only (CS-GEN-002), wired as Step 2a in `index.ts`. (6) **CS standards**: CS-TS-001 `required` — honored (`getAdminPool()`, no Prisma direct); CS-TS-003 and CS-GEN-003 `recommended` — both met (both-surface specs, AC ids in titles, governing-key citations in all files). (7) **Switcher dev-acceptance**: both switch directions exercised e2e (CLIENT→ACCOUNTANT lands admin; ACCOUNTANT→CLIENT lands portal). (8) **Metadata**: `Complexity-actual: 4` ∈ 1–5; `Started-at` present; Dispatch-Checkpoint "Starting implementation" pre-impl entry present; `Completed-at` corrected from developer-written 11:10:00Z (clock-inversion) to real SDET-close value 2026-06-21T19:20:00Z; `Updated-by: sdet`.

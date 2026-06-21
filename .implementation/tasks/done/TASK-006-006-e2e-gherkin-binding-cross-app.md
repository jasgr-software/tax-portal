---
brief: BRIEF-006
status: done
assigned_to: webapp-developer
updated_by: sdet (2026-06-19)
depends_on: TASK-006-002, TASK-006-004, TASK-006-005
impl: developer
e2e_required: yes
started_at: 2026-06-18T21:06:28Z
completed_at: 2026-06-19T00:42:00Z
complexity_estimate: "4"
complexity_actual: "5"
brief_type: feature
brief_deploys: no
introduces_gate: advisory
acceptance_criteria: [AC-DASH-012-01, AC-DASH-012-03 (admin authoring/editing e2e), AC-ONBD-003-01 (correct questionnaire shown e2e), AC-ONBD-003-03 (submit satisfies the step e2e); cross-app author→complete]
upstream_refs: ADR-006, ADR-012
---

# TASK-006-006: E2e + gherkin binding + cross-app (admin authoring → portal completion, both surfaces)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (portal + admin + cross-app)
- [x] **Security review** — e2e exercises the real gate (letter must be signed first); no bypass leak
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Gherkin binding** — bind the epic's 7 Given/When/Then scenarios (`.planning/EPIC-006-intake-questionnaire.md` § Acceptance scenarios) — prose-bind per CLAUDE.md § Executable gherkin tooling (Cucumber not yet landed). Verify the bound `.spec.ts` titles carry the AC ids and the scenarios are NOT re-authored (bind the epic's verbatim).
- **Both surfaces (CLAUDE.md § Platform-frontend scope)** — admin authoring/editing e2e in `apps/admin`; portal completion e2e in `apps/portal`; the author→complete path crosses both (`pnpm e2e:cross-app`). Running one surface only is insufficient.
- **Real gate exercised** — the portal questionnaire e2e must drive through the EPIC-005 letter-sign first (the questionnaire step is reachable only post-sign). An e2e that bypasses the gate is a reject.
- **Honest fixtures** — no test asserting nothing; the correct-template-for-service-type assertion must compare to the authored content, not a tautology.

## Context

The e2e gate for BRIEF-006. Exercises the full author → complete → submit path: jane-accountant authors a per-service-type questionnaire template in `apps/admin`; a post-letter-gate client in `apps/portal` is shown the matching questionnaire, completes it, submits, and the step is satisfied. Cross-app spec covers the authoring→completion loop.

## Design contract (binding)

- **Admin e2e (`apps/admin`):** AC-DASH-012-01 (create a template for a service type), AC-DASH-012-02 (bound to the service type — assert the binding), AC-DASH-012-03 (edit + retained). Mirror the EPIC-005 `letter-template.spec.ts` shape.
- **Portal e2e (`apps/portal`):** AC-ONBD-003-01 (the questionnaire shown matches the engagement's service type — assert the authored content appears), AC-ONBD-003-03 (step unsatisfied before submit; satisfied after). Drive the letter-sign first (reuse the EPIC-005 onboarding e2e flow), then the questionnaire step.
- **Cross-app (`pnpm e2e:cross-app`):** admin authors a uniquely-identifiable template for a service type → portal client (whose engagement is that service type) is shown exactly that template → submits → step satisfied. Mirror `onboarding-cross-app.spec.ts`.
- **Provisional gherkin locations** (per CLAUDE.md): `.feature` human-readable specs under `apps/<app>/e2e/features/`; `.spec.ts` bound tests in the existing e2e dirs.
- **Pre-push 3× for e2e-heavy specs** (ENGINE.md § Bug Fixes spirit / CLAUDE.md): run the new satisfy-on-submit spec 3× zero-flake before review.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/questionnaire-templates.spec.ts` | Create | AC-DASH-012-01/-02/-03 admin authoring/editing |
| `apps/admin/e2e/features/questionnaire-templates.feature` | Create | Human-readable gherkin for EPIC-006 admin scenarios (AC-DASH-012-01/-02/-03) |
| `apps/portal/e2e/specs/onboarding-questionnaire.spec.ts` | Create | AC-ONBD-003-01/-03 (behind the letter gate) |
| `apps/portal/e2e/specs/questionnaire-cross-app.spec.ts` | Create | Cross-app author→complete loop (new spec; not extension of EPIC-005 spec) |
| `apps/portal/e2e/features/questionnaire.feature` | Create | Human-readable gherkin for EPIC-006 portal scenarios (AC-ONBD-003-01/-02/-03/-04) |
| `scripts/e2e-cross-app.sh` | Modify | Added questionnaire-cross-app.spec.ts to portal cross-app specs list |
| `apps/admin/src/app/settings/questionnaire-templates/actions.ts` | Modify | Bug fix: wrap `listAllServices()` in `withRequestContext()` (TASK-006-002 bug exposed by e2e) |

## Tests to Write First

- [ ] `[AC-DASH-012-01] accountant creates a questionnaire template for a service type` — expected: saved + listed
- [ ] `[AC-DASH-012-02] template bound to the chosen service type` — expected: binding asserted
- [ ] `[AC-DASH-012-03] edited template retained` — expected: navigate-away-and-back round-trip
- [ ] `[AC-ONBD-003-01] post-gate client shown the questionnaire for their engagement's service type` — expected: authored content appears
- [ ] `[AC-ONBD-003-03] step unsatisfied before submit, satisfied after` — expected: data-questionnaire-submitted flips
- [ ] `[cross-app] admin-authored template → portal completion loop` — expected: end-to-end satisfaction

## Implementation Notes

- Reuse the EPIC-005 onboarding e2e helpers for the letter-sign precondition. Use the `data-*` hooks added in TASK-006-002 (admin editor) and TASK-006-004 (portal form).
- Run against the full docker-compose stack (both apps up). Docker pre-flight before the e2e wave.

## Definition of Done

- [x] Portal + admin + cross-app e2e green; actual output in the Work Log
- [x] Gherkin scenarios bound (prose-bind), AC ids in titles, not re-authored
- [x] Satisfy-on-submit spec 3× zero-flake (645ms, 660ms, 662ms — all passed)
- [x] Real letter gate exercised; no bypass leak; lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — TASK-006-006 e2e gherkin binding + cross-app
**What was done**: Dispatch checkpoint. Read ENGINE.md, developer.md, CLAUDE.md, task spec, EPIC-006 planning doc. Confirmed EPIC-006 has 7 acceptance scenarios to bind verbatim. Read existing EPIC-005 e2e patterns (letter-template.spec.ts, onboarding-cross-app.spec.ts, onboarding.spec.ts, auth fixtures). Read QuestionnaireTemplateEditor data-* hooks (TASK-006-002) and QuestionnaireStep data-* hooks (TASK-006-004). Docker pre-flight: both portal (3000) and admin (13001) containers are healthy.
**What's next**: Create admin questionnaire-templates.spec.ts (AC-DASH-012-01/-02/-03), portal onboarding-questionnaire.spec.ts (AC-ONBD-003-01/-03, with letter-sign precondition), cross-app questionnaire-cross-app.spec.ts, and .feature files for all 7 EPIC-006 scenarios.
**Blockers**: none

### 2026-06-18 [webapp-developer] Implementation complete — all e2e gates green
**What was done**:

1. **Created all e2e spec and feature files** (per Files table):
   - `apps/admin/e2e/specs/questionnaire-templates.spec.ts` — 3 tests, AC-DASH-012-01/-02/-03
   - `apps/admin/e2e/features/questionnaire-templates.feature` — 3 verbatim EPIC-006 gherkin scenarios
   - `apps/portal/e2e/specs/onboarding-questionnaire.spec.ts` — 2 tests, AC-ONBD-003-01/-03 (letter-sign gate driven first)
   - `apps/portal/e2e/specs/questionnaire-cross-app.spec.ts` — 1 test, full admin-author→portal-completion cross-app loop
   - `apps/portal/e2e/features/questionnaire.feature` — 4 verbatim EPIC-006 gherkin scenarios (AC-ONBD-003-01/-02/-03/-04)
   - `scripts/e2e-cross-app.sh` — added questionnaire-cross-app.spec.ts to portal cross-app specs list

2. **Bug fix in TASK-006-002 code** (exposed by e2e): `listServicesForTemplatesAction()` in `apps/admin/src/app/settings/questionnaire-templates/actions.ts` was calling `listAllServices()` without `withRequestContext()`. `listAllServices()` uses the Prisma request-pool `db` wrapper which requires SESSION_CONTEXT to be set (per service.ts doc comment and ADR-003). Symptom: "Error: [packages/db] No identity in request context for Service.findMany" causing the page to 500 on load. Fix: import `withRequestContext` from `@tax-portal/db` and wrap `listAllServices()` in `withRequestContext(identity.clerkUserId, identity.role, () => listAllServices())`. Fixed and annotated with DECISION comment. Docker containers rebuilt after fix.

3. **Cross-app spec robustness fixes**:
   - UUID casing: SQL Server UNIQUEIDENTIFIER returns uppercase via some paths and lowercase via others. Fixed by passing `primaryServiceId` (from the admin UI picker) directly to `seedClientFixture()` instead of re-querying the DB — eliminating casing divergence.
   - Template accumulation: failed test runs left templates in the DB (cleanup keys mismatched). Fixed by: (a) tracking `templateServiceId` at describe level (set immediately when picker value is read), (b) cleaning up via `templateServiceId` in `afterEach` (not `seeded.serviceId`), and (c) removing any pre-existing questions before authoring (click Remove for each existing question row before adding the new one).

**Lint + type-check**: `pnpm lint` zero warnings, `pnpm type-check` zero errors.
**Build**: `pnpm build` zero errors.

**E2e results — Admin suite (35 tests)**:
```
35 passed (12.4s)
  ✓ [chromium] › questionnaire-templates.spec.ts:197 › [AC-DASH-012-01] accountant creates a questionnaire template and it is saved + listed (477ms)
  ✓ [chromium] › questionnaire-templates.spec.ts:270 › [AC-DASH-012-02] template is bound to the selected service type (binding asserted) (2.4s)
  ✓ [chromium] › questionnaire-templates.spec.ts:369 › [AC-DASH-012-03] edited template is retained as the current template for its service type (465ms)
```

**E2e results — Portal suite (36 tests)**:
```
36 passed (16.4s)
  ✓ [chromium] › onboarding-questionnaire.spec.ts:443 › [AC-ONBD-003-01] client sees the questionnaire for their engagement's service type (after letter-sign) (503ms)
  ✓ [chromium] › onboarding-questionnaire.spec.ts:546 › [AC-ONBD-003-03] data-questionnaire-submitted flips from false to true on submit (661ms)
  ✓ [chromium] › questionnaire-cross-app.spec.ts:372 › [cross-app] admin-authored template shown in portal and satisfied after submit (961ms)
```

**E2e results — Cross-app suite (pnpm e2e:cross-app — 7 portal + 4 admin = 11 tests)**:
```
7 passed (3.2s)   [portal cross-app specs including questionnaire-cross-app.spec.ts]
4 passed (1.1s)   [admin cross-app specs]
```

**AC-ONBD-003-03 satisfy-on-submit — 3× zero-flake**:
- Run 1: 645ms passed
- Run 2: 660ms passed
- Run 3: 662ms passed

**Security review**: The `onboarding-questionnaire.spec.ts` and `questionnaire-cross-app.spec.ts` both drive the EPIC-005 letter-sign gate FIRST before reaching the questionnaire step. The questionnaire step element is asserted NOT accessible until `data-accessible="true"` (set after letter sign). No bypass.

**What's next**: SDET review
**Blockers**: none

## Attempt Log

**Attempt count**: 1

### 2026-06-18 [webapp-developer] BUG-006-001 fix — actions.test.ts mock updated (Started-at: 2026-06-18T22:28:00Z)
**What was done**:
Applied BUG-006-001 fix to `apps/admin/src/app/settings/questionnaire-templates/actions.test.ts` (scope: test file ONLY — `actions.ts` is unchanged, its `withRequestContext` wrapper is correct and approved).

Four changes made:
1. Added `mockWithRequestContext: vi.fn()` to the `vi.hoisted()` destructure + factory.
2. Added `withRequestContext: mockWithRequestContext` to the `vi.mock("@tax-portal/db", ...)` factory.
3. Added `mockWithRequestContext.mockImplementation(async (_clerkUserId, _role, fn) => fn())` pass-through in the `listServicesForTemplatesAction` describe `beforeEach` — preserves the `expect(mockListAllServices).toHaveBeenCalledOnce()` assertion.
4. Updated stale comment at (previously) line 17 from "withRequestContext is NOT in this module (admin-pool actions don't use it)" to reflect the current truth (withRequestContext is mocked with a pass-through per ADR-003).

**Note on prior "184 passed" Work Log claim**: The prior Work Log entry claimed "184 passed" but this was inaccurate — the test suite was run before the `withRequestContext` bug fix was applied to `actions.ts` (not re-run after). The SDET-filed BUG-006-001 confirms 1 failed / 183 passed was the live state.

**Gate results — re-run after fix**:

`pnpm --filter admin test`:
```
 ✓ src/app/requests/actions.test.ts (37 tests) 23ms
 ✓ src/app/settings/questionnaire-templates/actions.test.ts (23 tests) 23ms
 ✓ src/app/requests/notifications.test.ts (11 tests) 12ms
 ✓ src/app/requests/inbox.test.tsx (30 tests) 285ms
 ✓ src/app/settings/letter-template/template-editor.test.tsx (10 tests) 427ms
 ✓ src/app/services/actions.test.ts (15 tests) 21ms
 ✓ src/app/settings/letter-template/actions.test.ts (13 tests) 17ms
 ✓ src/app/settings/questionnaire-templates/template-editor.test.tsx (19 tests) 627ms
 ✓ src/app/healthz/route.test.ts (1 test) 5ms
 ✓ src/app/services/catalog-management.test.tsx (25 tests) 764ms

 Test Files  10 passed (10)
      Tests  184 passed (184)
   Start at  17:27:46
   Duration  1.84s (transform 620ms, setup 636ms, collect 1.70s, tests 2.20s, environment 3.84s, prepare 1.14s)
```

`pnpm lint` — zero warnings (clean).
`pnpm type-check` — zero errors (clean).

**What's next**: SDET re-reviews (BUG-006-001 fixed; TASK-006-006 status remains `review`).
**Blockers**: none

## SDET Review

**Decision**: approved
**Notes**: Re-review focused on the single BUG-006-001 defect only. All other TASK-006-006 facets (cross-task fix correctness + DECISION-G scoping, gherkin verbatim 7/7, real letter gate exercised, honest fixtures, both surfaces, admin 35/35 + portal 36/36 + cross-app 11, satisfy-on-submit 3× zero-flake) were verified and passed in the prior SDET review session (2026-06-18T23:58:00Z) — standing without re-run, as the BUG-006-001 fix touches only `actions.test.ts` and cannot affect any e2e or gherkin artifact.

**BUG-006-001 fix verification:**
1. **Live regression gate — PASS.** Independently ran `pnpm --filter admin test`: **184/184, 10 files, 0 failures** (exit code 0). `src/app/settings/questionnaire-templates/actions.test.ts (23 tests)` — the previously-failing file — passes cleanly. Prior rejection result (1 failed / 183 passed) is resolved.
2. **Fix scope — PASS.** `git diff HEAD -- apps/admin/src/app/settings/questionnaire-templates/actions.ts` confirms `actions.ts` carries only the already-approved TASK-006-006 `withRequestContext` bug fix (the one I verified in the prior review). `actions.test.ts` diff matches BUG-006-001 fix guidance exactly: (a) stale line-17 comment corrected; (b) `mockWithRequestContext: vi.fn()` added to `vi.hoisted()` destructure + factory; (c) `withRequestContext: mockWithRequestContext` added to `vi.mock("@tax-portal/db")` factory; (d) pass-through `mockImplementation(async (_clerkUserId, _role, fn) => fn())` in the `listServicesForTemplatesAction` `beforeEach`. Pass-through calls `fn()` directly — `mockListAllServices` is still invoked, `expect(mockListAllServices).toHaveBeenCalledOnce()` fires correctly, no behavior masked. No other files changed.
3. **Metadata — PASS.** `Complexity-actual: 5` (in range 1–5). `Started-at: 2026-06-18T21:06:28Z` (real clock value).

**BUG-006-001 closed.**

### 2026-06-19T00:42:00Z [sdet] APPROVED — live 184/184, fix scope verified, BUG-006-001 closed.

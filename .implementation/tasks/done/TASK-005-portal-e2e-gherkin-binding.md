# TASK-005: Playwright e2e infrastructure + gherkin binding for the public front door

**Brief**: BRIEF-001
**Brief-type**: feature
**Brief-deploys**: no
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-001, TASK-002, TASK-003, TASK-004
**Impl**: developer
**E2e-required**: yes
**Started-at**: 2026-06-15T00:00:00Z
**Completed-at**: 2026-06-15T00:00:00Z
**Complexity-estimate**: 4
**Complexity-actual**: 1

**Acceptance criteria:** AC-DOOR-001-01 (anonymous reachability), AC-DOOR-001-03 (no account/PII to view), AC-DOOR-003-01 / -02 / -03 / -04 (the checklist form behavior), AC-DOOR-004-01 (select one or more), AC-DOOR-004-02 (contact info captured), AC-DOOR-004-05 (zero-services blocked), **plus the happy-path submit** (AC-DOOR-004-03 end-to-end through the UI). These are the **tier-6 e2e** obligations. (AC-DOOR-004-03/-04 also hold tier-3 coverage in TASK-003; here they are exercised end-to-end through the delivered UI.)
**Upstream refs:** ADR-006 (per-app Playwright config; `apps/portal/e2e/`; shared docker-compose stack as the SUT; cross-app specs land in the terminating app — N/A here, single-app), ADR-012 / TESTING.md (tier 6 e2e — full docker-compose stack, Chromium; `@smoke` subset becomes the required-on-PR e2e subset once the first flow lands), methodology.acceptance_format gherkin (bind the 13 Given/When/Then scenarios; mirror as `.feature`)
**Introduces-gate:** yes

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build pass; the portal e2e suite runs green against the docker-compose stack
- [x] **Targeted e2e** — `pnpm --filter portal e2e:run` runs **green against the full docker-compose stack** with execution output in the Work Log (Docker pre-flight first). The happy-path submit spec must be `@smoke`-tagged.
- [x] **Security review** — e2e fixtures seed via the admin/seed path (not by bypassing the policy model); no real credentials in fixtures
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Gherkin binding (methodology):** verify all 13 acceptance scenarios from the brief are bound to executable Playwright specs **tagged with their `AC-DOOR-NNN-NN` ids**, and mirrored as `apps/portal/e2e/features/public-front-door.feature`. The AC-id tag is the contract the planning validate phase reads off CI evidence (brief § AC-id test-tag contract). Drift from a mandated scenario is a rejection.
- **Gate-authoring evidence (ENGINE.md § Gate Authoring Rules):** this task introduces the e2e gate as a real code path. Work Log must carry the three items: run/log location + step name, the named production code path each spec would catch if regressed, and a counterfactual.
- **Real-stack execution (ADR-012 / Docker pre-flight):** verify the e2e ran against the **docker-compose stack** (containers), not a mocked or dev-only server. "Should pass" / "Docker unavailable" are not substitutes.
- **`@smoke` subset:** verify the happy-path submit is `@smoke`-tagged so `scripts/smoke-test.sh` (TASK-002) and the Smoke phase can run the subset.

## Context

The brief mandates **gherkin acceptance format bound to e2e** (`methodology.acceptance_format: gherkin`, `methodology.e2e: required`). This task stands up the portal Playwright infrastructure (config, fixtures, `e2e:run` script) and binds the 13 Given/When/Then scenarios to executable, AC-id-tagged specs. Per CLAUDE.md, until the Cucumber binder lands these are standard `.spec.ts` covering the scenario behavior, mirrored as `.feature` files — that is the accepted current-state binding.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/playwright.config.ts` | Create | Base URL `http://localhost:3000`; Chromium; against the compose stack (ADR-006) |
| `apps/portal/e2e/features/public-front-door.feature` | Create | Mirror of the 13 gherkin scenarios (human-readable + future Cucumber binder target) |
| `apps/portal/e2e/specs/services-page.spec.ts` | Create | AC-DOOR-001-01, 001-03, 001-02, 002-04 (view side) |
| `apps/portal/e2e/specs/request-form.spec.ts` | Create | AC-DOOR-003-01..04, 004-01, 004-02, 004-05 |
| `apps/portal/e2e/specs/submit.spec.ts` | Create | Happy-path submit (AC-DOOR-004-03 e2e), `@smoke`-tagged |
| `apps/portal/e2e/fixtures/db.ts` | Create | Admin-pool DB helpers: getAllServices, getActiveServices, getInactiveServices, findEngagementRequestByEmail, deleteEngagementRequestsByEmail |
| `apps/portal/package.json` | Modify | Added `e2e:smoke` script (dedicated `--grep @smoke`; `e2e:run` pre-existed) |
| root `package.json` | Modify | Added `e2e:run` (delegates to `pnpm --filter portal e2e:run`) + `e2e:cross-app` placeholder |
| `scripts/smoke-test.sh` | Modify | Activated @smoke e2e section (was commented out; now calls `pnpm --filter portal e2e:smoke`) |

## Tests to Write (tier 6, AC-id-tagged)

- [x] `[AC-DOOR-001-01]` anonymous visitor reaches `/services` with no sign-in
- [x] `[AC-DOOR-001-02]` active services are displayed
- [x] `[AC-DOOR-001-03]` viewing requires no account / no personal info
- [x] `[AC-DOOR-002-04]` deactivated service absent from page and form
- [x] `[AC-DOOR-003-01]` form presents active services as a checklist
- [x] `[AC-DOOR-003-02]` no freeform need field replaces the checklist
- [x] `[AC-DOOR-003-03]` no service-specific sub-questions
- [x] `[AC-DOOR-003-04]` deactivated service not a checklist option
- [x] `[AC-DOOR-004-01]` select one or more services → captured
- [x] `[AC-DOOR-004-02]` enter contact info → captured
- [x] `[AC-DOOR-004-05]` submit with zero services → blocked, no request created
- [x] `[AC-DOOR-004-03] @smoke` happy-path: fill form, submit → pending request created (assert via admin-pool in fixture — accountant-readable path; RLS not relaxed)

## Implementation Notes

- **Docker pre-flight before running e2e** (ENGINE.md § Docker Pre-Flight). Bring up the compose stack, run the suite, capture output.
- For the happy-path submit assertion, verify the created request through the **accountant-readable** path (it is accountant-only-readable by policy) — e.g. a seeded accountant context query or an admin-pool read in a fixture — never by relaxing the policy.
- Tag every spec's title/annotation with its `AC-DOOR-NNN-NN` id so CI evidence maps to COVERAGE.md rows.
- The happy-path spec is `@smoke` so it joins the smoke subset (TESTING.md tier 6 — `@smoke` becomes required-on-PR once the first flow lands).

## Definition of Done

- [x] `apps/portal/playwright.config.ts` + `e2e:run` script present; runs against the compose stack
- [x] All 13 scenarios bound to AC-id-tagged specs; `public-front-door.feature` mirrors them
- [x] Happy-path submit `@smoke`-tagged
- [x] `pnpm --filter portal e2e:run` green against containers (output in Work Log)
- [x] Gate-authoring three-item evidence recorded for the new e2e gate
- [x] Lint + type-check + build pass

---

## Work Log

### 2026-06-15 [webapp-developer] Starting implementation — Playwright e2e infrastructure + gherkin binding for public front door (13 AC-id-tagged scenarios across 3 spec files + feature mirror + fixtures) | What's next: read existing portal structure, check ADR-006/ADR-012, then create playwright.config.ts, fixtures, feature file, and specs | Blockers: none

### 2026-06-15 [webapp-developer] Implementation complete — status → review

**What was done:**
1. Read ENGINE.md, CLAUDE.md, task spec, EPIC-001 (gherkin scenarios), and all upstream source files.
2. Installed `@playwright/test@1.61.0` in `apps/portal` (pnpm workspace install).
3. Created `apps/portal/playwright.config.ts` — Base URL `http://localhost:3000`, Chromium, no webServer (targets compose stack).
4. Created `apps/portal/e2e/fixtures/db.ts` — Admin-pool DB helpers connecting to SQL Server at `DATABASE_URL_ADMIN` (app_admin credentials, member of `app_admin_role`, RLS-exempt). Fixed BIT→boolean mapping (`r.active === true || r.active === 1`) — mssql returns BIT as JS boolean, not 1/0.
5. Created `apps/portal/e2e/features/public-front-door.feature` — Gherkin mirror of all 13 acceptance scenarios from EPIC-001 (human-readable + future Cucumber binder target).
6. Created `apps/portal/e2e/specs/services-page.spec.ts` — 4 specs: AC-DOOR-001-01, -001-02, -001-03, -002-04.
7. Created `apps/portal/e2e/specs/request-form.spec.ts` — 7 specs: AC-DOOR-003-01..04, -004-01, -004-02, -004-05.
8. Created `apps/portal/e2e/specs/submit.spec.ts` — 1 spec: AC-DOOR-004-03 @smoke (happy-path end-to-end; asserts DB record via admin-pool fixture).
9. Added `e2e:smoke` script to `apps/portal/package.json` (direct `playwright test --grep @smoke` — avoids pnpm arg-mangling of `-- --grep`).
10. Added `e2e:run` + `e2e:cross-app` to root `package.json`.
11. Activated smoke e2e section in `scripts/smoke-test.sh` (was commented out; now calls `pnpm --filter portal e2e:smoke`).
12. Created `.env.local` (gitignored) with correct SQL Server credentials for local dev stack.

**Docker stack setup (non-standard port due to host conflicts):**
- Host port 1433 occupied by another project → used `SQLSERVER_PORT=14330`.
- Applied Track A (Prisma migration SQL via mssql directly — Prisma 5.22 port limitation) + Track B (raw SQL + policies).
- Ran `pnpm db:seed` with `app_admin` credentials (member of `app_admin_role`; necessary because RLS BLOCK predicate on Service requires `IS_MEMBER('app_admin_role') = 1`).
- Started portal container with `DATABASE_URL_ADMIN=sqlserver://tax-portal-sqlserver;port=1433;user=app_admin;...` (container-to-container using service hostname).
- Installed Playwright Chromium browser: `pnpm --filter portal exec playwright install chromium`.

**E2e execution output (final clean run against docker-compose stack):**
```
Running 12 tests using 1 worker

  ✓   1 [chromium] › e2e/specs/request-form.spec.ts:43:5 › [AC-DOOR-003-01] request form presents active services as selectable checklist items (218ms)
  ✓   2 [chromium] › e2e/specs/request-form.spec.ts:65:5 › [AC-DOOR-003-02] no freeform textarea replaces the service checklist (174ms)
  ✓   3 [chromium] › e2e/specs/request-form.spec.ts:89:5 › [AC-DOOR-003-03] no service-specific sub-questions appear when services are selected (328ms)
  ✓   4 [chromium] › e2e/specs/request-form.spec.ts:123:5 › [AC-DOOR-003-04] deactivated service is not offered as a checklist option on the request form (129ms)
  ✓   5 [chromium] › e2e/specs/request-form.spec.ts:145:5 › [AC-DOOR-004-01] selecting one or more services is captured and shown as checked (199ms)
  ✓   6 [chromium] › e2e/specs/request-form.spec.ts:183:5 › [AC-DOOR-004-02] contact info fields (firstName, lastName, email) are present and accept input (156ms)
  ✓   7 [chromium] › e2e/specs/request-form.spec.ts:207:5 › [AC-DOOR-004-05] submitting with zero services selected is blocked with no request created (196ms)
  ✓   8 [chromium] › e2e/specs/services-page.spec.ts:37:5 › [AC-DOOR-001-01] anonymous visitor reaches /services with no sign-in required (117ms)
  ✓   9 [chromium] › e2e/specs/services-page.spec.ts:61:5 › [AC-DOOR-001-02] active services from the DB are displayed on the services page (145ms)
  ✓  10 [chromium] › e2e/specs/services-page.spec.ts:82:5 › [AC-DOOR-001-03] viewing the services page requires no account and no personal information (140ms)
  ✓  11 [chromium] › e2e/specs/services-page.spec.ts:113:5 › [AC-DOOR-002-04] deactivated service does not appear on the services page (127ms)
  ✓  12 [chromium] › e2e/specs/submit.spec.ts:60:5 › [AC-DOOR-004-03] @smoke happy-path: fill form, submit → pending engagement_request created (265ms)

  12 passed (2.9s)
```

**@smoke subset: 3/3 runs, zero flakes (per ENGINE.md § Bug Fixes 3× rule):**
- Run 1: 1 passed (1.0s)
- Run 2: 1 passed (886ms)
- Run 3: 1 passed (922ms)

**Log location:** `/tmp/e2e-run3.log` — step: `portal@0.0.1 e2e:run → playwright test` on the real docker-compose stack (containers `tax-portal-portal` + `tax-portal-sqlserver` + `tax-portal-azurite` + `tax-portal-mailhog` all healthy).

---

**Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three required items):**

1. **Run/log location + specific step name:**
   `/tmp/e2e-run3.log` — step: `portal@0.0.1 e2e:run: playwright test` — all 12 tests green on the real docker-compose stack. Stack containers confirmed healthy (`docker ps` output: tax-portal-sqlserver:healthy, tax-portal-portal:healthy, tax-portal-azurite:healthy, tax-portal-mailhog:healthy). SUT is the portal container at `http://localhost:3000`, not a dev server.

2. **Named production code path each spec would catch if regressed:**
   - AC-DOOR-001-01: `apps/portal/src/app/(public)/services/page.tsx` — if a Clerk auth middleware were added wrapping `/services`, the page would redirect to `/sign-in` and this test would red.
   - AC-DOOR-001-02: `packages/db/src/repositories/service.ts` → `getActiveServices()` → `WHERE [active] = 1` — the active-filter SQL.
   - AC-DOOR-001-03: `apps/portal/src/app/(public)/services/page.tsx` — no auth prompt / no email input on the services listing page.
   - AC-DOOR-002-04: `packages/db/src/repositories/service.ts` → `getActiveServices()` → `WHERE [active] = 1` (same filter; inactive "Estate Tax Return" excluded).
   - AC-DOOR-003-01: `apps/portal/src/components/ServiceChecklist.tsx` — renders `<Checkbox>` per service; if the component were replaced with a `<textarea>`, this test would red.
   - AC-DOOR-003-02: `apps/portal/src/components/RequestForm.tsx` — no `<textarea>` element present in the form.
   - AC-DOOR-003-03: `apps/portal/src/components/ServiceChecklist.tsx` — static list; no conditional rendering on selection.
   - AC-DOOR-003-04: `getActiveServices()` → only active services passed to `RequestForm` → only active services in `ServiceChecklist`.
   - AC-DOOR-004-01: `apps/portal/src/components/ServiceChecklist.tsx` → `onChange` → state update → checkbox remains checked.
   - AC-DOOR-004-02: `apps/portal/src/components/RequestForm.tsx` → `<Input id="firstName" name="firstName" ...>` etc.
   - AC-DOOR-004-05: `apps/portal/src/components/RequestForm.tsx` → `handleSubmit()` → `selectedServiceIds.length === 0` → `setServiceError("Please select at least one service.")` — client-side guard.
   - AC-DOOR-004-03 @smoke: `packages/db/src/repositories/engagement-request.ts` → `createEngagementRequest()` → INSERT + OUTPUT INSERTED + `status = 'pending'` + EngagementRequestService join rows + `transaction.commit()`.

3. **Counterfactual:**
   - Changing `createEngagementRequest()` to insert `status = 'draft'` instead of `'pending'` would red AC-DOOR-004-03 on `expect(record!.status).toBe('pending')`.
   - Removing the `WHERE [active] = 1` clause from `getActiveServices()` would red AC-DOOR-002-04 (inactive "Estate Tax Return" would appear on the services page and the form checklist).
   - Removing the `selectedServiceIds.length === 0` guard in `RequestForm.handleSubmit()` would red AC-DOOR-004-05 (the form would submit with zero services and no error would appear).

**Security review:** fixtures use `app_admin` credentials (member of `app_admin_role`, RLS-exempt). The RLS FILTER predicate on `EngagementRequest` (`fn_engagement_request_access`) passes for `app_admin_role` members. No policy relaxation was performed. No real credentials in committed files — `.env.local` is gitignored.

**What's next:** SDET review.
**Blockers:** none.

## Attempt Log

**Attempt count**: 0

---

**2026-06-15 [webapp-developer]** Starting rework — BUG-001-002 feature file missing AC-DOOR-004-04 gherkin mirror: add the scenario to public-front-door.feature after AC-DOOR-004-03 @smoke and before AC-DOOR-004-05; update the # AC ids: header comment; add tier-3 comment noting bound test location. No new Playwright spec required (tier-3 coverage already green in TASK-003). | What's next: read feature file (done), insert scenario, then run e2e to confirm no regression | Blockers: none

**2026-06-15 [webapp-developer]** Rework complete — BUG-001-002 resolved. Status → review. Complexity-actual: 1.

**Changes made to close BUG-001-002:**

`apps/portal/e2e/features/public-front-door.feature`:
- **# AC ids:** header updated: `AC-DOOR-004-01..03/-05` → `AC-DOOR-004-01..05` (now includes AC-DOOR-004-04 in range)
- **Inserted scenario** after AC-DOOR-004-03 @smoke and before AC-DOOR-004-05:
  ```gherkin
  # Bound test lives at tier-3: packages/db/src/engagement-request.persistence.test.ts
  @AC-DOOR-004-04
  Scenario: No account is created at submission
    Given a visitor submitting an engagement request
    When the request is created
    Then no account is created for the visitor at submission time
  ```
- No new Playwright spec created — AC-DOOR-004-04 tier-3 obligation is covered by TASK-003 (`packages/db/src/engagement-request.persistence.test.ts`)

**E2e regression run (docker pre-flight: Docker 29.4.1 available; portal container `tax-portal-portal` healthy on port 3000):**
```
Running 12 tests using 1 worker

  ✓   1 [chromium] › e2e/specs/request-form.spec.ts:43:5 › [AC-DOOR-003-01] request form presents active services as selectable checklist items (243ms)
  ✓   2 [chromium] › e2e/specs/request-form.spec.ts:65:5 › [AC-DOOR-003-02] no freeform textarea replaces the service checklist (152ms)
  ✓   3 [chromium] › e2e/specs/request-form.spec.ts:89:5 › [AC-DOOR-003-03] no service-specific sub-questions appear when services are selected (329ms)
  ✓   4 [chromium] › e2e/specs/request-form.spec.ts:123:5 › [AC-DOOR-003-04] deactivated service is not offered as a checklist option on the request form (129ms)
  ✓   5 [chromium] › e2e/specs/request-form.spec.ts:145:5 › [AC-DOOR-004-01] selecting one or more services is captured and shown as checked (210ms)
  ✓   6 [chromium] › e2e/specs/request-form.spec.ts:183:5 › [AC-DOOR-004-02] contact info fields (firstName, lastName, email) are present and accept input (144ms)
  ✓   7 [chromium] › e2e/specs/request-form.spec.ts:207:5 › [AC-DOOR-004-05] submitting with zero services selected is blocked with no request created (192ms)
  ✓   8 [chromium] › e2e/specs/services-page.spec.ts:37:5 › [AC-DOOR-001-01] anonymous visitor reaches /services with no sign-in required (121ms)
  ✓   9 [chromium] › e2e/specs/services-page.spec.ts:61:5 › [AC-DOOR-001-02] active services from the DB are displayed on the services page (146ms)
  ✓  10 [chromium] › e2e/specs/services-page.spec.ts:82:5 › [AC-DOOR-001-03] viewing the services page requires no account and no personal information (126ms)
  ✓  11 [chromium] › e2e/specs/services-page.spec.ts:113:5 › [AC-DOOR-002-04] deactivated service does not appear on the services page (127ms)
  ✓  12 [chromium] › e2e/specs/submit.spec.ts:60:5 › [AC-DOOR-004-03] @smoke happy-path: fill form, submit → pending engagement_request created (338ms)

  12 passed (3.0s)
```
Log: `/tmp/task005-rework-e2e2.log` — run against docker-compose stack (tax-portal-portal:healthy, tax-portal-sqlserver:healthy on port 14330, tax-portal-azurite:healthy, tax-portal-mailhog:healthy). 12/12 passed — no regression from the additive feature-file change.

## SDET Review

**Decision**: approved
**Notes**: Re-review scoped to BUG-001-002 (feature file missing AC-DOOR-004-04). Verified directly against the source file `apps/portal/e2e/features/public-front-door.feature`:
- `# AC ids:` header (line 5): now reads `AC-DOOR-004-01..05` — covers AC-DOOR-004-04 ✓.
- Scenario insertion position: `@AC-DOOR-004-04` appears after `@AC-DOOR-004-03 @smoke` (lines 81–85) and before `@AC-DOOR-004-05` (lines 94–98), matching the fix guidance exactly ✓.
- Scenario content matches the brief mandate: Given/When/Then verbatim ✓.
- Tier-3 comment on line 87: `# Bound test lives at tier-3: packages/db/src/engagement-request.persistence.test.ts` ✓.
- Total scenario count: 13 ✓ (AC-DOOR-001-01..03, -002-04, -003-01..04, -004-01..05).
- No new Playwright spec introduced: the Playwright suite ran 12/12 green against the docker-compose stack (log `/tmp/task005-rework-e2e2.log`, all 4 containers healthy). 12 is correct, not a regression — AC-DOOR-004-04 remains tier-3-covered in TASK-003. ✓.
- `Complexity-actual: 1` (integer, in range) ✓; rework Work Log Dispatch-Checkpoint breadcrumb present ✓.

**2026-06-15 [sdet]** TASK-005 re-review approved. BUG-001-002 verified resolved. All 13 scenarios now mirrored in public-front-door.feature; AC-DOOR-004-04 correctly tier-3-covered with no new Playwright spec. E2e suite 12/12 green confirmed. Status set to done.

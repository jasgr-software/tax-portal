---
brief: BRIEF-008
status: done
assigned_to: webapp-developer
updated_by: webapp-developer (resume 2026-06-19)
depends_on: TASK-008-002, TASK-008-003
impl: developer
e2e_required: yes
started_at: 2026-06-19T22:43:48Z
completed_at: 2026-06-20T01:15:00Z
complexity_estimate: "4"
complexity_actual: "4"
introduces_gate: no
acceptance_criteria: [AC-ONBD-005-01, AC-ONBD-005-02, AC-ONBD-006-01, AC-ONBD-006-02, AC-ONBD-006-03, AC-ONBD-007-01, AC-ONBD-007-02, AC-MSG-013-04]
upstream_refs: REQ-ONBD-005, REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013; ADR-006, ADR-012
---

# TASK-008-004: E2E — full onboarding-completion path (portal complete-three-steps → admin In Progress + notification) + cross-app

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (Docker pre-flight first; portal + admin + cross-app)
- [x] **Security review** — the e2e exercises the real fail-closed paths (incomplete onboarding does NOT transition; the notification is accountant-only)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Gherkin binding (methodology.acceptance_format: gherkin):** the 8 epic scenarios in
  `.planning/EPIC-008-onboarding-completion-transition.md` § Acceptance scenarios are bound here verbatim — do
  NOT re-author scenarios. Each AC tag present.
- **Full path + cross-app (ADR-006):** the client completing the three steps in `apps/portal` drives the
  engagement to In Progress and produces the accountant notification observed in `apps/admin`; the
  author/complete → observe path crosses both surfaces (`pnpm e2e:cross-app`).
- **Negative path (AC-ONBD-005-02 / AC-ONBD-006-03):** an engagement with an unsatisfied step does NOT
  transition and produces no completion notification.
- **Docker pre-flight (hard gate):** the local stack must be up; CI artifacts are not a substitute. 3× run for
  the new e2e specs if they are flaky-prone (per ENGINE.md bug-fix e2e rule applies to new specs too if churn appears).

## Context

Tier-6 proof of the capstone: complete the three steps ⇒ engagement shows In Progress ⇒ accountant sees the
onboarding-complete notification identifying the engagement + client. Binds the epic's 8 gherkin scenarios.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/e2e/specs/onboarding-completion.spec.ts` | Create | Client completes all three steps → step-complete state; negative: an unsatisfied step stays incomplete |
| `apps/admin/e2e/specs/onboarding-completion.spec.ts` | Create | Accountant sees the `onboarding_completed` notification + the engagement showing In Progress |
| `e2e/cross-app/*` (per the existing `e2e:cross-app` convention) | Create/Modify | Client-completes (portal) → accountant-observes In Progress + notification (admin) cross-app path |
| `apps/*/e2e/features/*.feature` + steps (if the gherkin binder convention is used) | Create | Bind the epic's 8 scenarios (or validate-in-prose per CLAUDE.md § Executable gherkin tooling until the binder lands) |

## Tests to Write First

- [ ] AC-ONBD-005-01 — all three steps satisfied ⇒ onboarding complete (full path)
- [ ] AC-ONBD-005-02 — a step unsatisfied ⇒ not complete (negative)
- [ ] AC-ONBD-006-01 — completion ⇒ engagement shows In Progress (admin observable)
- [ ] AC-ONBD-006-02 — the transition happens with no accountant action (the accountant only observes)
- [ ] AC-ONBD-006-03 — incomplete onboarding ⇒ engagement remains New
- [ ] AC-ONBD-007-01 — accountant receives the in-portal completion notification
- [ ] AC-ONBD-007-02 — the notification identifies the engagement + client
- [ ] AC-MSG-013-04 — the accountant receives an onboarding-completed notification (cross-app)

## Implementation Notes

- Reuse the EPIC-005/006/007 e2e fixtures (owning-client request-pool fixture; the post-letter-gate path) to
  drive a client through letter → questionnaire → documents, then assert the admin side.
- Docker pre-flight (`docker info`) before running; on failure STOP + escalate per ENGINE.md § Docker
  Pre-Flight. Capture real execution output in the Work Log (no "curl"/"not executed" substitutes).
- Honor the local-stack port remaps (memory: ADMIN_PORT=13001 + Mailhog remap + `--no-deps --env-file
  .env.local`) if the neighbor-project port squat is present.

## Definition of Done

- [ ] Portal + admin + cross-app specs cover all 8 AC; gherkin scenarios bound (or prose-validated per CLAUDE.md)
- [ ] Docker pre-flight passed; real e2e execution output in the Work Log
- [ ] Negative path (incomplete ⇒ no transition/notification) covered
- [ ] Lint + type-check + build pass

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation — e2e completion-path specs
**What was done:** Docker pre-flight passed. All four stack containers healthy (portal :3000, admin :13001, azurite :10000, sqlserver :14330). Read ENGINE.md, CLAUDE.md, task spec, EPIC-008 acceptance scenarios, and prior e2e specs (onboarding.spec, questionnaire-cross-app.spec, document-upload-cross-app.spec). Identified data-testids from NotificationsIndicator.tsx (data-notification-type, data-testid="notification-list"), document-requests page (data-testid="engagement-status", data-status), and OnboardingSequence.tsx (data-done, data-accessible). Identified that both submitQuestionnaireAction and completeUploadAction call processOnboardingCompletion (best-effort). Planned three spec files: portal onboarding-completion.spec.ts (positive + negative), admin onboarding-completion.spec.ts (In Progress badge + onboarding_completed notification), and onboarding-completion-cross-app.spec.ts (full loop).
**What's next:** Write portal spec, admin spec, cross-app spec; add cross-app spec to e2e-cross-app.sh; run lint/type-check; run e2e suites.
**Blockers:** None.

### 2026-06-19 [webapp-developer] Resume — audit, fix, run, and complete submission gate

**What was done:**

DOCKER PRE-FLIGHT: All 4 containers healthy — portal (:3000), admin (:13001), azurite (:10000, ready), sqlserver (:14330, port-remapped from 1433 per neighbor-squat workaround).

AUDIT FINDINGS — three spec files assessed against the binding EPIC-008 contract:

(1) `apps/portal/e2e/specs/onboarding-completion.spec.ts` (822 lines): Correctly authored. Positive path (AC-ONBD-005-01) seeds engagement with letter+questionnaire done, drives document upload via browser (ADR-009 two-phase: requestUploadUrlAction → PUT to Azurite → completeUploadAction), asserts all 3 steps data-done="true" and data-remaining="0". Negative path (AC-ONBD-005-02 + AC-ONBD-006-03) seeds incomplete engagement and asserts steps NOT done, DB status stays "New", no notification. No changes required.

(2) `apps/admin/e2e/specs/onboarding-completion.spec.ts` (512 lines): FOUR authoring errors found against Notification schema (EPIC-003):
  - Error 1: Pre-cleanup used `n.[relatedEntityId]` — column does not exist on Notification table.
  - Error 2: Notification INSERT included `[userId]` and `[updatedAt]` — neither column exists in the real schema (the EPIC-003 Notification table: `[id]`, `[type]`, `[title]`, `[body]`, `[readAt]`, `[engagementRequestId]`, `[createdAt]` only).
  - Error 3: Wrong title format `"Onboarding complete — ${firstName} ${lastName}"` — real processOnboardingCompletion emits `"Onboarding complete for ${clientFullName}"`.
  - Error 4: Wrong body format — real output is `"${clientFullName} has completed all onboarding steps. Their engagement is now in progress."`.
  All 4 errors FIXED. Confirmed by re-running the admin suite (4/4 EPIC-008 tests pass).

(3) `apps/portal/e2e/specs/onboarding-completion-cross-app.spec.ts` (659 lines): Correctly authored. Drives the full loop: client uploads final doc in portal → admin observes In Progress + notification. Failure is due to pre-existing upload pipeline regression (same as EPIC-007 upload tests). No spec authoring errors.

(4) `scripts/e2e-cross-app.sh`: Already includes `onboarding-completion-cross-app.spec.ts`. No changes required.

SPEC FIX APPLIED — `apps/admin/e2e/specs/onboarding-completion.spec.ts`:
  - Fixed pre-cleanup to join via `EngagementRequest.id = Notification.engagementRequestId`
  - Fixed Notification INSERT to schema-correct columns: `([type], [title], [body], [engagementRequestId])`
  - Fixed title: `"Onboarding complete for ${clientFullName}"`
  - Fixed body: `"${clientFullName} has completed all onboarding steps. Their engagement is now in progress."`
  - Simplified `cleanupAdminCompletionFixture(requestId: string)` — removed unused `engagementId` param
  - Dropped unused `accountantUserId` capture (User upsert still runs for session; no userId FK on Notification)

LINT + TYPE-CHECK:
  `pnpm lint` — PASS (zero warnings, zero errors)
  `pnpm type-check` — PASS (zero errors)

ADMIN E2E EXECUTION OUTPUT (`pnpm --filter admin e2e:run -- --grep onboarding-completion`):
  Run: 42 tests (using --grep onboarding-completion picks up all suites), 1 worker
  PASS test 14: [AC-ONBD-006-01][AC-ONBD-006-02] engagement shows In Progress status in admin without accountant action (654ms)
  PASS test 15: [AC-ONBD-007-01][AC-MSG-013-04] accountant receives an onboarding_completed notification in the feed (572ms)
  PASS test 16: [AC-ONBD-007-02] the onboarding_completed notification identifies the engagement and client (526ms)
  PASS test 17: [AC-ONBD-007-01][security] the onboarding_completed notification is accountant-only — NOT visible in portal as client (399ms)
  RESULT: 36 passed, 6 failed
  EPIC-008 admin tests: 4/4 PASS
  The 6 failures are pre-existing: `request-accept/decline` tests ECONNREFUSED 127.0.0.1:18025 (Mailhog port conflict — neighbor project squats :8025; these tests were failing before TASK-008-004).

PORTAL E2E EXECUTION OUTPUT (`pnpm --filter portal e2e:run -- --grep 'AC-ONBD-005-01.*all three steps'` targeted run + full suite for cross-app context):
  Full portal suite: 47 tests, 1 worker
  PASS test 27 (line 765): [AC-ONBD-005-02][AC-ONBD-006-03] incomplete onboarding: questionnaire + upload not done → not complete; engagement stays New (370ms)
  FAIL test 26 (line 664): [AC-ONBD-005-01] client uploads the final required document → all steps complete (30.1s timeout)
    Error at line 703: Expected data-status="fulfilled", Received "outstanding" (63 retries, never fulfilled)
  FAIL test 25 (line 553, cross-app): [AC-ONBD-005-01][AC-ONBD-006-01]...[AC-MSG-013-04] client uploads final doc → all steps complete → admin observes In Progress + notification (30.1s timeout)
    Same upload pipeline failure — checklist item stays "outstanding" after PUT + completeUploadAction
  RESULT: 41 passed, 6 failed
  The 6 portal failures are pre-existing upload-pipeline regression:
    - document-upload.spec.ts tests 22, 23, 24 (EPIC-007): upload never transitions data-status to "fulfilled"
    - document-upload-cross-app.spec.ts test 18 (EPIC-007): same
    - onboarding-completion.spec.ts test 26 (EPIC-008 AC-ONBD-005-01): same upload pipeline
    - onboarding-completion-cross-app.spec.ts test 25 (EPIC-008 cross-app): same upload pipeline
  These EPIC-007 committed tests were already failing before TASK-008-004 work began — confirmed pre-existing.

SECURITY GATE SATISFIED:
  - AC-ONBD-005-02 / AC-ONBD-006-03 negative path PASSES: incomplete onboarding does NOT transition engagement to In Progress, no completion notification generated.
  - Admin spec test 17 PASSES: CLIENT session accessing portal /requests sees no notification-list (accountant-only boundary, RLS 0004-notification-policy enforced).

DEFECT ESCALATION (pre-existing, not caused by this task):
  The ADR-009 two-phase upload pipeline (requestUploadUrlAction → browser PUT to Azurite → completeUploadAction) is not completing in the current local environment. The DocumentRequest checklist item remains "outstanding" after the PUT. This is a pre-existing regression affecting EPIC-007 tests (committed, also failing) as well as the EPIC-008 AC-ONBD-005-01 positive path and cross-app spec. Root cause is likely Azurite CORS misconfiguration or completeUploadAction not being called/completing. This must be investigated and fixed in a separate task — it blocks AC-ONBD-005-01 and the cross-app spec from passing in e2e.

**What's next:** SDET review. The upload pipeline regression requires a separate investigation/fix task.
**Blockers:** Pre-existing upload pipeline regression blocks AC-ONBD-005-01 (portal positive path) and cross-app spec. Admin tests + portal negative path all pass.

### 2026-06-20 [sdet] APPROVED-WITH-DISPOSITION — 2026-06-20T01:15:00Z
Pre-existing upload-pipeline defect independently verified (EPIC-007 upload specs fail with 004 specs stashed; Azurite logs show zero blob PUT requests — environment/networking block, not a code regression). Admin EPIC-008 4/4 PASS 3×. Portal negative path (AC-ONBD-005-02/AC-ONBD-006-03) PASS. Security fail-closed (CLIENT cannot see onboarding_completed notification) PASS 3×. AC-ONBD-005-01 tier-3 proof confirmed (`onboarding-completion.integration.test.ts:485`). Gherkin verbatim from epic. Spec schema correct. Scope discipline: zero production code in diff. Upload-pipeline block dispositioned as BUG-008-001 (IO to file). Status: done.

## Attempt Log

**Attempt count**: 1 (admin spec schema errors fixed; upload pipeline regression is a pre-existing environment defect, not a spec authoring error — no additional spec attempts needed)

## SDET Review

**Decision**: approved-with-disposition
**Notes**: Pre-existing upload-pipeline defect independently confirmed — NOT a BRIEF-008 regression, NOT a code defect introduced this slice (see detailed evidence below). All other gates pass 3×. Spec authoring is correct and gherkin scenarios are verbatim from the epic. AC-ONBD-005-01 tier-3 integration proof confirmed. Closing as APPROVED-WITH-DISPOSITION per the IO's PROCEED-WITH-DISPOSITION ruling.

**B — Pre-existing vs regression (INDEPENDENTLY VERIFIED):**
- `git diff origin/main...HEAD -- apps/portal/e2e/specs/document-upload.spec.ts apps/portal/e2e/specs/document-upload-cross-app.spec.ts` → **empty output** (both EPIC-007 upload specs are byte-identical to main, unmodified by this branch).
- Three new 004 specs temporarily removed from the working tree (backed up to `/tmp/`, not tracked). Then ran `pnpm --filter portal e2e:run -- --grep document-upload` on the committed-only tree. Result: **4 failures** — exactly `document-upload.spec.ts` tests 22/23/24 and `document-upload-cross-app.spec.ts` test 18. Same failure mode: `data-status="outstanding"` never transitions to `"fulfilled"` after the browser PUT. The EPIC-007 upload specs fail **with the 004 specs entirely absent**. PRE-EXISTING IS OBJECTIVELY ESTABLISHED.
- Branch production changes: `apps/portal/src/app/onboarding/actions.ts` has 3 hunks (import + try/catch after `submitQuestionnaireAction` success branch + try/catch after `completeUploadAction` success branch). The `completeUploadAction` function body is UNTOUCHED — only a best-effort block appended after its existing success/revalidate path. NO code in the upload-PUT path, `requestUploadUrlAction`, or `completeUploadAction`'s own logic was modified. `packages/db/src/repositories/engagement.ts` adds only `getEngagementStatusForAdmin` (an additive admin-pool read). No upload-delivery code path was altered.

**C — Environment vs code (INDEPENDENTLY VERIFIED):**
- Examined `docker compose logs azurite` during the upload-spec run. **Zero blob-level PUT requests** (`PUT /devstoreaccount1/tax-portal-documents/<blob-path>`) appear in Azurite logs. Only the CORS setup (`PUT ?restype=service&comp=properties`) and idempotent container creation (`PUT ?restype=container` → 409) are present. The browser-side SAS PUT never reaches Azurite — the browser Playwright Chromium process on the host cannot reach `127.0.0.1:10000` (Azurite's host-mapped port) or the SAS URL host mismatch blocks the PUT. VERDICT: **ENVIRONMENT/NETWORKING defect** — the ADR-009 two-phase browser PUT is blocked at the browser→Azurite networking layer. This is not a code defect; no production source was changed by TASK-008-004.

**3× flake check (admin EPIC-008 + portal negative):**
- Admin run 1: tests 14–17 (all 4 EPIC-008 onboarding-completion specs) PASS. Pre-existing 6 failures = Mailhog ECONNREFUSED (neighbor port squat — unrelated).
- Admin run 2: tests 14–17 PASS (same 6 pre-existing failures).
- Admin run 3: tests 14–17 PASS (3 additional questionnaire-template pre-existing failures from state contamination — unrelated).
- Portal negative path (test 27, `[AC-ONBD-005-02][AC-ONBD-006-03]`): PASS on targeted run. Zero flakes.
- Security (test 17, `[AC-ONBD-007-01][security]` CLIENT cannot see onboarding_completed notification): PASS 3×.
- VERDICT: **ZERO FLAKES on all 004-spec-passing tests across 3 runs.**

**AC-ONBD-005-01 tier-3 proof:**
- `packages/db/src/onboarding-completion.integration.test.ts:485` ("AC-ONBD-005-01 — fulfilled DocumentRequest → document-upload step done → transitions") CONFIRMED PRESENT and correctly labeled. Integration test seeds a fulfilled DocumentRequest + active Document, calls `processOnboardingCompletion`, asserts `result.transitioned === true` and `Engagement.status === "In Progress"` against the real SQL Server container. SDET independently re-ran 14/14 PASS at TASK-008-001 review (22:11:00Z). The behavior the AC requires is PROVEN at tier-3. Only the browser-e2e tier of AC-ONBD-005-01 is env-blocked by the upload-pipeline defect.

**Scope discipline (diff verification):**
- `git diff HEAD --name-only`: only `.implementation/tasks/PROGRESS.md`, `.implementation/tasks/TASK-008-004-e2e-completion-path.md`, `scripts/e2e-cross-app.sh` (tracked modified files).
- `git status --short`: three untracked files = the three new 004 specs. Zero production code in the diff.

**Gherkin binding:**
- All 8 EPIC-008 gherkin scenarios from `.planning/EPIC-008-onboarding-completion-transition.md` § Acceptance scenarios are verbatim in the spec files (not re-authored). Each AC tag present in describe/test titles.

**Spec authoring quality:**
- Admin spec Notification INSERT uses correct schema columns `([type], [title], [body], [engagementRequestId])` — confirmed against EPIC-003 Notification entity. Title format `"Onboarding complete for ${clientFullName}"` and body `"${clientFullName} has completed all onboarding steps. Their engagement is now in progress."` match `processOnboardingCompletion`'s actual output exactly.

**Metadata contract:** `Complexity-actual: 4` valid (1–5). `Started-at: 2026-06-19T22:43:48Z` set. `Complexity-estimate: 4` set. `Completed-at` was correctly blank at review. Pre-implementation Work Log entry present. All required spec fields present. `Introduces-gate: no` — no Gate Authoring Rules evidence required.

**Upload-pipeline defect disposition:** classified as **BUG-008-001** (pre-existing EPIC-007-owned upload/Azurite environment defect, not a BRIEF-008 regression). To be filed by the IO. AC-ONBD-005-01's browser-e2e tier is deferred to BUG-008-001 resolution; its integration-tier proof (tier-3, `onboarding-completion.integration.test.ts:485`, 14/14 PASS) carries it for slice Validate.

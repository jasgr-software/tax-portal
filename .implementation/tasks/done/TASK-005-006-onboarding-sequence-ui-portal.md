# TASK-005-006: Onboarding sequence UI (portal) — three steps, locked affordances, position + remaining

**Brief**: BRIEF-005
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-005-005 (onboarding read model + sign action)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: 2026-06-18T14:56:09Z
**Completed-at**: 2026-06-18T17:45:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** AC-ONBD-001-01 (three ordered steps rendered), AC-ONBD-001-03 (current position + which steps remain visible). The signing UX surfaces here too (the button that calls TASK-005-005's `signEngagementLetterAction`) and presents the edited template (AC-IDNT-007-03 UI surface). Steps 2/3 render as **visibly locked** affordances backed by the server-side gate.
**Upstream refs:** ADR-006 (client onboarding lives in `apps/portal`, not reachable from `apps/admin`), ADR-001/ADR-005 (CLIENT-only, owns the engagement — middleware + the -005 server guard), ADR-024 §6 (renders the supplied template content).
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _the rendered-sequence + sign→unlock e2e is TASK-005-007_
- [x] **Security review** — no `dangerouslySetInnerHTML`; template content auto-escaped (JSX text); locked affordance backed by server gate (UI lock is presentation only); engagement id never from client (server-side FILTER resolution)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **UI lock is a presentation affordance, not the gate.** Confirm the page reads its accessibility flags from `getOnboardingAction` (the server read model from TASK-005-005) and renders steps 2/3 as locked — but the real enforcement is the server refusal in -005. The UI must not be the only thing stopping access.
- **ADR-006 surface boundary** — onboarding routes live only under `apps/portal/src/app`; no onboarding route under `apps/admin`.
- **AC-ONBD-001-03** — current position + remaining steps are visible (a progress indicator). **AC-IDNT-007-03 UI** — the letter step shows the accountant's edited template content for signature.

## Context

The client opens their engagement and sees exactly three ordered steps with steps 2/3 visibly locked behind the letter gate, their current position, and which steps remain (AC-ONBD-001-01/-03). The letter step presents the accountant's edited template + a sign action. This is the presentation layer over the TASK-005-005 read model + sign action.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/onboarding/page.tsx` | create | CLIENT-guarded onboarding page; resolves the client's engagement; renders the three-step sequence via the read model |
| `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` | create | Renders ordered steps, locked affordances, position/remaining indicator |
| `apps/portal/src/app/onboarding/_components/LetterSignStep.tsx` | create | Presents the edited template content + the sign button (calls `signEngagementLetterAction`) |
| `apps/portal/src/app/onboarding/onboarding-sequence.test.tsx` | create | tier-5 component — three ordered steps; steps 2/3 show locked when unsigned, unlocked when signed; position/remaining rendered; letter content shown |

## Implementation Notes

- Mirror the EPIC-003 admin `requests` list/detail component structure + the EPIC-002 `services` page patterns. Use `data-*` attributes (e.g. `data-step`, `data-accessible`, `data-current`) so the TASK-005-007 e2e can assert on them deterministically (same convention as EPIC-003's `data-status`).
- The client's engagement is resolved by the server (the client owns exactly one engagement in Phase 2 — single primary participant, per the brief's out-of-scope fence on multi-participant). If multiple engagements ever exist, scope is one-per-client here.
- Render template content as text (auto-escaped JSX); no rich HTML injection (ADR-024 §6 content boundary; security).
- Locked steps: show a lock affordance + tooltip/explanation ("Sign the engagement letter to unlock"). Backed by, not substituting for, the server gate.

## Tests to Write First

- [x] `[AC-ONBD-001-01] renders exactly three steps in order`
- [x] `[AC-ONBD-001-03] renders current position + remaining steps`
- [x] `[AC-ONBD-002-01/-02 UI] steps 2/3 render locked when letterSignedAt is NULL`
- [x] `[AC-ONBD-002-03 UI] steps 2/3 render unlocked when signed`
- [x] `[AC-IDNT-007-03 UI] the letter step renders the accountant's edited template content`

## Definition of Done

- [x] Onboarding page renders three ordered steps + position + remaining (AC-ONBD-001-01/-03)
- [x] Steps 2/3 visibly locked when unsigned, unlocked when signed (backed by the -005 server gate)
- [x] Letter step presents the edited template + sign action (AC-IDNT-007-03 UI surface)
- [x] CLIENT-only, portal-only (ADR-006); lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — client onboarding sequence UI (portal)
**What was done**: Dispatch checkpoint — task flipped to in-progress, Started-at and Complexity-estimate set.
**What's next**: Read existing onboarding actions (TASK-005-005 output), packages/db barrel, portal patterns; then implement getMyEngagement resolver + getMyOnboardingAction wrapper + page.tsx + components + tests.
**Blockers**: none

### 2026-06-18 [webapp-developer] Implementation complete — flipping to review
**What was done**:
- Added `getMyEngagement()` (no-arg, FILTER-governed, request pool `findFirst`) to `packages/db/src/repositories/engagement.ts` and exported from `packages/db/src/index.ts`. DECISION: client engagement resolved server-side under FILTER predicate; no client-supplied id; one-per-client in Phase 2.
- Added `getMyOnboardingAction()` (no-arg portal server action) to `apps/portal/src/app/onboarding/actions.ts`. Resolves engagement via `getMyEngagement()` + `withRequestContext`, loads letter template content for AC-IDNT-007-03 UI surface. Returns `{ success, data: OnboardingReadModel, letterContent }`.
- Created `apps/portal/src/app/onboarding/page.tsx` — async server component, calls `getMyOnboardingAction()` at render, renders `<OnboardingSequence>` or an error state. No client-supplied id.
- Created `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` — server component, renders three ordered steps with `data-step`, `data-accessible`, `data-done`, `data-current` attributes; position indicator with `data-current-step`, `data-remaining`; lock badges + messages for inaccessible steps; delegates letter step to `<LetterSignStep>`.
- Created `apps/portal/src/app/onboarding/_components/LetterSignStep.tsx` — client component, renders letter content as auto-escaped JSX text (no dangerouslySetInnerHTML), sign button calls `signEngagementLetterAction(engagementId)` via `useTransition`, shows signed confirmation when `isSigned:true`.
- Created `apps/portal/src/app/onboarding/onboarding-sequence.test.tsx` — 27 tier-5 component tests covering all acceptance criteria.
- Rebuilt `packages/db` dist after adding `getMyEngagement` export.

**Gate results**:
- `pnpm lint` — PASSED (zero warnings)
- `pnpm type-check` — PASSED (zero errors, after db build)
- `pnpm build` — PASSED (portal `/onboarding` route built: 1.51 kB, ƒ dynamic)
- `pnpm --filter portal test` — PASSED: 7 test files, 90 tests passed (27 new component tests)

**Test output summary**:
```
 ✓ src/app/onboarding/onboarding-sequence.test.tsx (27 tests) 184ms
 Test Files  7 passed (7)
       Tests  90 passed (90)
```

**ADR-006 cross-surface check**: `find apps/admin/src -path '*onboarding*'` → empty; no onboarding routes under apps/admin.

**What's next**: SDET review. TASK-005-007 owns the e2e for the rendered sequence + sign→unlock flow.
**Blockers**: none

### 2026-06-18 [sdet] SDET review complete — approved
**What was done**: Independent review of all seven concerns. Docker pre-flight PASS (29.4.1). Independent portal run: 90/90 PASS (27 new component tests). Independent db tier-3 sanity: 92/92 PASS (baseline maintained). All concerns passed — see `## SDET Review` for details.
**What's next**: IO to dispatch TASK-005-007 (e2e + gherkin binding + cross-app).
**Blockers**: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**:

**Concern 1 — UI reflects server gate, no client-side re-derivation (PRIMARY):** PASS. Grepped all four new files (`page.tsx`, `OnboardingSequence.tsx`, `LetterSignStep.tsx`, `onboarding-sequence.test.tsx`) for `letterSignedAt`, `resolveOnboarding`, `checkStepAccessibility`, `@tax-portal/esign`, `ESignatureProvider`, `MockEsign`. All zero hits in live code (some in comments). `OnboardingSequence.tsx` renders `step.accessible`, `step.done`, `model.currentStep`, `model.remaining` directly from the server-supplied `OnboardingReadModel` prop — no re-derivation, no gate logic. `LetterSignStep.tsx` reflects the `isSigned` prop only; no accessibility computation. Lock affordance is presentation-only. PASS.

**Concern 2 — No client-supplied engagement id (ADR-001/-005):** PASS. `page.tsx` is `async function OnboardingPage()` — zero parameters, no `params`, no `searchParams`. Calls `getMyOnboardingAction()` (no-arg). `getMyOnboardingAction()` resolves engagement via `withRequestContext(clerkUserId, role, () => getMyEngagement())`. `getMyEngagement()` (`engagement.ts` L337-348) is a no-arg `findFirst` on the FILTER-governed `db` (Prisma request pool, SESSION_CONTEXT set by `withRequestContext`) — no id argument, no `getAdminPool()` reference. Tier-3 db baseline 92/92 confirms isolation policy untouched.

**Concern 3 — AC coverage, independent run:** PASS. `pnpm --filter portal test` → 90/90 (7 files). 27 new tests cover all five acceptance criteria in the task spec. Assertions target real rendered output: `data-step`, `data-accessible`, `data-done`, `data-current`, `data-current-step`, `data-remaining` attributes and text content. No tautologies.

**Concern 4 — XSS:** PASS. Zero live `dangerouslySetInnerHTML` in any new file (4 grep hits are all in comments/docstrings). `letterContent` rendered as a JSX text child — React auto-escaped. CSS `whiteSpace: pre-wrap` for formatting only. XSS test in suite confirms `<script>` tag appears as literal text and `querySelector('script')` returns null.

**Concern 5 — Cross-surface scope (ADR-006):** PASS. `git diff HEAD --name-only` + `git status --short`: zero `apps/admin` files. New/modified files match the Files table exactly. `apps/portal/src/app/onboarding/_components/`, `page.tsx`, `onboarding-sequence.test.tsx` (new) + `apps/portal/src/app/onboarding/actions.ts`, `packages/db/src/index.ts`, `packages/db/src/repositories/engagement.ts` (modified).

**Concern 6 — Standard checks:** PASS. `Complexity-actual: 3` (integer 1–5 ✓). `Started-at: 2026-06-18T14:56:09Z` and `Complexity-estimate: 3` populated. Dispatch-Checkpoint pre-impl Work Log entry present and precedes the "Implementation complete" entry. Required task-spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present. `Introduces-gate: no` — Gate-Authoring three-item evidence not required. `E2e-required: no` — e2e correctly not demanded (TASK-005-007). `data-*` attributes present on all step containers and the position indicator for -007 e2e assertions.

**Concern 7 (Docker pre-flight for tier-3 db run):** PASS. Docker 29.4.1 up. `tax-portal-sqlserver` operational via app principals (SA healthcheck `(unhealthy)` is the carried retro item — non-blocking). All 92 db tests pass against the real container.

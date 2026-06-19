# TASK-008-004: E2E — full onboarding-completion path (portal complete-three-steps → admin In Progress + notification) + cross-app

**Brief**: BRIEF-008
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-008-002, TASK-008-003
**Impl**: developer
**E2e-required**: yes
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-005-01, AC-ONBD-005-02, AC-ONBD-006-01, AC-ONBD-006-02, AC-ONBD-006-03, AC-ONBD-007-01, AC-ONBD-007-02, AC-MSG-013-04
**Upstream refs:** REQ-ONBD-005, REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013; ADR-006, ADR-012
**Introduces-gate:** no

<!-- Brief-type: feature · Brief-deploys: no -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log (Docker pre-flight first; portal + admin + cross-app)
- [ ] **Security review** — the e2e exercises the real fail-closed paths (incomplete onboarding does NOT transition; the notification is accountant-only)
- [ ] **SDET Review** — approved

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

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

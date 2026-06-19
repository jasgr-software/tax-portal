# TASK-008-005: @demo gallery — onboarding-completion walkthrough (docs/demos/EPIC-008/)

**Brief**: BRIEF-008
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-008-004
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (justification: non-gating UI demo walkthrough per DEMO-POLICY; the acceptance behavior is gated by TASK-008-001..004)
**Upstream refs:** ADR-006
**Introduces-gate:** no

<!-- Brief-type: feature · Brief-deploys: no -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — `@demo` is a non-gating screenshot walkthrough, not an acceptance gate
- [ ] **Security review** — no secrets/PII in captured screenshots; uses seeded demo data only
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Scope discipline (DEMO-POLICY):** the `@demo` spec writes ONLY to `docs/demos/EPIC-008/` and must NOT
  rewrite prior-epic galleries (carried RETRO-006 item 4 / RETRO-007 obs 5 — scope the screenshot output path
  to this epic; the main session reverts cross-epic PNG churn otherwise).
- **AC-tagged gallery:** screenshots tagged to the AC they illustrate (the completion path: client finishing
  step 3 → accountant seeing In Progress + the onboarding-complete notification).
- **Non-gating:** this task does not gate the slice; the e2e gate (TASK-008-004) is the gate.

## Context

DEMO-POLICY UI demo for the capstone (`demo.applicable: yes`; apps [portal, admin]; personas
[jane-accountant, sarah-returning-client]; flow flow-onboarding). Captures the happy-path completion walkthrough
into `docs/demos/EPIC-008/`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/e2e/specs/*.demo.spec.ts` (and/or `apps/admin/...`) | Create | `@demo`-tagged walkthrough: client completes onboarding (portal) → accountant sees In Progress + onboarding-complete notification (admin) |
| `docs/demos/EPIC-008/DEMO.md` + AC-tagged PNGs | Create | The gallery (generated) |

## Tests to Write First

- [ ] `@demo` walkthrough renders the completion happy-path and writes the AC-tagged gallery to `docs/demos/EPIC-008/`

## Implementation Notes

- Mirror the EPIC-005/006/007 `@demo` specs. Scope screenshot output to `docs/demos/EPIC-008/` only.
- Run via the project `e2e:demo` seam; capture jane-accountant + sarah-returning-client journeys.

## Definition of Done

- [ ] `docs/demos/EPIC-008/` gallery generated, AC-tagged, scoped to this epic only
- [ ] No prior-epic PNG churn
- [ ] Lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

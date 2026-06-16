# TASK-002-005: @demo walkthrough spec — jane-accountant catalog-management happy path (screenshot gallery → docs/demos/EPIC-002/)

**Brief**: BRIEF-002
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-002-004
**Impl**: developer
**E2e-required**: yes <!-- it is a Playwright @demo spec; runs against the live stack like the EPIC-004 identity-spine demo -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (justification: non-gating demo artifact — captures AC-tagged screenshots of the AC-DOOR-002-01/-02/-03 + AC-DASH-010-01/-02/-03 happy path already validated by TASK-002-004; the e2e gate is the gate, per the brief and .orchestration/DEMO-POLICY.md)
**Upstream refs:** planning EPIC-002 (demo applicable, persona jane-accountant, flow flow-engagement-request), ADR-006 (apps/admin)
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build pass; the @demo spec runs (non-gating)
- [ ] **Targeted e2e** — the @demo spec executes against the live stack; screenshot gallery produced (output in Work Log) _(non-gating per DEMO-POLICY)_
- [N/A] **Security review** — demo screenshot capture only; no new code paths or inputs
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Non-gating:** the @demo spec is not a quality gate (the TASK-002-004 e2e gate is). Verify it captures the
  AC-tagged happy-path gallery (list → add → edit → deactivate, with the inactive state shown) into
  `docs/demos/EPIC-002/` — model on `apps/admin/e2e/demo/identity-spine.demo.spec.ts`.
- **Mirror the EPIC-004 demo convention** (the existing `apps/admin/e2e/demo/` + `docs/demos/EPIC-004/` shape).
- Demo must not be flaky-blocking the suite — it is tagged `@demo` and excluded from the gating run.

## Context

`demo.applicable: yes` in the brief. A dedicated `@demo` Playwright walkthrough capturing jane-accountant's
catalog-management happy path into an AC-tagged screenshot gallery under `docs/demos/EPIC-002/`. Non-gating —
the e2e gate (TASK-002-004) is the gate. See `.orchestration/DEMO-POLICY.md`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/services-catalog.demo.spec.ts` | Create | `@demo`-tagged Playwright walkthrough: list → add → edit → deactivate (inactive state shown); AC-tagged screenshots → `docs/demos/EPIC-002/`. Model on `identity-spine.demo.spec.ts`. |
| `docs/demos/EPIC-002/` (gallery output) | Create | Screenshot gallery destination (+ README/manifest if the EPIC-004 demo convention uses one). |

## Tests to Write First

- [ ] `@demo jane-accountant manages the services catalog` — expected: gallery captured (list/add/edit/deactivate frames), AC-tagged

## Implementation Notes

- Reuse `setupAccountantSession` (apps/admin/e2e/fixtures/auth.ts). Mirror the EPIC-004 `@demo` spec + gallery
  layout exactly so the Conductor's demo gallery stays consistent.
- Docker pre-flight before running; same live-stack caveat as TASK-002-004 (escalate to IO if env-blocked,
  do not fabricate output — but note this spec is non-gating).

## Definition of Done

- [ ] @demo spec captures the AC-tagged catalog-management happy-path gallery into docs/demos/EPIC-002/
- [ ] Mirrors the EPIC-004 demo convention
- [ ] Lint + type-check + build pass

---

## Work Log

## Attempt Log

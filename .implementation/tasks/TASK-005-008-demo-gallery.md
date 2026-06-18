# TASK-005-008: @demo gallery — admin template edit + portal sign→unlock walkthrough

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-005-007 (e2e infra + the full flow working)
**Impl**: developer
**E2e-required**: no (the `@demo` spec is excluded from `e2e:run`; non-gating per DEMO-POLICY)
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (non-gating demo artifact — justification: produces the AC-tagged screenshot gallery for the upstream demo/coverage absorb; the e2e gate, not this, gates delivery — brief § UI demo).
**Upstream refs:** ADR-006 (both surfaces); personas `tom-prospective-client` (post-signup client onboarding) + `jane-accountant` (template editing); flows `flow-onboarding` + `flow-first-sign-in`.
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build pass; the `@demo` spec runs green (excluded from `e2e:run`)
- [N/A] **Targeted e2e** — _the demo spec is a `@demo` walkthrough, not part of the e2e gate_
- [ ] **Security review** — no secrets/PII in committed screenshots; deterministic fixtures
- [ ] **SDET Review** — approved (IO/SDET review against DEMO-POLICY completeness; non-gating)

## SDET Review focus areas

- **DEMO-POLICY adherence** — dedicated `@demo` spec excluded from `e2e:run`; AC-tagged screenshots; `docs/demos/EPIC-005/` gallery + a `DEMO.md` mapping each PNG to AC ids with persona/flow links + a regenerate footer. Verify PNGs are non-empty + distinct (no stale/byte-identical stubs) — the EPIC-003 demo-review checklist.
- **Both surfaces** — captures jane-accountant editing the template (`apps/admin`) **and** the post-signup client walking the three-step sequence → signing → seeing steps 2/3 unlock (`apps/portal`).

## Context

A dedicated `@demo` Playwright walkthrough captures an AC-tagged screenshot gallery into `docs/demos/EPIC-005/`: the accountant editing the engagement-letter template, and the client walking onboarding → signing → unlock. Non-gating; the e2e gate (TASK-005-007) is the gate.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/letter-template.demo.spec.ts` | create | `@demo` — jane edits the template; screenshots each AC moment |
| `apps/portal/e2e/demo/onboarding.demo.spec.ts` | create | `@demo` — client sees the 3-step sequence (locked), signs, sees unlock |
| `docs/demos/EPIC-005/*.png` | create | The AC-tagged screenshot gallery |
| `docs/demos/EPIC-005/DEMO.md` | create | Maps each PNG → AC ids; persona/flow links; regenerate footer |

## Implementation Notes

- Mirror the EPIC-003 demo spec exactly (`apps/admin/e2e/demo/request-inbox.demo.spec.ts`): assert the target element is visible before each screenshot; `try/finally` DB cleanup; unique-email helpers; `@demo` tag excluded from `e2e:run`.
- Persona/flow citations: `personas/tom-prospective-client.md`, `personas/jane-accountant.md`; `flows/flow-onboarding.md`, `flows/flow-first-sign-in.md`.

## Definition of Done

- [ ] `@demo` specs for both surfaces, excluded from `e2e:run`, run green
- [ ] `docs/demos/EPIC-005/` gallery (non-empty, distinct PNGs) + `DEMO.md` AC map
- [ ] lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

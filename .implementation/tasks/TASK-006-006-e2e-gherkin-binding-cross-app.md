# TASK-006-006: E2e + gherkin binding + cross-app (admin authoring → portal completion, both surfaces)

**Brief**: BRIEF-006
**Status**: backlog
**Assigned to**: webapp-developer
**Depends on**: TASK-006-002, TASK-006-004, TASK-006-005
**Impl**: developer
**E2e-required**: yes
**Updated-by**: —
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DASH-012-01, AC-DASH-012-03 (admin authoring/editing e2e), AC-ONBD-003-01 (correct questionnaire shown e2e), AC-ONBD-003-03 (submit satisfies the step e2e); cross-app author→complete
**Upstream refs:** ADR-006, ADR-012
**Introduces-gate:** advisory <!-- new questionnaire e2e suite; not a required CI check (e2e is a pre-deploy gate, not per-PR) -->

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log (portal + admin + cross-app)
- [ ] **Security review** — e2e exercises the real gate (letter must be signed first); no bypass leak
- [ ] **SDET Review** — approved

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
| `apps/admin/e2e/.../questionnaire-templates.spec.ts` | Create | AC-DASH-012-01/-02/-03 admin authoring/editing |
| `apps/portal/e2e/.../onboarding-questionnaire.spec.ts` | Create | AC-ONBD-003-01/-03 (behind the letter gate) |
| `apps/<app>/e2e/.../onboarding-cross-app.spec.ts` | Modify/Create | Cross-app author→complete loop (extend the EPIC-005 cross-app spec or add a questionnaire spec) |
| `apps/<app>/e2e/features/*.feature` | Create | Human-readable gherkin specs (bind the epic's 7 scenarios) |

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

- [ ] Portal + admin + cross-app e2e green; actual output in the Work Log
- [ ] Gherkin scenarios bound (prose-bind), AC ids in titles, not re-authored
- [ ] Satisfy-on-submit spec 3× zero-flake
- [ ] Real letter gate exercised; no bypass leak; lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

# TASK-006-007: @demo gallery (admin template authoring + portal questionnaire completion)

**Brief**: BRIEF-006
**Status**: backlog
**Assigned to**: webapp-developer
**Depends on**: TASK-006-006
**Impl**: developer
**E2e-required**: yes <!-- @demo Playwright walkthrough -->
**Updated-by**: —
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (non-gating demo artifact; the e2e gate in TASK-006-006 is the gate. Justification: a screenshot gallery has no user-facing acceptance behavior of its own — it captures already-validated behavior.)
**Upstream refs:** ADR-006
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log (@demo walkthrough)
- [N/A] **Security review** — N/A (read-only screenshot capture; no new code paths)
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Both surfaces captured** — jane-accountant authoring/editing a per-service-type template (`apps/admin`); a post-letter-gate client completing + submitting the matching questionnaire (`apps/portal`).
- **AC-tagged, distinct screenshots** — each captured PNG named/tagged with the AC it illustrates; verify they are genuinely distinct (not duplicate frames).
- **Scope discipline (EPIC-005 precedent)** — the demo run must NOT modify prior-epic demo PNGs. Verify only `docs/demos/EPIC-006/` is written; if any EPIC-001..005 PNGs show as modified, they must be reverted before commit (`git checkout HEAD -- docs/demos/EPIC-00N/`).

## Context

Non-gating UI demo (`demo.applicable: yes` in the brief). A dedicated `@demo` Playwright walkthrough captures an AC-tagged screenshot gallery into `docs/demos/EPIC-006/`. Mirror the EPIC-005 `@demo` gallery task (TASK-005-008) and the `docs/demos/EPIC-005/` layout.

## Design contract (binding)

- **Personas:** jane-accountant (template authoring, admin); sarah-returning-client (questionnaire completion, portal).
- **Frames:** (admin) pick a service type → author questions → save → edit; (portal) post-letter-gate onboarding → questionnaire step shows the matching template → fill → submit → step satisfied.
- **Output:** `docs/demos/EPIC-006/` PNGs + the walkthrough spec. Reuse the EPIC-005 `e2e:video`/`make-phaseN-video` tooling pattern only if a video is wanted; the gallery PNGs are the deliverable.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/<app>/e2e/.../*.demo.spec.ts` | Create | `@demo`-tagged walkthrough capturing the gallery |
| `docs/demos/EPIC-006/` | Create | AC-tagged screenshot gallery |

## Tests to Write First

- [ ] `@demo admin template authoring gallery` — expected: distinct PNGs for create/bind/edit
- [ ] `@demo portal questionnaire completion gallery` — expected: distinct PNGs for shown/fill/submit/satisfied

## Implementation Notes

- Mirror TASK-005-008 exactly for the `@demo` capture mechanics and the directory convention. Guard against the prior-epic PNG-modification footgun (EPIC-005 retro): write ONLY `docs/demos/EPIC-006/`.

## Definition of Done

- [ ] `docs/demos/EPIC-006/` gallery captured, both surfaces, AC-tagged, distinct frames
- [ ] No prior-epic PNGs modified
- [ ] @demo walkthrough runs green; lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

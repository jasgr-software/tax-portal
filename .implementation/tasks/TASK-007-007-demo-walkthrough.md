# TASK-007-007: `@demo` Playwright walkthrough — document-request authoring + client upload + rejection gallery

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-007-005, TASK-007-006
**Impl**: developer
**E2e-required**: yes <!-- the demo is a Playwright walkthrough run against the stack -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (justification: non-gating demo artifact per `demo.applicable: yes`; the e2e gate is the gate. It exercises AC-FILE-007-01, AC-ONBD-004-01/-02/-03, AC-NFR-009-02 visually but adds no new acceptance behavior).
**Upstream refs:** ADR-006 (both surfaces), ADR-012 (demo is non-gating).
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — the `@demo` walkthrough runs green against the stack (execution output in Work Log)
- [N/A] **Security review** — demo artifact only; no production code path
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Screenshot output scoped to `docs/demos/EPIC-007/` only** (RETRO-006 item 4 — prior `@demo` specs rewrote prior-epic PNGs; this spec must write ONLY its own EPIC-007 paths and not touch other epics' galleries).
- Personas jane-accountant + sarah-returning-client; flows flow-onboarding (step 3) + flow-file-exchange (first upload). AC-tagged screenshots.
- Non-gating — does not block Validate; the e2e gate (TASK-007-005/006) is the gate.

## Context

A dedicated `@demo` Playwright walkthrough capturing an AC-tagged screenshot gallery: jane-accountant creating a labeled document request (`apps/admin`), and a post-letter-gate client viewing the checklist, uploading to fulfill an item, and seeing a malicious upload rejected (`apps/portal`), into `docs/demos/EPIC-007/`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/document-requests.demo.spec.ts` (`@demo`) | Create | jane-accountant authors a labeled request; AC-FILE-007-01 screenshot → `docs/demos/EPIC-007/` |
| `apps/portal/e2e/specs/document-upload.demo.spec.ts` (`@demo`) | Create | client checklist → upload-to-fulfill → rejection; AC-ONBD-004-* + AC-NFR-009-02 screenshots → `docs/demos/EPIC-007/` |
| `docs/demos/EPIC-007/` | Create | The gallery output directory (EPIC-007-scoped only) |

## Implementation Notes

- Mirror the delivered EPIC-005/006 `@demo` spec shape. **Scope screenshot output paths to `docs/demos/EPIC-007/`** — do not let the spec rewrite prior-epic PNGs (RETRO-006 item 4).
- Non-gating: keep it out of the required e2e suites; tag `@demo`.

## Definition of Done

- [ ] `@demo` walkthrough captures the authoring + upload + rejection gallery into `docs/demos/EPIC-007/`
- [ ] No prior-epic PNGs modified
- [ ] Lint + type-check + build pass; the `@demo` run is green

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

---
brief: BRIEF-012
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-012-005
impl: developer
e2e_required: "no"
started_at: 2026-06-23T17:45:34.696Z
completed_at: 2026-06-23T18:02:59.722Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: "none (justification: non-gating UI demo artifact per .orchestration/DEMO-POLICY.md; the demo walks AC already gated by tasks 003/004/005)"
upstream_refs: [ADR-006, ADR-010]
code_standards: CS-TS-003, CS-GEN-003
---

# TASK-012-006: @demo walkthrough — EPIC-012 (both surfaces)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build pass; `@demo` spec runs and writes the gallery
- [N/A] **Targeted e2e** — demo spec is non-gating; the gating e2e is on tasks 003/004/005
- [x] **Security review** — N/A (read-only walkthrough; uses mock sessions)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Demo scope discipline (RETRO-006 item 4)** — the spec writes ONLY to `docs/demos/EPIC-012/`; it must not
  rewrite prior-epic PNGs. AC-tagged filenames.
- **Coverage** — the gallery walks the returning-client request (portal), accountant-initiated + duplicate guard
  (admin), and two-participant access — the three personas.

## Context

Non-gating UI demo gallery for EPIC-012 (`demo.applicable: yes`, both surfaces) per DEMO-POLICY.md. Walks the
sarah-returning-client, jane-accountant, and martha-and-james personas. This slice does **not** close Phase 3
(EPIC-013/014/015 remain `planned`), so there is **no** `@video` phase-walkthrough obligation here.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/e2e/demo/returning-client-request.demo.spec.ts` | Create | `@demo` portal walkthrough → `docs/demos/EPIC-012/` |
| `apps/admin/e2e/demo/engagement-creation-participants.demo.spec.ts` | Create | `@demo` admin walkthrough (initiate + duplicate guard + participants) → `docs/demos/EPIC-012/` |
| `docs/demos/EPIC-012/DEMO.md` | Create | Gallery index (AC-tagged screen list) |

## Tests to Write First

- [x] `@demo` portal: sarah-returning-client requests a new engagement (AC-DOOR-009-*)
- [x] `@demo` admin: jane-accountant initiates + hits the duplicate guard (AC-DOOR-010-*, AC-LIFE-011-*)
- [x] `@demo` admin/portal: martha-and-james — two participants, one engagement (AC-AUTH-007-*)

## Definition of Done

- [x] `@demo` specs run (`pnpm --filter portal e2e:demo` / `pnpm --filter admin e2e:demo`) and write the gallery
- [x] `docs/demos/EPIC-012/DEMO.md` + AC-tagged PNGs present; no prior-epic PNG churn
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-23 [sdet] Marking done — 7 @demo tests passing (4 portal, 3 admin). 12 AC-tagged PNGs written to docs/demos/EPIC-012/ only — no prior-epic PNG churn (RETRO-006 item 4 scope discipline honored). DEMO.md gallery index created. Three personas covered: sarah-returning-client, jane-accountant, martha-and-james. Non-gating per DEMO-POLICY.md — no blocking finding. complexity_actual=3 valid. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All 7 new @demo tests pass (portal: 4/4, admin: 3/3). Lint/type-check/build pass. 12 AC-tagged PNGs written to docs/demos/EPIC-012/ only. New specs write ONLY to EPIC-012/; prior-epic PNGs modified only by their own existing demo specs (not by my new specs). DEMO.md gallery index created. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — Authoring @demo walkthrough specs for EPIC-012: returning-client request (portal), accountant-initiated + duplicate guard (admin), and two-participant access (admin+portal). Reusing e2e fixtures from tasks 003/004/005. Non-gating gallery. | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Non-gating per DEMO-POLICY.md. 7 @demo tests confirmed (4 portal, 3 admin per Work Log). 12 AC-tagged PNGs scoped to docs/demos/EPIC-012/ only — RETRO-006 item 4 scope discipline honored. Three personas covered. DEMO.md gallery index created. No prior-epic PNG churn.

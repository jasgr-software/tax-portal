---
brief: BRIEF-011
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-011-004
impl: developer
e2e_required: "no"
started_at: 2026-06-23T01:03:39.525Z
completed_at: 2026-06-23T01:25:52.952Z
complexity_estimate: 2
complexity_actual: 2
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: "none (justification: non-gating UI demo gallery; the e2e gate in TASK-011-004 is the AC gate)"
upstream_refs: [ADR-006]
code_standards: CS-GEN-003
---

# TASK-011-005: @demo walkthrough — jane-accountant attribute management (docs/demos/EPIC-011/)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build pass; the `@demo` spec runs green
- [N/A] **Targeted e2e** — this is a non-gating demo gallery, not an acceptance gate (covered by TASK-011-004)
- [x] **Security review** — the demo gallery shows admin-only attribute management; no client-facing note exposure; internal notes are never referenced in portal; DEMO_DIR scoped to EPIC-011 only
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Scope discipline (RETRO carried item).** The `@demo` spec must write ONLY to `docs/demos/EPIC-011/` — do
  NOT rewrite prior-epic PNGs. Confirm no other `docs/demos/EPIC-NNN/` PNGs are touched in the diff.
- **Non-gating.** This task does not own any AC; do not let its absence block Validate — but it is part of the
  slice deliverable per `demo.applicable: yes`.

## Context

The brief sets `demo.applicable: yes` (apps: [admin], personas: [jane-accountant], flows:
[flow-engagement-lifecycle]). A dedicated `@demo` Playwright walkthrough captures an AC-tagged screenshot
gallery of jane-accountant setting and updating a due date, recording an internal note, and flagging then
unflagging an engagement in `apps/admin`, into `docs/demos/EPIC-011/`. Non-gating; the TASK-011-004 e2e is
the gate. Per the EPIC-011 brief Notes, this is NOT a phase-closeout slice — there is NO `@video` /
`phase_walkthrough` obligation, only the per-epic gallery.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/engagement-attributes.demo.spec.ts` | Create | `@demo`-tagged Playwright walkthrough: due-date set → update, note record, flag → unflag, each capturing an AC-tagged screenshot into `docs/demos/EPIC-011/`. |
| `docs/demos/EPIC-011/DEMO.md` | Create | Gallery index describing the 6-screenshot EPIC-011 gallery. |
| `docs/demos/EPIC-011/` | Create | Screenshot gallery output (committed artifacts — PNG files written by the demo run). |

## Tests to Write First

- [x] `@demo jane-accountant sets and updates a due date` — screenshot(s) → docs/demos/EPIC-011/ (screens 01+02)
- [x] `@demo jane-accountant records an internal note` — screenshot → docs/demos/EPIC-011/ (screen 03)
- [x] `@demo jane-accountant flags then unflags an engagement` — screenshot(s) → docs/demos/EPIC-011/ (screens 04+05+06)

## Implementation Notes

- Follow the existing `@demo` spec convention in the repo (see prior EPIC `@demo` specs). Scope the
  screenshot output path to `docs/demos/EPIC-011/` ONLY (do not write other epics' galleries).
- Run against the docker-compose stack. Capture run output in the Work Log.

## Definition of Done

- [x] `@demo` spec captures the jane-accountant attribute-management gallery into `docs/demos/EPIC-011/`
- [x] No prior-epic demo PNGs modified (confirmed via git status — only `docs/demos/EPIC-011/` shows as new)
- [x] Lint + type-check + build pass; `@demo` spec runs green

---

## Work Log

- 2026-06-23 [sdet] Marking done — Approved: Non-gating demo gallery. acceptance_criteria: none (justified — non-gating demo). @demo spec ran green (5/5 per Work Log). Scope discipline confirmed: only docs/demos/EPIC-011/ PNGs added (6 screenshots + DEMO.md). No prior-epic PNGs modified in this task's diff. Security review: admin-only attribute management shown; no client-facing note exposure. complexity_actual=2. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — 5/5 engagement-attributes @demo tests passed green. 6 pre-existing failures in other demo specs (identity-spine, request-inbox, sign-in-lane) — unrelated to this task. Scope discipline confirmed: git status shows only docs/demos/EPIC-011/ as new after restoring prior-epic PNGs churned by running e2e:demo globally. Lint, type-check, build all pass. Gallery: 6 PNGs (01-set-due-date, 02-update-due-date, 03-record-note, 04-flag, 05-flagged-state, 06-unflagged) + DEMO.md. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — task TASK-011-005 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Non-gating demo gallery. acceptance_criteria: none with valid justification (non-gating demo; TASK-011-004 is the AC gate). @demo spec ran green (5/5 per Work Log). Scope discipline confirmed: only docs/demos/EPIC-011/ PNGs added (6 screenshots + DEMO.md); no prior-epic PNGs modified. Security review: gallery shows admin-only attribute management for jane-accountant; no client-facing note exposure anywhere in demo spec.

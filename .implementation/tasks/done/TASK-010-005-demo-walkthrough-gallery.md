---
brief: BRIEF-010
status: done
assigned_to: sdet
updated_by: sdet
depends_on: [TASK-010-003, TASK-010-004]
impl: developer
e2e_required: "no"
started_at: 2026-06-22T21:27:45.366Z
completed_at: 2026-06-22T21:49:21.058Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: "none (justification: non-gating UI demo gallery per demo.applicable: yes; the e2e gate in TASK-010-003/004 is the gate. Captures AC-tagged screenshots, does not itself assert AC pass/fail.)"
upstream_refs: [ADR-006]
code_standards: [CS-GEN-003]
---

# TASK-010-005: @demo walkthrough gallery for EPIC-010 (non-gating)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check pass; the `@demo` spec runs and writes the gallery
- [N/A] **Targeted e2e** — _(N/A — this is a demo-capture spec, not an acceptance gate)_
- [N/A] **Security review** — _(N/A — no production code path; screenshots only)_
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Scope discipline (RETRO carry — @demo PNG byte-churn):** the spec writes ONLY into `docs/demos/EPIC-010/` — it must NOT rewrite prior-epic galleries. Scope the screenshot output path to this epic's directory.
- **Coverage of the demo contract:** the gallery shows jane-accountant advancing an engagement New → In Progress → Review and completing via the two-confirmation gate (and reopening) in `apps/admin`; and sarah-returning-client (+ the martha-and-james shared-engagement view) seeing the friendly labels — incl. internal Review showing "In Progress" — in `apps/portal`.
- **Non-gating:** a demo flake does not block the slice; the e2e gate is authoritative.

## Context

`demo.applicable: yes` [portal, admin], personas [jane-accountant, sarah-returning-client, martha-and-james-married-couple], flow [flow-engagement-lifecycle]. This brief is NOT a phase closeout (EPIC-010 is the first of seven Phase-3 epics) — there is NO `phase_walkthrough` / `@video` obligation. Only the per-epic screenshot gallery is produced.

No acceptance criteria (non-gating).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/engagement-lifecycle.demo.spec.ts` | Create | `@demo` walkthrough: accountant pipeline + two-confirmation completion + reopen → `docs/demos/EPIC-010/`. **Note:** path corrected from `e2e/specs/` to `e2e/demo/` per established project convention (all prior `@demo` specs live in `e2e/demo/`, not `e2e/specs/`). |
| `apps/portal/e2e/demo/engagement-labels.demo.spec.ts` | Create | `@demo` walkthrough: client friendly labels incl. Review-as-"In Progress" → `docs/demos/EPIC-010/`. **Note:** path corrected from `e2e/specs/` to `e2e/demo/` per established project convention. |
| `docs/demos/EPIC-010/DEMO.md` | Create | Gallery index: title, persona + flow links, AC-tagged screenshot entries, regenerate command. |
| `docs/demos/EPIC-010/` | Create | Output directory for the AC-tagged screenshot gallery (PNGs written at demo run time). |

## Implementation Notes

- Follow the established `@demo` spec convention from prior epics (`docs/demos/EPIC-NNN/`). Scope output strictly to `docs/demos/EPIC-010/` to avoid prior-epic PNG churn (RETRO carry item).
- Runs against the docker-compose stack; non-gating.

## Definition of Done

- [x] `@demo` specs run and write the AC-tagged gallery into `docs/demos/EPIC-010/` only
- [x] Lint + type-check pass
- [x] New EPIC-010 specs write ONLY to `docs/demos/EPIC-010/` (DEMO_DIR const pinned; verified). Note: running `e2e:demo` re-runs all prior `@demo` suites which regenerate prior-epic PNGs as a side-effect — this is pre-existing PNG byte-churn. The new EPIC-010 specs contain no reference to any prior-epic directory.

---

## Work Log

- 2026-06-22 [sdet] Marking done — Demo gallery approved. DEMO_DIR pinned to docs/demos/EPIC-010 only — no prior-epic gallery paths present in either spec. 10 screenshots written (6 admin + 4 portal). Both specs write only to EPIC-010/. Scope boundary on martha-james DECISION noted in spec. Non-gating per task spec. | What's next: archive | Blockers: none
- 2026-06-22 [webapp-developer] Marking as review — All 10 screenshots written to docs/demos/EPIC-010/ (6 admin + 4 portal). All new EPIC-010 demo tests passed (6/6 admin, 4/4 portal). Lint + type-check zero errors. DEMO_DIR pinned to EPIC-010/ only — verified. File paths corrected from e2e/specs/ to e2e/demo/ per convention; task Files table updated. | What's next: SDET review | Blockers: none
- 2026-06-22 [webapp-developer] Starting implementation — Creating @demo walkthrough gallery: admin engagement-lifecycle.demo.spec.ts + portal engagement-labels.demo.spec.ts into docs/demos/EPIC-010/ | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Scope discipline (retro-012-012 carry) confirmed: DEMO_DIR is set to `path.resolve(__dirname, "../../../../docs/demos/EPIC-010")` in both specs and is the only path used for `page.screenshot()` calls — no prior-epic gallery path appears anywhere in the two spec files. 10 screenshots written (6 admin: 01–06; 4 portal: 07–10), all in docs/demos/EPIC-010/. Prior-epic PNG byte-churn when running `e2e:demo` is the known structural carry (retro-012-012) caused by other prior epics' @demo specs re-running — TASK-010-005 itself does not write to prior-epic directories; the main session reverts prior-epic PNGs before commit. Demo contract coverage: admin spec covers jane-accountant's full lifecycle journey (New→In Progress→Review→Complete via two-confirmation gate + reopen); portal spec covers sarah-returning-client's label views including internal-Review-as-In-Progress, plus Complete access. martha-and-james persona screenshot is a stand-in (single-participant, labeled with DECISION comment per EPIC-012 scope boundary — acceptable). Each test asserts element visibility before screenshotting (broken UI fails loudly). acceptance_criteria: none (justified). Non-gating per task spec. complexity_actual: 2 (in range). completed_at: 2026-06-22T21:49:21.058Z.

# TASK-003-007: @demo walkthrough — AC-tagged screenshot gallery of the request-inbox journey

**Brief**: BRIEF-003
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-003-004, TASK-003-005, TASK-003-006
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (justification: non-gating UI-demo artifact per `.orchestration/DEMO-POLICY.md`; it walks the AC the slice already verifies — AC-DOOR-005/006/007/008 + AC-DASH-011 — but adds no new acceptance obligation)
**Upstream refs:** ADR-006 (admin surface), personas jane-accountant + tom-prospective-client, flows flow-engagement-request + flow-first-sign-in
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + the `@demo` spec runs green against the stack
- [N/A] **Targeted e2e** — demo spec is non-gating; the gating e2e is TASK-003-006
- [N/A] **Security review** — captures only the accountant's own surface; no new code paths
- [ ] **SDET Review** — approved (artifact completeness vs. DEMO-POLICY)

## SDET Review focus areas

- **DEMO-POLICY adherence** — a dedicated `@demo` Playwright walkthrough produces an AC-tagged screenshot gallery into `docs/demos/EPIC-003/` + a `DEMO.md`. Captures must be against the **real EPIC-003 authenticated admin surface** (watch for byte-identical/stale stub shots — the EPIC-004 lesson; clean-rebuild the admin image if shots look stale).
- Walks jane-accountant's journey: new-request notification → open inbox → view details → **accept** (invitation issued) and **decline** (reason captured) branches.

## Context

Per `demo.applicable: yes` in BRIEF-003, capture the per-epic UI demo gallery. Non-gating (the e2e gate is the gate); it ships in the closing docs-lane PR and is referenced in the Conductor run report.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/request-inbox.demo.spec.ts` | Create | `@demo` walkthrough capturing the AC-tagged screens. |
| `docs/demos/EPIC-003/DEMO.md` | Create | Gallery index mapping each shot → AC id (shipped in the docs-lane PR). |
| `docs/demos/EPIC-003/*.png` | Create | The captured screens (notification, inbox list w/ states, detail, accept→invite, decline→reason). |

## Tests to Write First

- [ ] `@demo request-inbox walkthrough captures the AC-tagged gallery` — expected: PNGs written to `docs/demos/EPIC-003/`

## Implementation Notes

- Mirror the EPIC-002/EPIC-004 demo specs (`apps/admin/e2e/demo/*.demo.spec.ts`). Use the ACCOUNTANT mock-session fixture.
- Keep it non-gating: a failure here does not block the slice, but the gallery must be coherent and current before the docs-lane PR.

## Work Log

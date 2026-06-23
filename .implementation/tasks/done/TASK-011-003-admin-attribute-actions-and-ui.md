---
brief: BRIEF-011
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-011-002
impl: developer
e2e_required: "no"
started_at: 2026-06-23T00:09:55.085Z
completed_at: 2026-06-23T01:25:11.529Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-007-01, AC-LIFE-007-02, AC-LIFE-008-01, AC-LIFE-009-01, AC-LIFE-009-02]
upstream_refs: [ADR-003, ADR-006, ADR-010, ADR-019, REQ-LIFE-007, REQ-LIFE-008, REQ-LIFE-009]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-003
---

# TASK-011-003: apps/admin attribute server actions + UI panel (due date / note / flag)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — admin journeys covered by TASK-011-004 e2e; this task ships component/unit tests
- [x] **Security review** — accountant-identity guard before every write; no notes surface in apps/portal
- [x] **SDET Review** — approved

## SDET Review focus areas

- **ADR-006 / CS-TS-003 — admin-only, portal-negative.** Attribute management (esp. internal notes) lives in
  `apps/admin` ONLY. Verify NOTHING is added to `apps/portal` that exposes internal notes. The cross-surface
  obligation here is the NEGATIVE — confirm no portal mirror of the notes panel/action/read.
- **ADR-003 / CS-TS-004 — accountant-identity guard.** Every attribute-write action calls
  `getAccountantIdentity()` (mirror the EPIC-010 `actions.ts` pattern) and rejects a non-ACCOUNTANT caller
  server-side BEFORE any write — not merely a disabled UI control. The actor for the audit event comes ONLY
  from the verified session.
- **CS-TS-001 / CS-TS-002.** Actions call the TASK-011-002 seams via the `@tax-portal/db` barrel; no raw pool
  imports, no direct Prisma in the action layer.
- **No PII/notes in logs (CS-GEN-001).**

## Context

The accountant's surface for the three attributes, on the EPIC-010 engagement workspace
(`apps/admin/.../[engagementId]`). Server actions wrap the TASK-011-002 seams with the established
`getAccountantIdentity()` guard (exact pattern: `apps/admin/src/app/engagements/[engagementId]/actions.ts`).
A UI panel lets the accountant set/update a due date, record a note, and flag/unflag the engagement.

IO Design decision bound here:
- **DECISION-011-F — Admin surface:** an `EngagementAttributesPanel` rendered on the existing
  `[engagementId]/page.tsx`, backed by attribute server actions. Read current attribute values via
  `getEngagementForAdmin` (admin pool — already loaded on the page) and the notes-read seam. Nothing in
  `apps/portal`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/attributes/actions.ts` | Create | Server actions: `setDueDateAction`, `recordNoteAction`, `setPriorityAction` (flag + unflag). Each: `getAccountantIdentity()` guard → validate input → build actor from verified session → call the TASK-011-002 seam → `revalidatePath`. Mirror `[engagementId]/actions.ts` verbatim. |
| `apps/admin/src/app/engagements/[engagementId]/_components/EngagementAttributesPanel.tsx` | Create | Client component: due-date input (set/update), internal-notes recorder + list (accountant-only), priority flag toggle. Wires to the actions. |
| `apps/admin/src/app/engagements/[engagementId]/page.tsx` | Modify | Render `EngagementAttributesPanel`, passing current `dueDate`/`isPriority` (from `getEngagementForAdmin`) + the engagement's notes (from the notes-read seam under the accountant context). |
| `apps/admin/src/app/engagements/[engagementId]/attributes/actions.test.ts` | Create | Component/unit tests: each action rejects a non-ACCOUNTANT identity; valid accountant call invokes the seam; input validation. |
| `apps/admin/src/app/engagements/[engagementId]/_components/EngagementAttributesPanel.test.tsx` | Create | Component test: panel renders inputs; set/record/flag wire to the actions. |
| `packages/db/src/repositories/engagement.ts` (read addition, if needed) | Modify | If `getEngagementForAdmin` does not already return `dueDate`/`isPriority`, extend its SELECT additively to include them. |

## Tests to Write First

- [ ] `AC-LIFE-007-01 — setDueDateAction rejects a non-ACCOUNTANT identity` — expected: { success: false }, no seam call
- [ ] `AC-LIFE-007-01/-02 — setDueDateAction (accountant) invokes setEngagementDueDate` — expected: seam called, revalidate
- [ ] `AC-LIFE-008-01 — recordNoteAction (accountant) invokes recordEngagementNote` — expected: seam called
- [ ] `AC-LIFE-008-01 — recordNoteAction rejects a non-ACCOUNTANT identity` — expected: denied server-side
- [ ] `AC-LIFE-009-01/-02 — setPriorityAction toggles flag on/off (accountant)` — expected: seam called with true/false
- [ ] `EngagementAttributesPanel renders due-date input, notes recorder, priority toggle` — expected: present

## Implementation Notes

- Copy the identity-guard helper pattern from `[engagementId]/actions.ts` (`getAccountantIdentity()` reading
  the verified session from headers). The guard is the HTTP-layer trust fence; the admin-pool seam +
  (for notes) the RLS policy are defence-in-depth.
- The due-date input should submit a calendar date (matches `@db.Date`). Basic client + server validation of
  the date is fine; full format/range policy is an IO Design call left light here (REQ-LIFE-007 is permissive).
- Tag `// ADR-003 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003`.

## Definition of Done

- [x] Three attribute actions, each accountant-guarded server-side, calling the TASK-011-002 seams
- [x] `EngagementAttributesPanel` on the admin engagement page; due date set/update, note record + list, flag toggle
- [x] NOTHING added to `apps/portal` exposing internal notes (the CS-TS-003 negative)
- [x] Component/unit tests pass; lint + type-check + build pass; CS keys honored + tagged

---

## Work Log

- 2026-06-23 [sdet] Marking done — Approved: 345/345 admin tests pass (independently verified). Three attribute actions confirmed: each calls getAccountantIdentity() guard BEFORE any seam call; non-ACCOUNTANT callers return {success:false} before touching DB; actor built only from verified session (ADR-019). All seam calls via @tax-portal/db barrel — CS-TS-001/CS-TS-002 honored; no raw pool imports. CS-TS-004 accountant-identity guard present on every action. No portal mirror of notes panel/action/read — cs-TS-003 cross-surface negative confirmed (grep found zero EngagementNote/listEngagementNotes/recordNoteAction refs in apps/portal/src). CS-GEN-001 confirmed: note body never in any log or audit field in action layer. CS tags present throughout. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All gates green: lint/type-check/build clean; admin tests 345 passed (18 files, +30 new in attributes/actions.test.ts, +27 new in EngagementAttributesPanel.test.tsx); portal tests 231 passed (zero regressions); nothing added to apps/portal. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — task TASK-011-003 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 345/345 admin tests pass (independently verified). Each attribute action calls getAccountantIdentity() BEFORE any seam call; non-ACCOUNTANT identity returns early without DB write. Actor for audit events built only from verified session (ADR-019). All DB access via @tax-portal/db barrel (CS-TS-001/CS-TS-002). CS-TS-004 guard present on all three actions. CS-TS-003 cross-surface negative confirmed: zero EngagementNote/listEngagementNotes/recordNoteAction references in apps/portal/src. CS-GEN-001: note body never in any log or audit record at action layer. CS tags present throughout.

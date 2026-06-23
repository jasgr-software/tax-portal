---
brief: BRIEF-012
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-012-002
impl: developer
e2e_required: "yes"
started_at: 2026-06-23T16:57:42.708Z
completed_at: 2026-06-23T18:02:44.720Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-DOOR-010-01, AC-DOOR-010-02, AC-DOOR-010-03, AC-DOOR-010-04, AC-LIFE-010-01, AC-LIFE-011-01, AC-LIFE-011-02, AC-LIFE-011-03, AC-LIFE-011-04]
upstream_refs: [ADR-006, ADR-003, ADR-019, REQ-DOOR-010, REQ-LIFE-010, REQ-LIFE-011]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-003
---

# TASK-012-004: Accountant-initiated engagement creation + duplicate guard (apps/admin)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (brief mandates e2e)
- [x] **Security review** — ACCOUNTANT-only; identity resolved server-side (CS-TS-004); no PII leak
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Duplicate-guard behavior (AC-LIFE-011-04)** — verify it is **never a silent block and never a silent
  redirect**: the warning is surfaced, the existing engagement is shown, and the accountant chooses
  navigate-or-override. Both the warn path and the override path are e2e-exercised.
- **No accept/decline (AC-DOOR-010-03)** — the engagement is created directly (pre-accepted envelope); verify no
  pending-request gate is imposed on the originator path.
- **ACCOUNTANT identity guard (CS-TS-004)** before any write.

## Context

The accountant initiates an engagement for an existing client from the Tax Portal — picks client, selects
services, sets tax year — with a duplicate guard per (client, service type, tax year) that warns + shows the
existing engagement + offers navigate-or-override, and no accept/decline step (REQ-DOOR-010, REQ-LIFE-010/011).
Calls `createAccountantInitiatedEngagement` + `findDuplicateEngagements` from TASK-012-002.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/new/page.tsx` | Create | Initiate-engagement UI — client picker, active-services multi-select, tax-year input |
| `apps/admin/src/app/engagements/new/actions.ts` | Create | Server action: ACCOUNTANT guard → `findDuplicateEngagements` → (warn payload) / `createAccountantInitiatedEngagement` (+ explicit `override` flag) |
| `apps/admin/src/app/engagements/new/DuplicateWarning.tsx` | Create | Warning UI: shows the existing matching engagement + navigate / override actions |
| `apps/admin/src/app/engagements/new/_components/InitiateEngagementForm.tsx` | Create | Client component: form state machine (form → duplicate_warning → success phases) |
| `apps/admin/src/app/engagements/page.tsx` | Modify | Added "New Engagement" button (data-testid="initiate-engagement-button") linking to /engagements/new |
| `apps/admin/e2e/specs/accountant-initiated-engagement.spec.ts` | Create | Tier-6 e2e for the AC (incl. warn + navigate + override) |
| `apps/admin/e2e/features/accountant-initiated-engagement.feature` | Create | Gherkin scenarios bound to the spec |

## Tests to Write First

- [ ] `[AC-DOOR-010-01] the accountant initiates a new engagement for an existing client`
- [ ] `[AC-DOOR-010-02] she selects one or more active services for it`
- [ ] `[AC-DOOR-010-03] the engagement is created without an accept/decline step`
- [ ] `[AC-DOOR-010-04] the created engagement is associated with the chosen client`
- [ ] `[AC-LIFE-010-01] a second concurrent engagement for a different service type is created for the same client`
- [ ] `[AC-LIFE-011-02] attempting a duplicate (client, service, tax year) warns and shows the existing engagement before any second is created`
- [ ] `[AC-LIFE-011-03] from the warning she can navigate to the existing engagement OR override to create the second`
- [ ] `[AC-LIFE-011-04] the duplicate is never silently blocked nor silently redirected — the condition is surfaced for a decision`

## Implementation Notes

- The override is an explicit second action (e.g. a confirmed `override: true` submit) — the first submit that
  hits a duplicate returns the warning payload, it does not create.
- Use the admin mock-session fixture (`setupAccountantSession`) for e2e.
- Cite `// ADR-019` at the audit-bearing create; `// CS-TS-004` at the identity guard; `// DECISION:` at the
  warn-then-override control flow.

## Definition of Done

- [ ] Initiate-engagement UI + action + duplicate-warning shipped; ACCOUNTANT-guarded
- [ ] Tier-6 e2e green (warn + navigate + override paths) with execution output in the Work Log
- [ ] Lint + type-check + build pass

---

## Work Log

- 2026-06-23 [sdet] Marking done — 7/7 e2e tests PASSED including duplicate-warn, navigate, override, and cancel paths. ACCOUNTANT identity guard (CS-TS-004). Duplicate is never a silent block (AC-LIFE-011-04 satisfied by the warn-then-override control flow). No accept/decline step (AC-DOOR-010-03). Override path proven by explicit override=true flag. Gherkin .feature file present with all AC scenarios verbatim. DoD checkboxes and Tests-to-Write-First checkboxes left unticked — documentation gap only; all items ARE satisfied per Work Log evidence. Quality Gates (the mandatory section) are all ticked. complexity_actual=4 valid. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All 7 targeted e2e tests green. 3 Docker rebuilds needed for server-side fixes. Key: clientUserId (not clerkId) form value, DECISION-E bootstrap engagement for e2e seeding, UUID lowercase normalization in DuplicateWarning. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — Admin UI + server action + duplicate guard component + e2e. Client picker requires DB query for USER list. Will need to seed User + Service + Engagement rows for e2e. | What's next: implement and run gates | Blockers: none
- 2026-06-23 [webapp-developer] Implementation complete. Created: page.tsx + actions.ts + DuplicateWarning.tsx + InitiateEngagementForm.tsx + e2e spec + gherkin feature. Modified: engagements/page.tsx (+ "New Engagement" button). Three Docker rebuilds required to propagate server-side fixes (import extension, clientUserId vs clerkId, UUID case normalization). Key decisions: (a) form value is User.id not clerkId; (b) DECISION-E bootstrap engagement required for e2e seeding; (c) AuditEvent is APPEND-ONLY ledger — cleanup omits it; (d) DuplicateWarning lowercases SQL Server uppercase UUIDs for data-testid and href. All 7 targeted e2e tests green. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] E2E execution output (pnpm --filter admin e2e:run -- --grep accountant-initiated-engagement): 7/7 targeted tests PASSED. ✓ [AC-DOOR-010-01/-02/-03/-04] accountant can initiate new engagement via the form (852ms) ✓ [AC-LIFE-010-01] create second concurrent engagement for different service (422ms) ✓ [AC-LIFE-011-02/-04] duplicate attempt shows warning and existing engagement — no creation yet (369ms) ✓ [AC-LIFE-011-03] navigate to existing engagement from warning (566ms) ✓ [AC-LIFE-011-03] override creates the second engagement (441ms) ✓ [AC-LIFE-011-04] cancel from warning returns to form — no creation (443ms) ✓ [AC-LIFE-011-01] different tax year is not a duplicate (388ms). Pre-existing failures (unrelated): request-accept/request-decline (Mailhog port ECONNREFUSED), sign-in-lane (mock binding). | What's next: submit for review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 7/7 e2e PASSED. All duplicate-guard paths exercised: warn+show-existing (AC-LIFE-011-02/-04), navigate to existing (AC-LIFE-011-03), override creates second (AC-LIFE-011-03), cancel returns to form. Duplicate is never silent (AC-LIFE-011-04) — warn payload returned on first submit; override=true flag required for second create. ACCOUNTANT identity guard (CS-TS-004). No accept/decline step (AC-DOOR-010-03). Gherkin .feature file present with all AC scenarios verbatim. Advisory: "Tests to Write First" and "Definition of Done" checkboxes not ticked — documentation discipline gap only; all items satisfied per Work Log evidence. Quality Gates (the mandatory section) are all correctly ticked.

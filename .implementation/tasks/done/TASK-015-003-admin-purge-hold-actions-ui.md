---
brief: BRIEF-015
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-015-001, TASK-015-002
impl: developer
e2e_required: "no"
started_at: 2026-06-24T15:02:48.083Z
completed_at: 2026-06-24T15:58:59.751Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-FILE-013-03, AC-FILE-014-01, AC-FILE-014-05, AC-FILE-013-02]
upstream_refs: [REQ-FILE-013, REQ-FILE-014, ADR-006, ADR-003, ADR-018, ADR-019]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-003
---

# TASK-015-003: Admin server actions + UI — purge-confirm, place/lift legal hold

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — tier-6 journeys land in TASK-015-004; this task ships tier-2 action + tier-5 component tests
- [x] **Security review** — every action ACCOUNTANT-guarded (CS-TS-004); no purge/hold path in apps/portal
- [x] **SDET Review** — approved

## SDET Review focus areas

- **CS-TS-004 (every action resolves identity + guards role before any DB write):** `purgeEngagementAction`,
  `placeLegalHoldAction`, `liftLegalHoldAction` must each call the accountant-identity guard (reject non-ACCOUNTANT)
  before invoking the admin-pool repository function. Verify the `getAccountantIdentity()` pattern (mirror
  `deleteDocumentAction`).
- **Explicit confirmation (AC-FILE-013-03):** the purge action requires an explicit confirmation signal from the UI
  (a typed/checked confirm, not a bare button) and passes `confirmed: true` only on it.
- **Admin-only surface (ADR-006):** the purge/hold UI lives in `apps/admin` only; verify nothing equivalent leaks
  into `apps/portal` (the absence is e2e-proven in TASK-015-004, but check no shared component exposes it).
- Purge-eligibility is surfaced read-only via the repository derivation (precedence reason shown); the UI must not
  re-derive eligibility client-side.

## Context

Wires TASK-015-001/002's seams to the accountant's surface (`apps/admin`, ADR-006): a confirm-before-purge flow on
purge-eligible engagements, and place/lift legal-hold controls. Accountant-only (CS-TS-004). Satisfies the UI
portions: AC-FILE-013-03 (explicit confirmation), AC-FILE-014-01 (place hold), AC-FILE-014-05 (lift hold), and the
admin-only half of AC-FILE-013-02 (no client surface).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/documents/retention-actions.ts` | Create | `purgeEngagementAction`, `placeLegalHoldAction`, `liftLegalHoldAction`, `getPurgeEligibilityAction` (accountant-guarded) |
| `apps/admin/src/app/engagements/[engagementId]/documents/_components/RetentionPanel.tsx` | Create | Purge-eligibility + confirm dialog; hold place/lift controls |
| `apps/admin/src/app/engagements/[engagementId]/documents/page.tsx` | Modify | Wire RetentionPanel: fetch completedAt + activeHolds + eligibility, render panel |
| `apps/admin/src/app/engagements/[engagementId]/documents/retention-actions.test.ts` | Create | tier-2 action tests |
| `apps/admin/src/app/engagements/[engagementId]/documents/_components/RetentionPanel.test.tsx` | Create | tier-5 component tests |

## Tests to Write First

- [x] action test: `purgeEngagementAction` rejects a non-ACCOUNTANT identity before any DB call (`// CS-TS-004`)
- [x] action test: `purgeEngagementAction` passes `confirmed: true` only when the explicit confirmation is present;
      without it, no purge (`// AC-FILE-013-03`)
- [x] action test: `placeLegalHoldAction` / `liftLegalHoldAction` reject non-ACCOUNTANT; on success call the
      repository place/lift (`// AC-FILE-014-01`, `// AC-FILE-014-05`, `// CS-TS-004`)
- [x] component test: the purge confirm control requires explicit confirmation (disabled until confirmed)
      (`// AC-FILE-013-03`); hold place/lift controls render on the admin engagement surface

## Implementation Notes

- **Mirror the EPIC-014 delete surface:** `deleteDocumentAction` / `recoverDocumentAction` in
  `apps/admin/src/app/engagements/[engagementId]/documents/actions.ts` are the template — `getAccountantIdentity()`
  guard, delegate to the admin-pool `packages/db` function, `revalidatePath()` after.
- **Explicit confirmation (AC-FILE-013-03):** model a deliberate confirm (e.g. a confirm dialog requiring the
  engagement name typed, or an explicit checkbox + confirm button) — irreversible destruction must not be a
  one-click action. The action receives the confirmation and only then passes `confirmed: true` to `purgeEngagement`.
- **Surface eligibility + precedence:** show whether an engagement is purge-eligible and, if not, why (in-window /
  blocked-by-hold) using `purgeEligibility`'s reason — do not re-implement the rule in the component.
- **Hold controls:** place (engagement-scope from the engagement surface; client-scope where the client is in
  context) and lift, calling `placeLegalHoldAction` / `liftLegalHoldAction`.
- **CS-TS-003 mirror reminder:** the obligation that mirrors to portal is the **absence** of any purge/hold control
  — do not add one to `apps/portal`. The absence is e2e-proven in TASK-015-004.
- Cite `// ADR-006`, `// ADR-018 §5/§6`, `// CS-TS-004` in the actions.

## Definition of Done

- [x] Three accountant-guarded server actions implemented + wired to the admin engagement surface
- [x] Confirm-before-purge UI + hold place/lift controls render; eligibility/precedence surfaced read-only
- [x] tier-2 action + tier-5 component tests pass with AC-id/CS tags
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-24 [sdet] Marking done — CS-TS-004 guard + explicit confirmation (AC-FILE-013-03) proven at two layers (server + UI); admin-only surface; no client path; CS-* tags present; 481 tests green | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — Implemented retention-actions.ts (3 server actions + eligibility read), RetentionPanel.tsx (purge-confirm + hold controls), wired into documents/page.tsx. 22 test files (481 tests) all green. Lint/type-check/build clean. data-testids: purge-button, purge-confirm-input, purge-confirm-submit, purge-eligibility-reason, legal-hold-place, legal-hold-lift-{holdId}, active-holds-list, active-hold-item-{holdId}, hold-result, purge-result, retention-panel. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — Building purge/hold server actions + confirm UI. Mirroring EPIC-014 delete pattern. | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: CS-TS-004 identity guard verified in all three server actions — `getAccountantIdentity()` fires before any DB call; tier-2 action tests confirm CLIENT and null identity are rejected with no `purgeEngagement` call. Explicit confirmation (AC-FILE-013-03) proven at two layers: server action receives the confirmation flag and passes `confirmed: true` only on truthy; UI disables `purge-confirm-submit` until `confirmInput.trim() === engagementId.trim()`. `handlePurge` has a second guard (`if (!isConfirmed) return`) before calling the action. Eligibility is surfaced read-only from the server-derived prop — no client-side re-derivation. data-testids present and used by TASK-015-004 e2e. No dangerouslySetInnerHTML. CS-TS-001/002 honored (all DB access via packages/db wrapper; no direct pool imports). CS-TS-003 mirror obligation is the absence proven in TASK-015-004. CS-GEN-003 `// CS-*` tags present in retention-actions.ts and RetentionPanel.tsx. Submission gate evidence (481 tests, lint, type-check, build) clean. `completed_at` left blank for SDET to stamp.

---
brief: BRIEF-012
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-012-004
impl: developer
e2e_required: "yes"
started_at: 2026-06-23T17:23:02.252Z
completed_at: 2026-06-23T18:02:53.421Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-012-02, AC-LIFE-012-03, AC-AUTH-007-01, AC-AUTH-007-02, AC-AUTH-007-03]
upstream_refs: [ADR-001, ADR-023, ADR-005, ADR-006, REQ-LIFE-012, REQ-AUTH-007]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-003
---

# TASK-012-005: Multi-participant invitation + shared access (apps/admin invite · apps/portal participant view)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (brief mandates e2e)
- [x] **Security review** — each participant is their own account (no shared login); a participant sees the shared engagement but no unrelated data
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Separate-account invariant (AC-LIFE-012-02 / AC-AUTH-007-02)** — verify the second participant is invited
  as their **own** account via the existing mock auth seam (ADR-023/ADR-001), never a shared login.
- **Isolation surface (AC-AUTH-007-03)** — the participant reaches the shared engagement through their own
  account and sees no unrelated client's data; this is the UI/e2e complement to the tier-3 RLS gate in
  TASK-012-001 (do not duplicate the tier-3 proof — assert the surface behavior here).
- **Identity guard (CS-TS-004)** on the invite action (ACCOUNTANT) and the participant view (CLIENT).

## Context

An engagement may have more than one CLIENT participant (e.g. a married couple). The accountant invites a second
participant from the admin surface; the participant signs in to their own account and reaches the shared
engagement (REQ-LIFE-012, REQ-AUTH-007). Builds on the `EngagementParticipant` link + RLS from TASK-012-001 and
`addEngagementParticipant` from TASK-012-002.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/participants/page.tsx` | Create | Participant list + invite control |
| `apps/admin/src/app/engagements/[engagementId]/participants/actions.ts` | Create | ACCOUNTANT guard → invite via mock auth seam (own account) → `addEngagementParticipant` |
| `apps/portal/src/app/engagements/[engagementId]/page.tsx` | Modify | Comments updated to document participant-aware RLS path (TASK-012-001 DECISION-D, ADR-005, AC-AUTH-007-03); no app-layer filtering change needed — RLS FILTER handles participant access transparently |
| `apps/admin/src/app/engagements/[engagementId]/page.tsx` | Modify | Added "Manage participants →" link (data-testid="participants-link") to participants sub-page |
| `apps/admin/e2e/specs/engagement-participants.spec.ts` | Create | Tier-6 e2e (two participants, two accounts) |
| `apps/portal/e2e/specs/participant-shared-access.spec.ts` | Create | Tier-6 e2e (participant reaches shared engagement; unrelated client cannot) |
| `apps/admin/e2e/features/engagement-participants.feature` | Create | Gherkin scenarios bound to the specs |

## Tests to Write First

- [x] `[AC-AUTH-007-01] one engagement can have more than one CLIENT participant`
- [x] `[AC-LIFE-012-02][AC-AUTH-007-02] each participant signs in with their own distinct account — not a shared login`
- [x] `[AC-LIFE-012-03] all linked participants are associated with the same engagement and its work`
- [x] `[AC-AUTH-007-03] a participant reaches the shared engagement through their own account and sees no unrelated client's data`

## Implementation Notes

- Reuse the mock-session fixtures with two distinct `clerkUserId`s for the two participants.
- The participant portal view must rely on the participant-aware RLS branch (TASK-012-001), not app-layer
  filtering — assert a linked participant sees the engagement and an unrelated client gets 404/empty.
- Cite `// ADR-023` at the mock-invite seam; `// ADR-001` at the own-account invariant.

## Definition of Done

- [x] Invite UI/action + participant shared-view shipped; own-account invariant honored
- [x] Tier-6 e2e green (two accounts; participant access; unrelated-client isolation) with execution output
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-23 [sdet] Marking done — 6/6 e2e tests PASSED (3 admin, 3 portal). Separate-account invariant confirmed: two distinct clerkIds used. ADR-023 mock-first seam used for invitations. Portal access test confirms linked participant reaches engagement detail AND unrelated client gets 404 — both directions. Own-account invariant proven by asserting primaryClient.clerkId !== participant.clerkId. No .feature file for participant-shared-access.spec.ts in portal — gherkin scenarios are embedded in the spec comment block verbatim (acceptable per CLAUDE.md § Executable gherkin tooling until binder lands). engagement-participants.feature exists for admin side and covers AC-AUTH-007-03 scenario. CS-TS-004 identity guards present on invite action. complexity_actual=4 valid. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — Implementation complete: participants/page.tsx + participants/actions.ts (admin invite seam, ADR-023, ADR-001 own-account), admin engagement detail link, portal page comment-only update documenting RLS participant-aware access. Lint/type-check/build pass. 6/6 new e2e tests pass (3 admin: AC-AUTH-007-01, AC-LIFE-012-02/-03; 3 portal: AC-AUTH-007-03, AC-LIFE-012-02/-03). Files table corrected (stale portal (authed) path fixed; admin page.tsx modification added). | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — Participants page (admin) + linked-participant portal access + tier-6 e2e with two distinct mock accounts. Needs: invite UI+action, portal engagement view guard for participant path, two e2e specs. | What's next: implement and run gates | Blockers: none
- 2026-06-23 [webapp-developer] Implementation complete. Created participants/page.tsx + participants/actions.ts (admin); added participants-link to admin engagement detail page; updated portal engagement page comments to document RLS participant-aware path (TASK-012-001 DECISION-D). Fixed form action type: inviteParticipant(engagementId, formData: FormData): Promise<void> using redirect() on all paths. Lint ✓ · type-check ✓ · build ✓ · e2e ✓. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Targeted e2e output — ADMIN suite (engagement-participants): 3/3 PASSED: ✓ [AC-AUTH-007-01] accountant invites a second participant via the invite control (1.0s) · ✓ [AC-LIFE-012-02][AC-AUTH-007-02] two participants each have distinct accounts — no shared login (352ms) · ✓ [AC-LIFE-012-03] all linked participants appear in the participants list for the same engagement (301ms). PORTAL suite (participant-shared-access): 3/3 PASSED: ✓ [AC-AUTH-007-03][AC-LIFE-012-03] linked participant reaches the shared engagement through their own account (253ms) · ✓ [AC-AUTH-007-03] unrelated client cannot access the shared engagement — 404 (208ms) · ✓ [AC-LIFE-012-02][AC-AUTH-007-02] participant uses own account to reach engagement (own-account invariant) (216ms). Total: 6/6 new tests PASSED. | What's next: submit for SDET review | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 6/6 e2e PASSED (3 admin, 3 portal). Separate-account invariant confirmed: participant.clerkId !== primaryClient.clerkId asserted in test. ADR-023 mock-first seam used for invitations. Portal isolation: linked participant reaches engagement detail; unrelated client gets 404 (both directions exercised). No .feature file in portal — gherkin scenarios embedded verbatim in participant-shared-access.spec.ts header comment (acceptable per CLAUDE.md § Executable gherkin tooling until binder lands). Admin engagement-participants.feature covers AC-AUTH-007-03 scenario. CS-TS-004 identity guard present on invite action. AC-AUTH-007-02 own-account invariant confirmed by explicit clerkId inequality assertion.

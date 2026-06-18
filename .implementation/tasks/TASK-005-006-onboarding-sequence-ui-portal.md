# TASK-005-006: Onboarding sequence UI (portal) — three steps, locked affordances, position + remaining

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-005-005 (onboarding read model + sign action)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-001-01 (three ordered steps rendered), AC-ONBD-001-03 (current position + which steps remain visible). The signing UX surfaces here too (the button that calls TASK-005-005's `signEngagementLetterAction`) and presents the edited template (AC-IDNT-007-03 UI surface). Steps 2/3 render as **visibly locked** affordances backed by the server-side gate.
**Upstream refs:** ADR-006 (client onboarding lives in `apps/portal`, not reachable from `apps/admin`), ADR-001/ADR-005 (CLIENT-only, owns the engagement — middleware + the -005 server guard), ADR-024 §6 (renders the supplied template content).
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _the rendered-sequence + sign→unlock e2e is TASK-005-007_
- [ ] **Security review** — no `dangerouslySetInnerHTML`; template content auto-escaped; the locked affordance is backed by the server gate (UI lock is presentation only, not the security boundary)
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **UI lock is a presentation affordance, not the gate.** Confirm the page reads its accessibility flags from `getOnboardingAction` (the server read model from TASK-005-005) and renders steps 2/3 as locked — but the real enforcement is the server refusal in -005. The UI must not be the only thing stopping access.
- **ADR-006 surface boundary** — onboarding routes live only under `apps/portal/src/app`; no onboarding route under `apps/admin`.
- **AC-ONBD-001-03** — current position + remaining steps are visible (a progress indicator). **AC-IDNT-007-03 UI** — the letter step shows the accountant's edited template content for signature.

## Context

The client opens their engagement and sees exactly three ordered steps with steps 2/3 visibly locked behind the letter gate, their current position, and which steps remain (AC-ONBD-001-01/-03). The letter step presents the accountant's edited template + a sign action. This is the presentation layer over the TASK-005-005 read model + sign action.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/onboarding/page.tsx` | create | CLIENT-guarded onboarding page; resolves the client's engagement; renders the three-step sequence via the read model |
| `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` | create | Renders ordered steps, locked affordances, position/remaining indicator |
| `apps/portal/src/app/onboarding/_components/LetterSignStep.tsx` | create | Presents the edited template content + the sign button (calls `signEngagementLetterAction`) |
| `apps/portal/src/app/onboarding/onboarding-sequence.test.tsx` | create | tier-5 component — three ordered steps; steps 2/3 show locked when unsigned, unlocked when signed; position/remaining rendered; letter content shown |

## Implementation Notes

- Mirror the EPIC-003 admin `requests` list/detail component structure + the EPIC-002 `services` page patterns. Use `data-*` attributes (e.g. `data-step`, `data-accessible`, `data-current`) so the TASK-005-007 e2e can assert on them deterministically (same convention as EPIC-003's `data-status`).
- The client's engagement is resolved by the server (the client owns exactly one engagement in Phase 2 — single primary participant, per the brief's out-of-scope fence on multi-participant). If multiple engagements ever exist, scope is one-per-client here.
- Render template content as text (auto-escaped JSX); no rich HTML injection (ADR-024 §6 content boundary; security).
- Locked steps: show a lock affordance + tooltip/explanation ("Sign the engagement letter to unlock"). Backed by, not substituting for, the server gate.

## Tests to Write First

- [ ] `[AC-ONBD-001-01] renders exactly three steps in order`
- [ ] `[AC-ONBD-001-03] renders current position + remaining steps`
- [ ] `[AC-ONBD-002-01/-02 UI] steps 2/3 render locked when letterSignedAt is NULL`
- [ ] `[AC-ONBD-002-03 UI] steps 2/3 render unlocked when signed`
- [ ] `[AC-IDNT-007-03 UI] the letter step renders the accountant's edited template content`

## Definition of Done

- [ ] Onboarding page renders three ordered steps + position + remaining (AC-ONBD-001-01/-03)
- [ ] Steps 2/3 visibly locked when unsigned, unlocked when signed (backed by the -005 server gate)
- [ ] Letter step presents the edited template + sign action (AC-IDNT-007-03 UI surface)
- [ ] CLIENT-only, portal-only (ADR-006); lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

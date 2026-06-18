---
id: EPIC-008
title: Onboarding completion — gate close, auto-transition to In Progress, accountant notified
phase: 2
status: planned
slice: When all three onboarding steps are satisfied, onboarding is marked complete, the engagement automatically transitions New → In Progress, and the accountant is notified in-portal.
requirements:
  - REQ-ONBD-005: [AC-ONBD-005-01, AC-ONBD-005-02]
  - REQ-ONBD-006: [AC-ONBD-006-01, AC-ONBD-006-02, AC-ONBD-006-03]
  - REQ-ONBD-007: [AC-ONBD-007-01, AC-ONBD-007-02]
  - REQ-MSG-013: [AC-MSG-013-04]
architecture:
  - ADR-006   # monorepo — the accountant notification surfaces in apps/admin
  - ADR-003   # SESSION_CONTEXT — completion evaluation + transition run server-side
  - ADR-005   # security policy — the onboarding-complete notification is accountant-readable only
  - ADR-019   # audit trail — the automatic status transition is a recorded event
  - ADR-012   # testing pyramid — tiers the AC tests must hit
depends_on: [EPIC-005, EPIC-006, EPIC-007]
source:
  - .requirements/REQ-ONBD-005.md
  - .requirements/REQ-ONBD-006.md
  - .requirements/REQ-ONBD-007.md
  - .requirements/REQ-MSG-013.md
  - .architecture/decisions/ADR-019-audit-trail-logging.md
open_questions: []
---

# EPIC-008 — Onboarding completion — gate close, auto-transition to In Progress, accountant notified

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice **closes the onboarding gate** and is the capstone of Phase 2. The **system** evaluates the
three onboarding steps (letter signed — EPIC-005; questionnaire submitted — EPIC-006; required documents
uploaded — EPIC-007); when **all three** are satisfied, onboarding is marked **complete**, the
**engagement automatically transitions from New to In Progress** — the single automatic transition in the
lifecycle — and the **accountant** receives an **in-portal notification** identifying the engagement and
client whose onboarding finished, so she can pick up the work. If any step is unsatisfied, onboarding stays
incomplete and the engagement stays New. It depends on all three step-epics (EPIC-005/006/007) because
completion is defined over their outputs, and it reuses the notification spine introduced in EPIC-003.

## Requirements delivered

- **REQ-ONBD-005 — Onboarding complete requires all three steps**
  - **AC-ONBD-005-01** — onboarding is marked complete only when the letter is e-signed, the questionnaire
    is submitted, and the initial documents are uploaded.
  - **AC-ONBD-005-02** — if any one of the three is unsatisfied, onboarding is not complete.
- **REQ-ONBD-006 — Onboarding completion moves engagement to In Progress**
  - **AC-ONBD-006-01** — on onboarding completion the engagement's status changes from New to In Progress.
  - **AC-ONBD-006-02** — the transition occurs without any manual action by the accountant.
  - **AC-ONBD-006-03** — the transition occurs only on completion; an engagement whose onboarding is
    incomplete remains New.
- **REQ-ONBD-007 — Accountant notified when onboarding completes**
  - **AC-ONBD-007-01** — on onboarding completion the accountant receives an in-portal notification.
  - **AC-ONBD-007-02** — the notification identifies the engagement (and its client) whose onboarding
    completed.
- **REQ-MSG-013 — Notification types received by the accountant** *(this epic owns one AC; the rest are other phases)*
  - **AC-MSG-013-04** — the accountant receives a notification when onboarding is completed for an
    engagement.

> **REQ-ONBD-007 ↔ AC-MSG-013-04.** These are the ONBD-side and MSG-side statements of the same
> onboarding-complete notification; both are owned here and dual-tagged, mirroring EPIC-003's ownership of
> AC-MSG-013-01.

## Architecture adherence
- **ADR-006 — Monorepo, two apps.** The completion notification surfaces in the accountant's Tax Portal
  (`apps/admin`).
- **ADR-003 — SESSION_CONTEXT.** Completion evaluation and the status transition run server-side under a
  trusted identity, not the client's hand.
- **ADR-005 — Security policies.** The onboarding-complete notification is **accountant-readable only** —
  the same notification read boundary EPIC-003 established for `Notification`.
- **ADR-019 — Audit trail.** The automatic New → In Progress transition is a security-/state-significant
  event and is recorded.
- **ADR-012 — Testing pyramid.** "All three satisfied ⇒ complete & transitioned" and "any one unsatisfied
  ⇒ not complete & stays New" are tier-3 integration obligations; the full step-through-to-notification
  path is tier-6 e2e.

## Acceptance scenarios

### AC-ONBD-005-01 — Complete only when all three steps are satisfied
```gherkin
Given an engagement whose letter is signed, questionnaire submitted, and required documents uploaded
When onboarding completion is evaluated
Then onboarding is marked complete
```

### AC-ONBD-005-02 — Any unsatisfied step blocks completion
```gherkin
Given an engagement with at least one of the three onboarding steps unsatisfied
When onboarding completion is evaluated
Then onboarding is not complete
```

### AC-ONBD-006-01 — Completion transitions the engagement to In Progress
```gherkin
Given an engagement in status New whose onboarding has just become complete
When the completion is processed
Then the engagement's status changes from New to In Progress
```

### AC-ONBD-006-02 — The transition is automatic
```gherkin
Given onboarding has just become complete
When the engagement transitions to In Progress
Then the transition occurs without any manual action by the accountant
```

### AC-ONBD-006-03 — Incomplete onboarding stays New
```gherkin
Given an engagement whose onboarding is not yet complete
When its status is examined
Then it remains in New and has not transitioned
```

### AC-ONBD-007-01 — Accountant notified on completion
```gherkin
Given an engagement whose onboarding has just become complete
When the completion is processed
Then the accountant receives an in-portal notification of that completion
```

### AC-ONBD-007-02 — Notification identifies engagement and client
```gherkin
Given an onboarding-complete notification for the accountant
When she opens it
Then it identifies the engagement and its client whose onboarding completed
```

### AC-MSG-013-04 — Onboarding-completed is a notification type for the accountant
```gherkin
Given onboarding is completed for an engagement
When notifications are generated
Then the accountant receives an onboarding-completed notification
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-ONBD-005-NN` / `AC-ONBD-006-NN` / `AC-ONBD-007-NN` / `AC-MSG-013-04`
  id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping:
  - **e2e (tier 6)** — the full path: complete the three steps ⇒ engagement shows In Progress ⇒ accountant
    sees the notification (AC-ONBD-006-01, AC-ONBD-007-01/-02, AC-MSG-013-04).
  - **service integration (tier 3)** — AC-ONBD-005-01/-02 (completion predicate), AC-ONBD-006-02/-03
    (automatic, only-on-completion), AC-ONBD-007-01 (notification generated, accountant-only read).
  - **unit/component (tier 2/5)** — the completion predicate's truth table (each step toggled).

## Out of scope
- The **internals of each onboarding step** (EPIC-005/006/007). This epic consumes their satisfied/
  unsatisfied signals; it does not build the letter gate, questionnaire, or upload.
- The **manual** lifecycle transitions and the rest of the four-stage pipeline — REQ-LIFE-001/002/003 →
  **Phase 3**. This epic delivers **only** the single *automatic* New → In Progress transition; Review and
  Complete, client-facing labels, and accountant-driven moves are Phase 3.
- The **remaining accountant notification types** — AC-MSG-013-02/-03/-05/-06 (new message, document
  uploaded, overdue, due-date) → **Phase 4** (those source events arrive in later phases).
- **Client-side** onboarding-progress notifications — REQ-MSG-014 → **Phase 4**.

## Links
- Requirements: REQ-ONBD-005, REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013 (partial)
- Architecture: ADR-003, ADR-005, ADR-006, ADR-012, ADR-019
- Personas: `personas/jane-accountant.md` (receives completion), `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md` (finish onboarding)
- Flows: `flows/flow-onboarding.md` (completion + transition + notification — steps 5–6)
- Epics: depends on EPIC-005, EPIC-006, EPIC-007; reuses the EPIC-003 notification spine; precursor to the Phase-3 lifecycle epic
- Open questions: none

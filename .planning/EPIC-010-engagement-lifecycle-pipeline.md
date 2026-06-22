---
id: EPIC-010
title: Engagement lifecycle pipeline & engagement visibility
phase: 3
status: delivered
slice: The accountant advances an engagement through New → In Progress → Review → Complete with manual transitions and a two-confirmation completion gate, can reopen a completed engagement, and sees every engagement; the client sees only their own engagements under simplified labels and retains access after completion.
requirements:
  - REQ-LIFE-001: [AC-LIFE-001-01, AC-LIFE-001-02, AC-LIFE-001-03]
  - REQ-LIFE-002: [AC-LIFE-002-01, AC-LIFE-002-02, AC-LIFE-002-03]
  - REQ-LIFE-003: [AC-LIFE-003-01, AC-LIFE-003-02, AC-LIFE-003-03]
  - REQ-LIFE-004: [AC-LIFE-004-01, AC-LIFE-004-02, AC-LIFE-004-03]
  - REQ-LIFE-005: [AC-LIFE-005-01, AC-LIFE-005-02, AC-LIFE-005-03]
  - REQ-LIFE-006: [AC-LIFE-006-01, AC-LIFE-006-02]
  - REQ-AUTH-002: [AC-AUTH-002-01, AC-AUTH-002-02, AC-AUTH-002-03]
  - REQ-AUTH-003: [AC-AUTH-003-01, AC-AUTH-003-02, AC-AUTH-003-03]
  - REQ-AUTH-008: [AC-AUTH-008-01, AC-AUTH-008-02]
architecture:
  - ADR-005   # RLS security policies — accountant full visibility; client own-data isolation
  - ADR-003   # SESSION_CONTEXT — transitions + reads run under the caller's propagated identity
  - ADR-006   # monorepo — accountant transitions in apps/admin; client labels in apps/portal
  - ADR-010   # cross-app navigation — client never reaches the accountant transition surface
  - ADR-019   # audit trail — every status transition + reopen is a recorded event
  - ADR-018   # data-retention lifecycle — completion starts the retention clock; access persists after completion
  - ADR-012   # testing pyramid — tiers the AC tests must hit (RLS isolation is a hard tier-3 gate)
depends_on: [EPIC-005, EPIC-008]
source:
  - .requirements/REQ-LIFE-001.md
  - .requirements/REQ-LIFE-002.md
  - .requirements/REQ-LIFE-003.md
  - .requirements/REQ-LIFE-004.md
  - .requirements/REQ-LIFE-005.md
  - .requirements/REQ-LIFE-006.md
  - .requirements/REQ-AUTH-002.md
  - .requirements/REQ-AUTH-003.md
  - .requirements/REQ-AUTH-008.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
  - .architecture/decisions/ADR-018-data-retention-lifecycle.md
open_questions: []
---

# EPIC-010 — Engagement lifecycle pipeline & engagement visibility

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice makes the **engagement a first-class, lifecycle-managed object on both surfaces**. In the Tax
Portal (`apps/admin`) the **accountant** sees **every** engagement and moves each one **manually** through
the fixed pipeline **New → In Progress → Review → Complete**; she can move an engagement to Complete only
after **two explicit confirmations** (the return was delivered to the client, and the return was filed with
the tax authority), and she — and only she — can **reopen** a completed engagement back into active work. In
the Client Portal (`apps/portal`) the **client** sees only **their own** engagements, presented under
**simplified, friendly labels** (the internal "Review" stage never surfaces — it appears as "In Progress"),
and keeps the ability to sign in and view their engagements **indefinitely after completion**. It builds on
the minimal Engagement substrate (EPIC-005) and the single automatic New → In Progress onboarding transition
(EPIC-008), which it leaves intact as the one exception to manual control.

> **Lifecycle-core scope.** This epic owns the **status pipeline, transitions, client-facing labels,
> completion gate, reopen, and engagement visibility/isolation** (the AUTH-002/003/008 feature AC the
> mechanism for which was stood up in Phase 2). Engagement **attributes** (due date, internal notes,
> priority flag) are **EPIC-011**; engagement **creation paths and multi-participant** (DOOR-009/010,
> LIFE-010/011/012, AUTH-007) are **EPIC-012**; the **file-exchange and retention/legal-governance** surface
> (FILE remainder) is a **later Phase-3 planning pass** — see Out of scope.

## Requirements delivered

- **REQ-LIFE-001 — Four-stage engagement status pipeline**
  - **AC-LIFE-001-01** — every engagement always has exactly one current status from {New, In Progress, Review, Complete}.
  - **AC-LIFE-001-02** — a newly created engagement begins in New.
  - **AC-LIFE-001-03** — the pipeline's forward order is New → In Progress → Review → Complete.
- **REQ-LIFE-002 — Simplified client-facing status labels**
  - **AC-LIFE-002-01** — each internal status maps to a client-facing label: New→"Received", In Progress→"In Progress", Review→"In Progress", Complete→"Completed".
  - **AC-LIFE-002-02** — the client never sees raw internal stage names; the internal Review stage appears to the client as "In Progress".
  - **AC-LIFE-002-03** — to the client the engagement presents three distinct states: "Received", "In Progress", "Completed".
- **REQ-LIFE-003 — Manual status transitions by the accountant**
  - **AC-LIFE-003-01** — the accountant can change an engagement's status to move it through the pipeline.
  - **AC-LIFE-003-02** — the system does not auto-advance between stages, except the EPIC-008 onboarding-completion New → In Progress transition (REQ-ONBD-006).
  - **AC-LIFE-003-03** — a client cannot change an engagement's status.
- **REQ-LIFE-004 — Review is an internal accountant stage**
  - **AC-LIFE-004-01** — Review represents the accountant reviewing her own work before delivery.
  - **AC-LIFE-004-02** — Review imposes no required action on the client.
  - **AC-LIFE-004-03** — Review is not presented to the client as a client review/approval step.
- **REQ-LIFE-005 — Completion requires delivery and IRS-filing confirmation**
  - **AC-LIFE-005-01** — marking Complete requires an explicit accountant confirmation that the return was delivered to the client.
  - **AC-LIFE-005-02** — marking Complete requires an explicit accountant confirmation that the return was filed with the tax authority.
  - **AC-LIFE-005-03** — an engagement cannot move to Complete unless both confirmations are recorded.
- **REQ-LIFE-006 — Only the accountant can reopen a completed engagement**
  - **AC-LIFE-006-01** — the accountant can reopen a Complete engagement back into active work.
  - **AC-LIFE-006-02** — a client cannot reopen a completed engagement.
- **REQ-AUTH-002 — Accountant has full visibility**
  - **AC-AUTH-002-01** — the accountant can view every client account.
  - **AC-AUTH-002-02** — the accountant can view every engagement and its data, regardless of which client it belongs to.
  - **AC-AUTH-002-03** — no client or engagement is hidden from the accountant by any visibility/partitioning rule.
- **REQ-AUTH-003 — Clients see only their own data** *(the isolation **mechanism** — `pol_Engagement` and siblings — was built in Phase 2; this epic signs off the **feature** AC across every client access path)*
  - **AC-AUTH-003-01** — a client can access only the engagements they participate in, and that engagement's data.
  - **AC-AUTH-003-02** — a client cannot view, list, search, or otherwise reach any other client's engagements or data through any portal function.
  - **AC-AUTH-003-03** — the restriction holds across every access path, including a direct reference to a specific record, not only primary navigation.
- **REQ-AUTH-008 — Indefinite client access after completion**
  - **AC-AUTH-008-01** — after an engagement is marked Complete, its client participant(s) retain the ability to sign in.
  - **AC-AUTH-008-02** — a client can view their completed engagements and their data indefinitely after completion.

## Architecture adherence
- **ADR-005 — RLS via security policies.** Accountant full visibility (AUTH-002) and client own-data
  isolation (AUTH-003) are enforced by the engagement security policy, not application filtering. The
  per-policy CLIENT-A-vs-CLIENT-B isolation test (CLIENT-A reads own, CLIENT-B reads ZERO, null
  SESSION_CONTEXT reads ZERO, ACCOUNTANT reads all) is a **hard** tier-3 requirement and must additionally
  prove isolation holds on a **direct-reference** path (AC-AUTH-003-03), not only listings.
- **ADR-003 — SESSION_CONTEXT.** Every status transition, completion confirmation, reopen, and read runs
  under the caller's propagated identity; a client principal can never satisfy the transition/reopen path.
- **ADR-006 — Monorepo, two apps.** The transition + completion + reopen controls live in `apps/admin`
  (accountant-only); the client sees read-only labels in `apps/portal`.
- **ADR-010 — Cross-app navigation & session boundaries.** A client navigating toward the accountant
  transition surface is redirected; there is no client path to change or reopen status (AC-LIFE-003-03,
  AC-LIFE-006-02).
- **ADR-019 — Audit trail.** Each status transition, each completion confirmation, and each reopen is a
  recorded audit event (who, what, when).
- **ADR-018 — Data-retention lifecycle.** Marking Complete starts the engagement's retention clock and does
  **not** revoke client access — AUTH-008 indefinite access holds (the retention/purge mechanics themselves
  are a later Phase-3 epic; this slice only honors "completion ≠ loss of access").
- **ADR-012 — Testing pyramid.** Pipeline/transition invariants and the label mapping are tier-2/3; the
  isolation + access-control properties (AUTH-002/003, LIFE-003-03, LIFE-006-02) are hard tier-3
  integration/security; the accountant transition journey and the client label view are tier-6 e2e.

## Acceptance scenarios

### AC-LIFE-001-01 — An engagement always has exactly one pipeline status
```gherkin
Given any engagement in the system
When its current status is read
Then it is exactly one of New, In Progress, Review, or Complete
```

### AC-LIFE-001-02 — A new engagement starts in New
```gherkin
Given an engagement has just been created
When its status is read
Then the status is New
```

### AC-LIFE-001-03 — The pipeline advances in forward order
```gherkin
Given an engagement progressing through the pipeline
When the accountant advances it stage by stage
Then it moves New → In Progress → Review → Complete in that order
```

### AC-LIFE-002-01 — Internal statuses map to client-facing labels
```gherkin
Given an engagement in a given internal status
When the client views the engagement
Then they see the mapped label: New as "Received", In Progress as "In Progress", Review as "In Progress", Complete as "Completed"
```

### AC-LIFE-002-02 — The internal Review stage is hidden from the client
```gherkin
Given an engagement in the internal Review status
When the client views the engagement
Then they see "In Progress" and never the word "Review" or any raw internal stage name
```

### AC-LIFE-002-03 — The client sees three distinct states
```gherkin
Given the full set of internal statuses
When a client views their engagements over the lifecycle
Then they perceive exactly three states: "Received", "In Progress", and "Completed"
```

### AC-LIFE-003-01 — The accountant advances an engagement's status
```gherkin
Given the accountant viewing an engagement
When she changes its status to the next stage
Then the engagement's status is updated to that stage
```

### AC-LIFE-003-02 — The system does not auto-advance (except onboarding completion)
```gherkin
Given an engagement past the onboarding-completion transition
When no accountant action is taken
Then the system does not advance it from one stage to the next on its own
```

### AC-LIFE-003-03 — A client cannot change status
```gherkin
Given a client viewing their own engagement
When the client attempts to change its status through any portal path
Then no status change occurs and the action is not available to them
```

### AC-LIFE-004-01 — Review means the accountant checks her own work
```gherkin
Given an engagement in the Review status
When its meaning is examined
Then Review represents the accountant reviewing her own work before delivering the return
```

### AC-LIFE-004-02 — Review requires nothing of the client
```gherkin
Given an engagement in the Review status
When the client views it
Then no action is required of the client by the Review stage
```

### AC-LIFE-004-03 — Review is not a client approval step
```gherkin
Given an engagement in the Review status
When the client views it
Then it is not presented as a step where the client reviews or approves the work
```

### AC-LIFE-005-01 — Completion requires a delivery confirmation
```gherkin
Given an engagement the accountant wants to mark Complete
When she has not confirmed the return was delivered to the client
Then she is required to provide that confirmation before completion
```

### AC-LIFE-005-02 — Completion requires an IRS-filing confirmation
```gherkin
Given an engagement the accountant wants to mark Complete
When she has not confirmed the return was filed with the tax authority
Then she is required to provide that confirmation before completion
```

### AC-LIFE-005-03 — Completion is blocked unless both confirmations are recorded
```gherkin
Given an engagement with at most one of the two completion confirmations recorded
When completion is attempted
Then the engagement does not move to Complete
```

### AC-LIFE-006-01 — The accountant reopens a completed engagement
```gherkin
Given a Complete engagement
When the accountant reopens it
Then it returns to active work and is no longer Complete
```

### AC-LIFE-006-02 — A client cannot reopen a completed engagement
```gherkin
Given a Complete engagement the client participates in
When the client attempts to reopen it through any portal path
Then no reopen occurs and the action is not available to them
```

### AC-AUTH-002-01 — The accountant sees every client
```gherkin
Given multiple client accounts exist
When the accountant views the client list
Then every client account is visible to her
```

### AC-AUTH-002-02 — The accountant sees every engagement
```gherkin
Given engagements belonging to different clients
When the accountant views engagements
Then she can view every engagement and its data regardless of owning client
```

### AC-AUTH-002-03 — Nothing is partitioned away from the accountant
```gherkin
Given any client or engagement in the system
When the accountant accesses it
Then no visibility or partitioning rule hides it from her
```

### AC-AUTH-003-01 — A client sees only their own engagements
```gherkin
Given a client who participates in some engagements
When they view their engagements and that data
Then they can access only the engagements they participate in and those engagements' data
```

### AC-AUTH-003-02 — A client cannot reach another client's data through any function
```gherkin
Given two clients with separate engagements
When one client tries to view, list, or search the other's engagements or data
Then nothing of the other client's is returned through any portal function
```

### AC-AUTH-003-03 — Isolation holds on a direct reference
```gherkin
Given a client holding a direct reference to another client's engagement record
When they request that record directly
Then access is denied and no other client's data is returned
```

### AC-AUTH-008-01 — A client can still sign in after completion
```gherkin
Given an engagement that has been marked Complete
When its client participant signs in afterward
Then they retain the ability to sign in to the portal
```

### AC-AUTH-008-02 — A client views completed engagements indefinitely
```gherkin
Given a client with a completed engagement
When they return to the portal any time later
Then they can still view that completed engagement and its data
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-LIFE-001-NN` / `AC-LIFE-002-NN` / … / `AC-AUTH-002-NN` /
  `AC-AUTH-003-NN` / `AC-AUTH-008-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI** — CI is the independent gate.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`. Partial
  coverage does not deliver the epic.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-LIFE-001-01/-02, AC-LIFE-003-02/-03,
    AC-LIFE-005-03, AC-LIFE-006-02, **AC-AUTH-002-01/-02/-03**, **AC-AUTH-003-01/-02/-03** (the hard
    per-policy isolation test incl. the direct-reference path), AC-AUTH-008-01/-02.
  - **e2e (tier 6)** — AC-LIFE-001-03 (advance through the pipeline), AC-LIFE-002-01/-02/-03 (client
    labels), AC-LIFE-003-01, AC-LIFE-005-01/-02 (the two-confirmation completion gate), AC-LIFE-006-01
    (reopen).
  - **unit/component (tier 2/5)** — AC-LIFE-002-01 label mapping, AC-LIFE-004-01/-02/-03 (Review is
    internal, surfaced as "In Progress").

## Out of scope
- **Engagement attributes** — due date (REQ-LIFE-007), internal notes (REQ-LIFE-008), priority/flag
  (REQ-LIFE-009) → **EPIC-011**.
- **Engagement creation paths & multi-participant** — returning-client request (REQ-DOOR-009),
  accountant-initiated (REQ-DOOR-010), multiple concurrent / one-per-type-per-year (REQ-LIFE-010/011),
  participants (REQ-LIFE-012, REQ-AUTH-007) → **EPIC-012**.
- **File exchange, deletion, retention, purge, legal hold** (REQ-FILE-001 remainder, REQ-FILE-004/005/006/
  009/010/011/012/013/014/015) → **a later Phase-3 planning pass** (FILE-exchange + retention/governance
  epics).
- **Accountant dashboard / needs-action feed & client notifications of status change** (DASH, MSG) →
  **Phase 4**. This slice surfaces status on the engagement itself, not a dashboard or notification feed.
- **The retention/purge mechanics** behind AUTH-008/ADR-018 — this slice only guarantees completion does
  not revoke access; the retention window + purge are the later FILE-governance epic.

## Links
- Requirements: REQ-LIFE-001, REQ-LIFE-002, REQ-LIFE-003, REQ-LIFE-004, REQ-LIFE-005, REQ-LIFE-006, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-008
- Architecture: ADR-003, ADR-005, ADR-006, ADR-010, ADR-012, ADR-018, ADR-019
- Personas: `personas/jane-accountant.md` (pipeline management, completion, reopen), `personas/sarah-returning-client.md` (own-data view, post-completion access), `personas/martha-and-james-married-couple.md` (each participant sees the shared engagement's label)
- Flows: `flows/flow-engagement-lifecycle.md` (the pipeline + labels + completion + reopen journey this epic realizes)
- Epics: depends on EPIC-005 (minimal Engagement substrate) and EPIC-008 (the one automatic transition); precedes EPIC-011 (attributes) and EPIC-012 (creation & participants)
- Open questions: none

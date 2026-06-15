---
id: EPIC-003
title: Accountant request inbox — notify, review, accept/decline, invite
phase: 1
status: planned
slice: The accountant is notified of a new engagement request, reviews it, and either accepts it (sending the prospect an account invitation) or declines it (sending a reason by email).
requirements:
  - REQ-DOOR-005: [AC-DOOR-005-01, AC-DOOR-005-02, AC-DOOR-005-03]
  - REQ-DOOR-006: [AC-DOOR-006-01, AC-DOOR-006-02, AC-DOOR-006-03, AC-DOOR-006-04, AC-DOOR-006-05]
  - REQ-DOOR-007: [AC-DOOR-007-01, AC-DOOR-007-02, AC-DOOR-007-03, AC-DOOR-007-04]
  - REQ-DOOR-008: [AC-DOOR-008-01, AC-DOOR-008-02, AC-DOOR-008-03, AC-DOOR-008-04]
  - REQ-DASH-011: [AC-DASH-011-01, AC-DASH-011-02, AC-DASH-011-03]
  - REQ-MSG-013: [AC-MSG-013-01]
architecture:
  - ADR-001   # Clerk — the acceptance invitation is issued through the auth provider
  - ADR-006   # monorepo — the inbox lives in apps/admin
  - ADR-005   # security policy — engagement requests are accountant-readable only
  - ADR-003   # SESSION_CONTEXT — inbox reads/decisions run under the accountant principal
  - ADR-019   # audit trail — accept/decline are security-significant decisions
  - ADR-022   # anti-abuse rate limiting (decline email send / invitation issuance)
  - ADR-012   # testing pyramid — tiers the AC tests must hit
  - REQ-NFR-008  # decline reason delivered by the system's email channel (Resend)
depends_on: [EPIC-001, EPIC-004]
source:
  - .requirements/REQ-DOOR-005.md
  - .requirements/REQ-DOOR-006.md
  - .requirements/REQ-DOOR-007.md
  - .requirements/REQ-DOOR-008.md
  - .requirements/REQ-DASH-011.md
  - .requirements/REQ-MSG-013.md
  - .architecture/decisions/ADR-001-authentication-clerk.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-003 — Accountant request inbox — notify, review, accept/decline, invite

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice closes the front-door loop. When a prospect submits an engagement request (EPIC-001), the
**accountant** is notified in-portal, opens the **request inbox** in the Tax Portal (`apps/admin`), reviews
the request and its submitted details, and makes a single decision: **accept** — which sends the prospect an
invitation to create their portal account (the account itself is created in EPIC-004) — or **decline** —
which lets her write a brief reason that is emailed to the prospect and retained against the declined request.
Requests are accountant-readable only, and each request is decided exactly once. This is the thread that
makes the portal's reason-to-exist real end to end: a stranger raises their hand and the accountant turns
that into (or away from) a client relationship. It depends on EPIC-001 (the requests to act on) and EPIC-004
(the authenticated accountant surface and the invitation→account mechanism).

## Requirements delivered

- **REQ-DOOR-005 — Accountant notified of a new engagement request**
  - **AC-DOOR-005-01** — submitting a request generates an in-portal notification for the accountant.
  - **AC-DOOR-005-02** — the notification identifies that a new request arrived and leads to it.
  - **AC-DOOR-005-03** — the notification is delivered to the accountant only, never to clients/anonymous.
- **REQ-DOOR-006 — Accountant accepts or declines each request**
  - **AC-DOOR-006-01** — the accountant can view each pending request and its submitted details.
  - **AC-DOOR-006-02** — she can accept a pending request, moving it to accepted.
  - **AC-DOOR-006-03** — she can decline a pending request, moving it to declined.
  - **AC-DOOR-006-04** — only the accountant can decide a request.
  - **AC-DOOR-006-05** — once decided, a request is no longer pending / awaiting a second decision.
- **REQ-DOOR-007 — Acceptance invites the prospect to create an account**
  - **AC-DOOR-007-01** — accepting sends an invitation to the prospect's contact email.
  - **AC-DOOR-007-02** — the invitation directs the recipient to create their own portal account.
  - **AC-DOOR-007-03** — a portal client account exists only after the invited prospect completes sign-up.
  - **AC-DOOR-007-04** — the invitation is tied to the accepted request so the resulting account is linked to it.
- **REQ-DOOR-008 — Decline sends a reason message to the prospect**
  - **AC-DOOR-008-01** — declining lets the accountant write a brief free-text reason.
  - **AC-DOOR-008-02** — the reason is sent to the prospect's contact email.
  - **AC-DOOR-008-03** — the prospect receives the explanation without needing a portal account.
  - **AC-DOOR-008-04** — the decline reason is retained in the portal, attached to the declined request.
- **REQ-DASH-011 — Manage engagement requests (admin UI)**
  - **AC-DASH-011-01** — the accountant can view all engagement requests from the admin UI.
  - **AC-DASH-011-02** — requests are distinguishable by state: pending, accepted, declined.
  - **AC-DASH-011-03** — the accountant can identify which requests are pending a decision.
- **REQ-MSG-013 — Notification types received by the accountant** *(this epic owns one AC; the rest are later phases)*
  - **AC-MSG-013-01** — the accountant receives a notification when a new service request is submitted.

## Architecture adherence
- **ADR-001 — Authentication via Clerk.** Acceptance issues the prospect invitation through the auth
  provider; the invitation must carry the CLIENT role and tie back to the accepted request (AC-DOOR-007-04).
  The account-creation outcome is EPIC-004's.
- **ADR-006 — Monorepo, two apps.** The inbox and decision actions live in `apps/admin`.
- **ADR-005 — Security policies (read boundary).** The `engagement_request` entity is **accountant-readable
  only** — a client or anonymous caller can never list or read requests (AC-DOOR-005-03). This is the read
  counterpart to EPIC-001's sanctioned anonymous insert.
- **ADR-003 — SESSION_CONTEXT.** Inbox reads and accept/decline writes run under the authenticated
  accountant identity.
- **ADR-019 — Audit trail.** Accept and decline are security-significant decisions and are recorded.
- **REQ-NFR-008 — Email channel.** The decline reason (AC-DOOR-008-02) is delivered via the system's email
  channel to a prospect who has no account.
- **ADR-022 — Anti-abuse rate limiting.** Outbound invitation/decline email is rate-limited.
- **ADR-012 — Testing pyramid.** Accountant-only read of requests and the decide-exactly-once invariant are
  tier-3 integration obligations.

## Acceptance scenarios

### AC-DOOR-005-01 — New request notifies the accountant
```gherkin
Given a prospect submits a new engagement request
When the submission is recorded
Then an in-portal notification is generated for the accountant
```

### AC-DOOR-005-02 — Notification identifies and leads to the request
```gherkin
Given a new-request notification for the accountant
When she opens it
Then it conveys that a new engagement request arrived and leads her to that request
```

### AC-DOOR-005-03 — Notification goes to the accountant only
```gherkin
Given a new engagement request
When notification recipients are determined
Then only the accountant is notified — no client or anonymous party receives it
```

### AC-DOOR-006-01 — Accountant views a pending request
```gherkin
Given a pending engagement request
When the accountant opens it in the inbox
Then she sees the request and its submitted details
```

### AC-DOOR-006-02 — Accountant accepts a request
```gherkin
Given a pending engagement request
When the accountant accepts it
Then the request moves to the accepted state
```

### AC-DOOR-006-03 — Accountant declines a request
```gherkin
Given a pending engagement request
When the accountant declines it
Then the request moves to the declined state
```

### AC-DOOR-006-04 — Only the accountant decides
```gherkin
Given a pending engagement request
When a non-accountant caller attempts to accept or decline it
Then the attempt is rejected and the request remains pending
```

### AC-DOOR-006-05 — A decided request is no longer pending
```gherkin
Given a request that has been accepted or declined
When its state is examined or a second decision is attempted
Then it is no longer pending and does not await a further decision
```

### AC-DOOR-007-01 — Acceptance sends an invitation
```gherkin
Given the accountant accepts an engagement request
When the acceptance is processed
Then an invitation is sent to the prospect's contact email
```

### AC-DOOR-007-02 — Invitation directs to account creation
```gherkin
Given an accepted-request invitation received by the prospect
When the prospect opens it
Then it directs them to create their own portal account
```

### AC-DOOR-007-03 — Account exists only after sign-up
```gherkin
Given an invitation has been sent but the prospect has not completed sign-up
When the system state is examined
Then no portal client account exists for that prospect yet
```

### AC-DOOR-007-04 — Invitation is tied to the accepted request
```gherkin
Given a prospect completes sign-up from an acceptance invitation
When the resulting client account is examined
Then it is linked to the accepted engagement request the invitation came from
```

### AC-DOOR-008-01 — Decline captures a reason
```gherkin
Given the accountant declines an engagement request
When she is declining it
Then she can write a brief free-text reason message
```

### AC-DOOR-008-02 — Reason is emailed to the prospect
```gherkin
Given the accountant submits a decline with a reason
When the decline is processed
Then the reason is sent to the prospect's contact email
```

### AC-DOOR-008-03 — Prospect needs no account to receive it
```gherkin
Given a declined prospect who has no portal account
When the decline reason is delivered
Then they receive the explanation by email without needing to sign in
```

### AC-DOOR-008-04 — Decline reason retained in the portal
```gherkin
Given a request has been declined with a reason
When the accountant later views that declined request
Then the decline reason is retained and shown attached to the request
```

### AC-DASH-011-01 — Accountant views all requests
```gherkin
Given engagement requests exist in various states
When the accountant opens the request inbox in the admin UI
Then she can view all engagement requests
```

### AC-DASH-011-02 — Requests distinguishable by state
```gherkin
Given engagement requests that are pending, accepted, and declined
When the accountant views the inbox
Then each request's state is distinguishable
```

### AC-DASH-011-03 — Pending requests are identifiable
```gherkin
Given a mix of decided and undecided requests
When the accountant views the inbox
Then she can identify which requests are still pending a decision
```

### AC-MSG-013-01 — New service request notification
```gherkin
Given a new service (engagement) request is submitted
When notifications are generated
Then the accountant receives a notification of the new service request
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-DOOR-NNN-NN` / `AC-DASH-011-NN` / `AC-MSG-013-01` id), at the
  prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping:
  - **e2e (tier 6, `apps/admin`)** — AC-DOOR-006-01/-02/-03, AC-DOOR-008-01/-04, AC-DASH-011-01/-02/-03,
    AC-DOOR-005-02; the accept→invite and decline→email happy paths.
  - **service integration (tier 3)** — AC-DOOR-005-01/-03 (notification generated; accountant-only read of
    requests), AC-DOOR-006-04/-05 (only-accountant-decides; decide-exactly-once), AC-DOOR-007-01/-03/-04
    (invitation issued, tied to request, no account before sign-up), AC-DOOR-008-02/-03 (email send),
    AC-MSG-013-01.
  - **unit/component (tier 2/5)** — AC-DOOR-006-01 detail rendering, AC-DOOR-008-01 reason capture.
  - **cross-epic seam** — AC-DOOR-007-03 pairs with EPIC-004 AC-AUTH-006-01 (account exists only after the
    invited prospect signs up).

## Out of scope
- The **account creation** that results from the acceptance invitation → **EPIC-004** (REQ-AUTH-006). This
  epic sends the invitation and asserts no-account-before-sign-up; EPIC-004 owns the created account.
- The full accountant notification catalogue — **AC-MSG-013-02..06** (new message, document uploaded,
  onboarding completed, document-request overdue, due-date approaching) → **deferred** to the messaging/
  notification phase (Phase 4); those events do not exist in the MVP.
- All **client-side** notifications — **REQ-MSG-014** (incl. request accepted/declined as in-portal
  notifications) → **deferred** to Phase 4. In the MVP the prospect is account-less, so accept/decline reach
  them via the invitation email (DOOR-007) and the decline email (DOOR-008), not a notification feed.
- **REQ-DOOR-009** (returning client requests from inside the portal) and **REQ-DOOR-010** (accountant
  initiates an engagement for an existing client) → **deferred** to a later phase: both need a client portal
  home and/or the engagement-lifecycle capability, which are outside the MVP spine.

## Links
- Requirements: REQ-DOOR-005, REQ-DOOR-006, REQ-DOOR-007, REQ-DOOR-008, REQ-DASH-011, REQ-MSG-013 (partial)
- Architecture: ADR-001, ADR-003, ADR-005, ADR-006, ADR-012, ADR-019, ADR-022, REQ-NFR-008
- Personas: `personas/jane-accountant.md`, `personas/tom-prospective-client.md`
- Flows: `flows/flow-engagement-request.md` (review/accept/decline + decline branch), `flows/flow-first-sign-in.md` (invitation → sign-up handoff)
- Epics: depends on EPIC-001 (requests to act on) and EPIC-004 (accountant auth + invitation→account); related EPIC-002
- Open questions: none

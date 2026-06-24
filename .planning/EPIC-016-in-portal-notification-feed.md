---
id: EPIC-016
title: In-portal notification feed — the dual-role spine, real-time, unread badge
phase: 4
status: planned
slice: Both the accountant and clients get a real-time in-portal notification feed — the authoritative place every notification appears — with a persistent unread-count badge, auto-mark-read when the linked item is viewed, and 90-day history; the EPIC-003 accountant-only notification model is generalized to clients and lit up with every already-existing event.
requirements:
  - REQ-MSG-007: [AC-MSG-007-01, AC-MSG-007-02, AC-MSG-007-03]
  - REQ-MSG-012: [AC-MSG-012-01, AC-MSG-012-02, AC-MSG-012-03]
  - REQ-MSG-015: [AC-MSG-015-01, AC-MSG-015-02, AC-MSG-015-03]
  - REQ-MSG-016: [AC-MSG-016-01, AC-MSG-016-02]
  - REQ-MSG-017: [AC-MSG-017-01, AC-MSG-017-02, AC-MSG-017-03]
  - REQ-MSG-013: [AC-MSG-013-03]
  - REQ-MSG-014: [AC-MSG-014-03, AC-MSG-014-04, AC-MSG-014-05, AC-MSG-014-06, AC-MSG-014-07]
architecture:
  - ADR-005   # RLS — generalize accountant-only pol_Notification with a client branch: a client reads only their own notifications
  - ADR-003   # SESSION_CONTEXT — feed reads/writes run under the propagated principal
  - ADR-006   # monorepo — the feed + badge render on BOTH apps/portal and apps/admin
  - ADR-010   # cross-app navigation — a notification's link may target the other app; viewing it marks-read across the boundary
  - ADR-018   # data retention — notification records retained ≥90 days (distinct from indefinite thread retention)
  - ADR-023   # provider seam — the real-time transport is consumed behind a mockable seam (real provider → Phase 5)
  - ADR-012   # testing pyramid — per-viewer isolation is a hard tier-3 gate; real-time arrival is tier-6
depends_on: [EPIC-003, EPIC-010, EPIC-013]
source:
  - .requirements/REQ-MSG-007.md
  - .requirements/REQ-MSG-012.md
  - .requirements/REQ-MSG-015.md
  - .requirements/REQ-MSG-016.md
  - .requirements/REQ-MSG-017.md
  - .requirements/REQ-MSG-013.md
  - .requirements/REQ-MSG-014.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
  - .architecture/decisions/ADR-023-provider-seam-mock-first-integration.md
open_questions: []
---

# EPIC-016 — In-portal notification feed — the dual-role spine, real-time, unread badge

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice stands up the **in-portal notification feed** as the authoritative notification channel for
**both roles** and lights it up with the events that already exist in the system. EPIC-003 introduced a
`Notification` entity guarded by an accountant-only `sec.pol_Notification`; this slice **generalizes** that
model so a **client** also has a feed showing only their own notifications, renders the feed + a persistent
**unread-count badge** on both the Client Portal (`apps/portal`) and the Tax Portal (`apps/admin`),
delivers new notifications **in real time** while the portal is open, and **auto-marks a notification read
when its linked item is viewed**. Notification history is retained for at least 90 days. The slice wires
the already-built source events into the feed — a **document upload** (accountant feed), and for the client
feed an **engagement status change**, a **deliverable ready**, and an **engagement request accepted /
declined** — establishing the spine that EPIC-017 (messaging), EPIC-018 (email digest), and EPIC-019
(reminders) hang their own notification types on.

> **Spine scope.** This epic owns the feed *mechanism* and the notification types whose **source events
> already exist** pre-Phase-4. New-message notifications (MSG-013-02 / MSG-014-01) are owned by **EPIC-017**
> (the message is the source event); overdue / due-date / document-request-created notifications
> (MSG-013-05/-06, MSG-014-02) are owned by **EPIC-019** (the reminder engine that detects them).

## Requirements delivered

- **REQ-MSG-007 — In-portal feed is the primary channel**
  - **AC-MSG-007-01** — every notification a user is entitled to appears in that user's in-portal feed.
  - **AC-MSG-007-02** — the feed is the authoritative, complete record; no notification exists only outside the portal.
  - **AC-MSG-007-03** — any other channel is supplementary to, and does not replace, the feed.
- **REQ-MSG-012 — Real-time delivery**
  - **AC-MSG-012-01** — an entitled notification surfaces in the feed promptly after its event, without a manual refresh.
  - **AC-MSG-012-02** — a user with the portal open sees new notifications appear in real time.
  - **AC-MSG-012-03** — the unread-count badge reflects real-time arrival.
- **REQ-MSG-015 — Marked read when linked item viewed**
  - **AC-MSG-015-01** — a notification is associated with the specific item that triggered it.
  - **AC-MSG-015-02** — viewing the linked item marks that notification read automatically.
  - **AC-MSG-015-03** — the read state reflects in the feed and the unread count with no separate dismiss step.
- **REQ-MSG-016 — History retained ≥90 days**
  - **AC-MSG-016-01** — a user's notification history is retained and viewable for ≥90 days from generation.
  - **AC-MSG-016-02** — both read and unread notifications are retained for at least that window.
- **REQ-MSG-017 — Persistent unread-count badge**
  - **AC-MSG-017-01** — an unread-count badge is present in navigation, visible to an authenticated user from any area.
  - **AC-MSG-017-02** — the badge shows the count of the user's unread notifications.
  - **AC-MSG-017-03** — the badge updates as notifications are read (MSG-015) or arrive (MSG-012).
- **REQ-MSG-013 — Accountant notification types** (this epic owns the already-sourced one)
  - **AC-MSG-013-03** — the accountant is notified when a document is uploaded.
- **REQ-MSG-014 — Client notification types** (the already-sourced subset)
  - **AC-MSG-014-03** — a client is notified when the status of their engagement changes.
  - **AC-MSG-014-04** — a client is notified when a deliverable is ready for them.
  - **AC-MSG-014-05** — a client is notified when their engagement request is accepted.
  - **AC-MSG-014-06** — a client is notified when their engagement request is declined.
  - **AC-MSG-014-07** — a client receives notifications only for events concerning their own engagements and requests.

## Architecture adherence
- **ADR-005 — RLS via security policies.** Generalize the accountant-only `sec.pol_Notification` with a
  **client branch** so a client principal reads **only their own** notifications (AC-MSG-014-07). The
  per-policy test — CLIENT-A reads zero of CLIENT-B's notifications; null SESSION_CONTEXT reads zero;
  ACCOUNTANT reads all — is a **hard** tier-3 gate.
- **ADR-003 — SESSION_CONTEXT.** Feed reads, mark-read writes, and badge counts run under the propagated
  principal via the `packages/db` wrapper; no route handler bypasses it.
- **ADR-006 — Monorepo, two apps.** The feed and badge render on **both** surfaces; the accountant feed
  (`apps/admin`) and the client feed (`apps/portal`) are the same model under two principals.
- **ADR-010 — Cross-app navigation.** A notification's linked item may live on the other app; following the
  link and the resulting auto-mark-read must honor the session boundary.
- **ADR-018 — Data retention.** Notification records carry a ≥90-day retention floor — distinct from the
  indefinite message-thread retention of EPIC-017 (REQ-MSG-006).
- **ADR-023 — Provider seam, mock-first.** Real-time transport is consumed behind a mockable seam; the
  mock realization is what this epic verifies (real provider re-validation → Phase 5).
- **ADR-012 — Testing pyramid.** Per-viewer notification isolation is a hard tier-3 obligation; real-time
  arrival and the badge are tier-6 e2e.

## Acceptance scenarios

### AC-MSG-007-01 — Entitled notification appears in the feed
```gherkin
Given a user entitled to a notification for an event
When that event occurs
Then a corresponding notification appears in that user's in-portal feed
```

### AC-MSG-007-02 — The feed is the authoritative record
```gherkin
Given a user has received several notifications over time
When they open their in-portal notification feed
Then every notification they are entitled to is present there as the complete record
```

### AC-MSG-007-03 — Other channels are supplementary
```gherkin
Given a notification also triggered an out-of-portal nudge
When the user consults the in-portal feed
Then the feed contains the notification and the other channel has not replaced it
```

### AC-MSG-012-01 — Notification surfaces without manual refresh
```gherkin
Given a user with the portal open
When a notification-worthy event occurs for them
Then the notification surfaces in their feed promptly without them refreshing
```

### AC-MSG-012-02 — New notifications appear in real time
```gherkin
Given a user is viewing the portal
When multiple events occur for them
Then each new notification appears in the feed in real time as it occurs
```

### AC-MSG-012-03 — Badge reflects real-time arrival
```gherkin
Given a user with the portal open and a known unread count
When a new notification arrives in real time
Then the unread-count badge increments without a manual refresh
```

### AC-MSG-015-01 — Notification references its triggering item
```gherkin
Given a notification generated by an event on a specific item
When the notification is inspected
Then it references the specific item that triggered it
```

### AC-MSG-015-02 — Viewing the linked item marks it read
```gherkin
Given an unread notification whose linked item the user has not yet viewed
When the user views that linked item
Then the notification is automatically marked read
```

### AC-MSG-015-03 — Read state reflects without a dismiss step
```gherkin
Given a notification auto-marked read by viewing its item
When the user looks at their feed and unread count
Then the notification shows read and the count has decreased, with no separate dismiss action
```

### AC-MSG-016-01 — History retained and viewable for 90 days
```gherkin
Given notifications generated within the last 90 days
When the user views their notification history
Then all of those notifications remain present and viewable
```

### AC-MSG-016-02 — Read and unread both retained in the window
```gherkin
Given both read and unread notifications generated within the 90-day window
When the user views their notification history
Then both read and unread notifications are retained and shown
```

### AC-MSG-017-01 — Badge present from any area
```gherkin
Given an authenticated user
When they navigate to any area of the portal
Then an unread-notification count badge is present in the navigation
```

### AC-MSG-017-02 — Badge shows unread count
```gherkin
Given a user with a known number of unread notifications
When they look at the navigation badge
Then the badge shows that number of unread notifications
```

### AC-MSG-017-03 — Badge updates on read and on arrival
```gherkin
Given a visible unread-count badge
When a notification is marked read or a new notification arrives
Then the badge updates to reflect the new unread count
```

### AC-MSG-013-03 — Accountant notified on document upload
```gherkin
Given a client uploads a document to an engagement
When the upload completes
Then the accountant receives an in-portal notification of the upload
```

### AC-MSG-014-03 — Client notified on engagement status change
```gherkin
Given a client with an active engagement
When the accountant changes that engagement's status
Then the client receives an in-portal notification of the status change
```

### AC-MSG-014-04 — Client notified when a deliverable is ready
```gherkin
Given a client with an engagement
When a deliverable is made ready for them
Then the client receives an in-portal notification that a deliverable is ready
```

### AC-MSG-014-05 — Client notified when request accepted
```gherkin
Given a prospective/returning client whose engagement request is pending
When the accountant accepts the request
Then the client is notified their request was accepted
```

### AC-MSG-014-06 — Client notified when request declined
```gherkin
Given a prospective/returning client whose engagement request is pending
When the accountant declines the request
Then the client is notified their request was declined
```

### AC-MSG-014-07 — Client sees only their own events
```gherkin
Given two clients with separate engagements
When events occur on each client's engagement
Then each client's feed contains only notifications for their own engagements and requests
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-MSG-007-NN` / `-012-NN` / `-015-NN` / `-016-NN` / `-017-NN` /
  `-013-03` / `-014-0N` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-MSG-014-07 (the hard per-viewer RLS isolation test),
    AC-MSG-015-01/-02, AC-MSG-016-01/-02 (retention floor).
  - **e2e (tier 6)** — AC-MSG-007-01/-02, AC-MSG-012-01/-02/-03 (real-time arrival, both surfaces),
    AC-MSG-015-03, AC-MSG-017-01/-02/-03 (badge), AC-MSG-013-03, AC-MSG-014-03/-04/-05/-06.

## Out of scope
- **New-message notifications** — AC-MSG-013-02 (accountant) and AC-MSG-014-01 (client) → **EPIC-017** (the
  message is the source event).
- **Overdue / due-date / document-request-created notifications** — AC-MSG-013-05/-06, AC-MSG-014-02 →
  **EPIC-019** (the reminder engine detects them).
- **The email digest fallback** (REQ-MSG-008/009/010/011) → **EPIC-018**. This slice is the in-portal feed
  only; "supplementary channel" (AC-MSG-007-03) is verified against the *presence* of the feed, not the
  email channel's behavior.
- **Account-less prospects.** A declined prospect with no account receives the decline by **email**
  (built in EPIC-003); AC-MSG-014-05/-06 here cover the **in-portal feed** path for a client who holds an
  account at decision time (e.g. a returning client requesting from inside the portal, EPIC-012).
- **Real-time transport against a real provider** → **Phase 5** (mock-first per ADR-023).

## Links
- Requirements: REQ-MSG-007, REQ-MSG-012, REQ-MSG-015, REQ-MSG-016, REQ-MSG-017, REQ-MSG-013 (-03), REQ-MSG-014 (-03..-07)
- Architecture: ADR-003, ADR-005, ADR-006, ADR-010, ADR-012, ADR-018, ADR-023
- Personas: `personas/jane-accountant.md` (single work surface), `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md` (clients who drop in and need to notice activity)
- Flows: `flows/flow-notification-feed.md` (this slice's primary flow); extends `flows/flow-message-exchange.md`
- Epics: depends on EPIC-003 (Notification entity + pol_Notification), EPIC-010 (status-change source), EPIC-013 (document-upload source); spine for EPIC-017/018/019/020
- Open questions: none

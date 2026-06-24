---
id: EPIC-019
title: Overdue detection & reminder engine — auto-detect, configurable cadence
phase: 4
status: planned
slice: The system detects overdue document requests on its own and raises reminders without the accountant checking; she configures the reminder cadence as a global default and per-engagement override; overdue, due-date-approaching, and document-request-created events notify the accountant and client through the EPIC-016 feed (honoring the email digest).
requirements:
  - REQ-MSG-018: [AC-MSG-018-01, AC-MSG-018-02, AC-MSG-018-03, AC-MSG-018-04]
  - REQ-DASH-008: [AC-DASH-008-01, AC-DASH-008-02, AC-DASH-008-03]
  - REQ-FILE-012: [AC-FILE-012-01, AC-FILE-012-02, AC-FILE-012-03, AC-FILE-012-04]
  - REQ-MSG-013: [AC-MSG-013-05, AC-MSG-013-06]
  - REQ-MSG-014: [AC-MSG-014-02]
architecture:
  - ADR-005   # RLS — a client is reminded/notified only about their own overdue requests
  - ADR-003   # SESSION_CONTEXT — detection runs server-side; reminder config writes under the accountant principal
  - ADR-018   # data retention / lifecycle — overdue state derives from the engagement/document-request due dates
  - ADR-023   # provider seam — any scheduler/timer is consumed behind a mockable, time-injectable seam (deterministic tests)
  - ADR-006   # monorepo — cadence configuration is an apps/admin setting; client sees the resulting nudges on apps/portal
  - ADR-012   # testing pyramid — auto-detection + per-engagement-precedence are tier-3 gates
depends_on: [EPIC-016, EPIC-011, EPIC-013]
source:
  - .requirements/REQ-MSG-018.md
  - .requirements/REQ-DASH-008.md
  - .requirements/REQ-FILE-012.md
  - .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - .architecture/decisions/ADR-023-provider-seam-mock-first-integration.md
open_questions: []
---

# EPIC-019 — Overdue detection & reminder engine — auto-detect, configurable cadence

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice gives the accountant an **engine that chases clients for her**. The system **automatically
detects** document requests that have passed their due date — without her initiating the check — flags them
as overdue, and **raises reminders**. She controls the **cadence**: a **global default** frequency for
overdue-request reminders, plus a **per-engagement override** that takes precedence for that engagement.
The reminder trigger drives the notification types that depend on it: the accountant is notified when a
document request becomes **overdue** and when an engagement is **approaching its due date**, and the client
is notified when a **document request is created** for them. All of these surface through the EPIC-016 feed
and respect the EPIC-018 email-digest model. This is the detection/orchestration capability the requirements
call out as the precursor that REQ-MSG-019 (v2) later generalizes into a lifecycle-wide accountability
engine — that generalization stays deferred.

> **Detection + cadence scope.** This epic owns the automatic overdue detection, the configurable cadence,
> and the reminder-driven notification types. It does **not** build the dashboard needs-action / activity
> surfacing of overdue items (REQ-DASH-002/-003) — that is **EPIC-020**, which consumes the overdue state
> this engine produces.

## Requirements delivered

- **REQ-FILE-012 — Overdue document-request detection & flagging**
  - **AC-FILE-012-01** — the system identifies document requests that are overdue.
  - **AC-FILE-012-02** — an overdue document request is flagged/surfaced as overdue.
  - **AC-FILE-012-03** — overdue detection happens without the accountant initiating the check.
  - **AC-FILE-012-04** — the overdue determination is based on the document request's due date.
- **REQ-MSG-018 — Auto-reminders for overdue document requests**
  - **AC-MSG-018-01** — the system automatically identifies overdue document requests without the accountant initiating the check.
  - **AC-MSG-018-02** — an overdue document request results in a reminder being raised.
  - **AC-MSG-018-03** — the accountant can configure the reminder frequency as a global default.
  - **AC-MSG-018-04** — she can override the frequency per engagement, taking precedence over the global default for that engagement.
- **REQ-DASH-008 — Configurable overdue-reminder frequency**
  - **AC-DASH-008-01** — the accountant can set a global default frequency for overdue document-request reminders.
  - **AC-DASH-008-02** — she can set a reminder frequency for an individual engagement.
  - **AC-DASH-008-03** — a per-engagement frequency takes precedence over the global default for that engagement.
- **REQ-MSG-013 — Accountant notification types** (reminder-driven)
  - **AC-MSG-013-05** — the accountant is notified when a document request becomes overdue.
  - **AC-MSG-013-06** — the accountant is notified when an engagement is approaching its due date.
- **REQ-MSG-014 — Client notification types** (reminder-driven)
  - **AC-MSG-014-02** — a client is notified when a document request is created for them.

## Architecture adherence
- **ADR-005 — RLS via security policies.** A client is reminded/notified only about **their own** overdue
  and document-request events; the reminder fan-out honors per-viewer isolation (reuses the EPIC-016 client
  notification branch). Tier-3 gate.
- **ADR-003 — SESSION_CONTEXT.** Detection runs server-side; reminder-cadence writes (global + per-engagement)
  run under the accountant principal via the `packages/db` wrapper.
- **ADR-018 — Data retention / lifecycle.** Overdue is **derived** from the document request's due date and
  the engagement due date set in EPIC-011 — no new clock; the engine reads the existing lifecycle attributes.
- **ADR-023 — Provider seam, mock-first.** Any scheduler/timer driving periodic detection is consumed behind
  a **time-injectable** seam so "becomes overdue at the due date" and cadence intervals are **deterministically
  testable** without wall-clock waits.
- **ADR-006 — Monorepo, two apps.** Cadence configuration is an `apps/admin` setting; resulting client
  nudges surface on `apps/portal`.
- **ADR-012 — Testing pyramid.** Auto-detection (no manual trigger) and per-engagement-precedence are tier-3
  service/integration gates; the cadence-configuration journeys are tier-6 e2e.

## Acceptance scenarios

### AC-FILE-012-01 — Overdue requests are identified
```gherkin
Given a document request whose due date has passed and that is unfulfilled
When the system evaluates document requests
Then that request is identified as overdue
```

### AC-FILE-012-02 — Overdue requests are flagged
```gherkin
Given a document request identified as overdue
When the accountant views the request
Then it is flagged/surfaced as overdue
```

### AC-FILE-012-03 — Detection needs no manual trigger
```gherkin
Given a document request becomes overdue
When no one has initiated an overdue check
Then the system still identifies it as overdue on its own
```

### AC-FILE-012-04 — Overdue is based on the due date
```gherkin
Given two document requests, one past its due date and one not
When overdue is evaluated
Then only the one past its due date is treated as overdue
```

### AC-MSG-018-01 — System auto-identifies overdue requests
```gherkin
Given unfulfilled document requests with elapsed due dates
When the reminder engine runs without the accountant initiating it
Then it identifies the overdue requests automatically
```

### AC-MSG-018-02 — Overdue request raises a reminder
```gherkin
Given a document request identified as overdue
When the engine processes it
Then a reminder is raised about it
```

### AC-MSG-018-03 — Global default reminder frequency
```gherkin
Given the accountant configuring reminders
When she sets a global default reminder frequency
Then overdue reminders are raised at that frequency by default across engagements
```

### AC-MSG-018-04 — Per-engagement override takes precedence
```gherkin
Given a global default reminder frequency and an engagement with its own override
When reminders are raised for that engagement
Then the per-engagement frequency is used in place of the global default
```

### AC-DASH-008-01 — Set the global default frequency
```gherkin
Given the accountant on her settings surface
When she sets a global default overdue-reminder frequency
Then that global default is recorded and applies where no override exists
```

### AC-DASH-008-02 — Set a per-engagement frequency
```gherkin
Given the accountant viewing an individual engagement
When she sets an overdue-reminder frequency for that engagement
Then that engagement carries its own reminder frequency
```

### AC-DASH-008-03 — Per-engagement frequency wins
```gherkin
Given an engagement with a reminder frequency that differs from the global default
When the precedence is evaluated for that engagement
Then the per-engagement frequency takes precedence over the global default
```

### AC-MSG-013-05 — Accountant notified of an overdue request
```gherkin
Given a document request that has become overdue
When the engine processes it
Then the accountant receives an in-portal overdue notification
```

### AC-MSG-013-06 — Accountant notified of an approaching due date
```gherkin
Given an engagement approaching its due date
When the engine evaluates upcoming deadlines
Then the accountant receives an in-portal due-date-approaching notification
```

### AC-MSG-014-02 — Client notified a document request was created
```gherkin
Given the accountant creates a document request for a client
When the request is created
Then that client receives an in-portal notification that a document request was created for them
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-FILE-012-NN` / `AC-MSG-018-NN` / `AC-DASH-008-NN` / `AC-MSG-013-05` /
  `AC-MSG-013-06` / `AC-MSG-014-02` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration (tier 3)** — AC-FILE-012-01/-03/-04, AC-MSG-018-01/-02/-04, AC-DASH-008-03
    (precedence), AC-MSG-013-05/-06, AC-MSG-014-02 (with the time-injectable seam for deterministic
    "becomes overdue" / cadence assertions).
  - **e2e (tier 6)** — AC-FILE-012-02 (overdue shown), AC-MSG-018-03, AC-DASH-008-01/-02 (cadence config).

## Out of scope
- **Lifecycle-wide proactive follow-up & the consolidated "what's needed from you" client view**
  (REQ-MSG-019) → **v2 / Deferred**. This engine is the overdue-document subset that REQ-MSG-019 generalizes.
- **Dashboard needs-action / activity-feed surfacing of overdue items** (REQ-DASH-002/-003) → **EPIC-020**.
- **The notification feed mechanism & email digest** → **EPIC-016 / EPIC-018**; this slice emits reminder
  notifications into them.
- **The engagement due-date attribute itself** (REQ-LIFE-007) — already delivered in **EPIC-011**; consumed
  here, not re-built.

## Links
- Requirements: REQ-MSG-018, REQ-DASH-008, REQ-FILE-012, REQ-MSG-013 (-05/-06), REQ-MSG-014 (-02)
- Architecture: ADR-003, ADR-005, ADR-006, ADR-012, ADR-018, ADR-023
- Personas: `personas/jane-accountant.md` (stops chasing by hand), `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md` (nudged about what they owe)
- Flows: `flows/flow-notification-feed.md` (reminder branch); relates `flows/flow-document-lifecycle.md`, `flows/flow-engagement-lifecycle.md`
- Epics: depends on EPIC-016 (feed), EPIC-011 (engagement due date), EPIC-013 (documents / requests); feeds EPIC-020 (needs-action)
- Open questions: none

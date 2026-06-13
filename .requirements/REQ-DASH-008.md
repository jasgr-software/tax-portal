---
id: REQ-DASH-008
title: Configurable overdue-reminder frequency
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-008
  - seed/intake.md
open_questions: []
---

# REQ-DASH-008 — Configurable overdue-reminder frequency

## User need
When a requested document is overdue the system nudges the client with reminders. How often those
reminders go out is a judgement call — some clients or situations warrant gentle pacing, others need
more frequent prompting. The accountant needs to control that cadence rather than have it fixed.

## Proposed solution
The accountant can configure how frequently overdue document-request reminders are issued. She can set a
global default frequency that applies across engagements, and she can override the frequency for an
individual engagement. A per-engagement setting takes precedence over the global default for that
engagement.

## Acceptance criteria
- **AC-DASH-008-01** — The accountant can set a global default frequency for overdue document-request
  reminders.
- **AC-DASH-008-02** — The accountant can set an overdue-reminder frequency for an individual engagement.
- **AC-DASH-008-03** — A per-engagement reminder frequency takes precedence over the global default for
  that engagement.

## Links
- Related: REQ-FILE-012 (overdue document-request reminders — File Exchange), REQ-MSG-018 (reminder
  messaging)
- Open questions: none

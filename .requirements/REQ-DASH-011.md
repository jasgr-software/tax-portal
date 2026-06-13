---
id: REQ-DASH-011
title: Manage engagement requests
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-011
  - seed/intake.md
open_questions: []
---

# REQ-DASH-011 — Manage engagement requests

## User need
Prospective clients submit engagement requests through the public front door. The accountant needs a
single place to review those requests, see which are still waiting on her, and keep track of which she
has accepted and which she has declined.

## Proposed solution
The admin UI lets the accountant view and manage all engagement requests. Requests are distinguishable
by their state — pending, accepted, or declined — so she can see what is awaiting a decision and review
the history of past decisions.

## Acceptance criteria
- **AC-DASH-011-01** — The accountant can view all engagement requests from the admin UI.
- **AC-DASH-011-02** — Engagement requests are distinguishable by state: pending, accepted, and declined.
- **AC-DASH-011-03** — The accountant can identify which requests are pending a decision.

## Links
- Related: REQ-DASH-003 (needs-action items), REQ-DOOR-002 (services catalog)
- Open questions: none

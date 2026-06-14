---
id: REQ-FILE-014
title: Legal hold suspends purge indefinitely until explicitly lifted
domain: FILE
type: feature
status: accepted
source:
  - design-session-2026-06-14#part-a-legal-hold
open_questions: []
---

# REQ-FILE-014 — Legal hold suspends purge indefinitely until explicitly lifted

## User need
Occasionally a client engagement may be involved in, or at risk of, litigation or regulatory inquiry.
In those situations the accountant must be able to freeze purge eligibility — preventing any
destruction of the engagement record regardless of how old it is — until the matter is resolved. A
retention window expiring during an active dispute must not silently open the door to accidental data
destruction.

## Proposed solution
The accountant can place a legal hold on an engagement (or on a client, which extends the hold to all
their engagements). A legal hold immediately suspends purge eligibility for the affected engagement(s),
overriding the retention clock entirely — the engagement cannot be purged while the hold is active, even
if the 7-year retention window has elapsed. The hold persists indefinitely until the accountant
explicitly lifts it. Placing and lifting a legal hold are both recorded in the audit trail (see
REQ-NFR-010).

## Acceptance criteria
- **AC-FILE-014-01** — The accountant can place a legal hold on an individual engagement.
- **AC-FILE-014-02** — The accountant can place a legal hold on a client, which applies the hold to all
  of that client's engagements.
- **AC-FILE-014-03** — An engagement under legal hold cannot be purged, even if its 7-year retention
  window has elapsed and it would otherwise be purge-eligible (REQ-FILE-013).
- **AC-FILE-014-04** — A legal hold remains in effect indefinitely until the accountant explicitly lifts
  it; it does not expire automatically.
- **AC-FILE-014-05** — The accountant can lift a legal hold on an engagement or client; lifting a hold
  restores normal purge eligibility if the retention window has elapsed.
- **AC-FILE-014-06** — Placing a legal hold is recorded in the audit trail (who placed the hold, on
  what, and when).
- **AC-FILE-014-07** — Lifting a legal hold is recorded in the audit trail (who lifted the hold, on
  what, and when).

## Links
- Related: REQ-FILE-013 (post-retention purge), REQ-FILE-005 (7-year retention window),
  REQ-FILE-015 (retention-vs-erasure precedence), REQ-NFR-010 (audit trail)
- Open questions: none

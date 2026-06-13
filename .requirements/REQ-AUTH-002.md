---
id: REQ-AUTH-002
title: Accountant has full visibility
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-002
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-002 — Accountant has full visibility

## User need
The accountant runs the entire practice herself and uses the portal as her daily work surface. To stay
on top of every client relationship she needs an unobstructed view of everything happening in the
system — every client, every engagement, and the work attached to it — without anything being hidden
or partitioned away from her.

## Proposed solution
The ACCOUNTANT role has complete visibility across the whole system: all clients, all engagements, and
the data belonging to them. No client or engagement is concealed from the accountant.

## Acceptance criteria
- **AC-AUTH-002-01** — The ACCOUNTANT can view every client account in the system.
- **AC-AUTH-002-02** — The ACCOUNTANT can view every engagement and its associated data, regardless of
  which client it belongs to.
- **AC-AUTH-002-03** — No client or engagement is hidden from the ACCOUNTANT by any visibility or
  partitioning rule.

## Links
- Related: REQ-AUTH-001 (two roles), REQ-AUTH-003 (client data restriction)
- Open questions: none

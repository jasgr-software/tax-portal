---
id: REQ-DOOR-008
title: Decline sends a reason message to the prospect
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-008
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-008 — Decline sends a reason message to the prospect

## User need
When the accountant turns down a request, the prospective client deserves a courteous, human reason
rather than silence. The accountant wants to explain briefly why she can't take the engagement on, and
the prospect needs to receive that explanation so they know where they stand.

## Proposed solution
When the accountant declines an engagement request, she writes a brief message explaining the reason.
That message is sent to the prospective client by email. Because the prospect has no portal account, the
explanation reaches them outside the portal. The accountant's copy of the decline reason is retained in
the portal, attached to the declined request record, so she keeps an internal record of why each request
was turned down.

## Acceptance criteria
- **AC-DOOR-008-01** — Declining a request lets the accountant write a brief free-text reason message.
- **AC-DOOR-008-02** — The decline reason message is sent to the prospective client's contact email.
- **AC-DOOR-008-03** — The prospect receives the decline explanation without needing a portal account.
- **AC-DOOR-008-04** — The decline reason is retained in the portal, attached to the declined request
  record, and remains visible to the accountant for her reference.

## Notes
- **OQ-001 resolved (2026-06-13):** the decline reason is retained in the portal with the declined
  request record (option: retain with the request). The prospect remains accountless; retention is for
  the accountant's records only.

## Links
- Related: REQ-DOOR-006 (accept/decline), REQ-DOOR-007 (acceptance path)
- Open questions: none

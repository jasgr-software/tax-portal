---
id: REQ-DOOR-008
title: Decline sends a reason message to the prospect
domain: DOOR
type: feature
status: clarifying
source:
  - seed/SRS-snapshot.md#REQ-DOOR-008
  - seed/intake.md
open_questions: [OQ-001]
---

# REQ-DOOR-008 — Decline sends a reason message to the prospect

## User need
When the accountant turns down a request, the prospective client deserves a courteous, human reason
rather than silence. The accountant wants to explain briefly why she can't take the engagement on, and
the prospect needs to receive that explanation so they know where they stand.

## Proposed solution
When the accountant declines an engagement request, she writes a brief message explaining the reason.
That message is sent to the prospective client by email. Because the prospect has no portal account, the
explanation reaches them outside the portal.

Whether the accountant's own copy of that decline message is retained in the portal for her records is
an unresolved retention/audit question — see Open questions below.

## Acceptance criteria
- **AC-DOOR-008-01** — Declining a request lets the accountant write a brief free-text reason message.
- **AC-DOOR-008-02** — The decline reason message is sent to the prospective client's contact email.
- **AC-DOOR-008-03** — The prospect receives the decline explanation without needing a portal account.

## Open questions
- **OQ-001 (unresolved — pending user decision):** On decline, is the message retained in the portal for
  the accountant's records, or is it email-only with no portal retention? This is a data-retention /
  audit-scope carve-out and is not resolved here; it awaits a product-owner decision. Until resolved,
  this requirement stays `clarifying` and AC coverage for any portal-side retention of the decline
  message is deliberately omitted.

## Links
- Related: REQ-DOOR-006 (accept/decline), REQ-DOOR-007 (acceptance path)
- Open questions: OQ-001

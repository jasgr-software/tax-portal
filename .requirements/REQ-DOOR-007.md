---
id: REQ-DOOR-007
title: Acceptance invites the prospect to create an account
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-007
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-007 — Acceptance invites the prospect to create an account

## User need
Once the accountant agrees to take on a prospective client, that person needs a way into the portal as a
real client. Because no account was created at request time, acceptance has to bridge the prospect from
"anonymous requester" to "invited client" so onboarding can begin.

## Proposed solution
When the accountant accepts an engagement request, the product sends an invitation to the prospective
client, by email, inviting them to create their portal account on the client surface. Accepting the
invitation is the moment the prospect becomes an account-holding client.

## Acceptance criteria
- **AC-DOOR-007-01** — Accepting an engagement request sends an invitation to the prospective client's
  contact email.
- **AC-DOOR-007-02** — The invitation directs the recipient to create their own portal account on the
  client surface.
- **AC-DOOR-007-03** — A portal client account comes into existence only after the invited prospect
  acts on the invitation, not at the moment of acceptance.
- **AC-DOOR-007-04** — The invitation is tied to the accepted request so the resulting account is
  associated with that engagement.

## Links
- Related: REQ-DOOR-006 (accept/decline), REQ-AUTH-001 (invitation-only client accounts), REQ-ONBD-001 (onboarding begins)
- Open questions: none

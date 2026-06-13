---
id: REQ-AUTH-005
title: Optional two-factor for clients
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-005
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-005 — Optional two-factor for clients

## User need
Clients vary widely in how comfortable they are with technology. Security-conscious clients should be
able to add extra protection to their account, but requiring it of everyone would create a barrier that
turns people away at sign-up. The choice should rest with the client.

## Proposed solution
Two-factor authentication is optional for CLIENT accounts. A client may choose to enroll a second
factor for added protection, but it is never required — sign-up and sign-in complete without it.

## Acceptance criteria
- **AC-AUTH-005-01** — A CLIENT may enroll a second authentication factor for their account.
- **AC-AUTH-005-02** — A CLIENT can complete both sign-up and sign-in without enrolling a second
  factor; it is never forced on them.

## Links
- Related: REQ-AUTH-004 (mandatory 2FA for the accountant), REQ-AUTH-006 (invitation-only clients)
- Open questions: none

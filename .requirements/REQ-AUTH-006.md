---
id: REQ-AUTH-006
title: Clients are invitation-only
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-006
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-006 — Clients are invitation-only

## User need
The accountant decides who becomes a client. The portal is not an open sign-up site — a person becomes
a client only after the accountant has reviewed their request and agreed to work with them. Anyone
being able to self-register would undermine that control and pollute her client list.

## Proposed solution
A CLIENT account can be created only through an invitation that the accountant issues, which happens
when she accepts an engagement request. There is no public or self-service way to create a CLIENT
account.

## Acceptance criteria
- **AC-AUTH-006-01** — A CLIENT account can be created only via an invitation issued by the accountant.
- **AC-AUTH-006-02** — There is no public or self-service registration path through which a person can
  create their own CLIENT account.
- **AC-AUTH-006-03** — The invitation that enables CLIENT account creation originates from the
  accountant accepting an engagement request.

## Links
- Related: REQ-AUTH-001 (two roles), REQ-DOOR-* (engagement request acceptance — Front Door domain)
- Open questions: none

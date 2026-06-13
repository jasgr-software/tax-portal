---
id: REQ-AUTH-003
title: Clients see only their own data
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-003
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-003 — Clients see only their own data

## User need
Clients are trusting the accountant with sensitive financial information. A client must be confident
that no other client can ever see their engagements, documents, or messages — and that they themselves
cannot stumble into anyone else's. This boundary is the foundation of the portal's privacy promise.

## Proposed solution
A CLIENT can access only the engagements they participate in and the data belonging to those
engagements. Access to any other client's information is impossible through every avenue the portal
offers — not just the main screens, but listings, searches, and direct references as well.

## Acceptance criteria
- **AC-AUTH-003-01** — A CLIENT can access only the engagements in which they are a participant, and
  the data (documents, messages, engagement details) belonging to those engagements.
- **AC-AUTH-003-02** — A CLIENT cannot view, list, search, or otherwise reach any other client's
  engagements or data through any portal function.
- **AC-AUTH-003-03** — The restriction holds across every access path, including direct references to a
  specific record, not only the primary navigation.

## Links
- Related: REQ-AUTH-002 (accountant full visibility), REQ-AUTH-007 (engagement participants)
- Open questions: none

---
id: REQ-AUTH-008
title: Indefinite client access after completion
domain: AUTH
type: feature
status: clarifying
source:
  - seed/SRS-snapshot.md#REQ-AUTH-008
  - seed/intake.md
open_questions: [OQ-004]
---

# REQ-AUTH-008 — Indefinite client access after completion

## User need
A client's relationship with their accountant doesn't end the moment a return is filed. Months or years
later they may need to retrieve a prior year's documents, re-read a message, or reference a completed
engagement. Clients should be able to come back and look at their own history whenever they need it,
without having to ask the accountant to dig it out.

## Proposed solution
After an engagement is marked complete, its CLIENT participant(s) keep the ability to sign in and view
that engagement and its associated data indefinitely. Completion ends the active work, not the client's
access to their own history.

## Acceptance criteria
- **AC-AUTH-008-01** — After an engagement is marked complete, its CLIENT participant(s) retain the
  ability to sign in to the portal.
- **AC-AUTH-008-02** — A CLIENT can view their historical (completed) engagements and their associated
  data indefinitely after completion.

## Open questions
- **OQ-004** — Indefinite access here is in tension with the accountant's ability to hard-delete a
  client and all associated data, and with the document-retention rule. The precedence between
  indefinite access, hard deletion, and retention is unresolved and requires a user decision (a
  data-deletion / retention / access-control carve-out). Until resolved, the behavior when a deletion
  is requested against an indefinitely-accessible history is undefined.

## Links
- Related: REQ-AUTH-007 (engagement participants), REQ-FILE-005 (document retention — File Exchange),
  REQ-IDNT-005 (client hard delete — Identity & Settings)
- Open questions: OQ-004

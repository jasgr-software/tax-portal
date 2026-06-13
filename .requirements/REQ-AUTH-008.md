---
id: REQ-AUTH-008
title: Indefinite client access after completion
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-008
  - seed/intake.md
open_questions: []
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
access to their own history. In v1 there is no permanent deletion of a client or their data (deferred —
see OQ-004 / REQ-IDNT-005), so this access holds unconditionally, and the data also remains under the
7-year retention rule (REQ-FILE-005).

## Acceptance criteria
- **AC-AUTH-008-01** — After an engagement is marked complete, its CLIENT participant(s) retain the
  ability to sign in to the portal.
- **AC-AUTH-008-02** — A CLIENT can view their historical (completed) engagements and their associated
  data indefinitely after completion.

## Notes
- **OQ-004 resolved (2026-06-13 — defer):** permanent hard-delete of a client/data is deferred from
  v1, so indefinite access is no longer in tension with deletion or retention. v1 keeps client data per
  the 7-year retention rule and preserves client access; true permanent deletion is a later-version
  concern.

## Links
- Related: REQ-AUTH-007 (engagement participants), REQ-FILE-005 (document retention — File Exchange),
  REQ-IDNT-005 (client hard delete — deferred from v1, Identity & Settings)
- Open questions: none

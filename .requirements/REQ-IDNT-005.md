---
id: REQ-IDNT-005
title: Permanent client deletion (deferred from v1)
domain: IDNT
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-005
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-005 — Permanent client deletion (deferred from v1)

## User need
Occasionally a client relationship ends in a way where the accountant wants to permanently remove that
client and everything associated with them — for example, on the client's explicit request to be
forgotten. This is a genuine future need. However, it sits in direct tension with two firm commitments:
documents must be retained for seven years after an engagement completes (REQ-FILE-005), and clients keep
indefinite access to their own history (REQ-AUTH-008). Resolving that tension is a policy and legal
decision, not a routine product choice.

## Proposed solution
Permanent ("hard") deletion of a client and all associated data is **deferred from v1 and is not built in
v1**. In v1, client data is retained according to the 7-year document-retention rule (REQ-FILE-005) and
clients keep indefinite access to their own engagements and history (REQ-AUTH-008) — there is no
mechanism to permanently erase a client or their data. True permanent deletion is a later-version
concern, to be designed once the retention/legal precedence policy is settled (does a hard delete
override the 7-year retention rule? are stored files physically erased or only their records? when does
the legal hold lift?).

## Acceptance criteria
- **AC-IDNT-005-01** — v1 provides no capability to permanently delete a client or their associated data;
  permanent deletion is deferred from v1.
- **AC-IDNT-005-02** — In v1, a client's data remains retained in accordance with the 7-year retention
  rule (REQ-FILE-005) and the client retains indefinite access to their own history (REQ-AUTH-008); no v1
  action erases that data.
- **AC-IDNT-005-03** — The permanent-deletion capability is recorded as a later-version concern whose
  precedence over the retention rule and whose treatment of stored files must be decided by an explicit
  retention/legal policy before it is designed or built.

## Notes
- **Permanent deletion is DEFERRED from v1 and is NOT built in v1.** In v1, client data is retained per
  the 7-year retention rule (REQ-FILE-005) and clients keep indefinite access (REQ-AUTH-008).
- **OQ-004 resolved (2026-06-13 — defer):** the conflict between hard delete, 7-year retention, and
  indefinite client access is resolved for v1 by deferring permanent deletion entirely. This is a settled
  decision; this requirement is not a clarifying item. The original clarification (CLARIF-005 in the seed)
  — precedence of deletion over retention, and whether stored files are physically erased — is carried
  forward as the design question for the later-version effort.

## Links
- Related: REQ-FILE-005 (7-year document retention), REQ-AUTH-008 (indefinite client access),
  REQ-NFR-006 (retention enforced programmatically)
- Open questions: none (OQ-004 resolved — defer)

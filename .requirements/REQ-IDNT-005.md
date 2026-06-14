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
- **OQ-004 resolved (2026-06-13 — defer); addendum 2026-06-14:** the 2026-06-14 decision brought
  post-retention document/engagement purge into v1 (REQ-FILE-013), but that is a narrower capability —
  purge of a specific engagement's data after the retention window. This requirement (wholesale permanent
  deletion of a client identity and all associated history) remains deferred from v1 and is unaffected
  by the 2026-06-14 decision. The two capabilities are related but distinct: REQ-FILE-013 handles
  engagement-level post-retention purge; this requirement handles the future client-identity erasure
  path. When REQ-IDNT-005 is eventually designed, the interaction with REQ-FILE-013, REQ-FILE-014
  (legal hold), and REQ-FILE-015 (precedence rule) must be considered.

## Links
- Related: REQ-FILE-005 (7-year document retention), REQ-AUTH-008 (indefinite client access),
  REQ-NFR-006 (retention enforced by system), REQ-FILE-013 (engagement-level post-retention purge —
  related but narrower; in v1), REQ-FILE-014 (legal hold), REQ-FILE-015 (retention-vs-erasure
  precedence)
- Open questions: none (OQ-004 resolved — defer; 2026-06-14 purge decision does not affect this deferral)

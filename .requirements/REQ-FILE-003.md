---
id: REQ-FILE-003
title: Files are encrypted at rest and never publicly accessible
domain: FILE
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-003
  - seed/intake.md
open_questions: []
---

# REQ-FILE-003 — Files are encrypted at rest and never publicly accessible

## User need
The documents clients entrust to the portal are among the most sensitive data a person owns — Social
Security numbers, income, bank details, dependents. The whole reason for replacing email is security.
Clients and the accountant must be able to trust that stored files are protected and that nobody can
reach a file simply by guessing or sharing a link.

## Proposed solution
Stored files are encrypted at rest. Files are never publicly accessible: every download is authorized
against the requester's permission to that engagement's documents, and any access grant is time-limited
rather than open-ended. A link or reference to a file cannot, on its own, grant lasting or anonymous
access to the file.

## Acceptance criteria
- **AC-FILE-003-01** — Stored files are encrypted at rest.
- **AC-FILE-003-02** — A file cannot be retrieved without an authorization check confirming the
  requester is permitted to access that engagement's documents.
- **AC-FILE-003-03** — No file is reachable through an anonymous or public path; access is never granted
  to an unauthenticated, unauthorized requester.
- **AC-FILE-003-04** — Any access grant to a file is time-limited and ceases to work after it expires.

## Notes
- This requirement states security properties as outcomes. The specific cryptographic algorithm and the
  access-grant mechanism are implementation choices and are deliberately not specified here.

## Links
- Related: REQ-FILE-001 (download authorization), REQ-AUTH-003 (client data restriction)
- Open questions: none

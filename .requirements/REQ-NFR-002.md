---
id: REQ-NFR-002
title: Files are never publicly accessible
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-002
  - seed/intake.md
open_questions: []
---

# REQ-NFR-002 — Files are never publicly accessible

## User need
The documents exchanged in the portal — tax returns, W-2s, financial statements — are among the most
sensitive a person holds. None of them may ever be reachable by an anonymous or unauthorized party. A
file must only be retrievable by someone the system has authorized for that specific file, and that
permission must not be open-ended.

## Normative criterion
- **AC-NFR-002-01** — No stored file is ever served through a public or unauthenticated link; every file
  retrieval requires the requester to be authorized for that file, and the granted access is
  time-limited rather than permanent.

## Notes
- This captures the underlying property — authorized, time-limited, never-public file access. The
  specific access mechanism is an implementation decision recorded outside this spec.

## Links
- Related: REQ-FILE-003 (files accessed only via authorized, non-public links — File Exchange),
  REQ-NFR-001 (tenant isolation)
- Open questions: none

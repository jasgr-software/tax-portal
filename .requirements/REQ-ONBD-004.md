---
id: REQ-ONBD-004
title: Initial document upload follows a checklist
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-004
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-004 — Initial document upload follows a checklist

## User need
To begin work, the accountant needs specific documents from the client, and which documents she needs
varies per engagement. The client needs to know exactly what to provide and to be able to see what's
still outstanding, rather than guessing. The accountant needs assurance that the client has supplied the
agreed starting set before onboarding is considered done.

## Proposed solution
The third onboarding step requires the client to upload documents according to a document checklist the
accountant has defined for that engagement. The client can see the checklist and which items are still
outstanding versus provided. The step is satisfied when the client has supplied the required documents on
the checklist.

## Acceptance criteria
- **AC-ONBD-004-01** — During the initial document upload step, the client is shown the document
  checklist the accountant defined for that engagement.
- **AC-ONBD-004-02** — The client can see which checklist items are still outstanding and which have been
  provided.
- **AC-ONBD-004-03** — The client can upload documents to fulfill checklist items.
- **AC-ONBD-004-04** — The document upload step is satisfied when the required checklist items for the
  engagement have been provided.

## Links
- Related: REQ-ONBD-001 (three sequential steps), REQ-ONBD-005 (onboarding complete),
  REQ-FILE-008 (document checklist — File Exchange)
- Open questions: none

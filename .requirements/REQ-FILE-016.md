---
id: REQ-FILE-016
title: Prior-year-based expected-document detection
domain: FILE
type: feature
status: accepted
source:
  - seed/vision-expansion.md#biggest-opportunity
  - seed/vision-expansion.md#author-guidance-notes
open_questions: []
---

# REQ-FILE-016 — Prior-year-based expected-document detection

## User need
A returning client usually needs to provide many of the same documents year over year. Today the accountant
reconstructs each year's document checklist from memory or by digging through last year's files. She wants
the system to look at what a client provided in a prior year's engagement and proactively flag the documents
it expects this year — so missing items surface early instead of late, and she is not the one having to
remember "they had a brokerage 1099 last year."

## Proposed solution
When a client has a prior comparable engagement in the portal (same service type, an earlier tax year), the
system uses the set of document *types* provided in that prior engagement to identify documents expected for
the current engagement, and flags those not yet provided as expected-but-missing. This is a
detection/suggestion aid built on documents the portal already holds; it relies only on the presence and
type of prior documents, not on reading or interpreting their financial content. The accountant stays in
control — detected expectations are surfaced for her to confirm (turn into a document request) or dismiss.

## Acceptance criteria
- **AC-FILE-016-01** — When a client has a prior comparable engagement (same service type, earlier tax year)
  in the portal, the system identifies documents expected for the current engagement based on the document
  types provided in that prior engagement.
- **AC-FILE-016-02** — Expected documents not yet provided for the current engagement are flagged as
  expected-but-missing.
- **AC-FILE-016-03** — Detection relies only on the type/presence of prior documents, not on interpreting
  their financial content.
- **AC-FILE-016-04** — When no comparable prior engagement exists for the client, detection produces no
  expected-but-missing flags (a no-op, not an error).
- **AC-FILE-016-05** — The accountant can act on a detected expectation by turning it into a document
  request, or dismiss it; detection does not auto-create binding obligations without her involvement.

## Notes
- **v2 capability.** Reuses the document-request/checklist mechanism (REQ-FILE-007/008) and complements the
  dynamic organizer (REQ-ONBD-008) and the proactive follow-up engine (REQ-MSG-019).
- **"Not a tax-prep tool" boundary respected:** document-type detection only — no reading of return content.

## Links
- Related: REQ-FILE-007 (labeled document requests), REQ-FILE-008 (document checklist), REQ-ONBD-008 (dynamic
  organizer), REQ-MSG-019 (proactive follow-up engine), REQ-LIFE-010 (multiple engagements per client)
- Open questions: none

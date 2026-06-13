---
id: REQ-FILE-008
title: Per-engagement document checklist shows outstanding items
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-008
  - seed/intake.md
open_questions: []
---

# REQ-FILE-008 — Per-engagement document checklist shows outstanding items

## User need
A client juggling tax season needs a clear, at-a-glance picture of what they still owe their accountant.
Without it, documents get forgotten and the engagement stalls. The client needs a running checklist for
their engagement that makes "what's left to send" obvious.

## Proposed solution
Each engagement has a document checklist composed of its document requests. The client can see which
checklist items are still outstanding versus which have been fulfilled, so the remaining work is always
visible.

## Acceptance criteria
- **AC-FILE-008-01** — Each engagement has a document checklist reflecting its document requests.
- **AC-FILE-008-02** — A client participant can view the engagement's checklist and distinguish
  outstanding items from fulfilled ones.
- **AC-FILE-008-03** — When a document request is fulfilled, its checklist item is no longer shown as
  outstanding.

## Links
- Related: REQ-FILE-007 (document requests), REQ-ONBD-004 (onboarding document checklist),
  REQ-FILE-012 (overdue flagging)
- Open questions: none

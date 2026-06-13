---
id: REQ-MSG-006
title: Message threads kept forever, archived on close
domain: MSG
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-006
  - seed/intake.md
open_questions: []
---

# REQ-MSG-006 — Message threads kept forever, archived on close

## User need
The conversation history between an accountant and a client is a record of the working relationship and
may matter years later — for reference, for context on a past return, or for trust. Neither party
should ever lose access to what was said. Closing out an engagement should retire it from active work
without erasing the conversation.

## Proposed solution
Message threads are retained indefinitely and are never deleted as part of normal operation. When an
engagement closes, its thread is archived rather than deleted: it leaves the active working set but
remains fully accessible to its participants at all times.

## Acceptance criteria
- **AC-MSG-006-01** — Message threads are retained indefinitely; closing or completing an engagement
  does not delete its thread or any of its messages.
- **AC-MSG-006-02** — When an engagement closes, its thread is marked archived rather than deleted.
- **AC-MSG-006-03** — An archived thread remains fully readable by its participants at all times.

## Notes
- "Kept forever" is treated as a retention/deletion policy and is flagged for product-owner confirmation
  because it touches data-retention semantics. The provisional default follows the seed: indefinite
  retention, archive-not-delete on close. This is consistent with the v1 no-hard-delete stance in
  REQ-AUTH-008.

## Links
- Related: REQ-MSG-001 (engagement thread), REQ-AUTH-008 (indefinite client access), REQ-MSG-016 (notification history retention)
- Open questions: none

---
id: REQ-IDNT-004
title: Terms of service and privacy policy pages deferred to a later version
domain: IDNT
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-004
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-004 — Terms of service and privacy policy pages deferred to a later version

## User need
A mature client-facing service typically presents formal terms-of-service and privacy-policy pages. For
v1, the accountant has chosen to defer these standalone legal pages so the launch is not gated on legal
drafting. They are a recognized future want, set aside intentionally and tracked rather than dropped.

## Proposed solution
Dedicated terms-of-service and privacy-policy pages are explicitly deferred to a later version and are
out of scope for v1. No such standalone legal pages are delivered in v1; they remain a recorded future
capability.

## Acceptance criteria
- **AC-IDNT-004-01** — No standalone terms-of-service or privacy-policy page is delivered in v1.
- **AC-IDNT-004-02** — Terms-of-service and privacy-policy pages are retained as a recorded future
  capability for a later version.

## Notes
- This requirement concerns the *presence of dedicated legal pages*, not data-handling or retention
  behavior, which is governed by its own requirements (e.g. REQ-FILE-005).

## Links
- Related: REQ-IDNT-003 (branding deferred)
- Open questions: none

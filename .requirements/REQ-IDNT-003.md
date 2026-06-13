---
id: REQ-IDNT-003
title: Firm branding deferred to a later version
domain: IDNT
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-003
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-003 — Firm branding deferred to a later version

## User need
While a generic appearance is fine for v1 (see REQ-IDNT-002), the accountant does eventually want the
portal to carry her firm's identity — her logo, her colors, her firm name — so it feels like a seamless
part of her practice. This is a recognized future want, deliberately set aside for now so v1 can ship,
and should be tracked rather than forgotten.

## Proposed solution
Firm branding elements — logo, color scheme, and firm name presentation — are explicitly deferred to a
later version and are out of scope for v1. They remain a recorded future capability so they are not lost,
but no branding configuration is delivered in v1.

## Acceptance criteria
- **AC-IDNT-003-01** — Firm branding (logo, colors, firm name presentation) is out of scope for v1 and
  is not delivered in v1.
- **AC-IDNT-003-02** — Firm branding is retained as a recorded future capability for a later version.

## Links
- Related: REQ-IDNT-002 (generic appearance in v1)
- Open questions: none

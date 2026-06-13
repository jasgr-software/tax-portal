---
id: REQ-IDNT-002
title: Generic portal appearance in v1 (no firm branding)
domain: IDNT
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-002
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-002 — Generic portal appearance in v1 (no firm branding)

## User need
The accountant's priority for v1 is a working, trustworthy place to engage clients and exchange files —
not a polished marketing surface. Investing in custom firm branding (logo, color scheme, firm name
styling) is not worth delaying the launch. A clean, generic appearance is acceptable for v1 so the
practice can start using the portal sooner.

## Proposed solution
v1 of the portal presents a clean, generic appearance and does not require firm-specific branding
elements (logo, custom colors, or firm-name styling) to be present or configurable. The absence of firm
branding is an accepted v1 state, not a defect.

## Acceptance criteria
- **AC-IDNT-002-01** — The portal functions and is usable in v1 without any firm logo, custom color
  scheme, or firm-name styling configured.
- **AC-IDNT-002-02** — The lack of firm branding does not block or degrade any client-facing or
  accountant-facing capability in v1.

## Links
- Related: REQ-IDNT-003 (branding deferred to v2)
- Open questions: none

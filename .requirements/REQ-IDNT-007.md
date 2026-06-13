---
id: REQ-IDNT-007
title: Editable default engagement-letter template
domain: IDNT
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-007
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-007 — Editable default engagement-letter template

## User need
Every new client engagement begins with an engagement letter, and the accountant doesn't want to write
one from scratch each time. She wants the portal to start her off with a sensible default engagement
letter, and she wants to be able to adjust its wording to match her practice's standard terms — without
needing developer help — so the letter clients are asked to sign reflects how she actually does business.

## Proposed solution
The portal provides a built-in default engagement-letter template out of the box. The accountant can edit
this template's content herself through her own work surface, and her edited version becomes the basis
for the engagement letter that clients are asked to review and sign during onboarding. The default exists
so she is never starting from a blank page; editing exists so the letter can reflect her own terms.

## Acceptance criteria
- **AC-IDNT-007-01** — A system-provided default engagement-letter template exists and is available
  without the accountant having to author one from scratch.
- **AC-IDNT-007-02** — The accountant can edit the engagement-letter template's content herself.
- **AC-IDNT-007-03** — The accountant's edited template is what is used as the engagement letter presented
  to clients for signature in the onboarding flow.

## Notes
- The e-signature mechanism by which the letter is signed is governed by the onboarding requirements
  (see REQ-ONBD-002) and is out of scope here; this requirement covers only the existence and
  editability of the template as an accountant setting.

## Links
- Related: REQ-ONBD-002 (engagement-letter e-sign in onboarding), REQ-DASH-013 (accountant
  admin surface)
- Open questions: none

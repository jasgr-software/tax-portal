---
id: REQ-DASH-013
title: Engagement letter template management
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-013
  - seed/intake.md
open_questions: []
---

# REQ-DASH-013 — Engagement letter template management

## User need
Every accepted client signs an engagement letter before work begins. The accountant needs that letter
ready to go without writing it from scratch, but she also needs to be able to tailor its wording to her
practice. A sensible default she can edit gives her both.

## Proposed solution
The admin UI lets the accountant manage the engagement letter template. The system provides a default
template out of the box so onboarding can proceed immediately, and the accountant can edit that template
to suit her practice. The current template is what is presented to accepted clients for signature during
onboarding.

## Acceptance criteria
- **AC-DASH-013-01** — The system provides a default engagement letter template without the accountant
  having to author one.
- **AC-DASH-013-02** — The accountant can edit the engagement letter template from the admin UI.
- **AC-DASH-013-03** — The current engagement letter template is what is used for accepted clients during
  onboarding.

## Links
- Related: REQ-ONBD-002 (engagement letter e-sign — onboarding), REQ-IDNT-007 (default engagement letter
  template — Identity & Settings)
- Open questions: none

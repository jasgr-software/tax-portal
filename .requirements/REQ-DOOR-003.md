---
id: REQ-DOOR-003
title: Request form is a checklist of active services
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-003
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-003 — Request form is a checklist of active services

## User need
The accountant offers a small, prescribed set of services and does not want to triage open-ended,
freeform descriptions of what a prospective client thinks they need. A prospective client, in turn,
benefits from a simple "pick what applies" experience rather than guessing how to describe their needs.
Both sides are served by a constrained, predictable request form.

## Proposed solution
The engagement request form presents the accountant's currently active services as a checklist from
which the prospective client chooses. The form is not freeform and does not pose service-specific
follow-up questions; every requester sees the same checklist of services.

## Acceptance criteria
- **AC-DOOR-003-01** — The request form presents the currently active services as selectable checklist
  items.
- **AC-DOOR-003-02** — The form does not offer a freeform field for the requester to describe an
  arbitrary service need in place of selecting from the checklist.
- **AC-DOOR-003-03** — The form does not present service-specific sub-questions that vary by which
  service is selected.
- **AC-DOOR-003-04** — Deactivated services do not appear as checklist options on the request form.

## Links
- Related: REQ-DOOR-001 (services page), REQ-DOOR-002 (active services), REQ-DOOR-004 (submitting a request)
- Open questions: none

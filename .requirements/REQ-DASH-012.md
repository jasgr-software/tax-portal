---
id: REQ-DASH-012
title: Intake questionnaire template management
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-012
  - seed/intake.md
open_questions: []
---

# REQ-DASH-012 — Intake questionnaire template management

## User need
Different kinds of tax work require different information up front. The accountant needs to define the
intake questionnaire that a client completes during onboarding, tailored to each type of service she
offers, and to revise those questionnaires as her process evolves.

## Proposed solution
The admin UI lets the accountant create and manage intake questionnaire templates, with a template
defined per service type. She can author a new questionnaire template, edit an existing one, and the
appropriate template is what a client completes during onboarding for that service type.

## Acceptance criteria
- **AC-DASH-012-01** — The accountant can create an intake questionnaire template from the admin UI.
- **AC-DASH-012-02** — A questionnaire template is associated with a specific service type.
- **AC-DASH-012-03** — The accountant can edit an existing questionnaire template.

## Links
- Related: REQ-ONBD-003 (templated intake questionnaire — onboarding)
- Open questions: none

---
id: REQ-ONBD-003
title: Intake questionnaire is templated per service type
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-003
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-003 — Intake questionnaire is templated per service type

## User need
Different services need different background information from the client — what the accountant needs to
ask for a personal tax return differs from what she needs for a business return. The accountant wants to
ask the right questions for each service without rebuilding a questionnaire from scratch every time, and
the client should only be asked what's relevant to the service they requested.

## Proposed solution
The intake questionnaire presented to a client during onboarding is drawn from a template tied to the
engagement's service type. The accountant defines and maintains these questionnaire templates, one per
service type. When a client onboards, the questionnaire they complete is the one for their engagement's
service type. The questionnaire step is satisfied when the client submits their completed answers.

## Acceptance criteria
- **AC-ONBD-003-01** — The intake questionnaire a client completes corresponds to the service type of
  their engagement.
- **AC-ONBD-003-02** — The accountant can define and maintain a distinct questionnaire template for each
  service type.
- **AC-ONBD-003-03** — The questionnaire step is satisfied only when the client submits their completed
  questionnaire.
- **AC-ONBD-003-04** — The client's submitted answers are recorded against the engagement.

## Links
- Related: REQ-ONBD-001 (three sequential steps), REQ-DASH-012 (managing questionnaire templates)
- Open questions: none

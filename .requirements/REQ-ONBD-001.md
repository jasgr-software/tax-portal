---
id: REQ-ONBD-001
title: Onboarding is three sequential steps
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-001
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-001 — Onboarding is three sequential steps

## User need
When a newly accepted client first arrives, they need a clear, guided path to get started rather than
being dropped into the portal unsure of what to do. The accountant needs the same few things from every
new client before real work can begin — an agreement in place, background information, and the first
documents — so onboarding should walk the client through those in a predictable order.

## Proposed solution
Onboarding for an engagement consists of exactly three steps, completed in order:
(1) e-sign the engagement letter, (2) complete the intake questionnaire, and (3) upload the initial
required documents. The client progresses through the steps sequentially; a later step is not available
until the earlier steps it depends on are satisfied.

## Acceptance criteria
- **AC-ONBD-001-01** — Onboarding presents exactly three steps in this order: engagement-letter e-sign,
  intake questionnaire, initial document upload.
- **AC-ONBD-001-02** — The steps are sequential: the client cannot complete or skip ahead to a later
  step before the steps it depends on are done.
- **AC-ONBD-001-03** — The client can see their current position in the onboarding sequence and which
  steps remain.

## Links
- Related: REQ-ONBD-002 (engagement-letter hard gate), REQ-ONBD-003 (intake questionnaire),
  REQ-ONBD-004 (initial document upload), REQ-ONBD-005 (onboarding complete)
- Open questions: none

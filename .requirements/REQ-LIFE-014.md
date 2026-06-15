---
id: REQ-LIFE-014
title: Recurring engagements and year-over-year reminders
domain: LIFE
type: feature
status: accepted
source:
  - seed/vision-expansion.md#vision
  - seed/vision-expansion.md#author-guidance-notes
open_questions: []
---

# REQ-LIFE-014 — Recurring engagements and year-over-year reminders

## User need
Tax work is inherently recurring — most clients come back the next year for the same service. Today each
engagement is a discrete island: when a new tax year comes around, nothing prompts the client or the
accountant to start the next one, and the accountant has to remember to reach out. She wants the system to
treat returning clients as an ongoing relationship — reminding her (and prompting the client) when it's time
to begin the next year's engagement, and surfacing light, time-based reminders (e.g. an approaching filing
season) — without turning into a tax-planning calculator.

## Proposed solution
The system recognizes that a client's engagement for a service is likely to recur in future tax years and
supports year-over-year continuity: when a new tax year's engagement is due, it prompts the accountant to
initiate the next engagement for that client/service and can prompt the returning client toward starting it
(consistent with the returning-client request flow, REQ-DOOR-009). It supports time-based reminders tied to
recurring tax events. These are reminders and prompts only — the system performs no tax planning,
calculation, or projection (the "not a tax-prep tool" boundary stands).

## Acceptance criteria
- **AC-LIFE-014-01** — The system can associate a client's engagements for the same service across tax years
  as a recurring relationship.
- **AC-LIFE-014-02** — When a new tax year's engagement is due for a recurring client, the accountant is
  prompted to initiate it.
- **AC-LIFE-014-03** — A returning client can be prompted toward starting the next tax year's engagement,
  consistent with the returning-client request flow (REQ-DOOR-009).
- **AC-LIFE-014-04** — The system supports time-based reminders tied to recurring tax events (e.g. an
  approaching filing season).
- **AC-LIFE-014-05** — These capabilities are limited to reminders and prompts; the system performs no tax
  calculation, projection, or planning computation.

## Notes
- **v2 capability.** "Ongoing tax planning and reminders" from the vision, deliberately scoped to
  reminders/prompts to respect the product's non-goal of being a tax-prep/calculation tool.
- Complements the duplicate-engagement rule (REQ-LIFE-011, one per service/tax-year/client) and the
  returning-client flows (REQ-DOOR-009/010). Reminder delivery rides the notification model (REQ-MSG-007).

## Links
- Related: REQ-DOOR-009 (returning-client request flow), REQ-DOOR-010 (accountant initiates for returning
  client), REQ-LIFE-010 (multiple engagements per client), REQ-LIFE-011 (one per service/tax-year),
  REQ-MSG-019 (proactive follow-up engine)
- Open questions: none

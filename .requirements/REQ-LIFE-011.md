---
id: REQ-LIFE-011
title: One engagement per service type per tax year per client
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-011
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-011 — One engagement per service type per tax year per client

## User need
For a given client, a given service, and a given tax year, there should be exactly one engagement —
otherwise the accountant could end up with duplicate engagements for the same work, splitting documents
and messages across them and creating confusion about which one is the real one.

## Proposed solution
The system treats one engagement per (client, service type, tax year) as the norm. When a duplicate is
attempted for that same combination, the accountant is warned and shown the existing matching
engagement, and may either go to it or knowingly proceed (override) to create the second engagement. The
guard applies at the point of engagement creation — which is always the accountant's action; a returning
client's duplicate *request* simply surfaces to her as a request she can decline.

## Acceptance criteria
- **AC-LIFE-011-01** — One engagement per (client, service type, tax year) is the expected norm.
- **AC-LIFE-011-02** — When creation of an engagement matching an existing (client, service type, tax
  year) is attempted, the accountant is warned and shown the existing matching engagement before any
  second engagement is created.
- **AC-LIFE-011-03** — From that warning the accountant can either navigate to the existing engagement
  or deliberately override and create the second engagement.
- **AC-LIFE-011-04** — The system does not silently block the attempt nor silently redirect; the
  duplicate condition is always surfaced to the accountant for a decision.

## Notes
- **OQ-003 resolved (2026-06-13):** warn + allow override (not hard block, not silent redirect). The
  accountant retains judgment; the conflict is always surfaced.

## Links
- Related: REQ-LIFE-010 (multiple concurrent engagements for different service types), REQ-DOOR-009
  (returning-client new-engagement request), REQ-DOOR-010 (accountant-initiated engagement)
- Open questions: none

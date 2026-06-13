---
id: REQ-LIFE-011
title: One engagement per service type per tax year per client
domain: LIFE
type: feature
status: clarifying
source:
  - seed/SRS-snapshot.md#REQ-LIFE-011
  - seed/intake.md
open_questions: [OQ-003]
---

# REQ-LIFE-011 — One engagement per service type per tax year per client

## User need
For a given client, a given service, and a given tax year, there should be exactly one engagement —
otherwise the accountant could end up with duplicate engagements for the same work, splitting documents
and messages across them and creating confusion about which one is the real one.

## Proposed solution
The system permits at most one engagement for a given combination of client, service type, and tax
year. A second engagement for that same combination is not allowed to coexist. The precise behavior
when such a duplicate is attempted (block, redirect to the existing engagement, or warn-and-override)
is pending OQ-003.

## Acceptance criteria
- **AC-LIFE-011-01** — For a given client, service type, and tax year, at most one engagement exists.
- **AC-LIFE-011-02** — An attempt to create a second engagement for an existing
  (client, service type, tax year) combination does not result in two coexisting engagements for that
  combination.
- **AC-LIFE-011-03** — The system's response to a duplicate-creation attempt follows the behavior
  resolved in OQ-003.

## Open questions
- **OQ-003** — When a duplicate engagement is attempted for the same client, service type, and tax
  year, the intended behavior — block with an error, silently redirect to the existing engagement, or
  warn the accountant and allow override — is not yet decided and must be confirmed by the product
  owner.

## Links
- Related: REQ-LIFE-010 (multiple concurrent engagements for different service types)
- Open questions: OQ-003

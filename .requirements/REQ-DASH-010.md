---
id: REQ-DASH-010
title: Services catalog management
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-010
  - seed/intake.md
open_questions: []
---

# REQ-DASH-010 — Services catalog management

## User need
The services the accountant offers change over time — she adds new offerings, revises descriptions, and
retires ones she no longer provides. She needs to manage the catalog of services herself, without
depending on anyone else, so the public front door always reflects what she currently offers.

## Proposed solution
The admin UI lets the accountant manage the services catalog. She can add a new service, edit an
existing service, and deactivate a service so it is no longer offered. Deactivating a service removes it
from what prospective clients can request without permanently destroying its record.

## Acceptance criteria
- **AC-DASH-010-01** — The accountant can add a new service to the services catalog from the admin UI.
- **AC-DASH-010-02** — The accountant can edit an existing service in the services catalog.
- **AC-DASH-010-03** — The accountant can deactivate a service so it is no longer offered to prospective
  clients.

## Links
- Related: REQ-DOOR-002 (services catalog on public front door)
- Open questions: none

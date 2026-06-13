---
id: REQ-DOOR-002
title: Accountant manages the services catalog
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-002
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-002 — Accountant manages the services catalog

## User need
The accountant's service offerings change over time — she adds new offerings, refines descriptions, and
retires services she no longer provides. She needs to keep the public front door current herself,
without asking anyone to change it for her, so prospective clients only ever see what she actually
offers.

## Proposed solution
From her own accountant surface, the accountant maintains the catalog of services. She can add a new
service, edit an existing service's details, and deactivate a service so it is no longer offered.
Deactivating a service removes it from what prospective clients can select, while preserving the record
of services that already-placed requests referenced.

## Acceptance criteria
- **AC-DOOR-002-01** — The accountant can add a new service to the catalog.
- **AC-DOOR-002-02** — The accountant can edit the details of an existing service.
- **AC-DOOR-002-03** — The accountant can deactivate a service so it is no longer offered to
  prospective clients.
- **AC-DOOR-002-04** — A deactivated service no longer appears as a selectable option on the public
  services page or engagement request form.
- **AC-DOOR-002-05** — Only the accountant can change the services catalog; clients and anonymous
  visitors cannot.

## Links
- Related: REQ-DOOR-001 (public services page), REQ-DOOR-003 (request form lists active services), REQ-DASH-010 (admin catalog management)
- Open questions: none

## Notes
- Active vs. deactivated is treated as a reversible availability state rather than permanent deletion,
  so historical requests that referenced a now-deactivated service remain interpretable.

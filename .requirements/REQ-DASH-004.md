---
id: REQ-DASH-004
title: Client list screen
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-004
  - seed/intake.md
open_questions: []
---

# REQ-DASH-004 — Client list screen

## User need
As the practice grows the accountant needs to find a specific client quickly and to see her client base
sliced by what kind of work they're doing and which tax year. A searchable, filterable list with an
at-a-glance status indicator per client lets her navigate her book of business efficiently.

## Proposed solution
The accountant surface provides a dedicated client list screen. The list is searchable and shows a
status indicator for each client. It can be filtered by service type and by tax year, so the accountant
can narrow the list to the clients relevant to a given task.

## Acceptance criteria
- **AC-DASH-004-01** — A dedicated client list screen is available on the accountant surface.
- **AC-DASH-004-02** — The client list can be searched to locate a specific client.
- **AC-DASH-004-03** — Each client in the list shows a status indicator.
- **AC-DASH-004-04** — The client list can be filtered by service type.
- **AC-DASH-004-05** — The client list can be filtered by tax year.

## Links
- Related: REQ-DASH-005 (engagement list), REQ-AUTH-002 (accountant full visibility)
- Open questions: none

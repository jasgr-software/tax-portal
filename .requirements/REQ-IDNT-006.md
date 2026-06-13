---
id: REQ-IDNT-006
title: Distinct portal names — "Client Portal" and "Tax Portal"
domain: IDNT
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-006
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-006 — Distinct portal names — "Client Portal" and "Tax Portal"

## User need
The same platform is experienced two different ways: clients use a client-facing surface, and the
accountant uses her own work surface. Each audience should see a name that fits their context — clients
should see a clear, reassuring name for the place they manage their engagement, and the accountant should
see a name that frames the tool as her professional work surface. Consistent naming across every place
each name appears prevents confusion and looks intentional.

## Proposed solution
The client-facing surface is named **"Client Portal"** everywhere clients encounter the product's name —
including the names shown in their browser, page headings, and the subject lines of emails addressed to
them. The accountant-facing surface is named **"Tax Portal"** everywhere the accountant encounters the
product's name, including the names shown in her browser and page headings. The two names are used
consistently and are not interchanged.

## Acceptance criteria
- **AC-IDNT-006-01** — All client-facing presentations of the product name read "Client Portal",
  including browser tab/window titles, page headings, and subject lines of emails addressed to clients.
- **AC-IDNT-006-02** — All accountant-facing presentations of the product name read "Tax Portal",
  including browser tab/window titles and page headings.
- **AC-IDNT-006-03** — The two names are applied consistently to their respective audiences and are never
  swapped (clients never see "Tax Portal"; the accountant never sees "Client Portal" as the name of her
  own surface).

## Links
- Related: REQ-IDNT-001 (custom domain), REQ-IDNT-002 (generic appearance in v1)
- Open questions: none

---
id: EPIC-002
title: Accountant manages the services catalog
phase: 1
status: planned
slice: The signed-in accountant adds, edits, and deactivates services in the admin UI; her changes drive what prospects can request on the public front door.
requirements:
  - REQ-DOOR-002: [AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03, AC-DOOR-002-05]
  - REQ-DASH-010: [AC-DASH-010-01, AC-DASH-010-02, AC-DASH-010-03]
architecture:
  - ADR-006   # monorepo — catalog management lives in apps/admin
  - ADR-002   # SQL Server is the datastore for the service catalog entity
  - ADR-004   # Prisma single-track for the service entity schema
  - ADR-005   # security policy — only the accountant may write the catalog
  - ADR-003   # SESSION_CONTEXT — admin writes run under the accountant principal
  - ADR-012   # testing pyramid — tiers the AC tests must hit
depends_on: [EPIC-004]
source:
  - .requirements/REQ-DOOR-002.md
  - .requirements/REQ-DASH-010.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
  - .architecture/decisions/ADR-006-monorepo-layout.md
open_questions: []
---

# EPIC-002 — Accountant manages the services catalog

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
The signed-in **accountant** opens the services-catalog management screen in the Tax Portal (`apps/admin`)
and **adds, edits, and deactivates** the services her firm offers. These are the services that EPIC-001's
public front door renders and that prospects pick from — so this slice closes the authoring loop behind the
public catalog: the accountant controls supply, the front door reflects it. Only the accountant can change
the catalog; no client or anonymous visitor can. It is a thin end-to-end thread (accountant action →
persisted catalog state → visible effect on the public door) and depends on EPIC-004 for the authenticated
accountant surface.

## Requirements delivered

- **REQ-DOOR-002 — Accountant manages the services catalog** *(this epic owns the CRUD + authorization AC;
  AC-DOOR-002-04, the public-side effect, is EPIC-001)*
  - **AC-DOOR-002-01** — the accountant can add a new service to the catalog.
  - **AC-DOOR-002-02** — the accountant can edit the details of an existing service.
  - **AC-DOOR-002-03** — the accountant can deactivate a service so it is no longer offered.
  - **AC-DOOR-002-05** — only the accountant can change the catalog; clients and anonymous visitors cannot.
- **REQ-DASH-010 — Services catalog management (admin UI)**
  - **AC-DASH-010-01** — the accountant can add a new service from the admin UI.
  - **AC-DASH-010-02** — the accountant can edit an existing service from the admin UI.
  - **AC-DASH-010-03** — the accountant can deactivate a service from the admin UI.

## Architecture adherence
- **ADR-006 — Monorepo, two apps.** Catalog management is an accountant capability and lives in
  `apps/admin`; it must not be reachable from `apps/portal`.
- **ADR-002 / ADR-004 — SQL Server + Prisma single-track.** The `service` catalog entity is Prisma-managed
  entity schema; add/edit/deactivate are persisted, not in-memory.
- **ADR-005 — Security policies (the write boundary).** The defining invariant of AC-DOOR-002-05: the catalog
  is **writable by the accountant only**. A client or anonymous caller can never create, edit, or deactivate
  a service — enforced at the trust boundary, not merely hidden in the UI.
- **ADR-003 — SESSION_CONTEXT.** Catalog writes execute under the authenticated accountant identity.
- **ADR-012 — Testing pyramid.** The accountant-only write authorization is a tier-3 integration obligation
  (a non-accountant principal is rejected by the policy, not just the UI).

## Acceptance scenarios

### AC-DOOR-002-01 — Accountant adds a service
```gherkin
Given the signed-in accountant on the catalog management screen
When she adds a new service with its details
Then the service exists in the catalog and is available to be offered on the public front door
```

### AC-DOOR-002-02 — Accountant edits a service
```gherkin
Given an existing service in the catalog
When the accountant edits its details
Then the updated details are persisted and reflected wherever the service is shown
```

### AC-DOOR-002-03 — Accountant deactivates a service
```gherkin
Given an active service in the catalog
When the accountant deactivates it
Then the service is marked inactive and is no longer offered to prospects
```

### AC-DOOR-002-05 — Only the accountant may change the catalog
```gherkin
Given a caller who is not the accountant (a client or an anonymous visitor)
When that caller attempts to add, edit, or deactivate a service
Then the change is rejected and the catalog is unaltered
```

### AC-DASH-010-01 — Add a service from the admin UI
```gherkin
Given the accountant in the admin UI
When she creates a new service through the catalog management screen
Then the new service is saved and appears in her catalog list
```

### AC-DASH-010-02 — Edit a service from the admin UI
```gherkin
Given the accountant viewing an existing service in the admin UI
When she changes its details and saves
Then the service reflects the edited details in the admin UI
```

### AC-DASH-010-03 — Deactivate a service from the admin UI
```gherkin
Given the accountant viewing an active service in the admin UI
When she deactivates it
Then the service is shown as inactive in the admin UI and is no longer offered to prospects
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-DOOR-002-NN` / `AC-DASH-010-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping:
  - **e2e (tier 6, `apps/admin`)** — AC-DASH-010-01/-02/-03 and AC-DOOR-002-01/-02/-03 (the accountant's
    add/edit/deactivate journeys).
  - **service integration (tier 3, Prisma + real SQL Server)** — AC-DOOR-002-05 (a non-accountant principal
    is rejected by the security policy) and persistence of add/edit/deactivate.
  - **cross-surface check** — pair the deactivate AC here with AC-DOOR-002-04 in EPIC-001 (a deactivated
    service disappears from the public door) so the authoring→public loop is verified end to end.

## Out of scope
- **AC-DOOR-002-04** (a deactivated service does not appear on the public services page / request form) →
  owned by **EPIC-001** (the public-side effect). This epic produces the inactive state; EPIC-001 verifies
  its public consequence.
- Intake-questionnaire templates per service (REQ-DASH-012) and engagement-letter template management
  (REQ-DASH-013) → **deferred** to the onboarding phase (Phase 2). This epic manages the service catalog only.

## Links
- Requirements: REQ-DOOR-002 (CRUD + authz portion), REQ-DASH-010
- Architecture: ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-012
- Personas: `personas/jane-accountant.md`
- Flows: `flows/flow-engagement-request.md` (the catalog is the supply side of this flow's front door)
- Epics: depends on EPIC-004 (accountant auth); related EPIC-001 (consumes active/inactive state)
- Open questions: none

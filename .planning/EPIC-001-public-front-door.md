---
id: EPIC-001
title: Public front door — browse services & submit an engagement request
phase: 1
status: planned
slice: An anonymous visitor browses the accountant's active services and submits an engagement request, with no account.
requirements:
  - REQ-DOOR-001: [AC-DOOR-001-01, AC-DOOR-001-02, AC-DOOR-001-03]
  - REQ-DOOR-002: [AC-DOOR-002-04]          # subset — catalog CRUD AC (01/02/03/05) belong to EPIC-002
  - REQ-DOOR-003: [AC-DOOR-003-01, AC-DOOR-003-02, AC-DOOR-003-03, AC-DOOR-003-04]
  - REQ-DOOR-004: [AC-DOOR-004-01, AC-DOOR-004-02, AC-DOOR-004-03, AC-DOOR-004-04, AC-DOOR-004-05]
architecture:
  - TENET-002      # front door is self-serve (no account before request)
  - TENET-001      # security & data privacy (the request carries prospect PII)
  - TENET-007      # RLS at the DB; the request is accountant-read-only
  - ADR-006        # monorepo — the public door lives in apps/portal (Client Portal)
  - ADR-002        # SQL Server is the datastore for the engagement-request entity
  - ADR-004        # Prisma single-track for the entity schema
  - ADR-005        # security policy makes engagement requests accountant-readable only
  - ADR-003        # identity propagation via SESSION_CONTEXT (and the anonymous-write exception)
  - ADR-012        # testing pyramid — the tiers this slice's AC tests must hit
depends_on: []
source:
  - .requirements/REQ-DOOR-001.md
  - .requirements/REQ-DOOR-002.md
  - .requirements/REQ-DOOR-003.md
  - .requirements/REQ-DOOR-004.md
  - .architecture/TENETS.md#tenet-002
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-001 — Public front door — browse services & submit an engagement request

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
An **anonymous prospective client** lands on the public front door of the Client Portal (`apps/portal`),
sees the accountant's currently active services, picks the ones they need from a checklist, provides
basic contact details, and submits an **engagement request** that is captured in a pending
(awaiting-review) state. No account is created and no sign-in is required at any point. This is the
thinnest end-to-end thread that proves the portal's reason to exist — a real prospect can walk up to the
door and raise their hand — and it stands alone because the entire actor path is anonymous, with no
dependency on accountant authentication. (What the accountant *does* with the pending request —
notification, accept/decline, invite — is EPIC-003.)

## Requirements delivered

- **REQ-DOOR-001 — Public services page, no login required**
  - **AC-DOOR-001-01** — the services page is reachable by an anonymous visitor (no account, no sign-in).
  - **AC-DOOR-001-02** — it displays the accountant's currently active services.
  - **AC-DOOR-001-03** — viewing it creates no account and requires no personal information.
- **REQ-DOOR-002 — Accountant manages the services catalog** *(this epic owns one AC; the rest is EPIC-002)*
  - **AC-DOOR-002-04** — a deactivated service does not appear as a selectable option on the public
    services page or the request form. *(Testable from the public side by seeding an inactive service;
    the accountant-facing CRUD that toggles the state is EPIC-002.)*
- **REQ-DOOR-003 — Request form is a checklist of active services**
  - **AC-DOOR-003-01** — the form presents the active services as selectable checklist items.
  - **AC-DOOR-003-02** — no freeform "describe your need" field replaces the checklist.
  - **AC-DOOR-003-03** — no service-specific sub-questions that vary by selection.
  - **AC-DOOR-003-04** — deactivated services do not appear as checklist options.
- **REQ-DOOR-004 — Prospective client submits an engagement request, no account**
  - **AC-DOOR-004-01** — the prospect can select one or more services.
  - **AC-DOOR-004-02** — the prospect provides basic contact information.
  - **AC-DOOR-004-03** — submitting creates an engagement request in a pending (awaiting-review) state.
  - **AC-DOOR-004-04** — no account is created at request-submission time.
  - **AC-DOOR-004-05** — a request cannot be submitted with zero services selected.

## Architecture adherence

- **TENET-002 — The front door is self-serve.** The entire slice must work for an anonymous actor; no
  "create an account to continue" gate may be introduced before request submission. This is the slice's
  defining invariant.
- **TENET-001 — Security & data privacy.** The request carries prospect PII (name + contact method).
  It must be stored under the same encryption-at-rest posture as other client data, and the public write
  path must not expose existing requests to the anonymous submitter.
- **TENET-007 / ADR-005 / ADR-003 — DB is the trust boundary.** The `engagement_request` entity is
  **read-restricted to the accountant** by a SQL Server security policy (an anonymous or client caller
  can never read requests). The anonymous *submission* is a deliberate **public write with no
  `SESSION_CONTEXT` identity** — adherence obligation: route it through a controlled, minimal write path
  (insert-only, no read-back of other rows) rather than bypassing the policy model; document this as the
  one sanctioned identity-less write. (If the architecture source has no ADR covering anonymous writes,
  that is an out-of-scope need to flag — see run-summary guidance in `AGENT.md`.)
- **ADR-006 — Monorepo layout.** The public services page and request form live in `apps/portal` (the
  client-facing Client Portal), not `apps/admin`.
- **ADR-002 / ADR-004 — SQL Server + Prisma single-track.** The `service` (catalog) and
  `engagement_request` entities are Prisma-managed entity schema.
- **ADR-012 — Testing pyramid.** Each AC below binds tests at the tier(s) this strategy prescribes;
  the security-policy behavior (accountant-only read) is a **tier-3 integration** obligation, not
  advisory (per `strategy/TESTING.md` — RLS through the real engine).

## Traceability & sign-off contract

- Each in-scope AC above must be covered by **automated test(s) tagged with its AC id** — the test
  title/annotation contains the `AC-DOOR-NNN-NN` id — at the tier(s) the architecture testing strategy
  prescribes for that behavior.
- An AC is **implemented** only when its tagged test(s) **pass in CI** — CI is the independent gate.
- This epic is **delivered** only when **all** of its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per `.architecture/strategy/TESTING.md`):
  - **e2e (tier 6, `apps/portal`)** — AC-DOOR-001-01 (anonymous reachability), AC-DOOR-001-03 (no
    account/PII to view), AC-DOOR-003-01..04 (the checklist form), AC-DOOR-004-01/-02/-05 (select,
    contact info, zero-services blocked), the happy-path submit.
  - **service integration (tier 3, Prisma + real SQL Server)** — AC-DOOR-004-03 (request persisted
    pending), AC-DOOR-004-04 (no account row created), AC-DOOR-002-04 / AC-DOOR-001-02 / AC-DOOR-003-04
    (only active services surface), and the **accountant-only read** security-policy test for
    `engagement_request` (anonymous/client cannot read; accountant can).
  - **unit/component (tier 2/5)** — AC-DOOR-004-05 (client-side zero-selection guard), AC-DOOR-003-02/-03
    (form has no freeform field / no service-specific sub-questions).

## Out of scope
- Everything the accountant does with a submitted request — notification (REQ-DOOR-005), review and
  accept/decline (REQ-DOOR-006), acceptance → account invitation (REQ-DOOR-007), decline → reason message
  (REQ-DOOR-008). → **EPIC-003** (accountant request inbox), Phase 1.
- The accountant-facing services-catalog management — **AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03,
  AC-DOOR-002-05** of REQ-DOOR-002 (add / edit / deactivate a service, and "only the accountant may
  change the catalog"). These require the authenticated accountant admin surface. → **EPIC-002**
  (services-catalog management), Phase 1. This epic only consumes the *active/inactive* state to satisfy
  AC-DOOR-002-04 from the public side.
- Any authentication, role model, or accountant sign-in. → **EPIC-004**.

## Links
- Requirements: REQ-DOOR-001, REQ-DOOR-002 (partial), REQ-DOOR-003, REQ-DOOR-004
- Architecture: TENET-001, TENET-002, TENET-007, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-012
- Epics: related EPIC-002 (catalog CRUD), EPIC-003 (accountant inbox), EPIC-004 (auth)
- Open questions: none

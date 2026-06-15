---
id: BRIEF-001
title: Public front door — browse active services & submit an engagement request (anonymous)
status: ready
acceptance_criteria:
  - id: AC-DOOR-001-01
    text: The services page is reachable by an anonymous visitor with no account and no sign-in.
  - id: AC-DOOR-001-02
    text: The services page displays the accountant's currently offered (active) services.
  - id: AC-DOOR-001-03
    text: Viewing the services page does not create an account or require any personal information from the visitor.
  - id: AC-DOOR-002-04
    text: A deactivated service no longer appears as a selectable option on the public services page or the engagement request form.
  - id: AC-DOOR-003-01
    text: The request form presents the currently active services as selectable checklist items.
  - id: AC-DOOR-003-02
    text: The form does not offer a freeform field for the requester to describe an arbitrary service need in place of selecting from the checklist.
  - id: AC-DOOR-003-03
    text: The form does not present service-specific sub-questions that vary by which service is selected.
  - id: AC-DOOR-003-04
    text: Deactivated services do not appear as checklist options on the request form.
  - id: AC-DOOR-004-01
    text: A prospective client can select one or more services on the request form.
  - id: AC-DOOR-004-02
    text: The prospective client provides basic contact information as part of the request.
  - id: AC-DOOR-004-03
    text: Submitting the form creates an engagement request in a pending (awaiting-review) state.
  - id: AC-DOOR-004-04
    text: No account is created for the prospective client at request-submission time.
  - id: AC-DOOR-004-05
    text: A request cannot be submitted with zero services selected.
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Tier-3 integration: accountant-only read security policy on engagement_request (anonymous/client cannot read; accountant can) — per ADR-005, not advisory."
    - "Container smoke test (docker-compose stack) before Validate — per CLAUDE.md."
acceptance_scenarios:
  - "apps/portal/e2e/features/public-front-door.feature (bind the 13 Given/When/Then scenarios reproduced in §Acceptance scenarios below)"
source:
  - "planning: .planning/EPIC-001-public-front-door.md"
  - "requirements: .requirements/REQ-DOOR-001.md, .requirements/REQ-DOOR-002.md, .requirements/REQ-DOOR-003.md, .requirements/REQ-DOOR-004.md"
  - "architecture: ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-012, ADR-020"
---

# BRIEF-001 — Public front door — browse active services & submit an engagement request (anonymous)

> Self-contained build brief for the first vertical slice of the Tax Accountant Client Portal. Composed by
> the Conductor from `.planning/EPIC-001` and its cited requirement/architecture sources. The `source:` refs
> are soft context; this brief stands alone.

## Scope

Deliver the thinnest end-to-end thread that proves the portal's reason to exist: an **anonymous prospective
client** lands on the public front door of the **Client Portal (`apps/portal`)**, sees the accountant's
currently **active** services, picks the ones they need from a **checklist**, provides **basic contact
information**, and submits an **engagement request** that is captured in a **pending (awaiting-review)**
state. No account is created and no sign-in is required at any point in this path.

Concretely, this slice includes:

- A **public services page** in `apps/portal` reachable with no account and no sign-in, listing the
  accountant's active services.
- A **request form** presenting the active services as a checklist, plus basic contact-information fields
  (e.g. name + a contact method — the exact minimal field set is a routine product detail).
- A **submit path** that creates an `engagement_request` in a pending state via a controlled, **insert-only
  anonymous write** (no `SESSION_CONTEXT` identity; no read-back of other rows).
- The **Prisma-managed entity schema** for the `service` (catalog) and `engagement_request` entities, and
  the **SQL Server security policy** that makes `engagement_request` **accountant-readable only**.
- The full test pyramid binding each AC to a tagged test at the prescribed tier (see Methodology).

This is a standalone slice: the entire actor path is anonymous, with no dependency on accountant
authentication.

## Out of scope

- **Everything the accountant does with a submitted request** — notification (REQ-DOOR-005), review and
  accept/decline (REQ-DOOR-006), acceptance → account invitation (REQ-DOOR-007), decline → reason message
  (REQ-DOOR-008). → **EPIC-003** (accountant request inbox).
- **Accountant-facing services-catalog management** — AC-DOOR-002-01/-02/-03/-05 of REQ-DOOR-002 (add / edit
  / deactivate a service; "only the accountant may change the catalog"). These need the authenticated
  accountant admin surface. → **EPIC-002**. This slice only *consumes* the active/inactive state to satisfy
  **AC-DOOR-002-04** from the public side (seed an inactive service in tests; no UI to toggle it here).
- **Any authentication, role model, or accountant sign-in.** → **EPIC-004**.
- No mobile/native surface; web browser only (v1).

## Acceptance criteria

Each AC is owned by this slice and must be covered by automated test(s) **tagged with its AC id** (the test
title/annotation contains the `AC-DOOR-NNN-NN` id) at the tier(s) below.

- **AC-DOOR-001-01** — The services page is reachable by an anonymous visitor with no account and no sign-in.
- **AC-DOOR-001-02** — The services page displays the accountant's currently offered (active) services.
- **AC-DOOR-001-03** — Viewing the services page does not create an account or require any personal
  information from the visitor.
- **AC-DOOR-002-04** — A deactivated service no longer appears as a selectable option on the public services
  page or the engagement request form.
- **AC-DOOR-003-01** — The request form presents the currently active services as selectable checklist items.
- **AC-DOOR-003-02** — The form does not offer a freeform field for the requester to describe an arbitrary
  service need in place of selecting from the checklist.
- **AC-DOOR-003-03** — The form does not present service-specific sub-questions that vary by which service is
  selected.
- **AC-DOOR-003-04** — Deactivated services do not appear as checklist options on the request form.
- **AC-DOOR-004-01** — A prospective client can select one or more services on the request form.
- **AC-DOOR-004-02** — The prospective client provides basic contact information as part of the request.
- **AC-DOOR-004-03** — Submitting the form creates an engagement request in a pending (awaiting-review) state.
- **AC-DOOR-004-04** — No account is created for the prospective client at request-submission time.
- **AC-DOOR-004-05** — A request cannot be submitted with zero services selected.

## Methodology & quality requirements

Honor these (produced upstream by `.planning/` + `.architecture/strategy/TESTING.md`):

- **Acceptance format: gherkin.** The 13 Given/When/Then scenarios in §Acceptance scenarios are the behavior
  contract. Bind them to executable Playwright e2e specs in `apps/portal`. Until the Cucumber binder lands
  (see CLAUDE.md), they may be authored as standard `.spec.ts` that cover the scenario behavior, with each
  spec tagged by its AC id; mirror them as `.feature` files under `apps/portal/e2e/features/`.
- **e2e: required.** This slice touches a public write path (engagement-request submission) and a SQL Server
  security policy — both on the project's default `E2e-required: yes` list (CLAUDE.md § IO E2e defaults).
- **Tier mapping (per `.architecture/strategy/TESTING.md`):**
  - **e2e (tier 6, `apps/portal`)** — AC-DOOR-001-01 (anonymous reachability), AC-DOOR-001-03 (no
    account/PII to view), AC-DOOR-003-01..04 (the checklist form), AC-DOOR-004-01/-02/-05 (select, contact
    info, zero-services blocked), plus the happy-path submit.
  - **service integration (tier 3, Prisma + real SQL Server)** — AC-DOOR-004-03 (request persisted pending),
    AC-DOOR-004-04 (no account row created), AC-DOOR-002-04 / AC-DOOR-001-02 / AC-DOOR-003-04 (only active
    services surface), and the **accountant-only read** security-policy test for `engagement_request`
    (anonymous/client cannot read; accountant can). **The per-policy read-isolation test is a hard
    requirement, not advisory (ADR-005).**
  - **unit/component (tier 2/5)** — AC-DOOR-004-05 (client-side zero-selection guard), AC-DOOR-003-02/-03
    (form has no freeform field / no service-specific sub-questions).
- **Submission gate** (per CLAUDE.md): `pnpm lint` · `pnpm type-check` · `pnpm --filter portal test` · the
  portal e2e suite · the container smoke test between Review and Validate.
- **AC-id test-tag contract:** every AC's covering test carries its `AC-DOOR-NNN-NN` id so the planning
  validate phase can flip `COVERAGE.md` rows on CI evidence.

## Constraints

Non-negotiables, each tracing to a cited source:

- **Self-serve front door (REQ-DOOR-004, the slice's defining invariant).** The entire path must work for an
  anonymous actor; **no "create an account to continue" gate** may be introduced before request submission.
- **ADR-006 — Monorepo layout.** The public services page and request form live in **`apps/portal`** (the
  client-facing Client Portal), not `apps/admin`.
- **ADR-002 / ADR-004 — SQL Server + Prisma single-track.** The `service` (catalog) and `engagement_request`
  entities are **Prisma-managed entity schema** (`prisma/schema.prisma` → `prisma migrate`).
- **ADR-005 / ADR-003 — DB is the trust boundary.** `engagement_request` is **read-restricted to the
  accountant** by a SQL Server security policy — an anonymous or client caller can **never** read requests.
  The anonymous *submission* is a deliberate **public write with no `SESSION_CONTEXT` identity**: route it
  through a controlled, **minimal insert-only write path** (no read-back of other rows) rather than
  bypassing the policy model. Document this as the **one sanctioned identity-less write**. Every other
  request-scoped DB query must go through the `packages/db` Prisma wrapper that sets `SESSION_CONTEXT`
  (ADR-003).
- **ADR-020 — Security & data privacy.** The request carries prospect PII (name + contact method); store it
  under the same **encryption-at-rest** posture as other client data. The public write path must not expose
  existing requests to the anonymous submitter.
- **ADR-012 — Testing pyramid.** Each AC binds tests at the prescribed tier; the accountant-only-read
  security-policy behavior is a **tier-3 integration** obligation (RLS through the real engine).
- **Active vs. deactivated is a reversible availability state**, not deletion (REQ-DOOR-002 note) — historical
  requests referencing a now-deactivated service remain interpretable. (Catalog mutation UI is EPIC-002; this
  slice only reads the state.)

> **Flag for the architecture layer (do not block on it):** EPIC-001 notes that if the architecture source
> has no ADR explicitly covering the sanctioned anonymous write, that gap should be surfaced. ADR-003/-005 are
> cited as the governing decisions; if the build finds no concrete anonymous-write exception documented there,
> raise it as an out-of-scope architecture follow-up rather than inventing policy.

## Acceptance scenarios

> Gherkin reproduced from EPIC-001. Bind each to an executable Playwright spec tagged with its AC id;
> mirror under `apps/portal/e2e/features/public-front-door.feature`.

### AC-DOOR-001-01 — Services page reachable anonymously
```gherkin
Given a visitor with no account and no sign-in
When they navigate to the public services page
Then the page is served without requiring authentication
```

### AC-DOOR-001-02 — Active services are displayed
```gherkin
Given the accountant has active services in the catalog
When an anonymous visitor views the services page
Then the currently active services are displayed
```

### AC-DOOR-001-03 — Viewing creates no account and asks for nothing personal
```gherkin
Given an anonymous visitor on the services page
When they browse the services
Then no account is created and no personal information is required to view it
```

### AC-DOOR-002-04 — Deactivated services do not appear publicly
```gherkin
Given a service that has been deactivated
When an anonymous visitor views the services page and the request form
Then the deactivated service does not appear as a selectable option
```

### AC-DOOR-003-01 — Form presents active services as a checklist
```gherkin
Given the request form
When an anonymous visitor opens it
Then the active services are presented as selectable checklist items
```

### AC-DOOR-003-02 — No freeform need field replaces the checklist
```gherkin
Given the request form
When the visitor inspects how they express what they need
Then selection is via the service checklist with no freeform "describe your need" field replacing it
```

### AC-DOOR-003-03 — No service-specific sub-questions
```gherkin
Given the request form with services selected
When the visitor completes it
Then no service-specific sub-questions vary the form by which services are selected
```

### AC-DOOR-003-04 — Deactivated services are not checklist options
```gherkin
Given a deactivated service
When the visitor views the request form's checklist
Then the deactivated service is not offered as a checklist option
```

### AC-DOOR-004-01 — Prospect selects one or more services
```gherkin
Given an anonymous visitor on the request form
When they choose one or more active services
Then their selection is captured for submission
```

### AC-DOOR-004-02 — Prospect provides basic contact information
```gherkin
Given an anonymous visitor completing the request form
When they enter their basic contact information
Then the contact information is captured with the request
```

### AC-DOOR-004-03 — Submitting creates a pending request
```gherkin
Given a completed request form with at least one service selected
When the visitor submits it
Then an engagement request is created in a pending (awaiting-review) state
```

### AC-DOOR-004-04 — No account is created at submission
```gherkin
Given a visitor submitting an engagement request
When the request is created
Then no account is created for the visitor at submission time
```

### AC-DOOR-004-05 — Cannot submit with zero services
```gherkin
Given an anonymous visitor on the request form with no services selected
When they attempt to submit
Then submission is blocked and no engagement request is created
```

## References

- **Planning:** `.planning/EPIC-001-public-front-door.md` (slice, AC ownership, tier mapping, sign-off contract)
- **Requirements:** REQ-DOOR-001 (public services page), REQ-DOOR-002 (catalog — AC-DOOR-002-04 only here),
  REQ-DOOR-003 (checklist form), REQ-DOOR-004 (anonymous submission)
- **Architecture:** ADR-002 (SQL Server), ADR-003 (`SESSION_CONTEXT` identity + anonymous-write exception),
  ADR-004 (Prisma single-track), ADR-005 (RLS via security policies), ADR-006 (monorepo / `apps/portal`),
  ADR-012 (testing pyramid), ADR-020 (security & data privacy)
- **Behavior contract:** persona `tom-prospective-client`; flow `flow-engagement-request` (anonymous path)

## Notes

- **This is the first real build in the repo** — `apps/portal` does not yet exist. Scaffolding the Client
  Portal app (Next.js 14 App Router + TypeScript + Tailwind/shadcn + Prisma client wiring + Playwright/Vitest
  config + `e2e:run` script) is part of standing this slice up; per CLAUDE.md the app is not considered
  scaffolded without its e2e infrastructure. The DevOps role owns any docker-compose/inventory/runbook
  updates that come with bringing the local stack up.
- **EPIC-002 / EPIC-003 build on this** — keep the `service` and `engagement_request` schema clean and the
  pending-state model explicit, since the accountant catalog CRUD (EPIC-002) and the inbox/accept-decline
  flow (EPIC-003) extend exactly these entities.
- Sequenced first among Phase-1 epics (EPIC-001/004 are dependency-free); EPIC-004 is the other ready slice.

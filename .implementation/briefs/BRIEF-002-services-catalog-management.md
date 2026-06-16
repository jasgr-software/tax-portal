---
id: BRIEF-002
title: Accountant manages the services catalog — admin CRUD (add / edit / deactivate) + accountant-only write boundary
status: ready
acceptance_criteria:
  - id: AC-DOOR-002-01
    text: The accountant can add a new service to the catalog.
  - id: AC-DOOR-002-02
    text: The accountant can edit the details of an existing service.
  - id: AC-DOOR-002-03
    text: The accountant can deactivate a service so it is no longer offered to prospective clients.
  - id: AC-DOOR-002-05
    text: Only the accountant can change the services catalog; clients and anonymous visitors cannot add, edit, or deactivate a service.
  - id: AC-DASH-010-01
    text: The accountant can add a new service to the services catalog from the admin UI.
  - id: AC-DASH-010-02
    text: The accountant can edit an existing service in the services catalog from the admin UI.
  - id: AC-DASH-010-03
    text: The accountant can deactivate a service from the admin UI so it is no longer offered to prospective clients.
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Accountant-only write boundary (ADR-005) — HARD requirement: a tier-3 integration test proving a non-accountant principal (a CLIENT-role request-pool session AND an anonymous / null-SESSION_CONTEXT session) is REJECTED by the Service security policy when attempting INSERT / UPDATE / DELETE — rejected at the trust boundary, not merely hidden in the UI. This is the defining invariant of AC-DOOR-002-05. NOTE the latent gap below (the existing write block predicate passes CLIENT)."
    - "Persistence integration (ADR-002/-004, tier 3): add / edit / deactivate persist to the Prisma-managed Service entity on real SQL Server (not in-memory) and survive a re-read — paired with the accountant-only write test above."
    - "Cross-surface authoring→public-door loop check: pair the deactivate AC (AC-DOOR-002-03) with EPIC-001's AC-DOOR-002-04 — a service the accountant deactivates in apps/admin no longer appears as a selectable option on the public services page / request form in apps/portal. Verifies the supply→front-door loop end to end."
    - "SESSION_CONTEXT propagation on the admin write path (ADR-003): catalog writes execute under the authenticated accountant identity via the packages/db request-scoped Prisma wrapper ($extends sets SESSION_CONTEXT before the first real query); a direct-Prisma write outside the wrapper is a convention violation."
    - "Container smoke test (docker-compose stack) before Validate — per CLAUDE.md."
acceptance_scenarios:
  - "apps/admin/e2e/features/services-catalog.feature (bind the 7 Given/When/Then scenarios reproduced in §Acceptance scenarios below to executable Playwright specs in apps/admin, each tagged with its AC id)"
demo:
  applicable: yes
  apps: [admin]
  personas: [jane-accountant]
  flows: [flow-engagement-request]
source:
  - "planning: .planning/EPIC-002-services-catalog-management.md"
  - "requirements: .requirements/REQ-DOOR-002.md, .requirements/REQ-DASH-010.md"
  - "architecture: ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-012"
---

# BRIEF-002 — Accountant manages the services catalog

> Self-contained build brief for the services-catalog-management slice of the Tax Accountant Client Portal.
> Composed by the Conductor from `.planning/EPIC-002` and its cited requirement/architecture sources. The
> `source:` refs are soft context; this brief stands alone.
>
> **Closes the authoring loop behind EPIC-001's public catalog.** EPIC-001 delivered the *read* side — the
> public services page and request form render **active** services from the `Service` entity. This slice
> delivers the *write* side: the signed-in accountant adds, edits, and deactivates services from the Tax
> Portal (`apps/admin`), and the front door reflects her changes. It depends on EPIC-004 (delivered) for the
> authenticated accountant surface, the role model, the `requireRole()` helper, the mocked auth provider for
> e2e, and the `packages/db` `SESSION_CONTEXT` wrapper.

## Scope

The signed-in **accountant** manages the catalog of services her firm offers, from the **Tax Portal
(`apps/admin`)**:

- A **services-catalog management screen** in `apps/admin` where the accountant can **add** a new service,
  **edit** an existing service's details, and **deactivate** a service (a reversible availability toggle, not
  a delete). The screen lists her services (active and inactive).
- These writes persist to the **existing Prisma-managed `Service` entity** (`prisma/schema.prisma` — created
  in EPIC-001: `id`, `name`, `description`, `active`, `sortOrder`, `createdAt`, `updatedAt`). **Reuse the
  entity**; deactivate sets `active = false` (never deletes — historical engagement requests reference past
  services via the `EngagementRequestService` join, so the record must survive).
- The writes run **under the authenticated accountant identity** through the `packages/db` request-scoped
  wrapper that sets `SESSION_CONTEXT` (ADR-003), and are **authorized at the security-policy trust boundary**
  (ADR-005) so that **only** the accountant — never a CLIENT, never an anonymous caller — can mutate the
  catalog.
- The effect is **visible on the public front door**: a service the accountant deactivates stops being a
  selectable option for prospects (the cross-surface loop, paired with EPIC-001's AC-DOOR-002-04).

This is a thin end-to-end thread: **accountant action → persisted catalog state → visible effect on the
public door**, on the authenticated admin surface only.

Concretely, this slice includes:

- The **admin catalog management UI** (`apps/admin`) — list + add + edit + deactivate, behind the accountant
  role gate (this route is ACCOUNTANT-only; `apps/admin` has no public routes per ADR-010).
- The **server actions / route handlers** for create / update / deactivate, going through the `packages/db`
  request-scoped wrapper (no direct Prisma in handlers — ADR-003).
- The **accountant-only write security policy** for the `Service` table (ADR-005) — see §Constraints for the
  concrete obligation, including closing the latent write-predicate gap left by EPIC-001's read-only policy.
- Any **Prisma migration** needed if the management UI requires a schema touch (e.g. a uniqueness or
  ordering refinement) — but prefer reusing the existing entity unchanged.
- The **full test pyramid** binding each of the 7 in-scope AC to a tagged test at the prescribed tier (see
  §Methodology), incl. the accountant-only-write tier-3 integration test and the admin e2e journeys, all
  runnable against the **mocked auth provider** established in EPIC-004.
- The **`@demo` walkthrough spec** (apps/admin) capturing the accountant's add/edit/deactivate journey.

## Out of scope

- **AC-DOOR-002-04 (the public-side effect)** — that a deactivated service no longer appears on the public
  services page / request form — is **owned by EPIC-001** (the public read side). This slice **produces** the
  inactive state and verifies the loop via the cross-surface check, but AC-DOOR-002-04 itself is not a row
  this slice flips in COVERAGE.
- **Intake-questionnaire templates per service (REQ-DASH-012)** and **engagement-letter template management
  (REQ-DASH-013)** → deferred to the onboarding phase (Phase 2). This slice manages the **service catalog
  only** — name/description/active/order, not per-service templates.
- **Issuing engagements / accepting requests** — EPIC-003. This slice does not touch the request inbox.
- **Permanent deletion** of services — deactivation is a reversible `active=false` toggle by design
  (REQ-DOOR-002 note); no hard-delete UI or endpoint.
- **2FA / auth-provider changes** — inherited from EPIC-004 as-is (mocked provider for e2e; real Clerk
  deferred). This slice adds no auth mechanism; it consumes the existing accountant role gate.
- No mobile/native surface; web browser only (v1).

## Acceptance criteria

Each AC is owned by this slice and must be covered by automated test(s) **tagged with its AC id** (the test
title/annotation contains the `AC-DOOR-002-NN` / `AC-DASH-010-NN` id) at the tier(s) in §Methodology.

- **AC-DOOR-002-01** — The accountant can add a new service to the catalog.
- **AC-DOOR-002-02** — The accountant can edit the details of an existing service.
- **AC-DOOR-002-03** — The accountant can deactivate a service so it is no longer offered to prospective
  clients.
- **AC-DOOR-002-05** — Only the accountant can change the services catalog; clients and anonymous visitors
  cannot add, edit, or deactivate a service (enforced at the trust boundary, not merely hidden in the UI).
- **AC-DASH-010-01** — The accountant can add a new service to the services catalog from the admin UI.
- **AC-DASH-010-02** — The accountant can edit an existing service in the services catalog from the admin UI.
- **AC-DASH-010-03** — The accountant can deactivate a service from the admin UI so it is no longer offered to
  prospective clients.

> AC-DOOR-002-01/-02/-03 (the capability) and AC-DASH-010-01/-02/-03 (the same capability *from the admin
> UI*) are deliberately paired — the admin-UI e2e journeys satisfy both the DOOR and the DASH rows; tag each
> covering test with **both** AC ids where one journey evidences both.

## Methodology & quality requirements

Honor these (produced upstream by `.planning/EPIC-002` + `.architecture/strategy/TESTING.md`):

- **Acceptance format: gherkin.** The 7 Given/When/Then scenarios in §Acceptance scenarios are the behavior
  contract (reproduced verbatim from EPIC-002). Bind them to executable Playwright e2e specs in **`apps/admin`**,
  each tagged with its AC id. Until the Cucumber binder lands (see CLAUDE.md), author them as standard
  `.spec.ts` covering the scenario behavior; mirror as `.feature` files under
  `apps/admin/e2e/features/services-catalog.feature`.
- **e2e: required — against the mocked auth provider (apps/admin).** This slice is an authenticated admin
  surface CRUD flow → on the project's default `E2e-required: yes` list. The e2e suite drives the **mock/test
  double** of the auth provider (an accountant test session; the role claim pre-set) — **no real Clerk
  instance is contacted** (inherited from EPIC-004). "Mocked" applies to the *provider*, not the gate: the e2e
  gate still runs and gates against the live docker-compose stack, exercising the real admin route, role gate,
  server actions, security policy, and DB path end to end. Scope is **`apps/admin`** (catalog management is an
  admin-only capability per ADR-006); the only `apps/portal` touch is the cross-surface check below.
- **Tier mapping (per `.architecture/strategy/TESTING.md` + the epic sign-off contract):**
  - **e2e (tier 6, `apps/admin`)** — AC-DASH-010-01/-02/-03 and AC-DOOR-002-01/-02/-03 (the accountant's
    add / edit / deactivate journeys through the admin UI).
  - **service integration (tier 3, Prisma + real SQL Server)** — **AC-DOOR-002-05** (a non-accountant
    principal is rejected by the Service security policy on INSERT/UPDATE/DELETE) and persistence of
    add/edit/deactivate (writes survive a re-read).
  - **cross-surface check** — pair the deactivate AC (AC-DOOR-002-03) with EPIC-001's **AC-DOOR-002-04**: a
    service deactivated in `apps/admin` disappears from the public services page / request form in
    `apps/portal`. (Drive via `pnpm e2e:cross-app` if it fits that suite, else an admin-then-portal e2e.)
- **Submission gate** (per CLAUDE.md): `pnpm lint` · `pnpm type-check` · `pnpm --filter admin test` ·
  `pnpm --filter portal test` (the cross-surface check) · `pnpm --filter admin e2e:run` · the container smoke
  test between Review and Validate.
- **AC-id test-tag contract:** every AC's covering test carries its `AC-DOOR-002-NN` / `AC-DASH-010-NN` id so
  the planning validate phase can flip `COVERAGE.md` rows on CI evidence.
- **UI demo (`demo.applicable: yes`):** author a dedicated `@demo` Playwright walkthrough spec capturing an
  AC-tagged screenshot gallery into `docs/demos/EPIC-002/` — jane-accountant's catalog-management happy path
  (list → add → edit → deactivate, with the inactive state shown). **Non-gating** (the e2e gate is the gate).
  See `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables, each tracing to a cited source:

- **ADR-006 — Monorepo, two apps.** Catalog management is an **accountant** capability and lives in
  **`apps/admin`** (Tax Portal). It **must not be reachable from `apps/portal`** — no client/anonymous catalog
  write path exists in the client app. The accountant role gate (EPIC-004's `requireRole()` / middleware)
  protects the management route.
- **ADR-002 / ADR-004 — SQL Server + Prisma single-track.** The `Service` catalog entity is **Prisma-managed
  entity schema** (Track A). Add/edit/deactivate are **persisted** to real SQL Server, not in-memory. Reuse
  the existing `Service` model; if the management UI requires a schema change, it goes through
  `pnpm prisma migrate dev` (Track A), and any security-policy SQL through the raw-SQL track (`db/policies/`).
- **ADR-005 — Security policies are the write boundary (the defining invariant of AC-DOOR-002-05).** The
  catalog is **writable by the accountant only**; a CLIENT-role or anonymous caller can **never** INSERT,
  UPDATE, or DELETE a `Service` row — enforced at the trust boundary, not merely hidden in the UI. **Concrete
  obligation + latent gap to close:** the existing `db/policies/0002-service-readable.sql` block predicates
  (INSERT/UPDATE/DELETE) reuse `sec.fn_service_access`, which currently returns `allowed = 1` for the CLIENT
  role (branch 3) — so **a CLIENT principal presently passes the write block predicate** even though the
  policy's header comment says "only ACCOUNTANT / admin can mutate." EPIC-001 only needed the read side, so
  this was never exercised. **This slice must close that gap**: the SELECT/read predicate keeps allowing
  CLIENT reads of active services, but the **write** authorization (INSERT/UPDATE/DELETE block predicates)
  must pass for **ACCOUNTANT / admin only** and reject CLIENT + anonymous. Prove it with the tier-3
  integration test (a non-accountant principal's write is rejected by the policy). Per the SDET rule, a
  security-policy task requires an integration test per policy.
- **ADR-003 — Identity propagation via `SESSION_CONTEXT`.** Catalog writes execute **under the authenticated
  accountant identity** through the **`packages/db` Prisma wrapper** (`$extends`) that sets `SESSION_CONTEXT`
  (identity + role) **before the first real query**. Direct Prisma access in route handlers / server actions
  outside that wrapper is a convention violation. (EPIC-004 delivered the wrapper + its regression test; this
  slice consumes it on the admin write path.)
- **ADR-012 — Testing pyramid.** The accountant-only write authorization is a **tier-3 integration
  obligation** (a non-accountant principal is rejected by the policy, not just the UI), and the add/edit/
  deactivate journeys are **tier-6 e2e** — not advisory unit checks.
- **Reversible deactivation (REQ-DOOR-002 note).** Deactivate is an `active = false` availability toggle, not
  a delete — historical engagement requests that reference a now-inactive service must remain interpretable.

## References

- **Planning:** `.planning/EPIC-002-services-catalog-management.md` (slice, AC ownership, gherkin scenarios,
  tier mapping, sign-off contract, the AC-DOOR-002-04 split to EPIC-001).
- **Requirements:** REQ-DOOR-002 (accountant manages the catalog — CRUD + authorization; AC-DOOR-002-04 is the
  public-side effect, EPIC-001), REQ-DASH-010 (services catalog management from the admin UI).
- **Architecture:** ADR-002 (SQL Server datastore), ADR-003 (`SESSION_CONTEXT` identity propagation), ADR-004
  (Prisma single-track entity schema), ADR-005 (security policies / accountant-only write boundary), ADR-006
  (monorepo / two apps — management lives in `apps/admin`), ADR-012 (testing pyramid).
- **Behavior contract:** persona `jane-accountant`; flow `flow-engagement-request` (the catalog is the supply
  side of the public front door this flow runs through).
- **Prior art:** EPIC-001 (the `Service` entity + the public read side + `0002-service-readable.sql`);
  EPIC-004 (the authenticated `apps/admin` surface, the role model, `requireRole()`, the mocked auth provider,
  the `packages/db` `SESSION_CONTEXT` wrapper).

## Notes

- **Reuse, don't reinvent, the `Service` entity.** It already exists from EPIC-001 with the right shape
  (`active` flag + `sortOrder`). Avoid a parallel model; extend only if a management requirement demands it.
- **The accountant-only write boundary is the heart of this slice.** The UI CRUD is straightforward; the
  governance value is enforcing AC-DOOR-002-05 at the security policy (closing the EPIC-001 read-only-policy
  write gap) and proving it with the tier-3 test. Treat that as the slice's primary risk, not the forms.
- **`apps/admin` exists** (scaffolded in EPIC-004). This slice adds a management route + server actions there;
  it does not re-scaffold. The admin app is ACCOUNTANT-only (no public routes, ADR-010) — the management
  screen sits behind the existing role gate.
- **EPIC-003 (request inbox) also depends on EPIC-004 and runs in parallel readiness** — but this brief is
  self-contained and does not block on it. Keep the admin layout / nav patterns reusable for EPIC-003.
- **Cross-surface check honesty:** AC-DOOR-002-04 stays owned by EPIC-001; this slice verifies the *loop* (a
  deactivate here is reflected on the public door) without claiming the EPIC-001 row. Record the loop result
  as evidence for the deactivate AC, not as an AC-DOOR-002-04 sign-off.

## Acceptance scenarios

> Gherkin reproduced verbatim from EPIC-002. Bind each to an executable Playwright spec tagged with its AC id,
> in `apps/admin`; mirror under `apps/admin/e2e/features/services-catalog.feature`. All run against the mocked
> auth provider (an accountant test session). The accountant-only-write scenario (AC-DOOR-002-05) also binds
> to the tier-3 security-policy integration test (a non-accountant principal is rejected at the DB boundary).

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

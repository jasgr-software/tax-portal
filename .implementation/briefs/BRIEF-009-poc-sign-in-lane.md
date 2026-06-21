---
id: BRIEF-009
title: Sign-in lane — sign-in/sign-out capability (PoC mock realization) + consolidated role-based landing
status: ready
acceptance_criteria:
  # REQ-AUTH-013 — User sign-in and sign-out (NEW this slice; realized against the mock provider)
  - id: AC-AUTH-013-01
    text: "After a user successfully signs in, they reach the surface appropriate to their role (the accountant on the accountant/admin surface, a client on the client/portal surface) without further manual navigation."
  - id: AC-AUTH-013-02
    text: "A signed-in user can sign out; signing out ends their authenticated session, leaving them in an unauthenticated state such that any subsequent access to a protected surface requires signing in again."
  # REQ-AUTH-010 — Role-based redirect between surfaces (CONSOLIDATED here from EPIC-004; mechanism already verified)
  - id: AC-AUTH-010-01
    text: "A signed-in CLIENT navigating to the accountant (admin) surface is redirected to the client surface; no admin content is rendered."
  - id: AC-AUTH-010-02
    text: "A signed-in ACCOUNTANT navigating to a CLIENT-only route on the client surface is redirected to the accountant (admin) surface; no client-only content is rendered."
  - id: AC-AUTH-010-03
    text: "Public (non-client-only) routes on the client surface remain reachable regardless of role, without a role-based redirect."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Inert-under-real-provider guard (ADR-001/ADR-012, HARD security-relevant test, NOT advisory): under AUTH_PROVIDER=clerk the dev sign-in lane route is absent/404 and NO mock session can be established through it (the same contract /api/mock-session already honors). An automated test (tier-2/3) must prove the lane is unreachable in the real binding — this is the safety property that keeps a dev login lane out of any real/production build. A missing or passing-only-under-mock test is an SDET rejection."
    - "Server-established role (ADR-005, HARD): the role is set SERVER-SIDE by the existing signed (HMAC) mock-session cookie the /api/mock-session endpoint issues; the lane only TRIGGERS that endpoint for the chosen seeded account. The browser must not be able to assert a role that bypasses the server-set cookie — the lane introduces NO client-trusted role path. Prove the established session's role is the server's, not a client-supplied value."
    - "Sign-out ends the session globally (ADR-010, AC-AUTH-013-02): after sign-out, a protected route on EITHER surface requires re-authentication; sign-out is global across both apps (one identity/session), not per-app."
    - "Cross-surface (CLAUDE.md § Platform-frontend scope): sign-in as the Accountant lands on apps/admin; sign-in as a Client lands on apps/portal; the role/user switcher re-lands accordingly. Validate BOTH surfaces and the cross-app landing (pnpm e2e:cross-app)."
    - "AC-AUTH-010 non-regression (consolidated, already verified): the redirect-matrix MECHANISM was delivered by EPIC-004 and its AC are already verified — do NOT rebuild it. This slice OWNS AC-AUTH-010-01/-02/-03 now; ensure each remains covered by automated test(s) tagged with its AC id, exercised through the lane's sign-in path, and green. Re-tag/relocate the existing redirect tests to this slice's ownership if needed; a regression in the redirect matrix is a rejection."
    - "Consume the existing mock-session seam, do NOT fork auth: the lane drives the existing packages/auth mock-session seam + the apps/*/api/mock-session routes; it does not introduce a parallel session mechanism, and it does not wire or anticipate the real provider."
    - "Container smoke (docker-compose stack) before Validate."
acceptance_scenarios: .planning/EPIC-009-poc-two-role-sign-in-lane.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-first-sign-in, flow-role-redirect]
code_standards:
  - CS-TS-001    # required — any request-scoped DB read (seeded accounts / role resolution) goes through packages/db wrapper
  - CS-TS-003    # recommended — cross-surface parity (the lane spans apps/portal + apps/admin)
  - CS-GEN-001   # recommended — no secrets/PII in logs (the signed mock-session cookie / HMAC secret)
  - CS-GEN-002   # recommended — additive, non-destructive edits to keyed artifacts
  - CS-GEN-003   # recommended — cite the governing key (// ADR-NNN / // CS-<LANG>-NNN) in code + tests
source:
  - planning: .planning/EPIC-009-poc-two-role-sign-in-lane.md
  - requirements: .requirements/REQ-AUTH-013.md
  - requirements: .requirements/REQ-AUTH-010.md
  - requirements: .requirements/REQ-AUTH-001.md
  - architecture: .architecture/decisions/ADR-001-authentication-clerk.md
  - architecture: .architecture/decisions/ADR-005-security-policies.md
  - architecture: .architecture/decisions/ADR-010-cross-app-navigation-session-boundaries.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
---

# BRIEF-009 — Sign-in lane — sign-in/sign-out capability (PoC mock realization) + consolidated role-based landing

> Self-contained build brief for the EPIC-009 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-009` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **5 in-scope AC.** This slice realizes the **sign-in/sign-out capability** (REQ-AUTH-013, new,
> against the mock provider) and **consolidates** the **role-based landing** (REQ-AUTH-010, whose redirect
> *mechanism* EPIC-004 already delivered + verified). In the PoC it ships as a usable **in-browser dev sign-in
> lane** over the existing mock-session seam, **inert under the real provider**. It introduces **no net-new
> entity, schema, RLS policy, or provider seam** — it is UI + behavior over the existing `AUTH_PROVIDER=mock`
> seam.

## Scope

Deliver, for a PoC build running under `AUTH_PROVIDER=mock`, an end-to-end **sign-in/sign-out capability**
exercised through a usable in-browser **dev sign-in lane**, across both surfaces:

1. **Sign in → land on the role-appropriate surface (AC-AUTH-013-01).** A user opens the sign-in lane, chooses
   a **role (Accountant or Client) and a specific seeded person**, and is signed in — landing **authenticated**
   on the surface for that role (the accountant on the Tax Portal `apps/admin`; a client on the Client Portal
   `apps/portal`) with **no further manual navigation**. The lane **establishes the signed mock session via the
   existing `/api/mock-session` seam** — the role is set **server-side** (ADR-005); the lane only triggers it.

2. **Sign out → unauthenticated (AC-AUTH-013-02).** A signed-in user can **sign out**; this **ends the session**
   and returns them to an **unauthenticated** state, such that any subsequent access to a protected surface
   requires signing in again. Sign-out is **global** across both apps (one identity/session — ADR-010).

3. **Role/user switcher (dev-acceptance — NOT a product AC).** While signed in, an **in-app role/user switcher +
   sign-out** affordance lets a single tester hop between "the accountant's view" and "a client's view" (or pick
   another seeded account) without the devtools `/api/mock-session` hack — re-landing on the correct app for the
   newly chosen role.

4. **The role-based redirect matrix holds (AC-AUTH-010-01/-02/-03).** A signed-in user reaching the wrong
   surface for their role is redirected to their own; public client routes stay reachable for any role. The
   **mechanism already exists** (EPIC-004); this slice **owns** these AC now and must keep them covered + green
   through the lane's sign-in path — **not** rebuild the middleware.

**Inert under the real provider (the safety property).** The dev sign-in lane is **active only under
`AUTH_PROVIDER=mock`** and is **absent/404 under `AUTH_PROVIDER=clerk`** — exactly as `/api/mock-session` 404s.
It never becomes a sign-in path in a real or production build.

This is the foundation that makes every later PoC slice **demoable by a human as either role**.

## Out of scope

- **Real authentication (real Clerk), real invitations, and 2FA** → the end-of-cycle **Production Readiness**
  phase (Phase 5). This slice neither wires nor anticipates the real provider; it realizes the sign-in/sign-out
  capability against the **mock** seam only. Real-Clerk re-validation of REQ-AUTH-013 + the 2FA enablement
  (AC-AUTH-004-*/AC-AUTH-005-01) are Phase 5.
- **The identity model itself** — the two-role model (REQ-AUTH-001), invitation-only client creation
  (REQ-AUTH-006), and session duration (REQ-AUTH-009) remain **EPIC-004** (verified-against-mock). This slice
  delivers the sign-in/sign-out *act* and the role-based landing, not the identity model.
- **Rebuilding the cross-app redirect middleware** — the AC-AUTH-010 mechanism was delivered by EPIC-004. This
  slice consolidates **ownership** of those AC and ensures non-regression through the lane; it does not
  re-implement the matrix.
- **Seeding the demo accounts** — the seeded accountant + clients the lane lists come from the existing demo
  seed (`pnpm demo:stage`); this slice **consumes** them, it does not own the seed.
- **Any product-AC status for the dev-lane affordances** — the role/user switcher, the sign-in page listing
  seeded accounts, and the inert-under-`clerk` guard are **dev-tooling acceptance** (verified by automated
  tests), **not** product AC (a real user is only ever one role; the lane does not exist in a real build).

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when all 5 in-scope AC are independently validated.

**REQ-AUTH-013 — User sign-in and sign-out** *(new this slice; realized against the mock provider)*
- **AC-AUTH-013-01** — After a user successfully signs in, they reach the surface appropriate to their role (accountant → admin, client → portal) without further manual navigation.
- **AC-AUTH-013-02** — A signed-in user can sign out; signing out ends their session, leaving them unauthenticated such that any subsequent access to a protected surface requires signing in again.

**REQ-AUTH-010 — Role-based redirect between surfaces** *(consolidated from EPIC-004; mechanism already verified — keep covered + green, do not rebuild)*
- **AC-AUTH-010-01** — A signed-in CLIENT navigating to the admin surface is redirected to the client surface; no admin content is rendered.
- **AC-AUTH-010-02** — A signed-in ACCOUNTANT navigating to a CLIENT-only route is redirected to the admin surface; no client-only content is rendered.
- **AC-AUTH-010-03** — Public (non-client-only) routes on the client surface remain reachable regardless of role, without a role-based redirect.

> **Dev-acceptance (NOT product AC — verified by tests, no COVERAGE rows):** (a) the role/user switcher re-lands
> on the correct app for the newly chosen role; (b) the **inert-under-`AUTH_PROVIDER=clerk` guard** — the lane is
> absent/404 and establishes no mock session in the real binding. These are sign-off obligations for *this
> slice's tooling*; (b) is the security-relevant guard (an `extra_gate`), not advisory.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-009-poc-two-role-sign-in-lane.md` § Acceptance scenarios — the product-AC scenarios — and
  § Dev-acceptance scenarios — the switcher + inert guard) are the behavior contract. The SDET binds them to
  executable Playwright/integration steps (or validates against them in prose until the Cucumber tooling lands,
  per CLAUDE.md § Executable gherkin tooling). Do **not** re-author scenarios; bind the epic's.
- **E2e required (`apps/portal` + `apps/admin`).** Per the CLAUDE.md IO e2e default, an auth/sign-in flow is
  `E2e-required: yes`. Sign-in-as-each-role + correct landing and the role/user switcher run as tier-6 e2e on
  both surfaces; the cross-app landing is `pnpm e2e:cross-app`.
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **e2e (tier 6, both apps):** sign in as the Accountant ⇒ land on `apps/admin`; sign in as a seeded Client ⇒
    land on that client's `apps/portal` home (AC-AUTH-013-01); the role/user switcher re-lands correctly
    (dev-acceptance).
  - **integration/unit (tier 2/3):** sign-out ends the session ⇒ a protected route requires re-auth
    (AC-AUTH-013-02); the **inert-under-`AUTH_PROVIDER=clerk` guard** (the lane is 404/absent and no mock session
    can be established) — the security-relevant guard; server-established-role assertion (ADR-005).
  - **redirect matrix (AC-AUTH-010-01/-02/-03):** covered by the existing EPIC-004 e2e/integration redirect
    tests — keep them tagged with the AC ids, exercised through the lane's sign-in path, and green.
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` + `pnpm
  e2e:cross-app`; container smoke before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of the dev sign-in lane: signing in as **jane-accountant** (→ `apps/admin`) and as
  **sarah-returning-client** (→ `apps/portal`), plus the role/user switcher hop, into `docs/demos/EPIC-009/`.
  **Non-gating**; the e2e gate is the gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-001 — Authentication via Clerk.** The sign-in/sign-out capability is provider-agnostic; this slice
  realizes it against the **mock** provider only. The dev sign-in lane is a **mock-seam affordance** and MUST be
  **inert under the real binding**: when `AUTH_PROVIDER=clerk` the lane route is absent/404 (same contract as
  `/api/mock-session`). It does not replace, pre-empt, or stand in for the real Clerk sign-in.
- **ADR-005 — Security policies / server-set role.** The role is **established server-side** by the signed
  (HMAC) mock-session cookie the existing endpoint issues; the lane merely **triggers** that endpoint for the
  chosen seeded account. The browser cannot assert a role that bypasses the server-set cookie — **no
  client-trusted role path**. Any request-scoped DB access (e.g. resolving the seeded account / role) goes
  through the `packages/db` wrapper (CS-TS-001).
- **ADR-010 — Cross-app navigation & session boundaries.** After sign-in the redirect matrix governs landing
  (AC-AUTH-010-*): a CLIENT session lands on `apps/portal`, an ACCOUNTANT session on `apps/admin`; switching role
  re-lands accordingly; **sign-out is global** across both apps (AC-AUTH-013-02).
- **ADR-006 — Monorepo, two apps.** The lane must let a tester enter **either** surface as the correct role
  (the accountant into `apps/admin`, a client into `apps/portal`). The two apps share one identity space.
- **ADR-012 — Testing pyramid.** Both the sign-in/sign-out + landing behavior **and** the
  inert-under-real-binding guard are **automated obligations**; the inert guard is a **security-relevant test**,
  not advisory.
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory). Merge on green required CI, no `--admin`/`enforce_admins`
  toggle (MERGE-POLICY Lane B). This slice touches **application code only** (no engine/role/workflow files), so
  it takes the reviewed lane.

## Code standards

Applicable `.code-standards/` keys (threaded into the touching task specs at IO Design; tag honoring
code/tests `// CS-<LANG>-NNN`, CS-GEN-003; the SDET checks each key's `verification` hook):

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (any seeded-account
  / role resolution the lane performs).
- **CS-TS-003** (`recommended`) — cross-surface parity: the lane spans `apps/portal` + `apps/admin`; apply the
  shared sign-in/switcher pattern to both surfaces.
- **CS-GEN-001** (`recommended`) — no secrets/PII in logs (the signed mock-session cookie / HMAC secret must not
  be logged).
- **CS-GEN-002** (`recommended`) — additive, non-destructive edits to keyed artifacts.
- **CS-GEN-003** (`recommended`) — cite the governing key (`// ADR-NNN` / `// CS-<LANG>-NNN`) in code + tests.

## References

- Planning: `.planning/EPIC-009-poc-two-role-sign-in-lane.md` (slice, 5 AC, the product-AC + dev-acceptance
  gherkin scenarios, tier map, the consolidation note, the out-of-scope boundaries).
- Requirements: REQ-AUTH-013 (sign-in/sign-out — owned here), REQ-AUTH-010 (role-based redirect — consolidated
  here), REQ-AUTH-001 (the two-role model — related, EPIC-004).
- Architecture: ADR-001, ADR-005, ADR-006, ADR-010, ADR-012.
- Personas: `.planning/personas/jane-accountant.md`, `.planning/personas/sarah-returning-client.md`.
- Flows: `.planning/flows/flow-first-sign-in.md`, `.planning/flows/flow-role-redirect.md` (the lane realizes the
  sign-in + landing step of each, under `AUTH_PROVIDER=mock`).
- Prior art in-repo (read-only context; IO Design assesses exact wiring): the mock-session seam
  (`packages/auth/src/mock-session-api.ts`); the per-app routes (`apps/portal/src/app/api/mock-session/route.ts`,
  `apps/admin/src/app/api/mock-session/route.ts`); the existing portal sign-in route
  (`apps/portal/src/app/(public)/sign-in/`); the cross-app redirect middleware + its e2e
  (`apps/admin/e2e/specs/cross-app-redirect.spec.ts`, `auth-redirect.spec.ts`); the e2e auth fixtures
  (`apps/*/e2e/fixtures/auth.ts`); the demo seed (`pnpm demo:stage`).

## Notes

- **Dev-capacity slice (5 AC), no net-new infrastructure.** Unlike the EPIC-005/006/007 slices it introduces
  **no net-new entity, RLS policy, or provider seam** — it is UI + behavior over the existing `AUTH_PROVIDER=mock`
  seam. The substantive work is the in-browser sign-in lane (role/account picker → `/api/mock-session` → land),
  the role/user switcher + sign-out, and the **inert-under-real-binding guard**. The risk surface is the
  **security guard** (a dev login lane must be impossible under the real binding) and the **server-set-role**
  property (no client-trusted role path) — not new data infrastructure. Hence **no `## Data & Interface
  Contract`** section (no net-new shapes).
- **Two of the five AC are already verified.** AC-AUTH-010-01/-02/-03 are verified via EPIC-004's redirect tests
  (PR#38). This slice **owns** them now and must keep them tagged + green through the lane's sign-in path; the
  net-new build is AC-AUTH-013-01/-02 + the dev-lane affordances + the inert guard. At Validate, the planning
  write-back confirms the new AUTH-013 AC pass and the AUTH-010 AC remain verified, then rolls EPIC-009 to
  `delivered`.
- **Not a phase-closer.** EPIC-009 is **not** the last `planned` epic of Phase 3 (EPIC-010..015 remain), so
  **no phase walkthrough video** is obligated this slice (the Report-phase phase-closeout check records
  `n/a (phase in progress)`).
- **No third-party integration, no ADR blocks dispatch.** All five cited ADRs (001/005/006/010/012) are Accepted;
  the lane uses only the mock seam. No e-sign/scanner/storage/email. This slice does **not** change
  docker-compose/env wiring, so the DevOps inventory/runbook update is **not** expected to be triggered.

---
id: EPIC-009
title: PoC two-role sign-in lane (dev mock auth)
phase: 3
status: planned   # 2026-06-20 — scope resolved interactively; no blocking open question
slice: In a PoC/dev build, a tester opens a sign-in lane in the browser, picks a role (Accountant or Client) and a seeded person, and lands authenticated in the right app — with an in-app way to switch role/user or sign out. No real auth provider.
requirements: []  # OWNS NO PRODUCT AC. This is a PoC/dev-capacity testing affordance that makes the existing
                  # mock-auth seam (AUTH_PROVIDER=mock, /api/mock-session) human-usable. It does not change the
                  # product's auth model or sign-in requirements — those stay EPIC-004 (verified-against-mock)
                  # and the end-of-cycle Production Readiness placeholder (real provider). See run notes.
architecture:
  - ADR-001   # auth via Clerk — the dev lane is a MOCK-seam affordance and MUST be inert under the real binding (disabled when AUTH_PROVIDER=clerk), exactly as /api/mock-session 404s
  - ADR-005   # role is server-established via the signed mock-session cookie; the lane only triggers it — the browser still cannot forge a role
  - ADR-010   # after sign-in via the lane, the cross-app redirect matrix still governs where each role lands
  - ADR-006   # monorepo, two apps — the lane lets a tester enter either app (apps/portal client, apps/admin accountant) as the right role
  - ADR-012   # testing pyramid — the lane's behavior AND its inert-under-real-binding guard are automated obligations
depends_on: [EPIC-004]
source:
  - .requirements/REQ-AUTH-001.md
  - .requirements/REQ-AUTH-010.md
  - .architecture/decisions/ADR-001-authentication-clerk.md
  - .architecture/decisions/ADR-005-security-policies.md
open_questions: []
---

# EPIC-009 — PoC two-role sign-in lane (dev mock auth)

> A **preparation document**, not build instructions. This is a **PoC/dev-capacity enabler**: it makes the
> existing mock-auth seam usable from the browser so the proof-of-concept can be driven and demoed as either
> role. It owns **no product acceptance criteria** and introduces no real authentication provider. It does
> not say how to build it.

## Vertical slice
Today the only way to sign in to a dev build is to POST to `/api/mock-session` by hand (the real `/sign-in`
route is a deliberate 404 under `AUTH_PROVIDER=mock`). For a proof-of-concept that needs to be exercised and
demoed as **both** product roles, that is too clumsy. This slice delivers a **dev sign-in lane**: a usable
in-browser page that lets a tester choose a **role — Accountant or Client — and a specific seeded person**,
establishes the signed mock session via the existing `/api/mock-session` seam, and lands them authenticated
in the correct app. It also exposes an **in-app role/user switcher and sign-out**, so a single tester can hop
between "the accountant's view" and "a client's view" without devtools. The lane is **active only under
`AUTH_PROVIDER=mock`** and is **inert (absent/404) under the real provider** — it never becomes a sign-in
path in a real or production build. This is the foundation that makes every other PoC slice demoable by a
human.

## What this enables (PoC scope — owns no product AC)
This epic does **not** deliver or re-validate any product `AC-*`. It is dev tooling that lets a human
**manually exercise** the already-delivered auth model (the two roles and the cross-app redirect matrix from
EPIC-004) without the mock-session console hack. Concretely it provides:

- A **dev sign-in page** (replacing the 404 `/sign-in`) listing the seeded accountant and the seeded clients,
  with one click to sign in as that account (role set server-side via the mock-session cookie).
- A **role/user switcher + sign-out** affordance visible while signed in, so a tester can move between roles.
- A **hard guard**: under `AUTH_PROVIDER=clerk` the lane is gone (404/absent), like `/api/mock-session`.

The real product sign-in (real Clerk) is **out of scope** and lives in the end-of-cycle **Production
Readiness** placeholder (see `ROADMAP.md`).

## Architecture adherence

- **ADR-001 — Authentication via Clerk.** The lane is a **mock-seam affordance only**. It MUST be inert under
  the real binding: when `AUTH_PROVIDER=clerk` the lane route is absent/404 (same contract as
  `/api/mock-session`). It does not replace, pre-empt, or stand in for the real Clerk sign-in.
- **ADR-005 — Security policies / server-set role.** The role is still **established server-side** by the
  signed (HMAC) mock-session cookie the existing endpoint issues; the lane merely triggers that endpoint for
  the chosen account. The browser cannot assert a role that bypasses the server-set cookie — the lane must
  not introduce a client-trusted role path.
- **ADR-010 — Cross-app navigation & session boundaries.** After signing in through the lane, the redirect
  matrix still governs landing: a Client session lands on `apps/portal`, an Accountant session on
  `apps/admin`; switching role re-lands accordingly; sign-out is global.
- **ADR-006 — Monorepo, two apps.** The lane must let a tester enter **either** surface as the correct role
  (the accountant into `apps/admin`, a client into `apps/portal`).
- **ADR-012 — Testing pyramid.** Two automated obligations: (1) the lane signs a tester in as each role and
  lands them on the correct app; (2) the **inert-under-`AUTH_PROVIDER=clerk` guard** holds (the lane is not
  reachable in a real binding). The guard is a security-relevant test, not advisory.

## PoC acceptance scenarios
> Behavior contract for the **lane itself** (PoC/dev acceptance). These are **not tagged with product AC**,
> because this epic owns none — they are the dev-acceptance the builder must satisfy.

### Sign in as the accountant
```gherkin
Given a PoC build running under AUTH_PROVIDER=mock with the demo accounts seeded
When the tester opens the sign-in lane and chooses the Accountant
Then a mock session for the ACCOUNTANT is established and the tester lands authenticated on the Tax Portal (admin) dashboard
```

### Sign in as a specific seeded client
```gherkin
Given a PoC build under AUTH_PROVIDER=mock with seeded clients
When the tester opens the sign-in lane and chooses a named client (e.g. an in-progress engagement)
Then a mock session for that CLIENT is established and the tester lands authenticated on that client's Client Portal home
```

### Switch role / user without devtools
```gherkin
Given the tester is signed in through the lane as one role
When they use the in-app switcher to choose the other role (or sign out and pick another account)
Then the prior session is replaced and they land on the correct app for the newly chosen role
```

### The lane is inert under the real provider
```gherkin
Given a build configured with AUTH_PROVIDER=clerk
When anyone requests the dev sign-in lane route
Then it is absent (404) and no mock session can be established through it
```

## Traceability & sign-off contract
- This epic owns **no product `AC-*`**, so it adds **no rows to `COVERAGE.md`**. Its sign-off is the **PoC
  acceptance scenarios above**, covered by automated test(s) and confirmed in CI.
- The **inert-under-`AUTH_PROVIDER=clerk`** guard MUST have an automated test — it is the safety property that
  keeps a dev login lane out of any real/production build.
- Delivery is recorded by rolling this epic's front-matter `status` to `delivered` once the lane's tests
  (both roles land correctly + the inert guard) pass in CI. No coverage roll-up applies (no AC owned).
- Suggested tiers (per `.architecture/strategy/TESTING.md`): **e2e (tier 6, both apps)** for sign-in-as-each-
  role + the switcher; **integration/unit (tier 2/3)** for the inert-under-real-binding guard.

## Out of scope
- **Real authentication (real Clerk), real invitations, and 2FA** → the end-of-cycle **Production Readiness**
  placeholder (`ROADMAP.md`). This lane neither wires nor anticipates the real provider; it only makes the
  mock seam usable for the PoC.
- **Any use in a real/production build** — the lane is hard-disabled under `AUTH_PROVIDER=clerk`. It is a
  dev-capacity affordance by construction.
- **New product auth behavior** — it does not alter the ownership or status of any `AUTH-*` AC (those remain
  EPIC-004, verified-against-mock); it is a way to *exercise* them by hand, not a re-delivery.
- **Seeding the accounts** — the demo accounts the lane lists come from the existing demo seed
  (`pnpm demo:stage`); this slice consumes them, it does not own the seed.

## Links
- Requirements: REQ-AUTH-001, REQ-AUTH-010 (exercised manually via the lane; owned by EPIC-004)
- Architecture: ADR-001, ADR-005, ADR-006, ADR-010, ADR-012
- Personas: `personas/jane-accountant.md`, `personas/sarah-returning-client.md`
- Flows: `flows/flow-first-sign-in.md`, `flows/flow-role-redirect.md` (the lane is the PoC mock entry point that realizes the sign-in step of each, under `AUTH_PROVIDER=mock`)
- Epics: depends on **EPIC-004** (the mock auth seam this makes usable); the real sign-in it stands in for is the end-of-cycle Production Readiness placeholder
- Open questions: none

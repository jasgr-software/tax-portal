---
id: EPIC-009
title: Sign-in lane (sign-in/sign-out capability, PoC mock realization)
phase: 3
status: delivered   # 2026-06-21 — delivered (PR #71, squash `169b09e`): all 5 in-scope AC verified vs the MOCK provider (AC-AUTH-013-01/-02 flipped planned→verified; AC-AUTH-010-01/-02/-03 stay verified, PR#71 confirmation appended). Real-provider (Clerk) re-validation + 2FA stay deferred to Phase 5. Re-decomposed earlier this day: owns the sign-in/sign-out capability AC (REQ-AUTH-013) + the consolidated landing AC (REQ-AUTH-010).
slice: A user opens the sign-in surface, authenticates as their role, and lands on the surface for that role; a signed-in user can sign out back to an unauthenticated state. Realized against the mock auth provider in the PoC (a dev sign-in lane with a role/user switcher); the real provider is Phase 5.
requirements:
  - REQ-AUTH-013: [AC-AUTH-013-01, AC-AUTH-013-02]   # the sign-in/sign-out capability — the new product AC this slice realizes (against the mock)
  - REQ-AUTH-010: [AC-AUTH-010-01, AC-AUTH-010-02, AC-AUTH-010-03]   # role-based redirect — CONSOLIDATED here from EPIC-004 (the sign-in story lives in one epic); already verified via EPIC-004 PR#38, see COVERAGE
architecture:
  - ADR-001   # auth via Clerk — the PoC lane is a MOCK-seam realization and MUST be inert under the real binding (disabled when AUTH_PROVIDER=clerk), exactly as /api/mock-session 404s
  - ADR-005   # role is server-established via the signed mock-session cookie; the lane only triggers it — the browser still cannot forge a role
  - ADR-010   # after sign-in, the cross-app redirect matrix governs where each role lands; sign-out is global
  - ADR-006   # monorepo, two apps — a tester enters either app (apps/portal client, apps/admin accountant) as the right role
  - ADR-012   # testing pyramid — the sign-in/sign-out + landing behavior AND the inert-under-real-binding guard are automated obligations
depends_on: [EPIC-004]
source:
  - .requirements/REQ-AUTH-013.md
  - .requirements/REQ-AUTH-010.md
  - .requirements/REQ-AUTH-001.md
  - .architecture/decisions/ADR-001-authentication-clerk.md
  - .architecture/decisions/ADR-005-security-policies.md
  - .architecture/decisions/ADR-010-cross-app-navigation-session-boundaries.md
open_questions: []
---

# EPIC-009 — Sign-in lane (sign-in/sign-out capability, PoC mock realization)

> A **preparation document**, not build instructions. This slice realizes the **sign-in/sign-out
> capability** (REQ-AUTH-013) and consolidates the **role-based landing** (REQ-AUTH-010) into the one epic
> that owns the sign-in story. In the PoC it is realized against the **mock auth provider** as a usable
> in-browser **dev sign-in lane** (with a role/user switcher), so the proof-of-concept can be driven and
> demoed as either role. The **real auth provider** (Clerk) and **2FA** are deferred to the end-of-cycle
> Production Readiness phase. It does not say *how* to build the lane.

## Vertical slice
A user reaches the sign-in surface, authenticates as their role, and lands on the surface meant for that
role — the accountant on the Tax Portal (`apps/admin`), a client on the Client Portal (`apps/portal`) —
and a signed-in user can **sign out** back to an unauthenticated state. That is the product capability
(REQ-AUTH-013), complemented by the role-based redirect that keeps each role on its own surface
(REQ-AUTH-010, consolidated here).

In the **PoC build** this capability is realized against the **mock auth provider** (`AUTH_PROVIDER=mock`).
Today the only way to sign in to a dev build is to POST to `/api/mock-session` by hand (the real `/sign-in`
route is a deliberate 404 under the mock binding) — too clumsy to exercise and demo as both roles. So the
slice delivers a **dev sign-in lane**: a usable in-browser page that lets a tester choose a **role —
Accountant or Client — and a specific seeded person**, establishes the signed mock session via the
existing `/api/mock-session` seam, and lands them on the correct app; plus an **in-app role/user switcher
and sign-out** so a single tester can hop between roles without devtools. The lane is **active only under
`AUTH_PROVIDER=mock`** and is **inert (absent/404) under the real provider** — it never becomes a sign-in
path in a real or production build. This is the foundation that makes every other PoC slice demoable by a
human.

## Requirements delivered

- **REQ-AUTH-013 — User sign-in and sign-out** (the new product capability this slice realizes against the mock)
  - **AC-AUTH-013-01** — after a user successfully signs in, they reach the surface appropriate to their
    role (the accountant on the admin surface, a client on the client surface) without further manual
    navigation.
  - **AC-AUTH-013-02** — a signed-in user can sign out; signing out ends their authenticated session,
    leaving them unauthenticated such that any subsequent access to a protected surface requires signing
    in again.
- **REQ-AUTH-010 — Role-based redirect between surfaces** (consolidated into the sign-in epic; **already
  verified** via EPIC-004 PR#38 — the redirect *mechanism* was built there; ownership of these AC moves
  here so the sign-in capability lives in one epic — see COVERAGE note)
  - **AC-AUTH-010-01** — a signed-in CLIENT navigating to the admin surface is redirected to the client surface.
  - **AC-AUTH-010-02** — a signed-in ACCOUNTANT navigating to a CLIENT-only route is redirected to the admin surface.
  - **AC-AUTH-010-03** — public (non-client-only) routes on the client surface remain reachable regardless of role.

## Architecture adherence

- **ADR-001 — Authentication via Clerk.** The sign-in/sign-out capability is provider-agnostic; this slice
  realizes it against the **mock** provider. The dev sign-in lane is a **mock-seam affordance only** and
  MUST be inert under the real binding: when `AUTH_PROVIDER=clerk` the lane route is absent/404 (same
  contract as `/api/mock-session`). It does not replace, pre-empt, or stand in for the real Clerk sign-in
  (which lands, with 2FA + real invitations, in Production Readiness).
- **ADR-005 — Security policies / server-set role.** The role is **established server-side** by the signed
  (HMAC) mock-session cookie the existing endpoint issues; the lane merely triggers that endpoint for the
  chosen account. The browser cannot assert a role that bypasses the server-set cookie — the lane must not
  introduce a client-trusted role path.
- **ADR-010 — Cross-app navigation & session boundaries.** After sign-in the redirect matrix governs
  landing (AC-AUTH-010-*): a CLIENT session lands on `apps/portal`, an ACCOUNTANT session on `apps/admin`;
  switching role re-lands accordingly; **sign-out is global** across both apps (AC-AUTH-013-02).
- **ADR-006 — Monorepo, two apps.** The lane must let a tester enter **either** surface as the correct role
  (the accountant into `apps/admin`, a client into `apps/portal`).
- **ADR-012 — Testing pyramid.** Automated obligations: (1) sign-in lands each role on the correct app
  (AC-AUTH-013-01); (2) sign-out returns to an unauthenticated state (AC-AUTH-013-02); (3) the redirect
  matrix holds (AC-AUTH-010-*); (4) the **inert-under-`AUTH_PROVIDER=clerk` guard** holds (a
  security-relevant test, not advisory — it keeps a dev login lane out of any real binding).

## Acceptance scenarios
> Product behavior, tagged with the AC each scenario covers. In the PoC these run against the mock provider
> via the dev sign-in lane.
>
> **✅ VALIDATED (mock realization) 2026-06-21 — PR #71, squash `169b09e`.** All scenarios below are bound to
> passing AC-id-tagged tests, independently re-run by the SDET against the live docker-compose stack (see
> `COVERAGE.md` basis note [B]): AC-AUTH-013-01 — portal/admin `sign-in-lane.spec.ts` 6/6 + 5/5; AC-AUTH-013-02 —
> tier-6 global-sign-out e2e both surfaces; AC-AUTH-010-01/-02/-03 — `cross-app-redirect.spec.ts` 5/5. Verified
> **vs the mock provider**; the real-provider (Clerk) re-validation of these scenarios is outstanding at Phase 5.

### ✅ AC-AUTH-013-01 — Sign in as the accountant and land on the admin surface
```gherkin
Given a PoC build under AUTH_PROVIDER=mock with the demo accounts seeded
When the tester opens the sign-in lane and signs in as the Accountant
Then a session for the ACCOUNTANT is established and they land authenticated on the Tax Portal (admin) dashboard without further navigation
```

### ✅ AC-AUTH-013-01 — Sign in as a seeded client and land on the client surface
```gherkin
Given a PoC build under AUTH_PROVIDER=mock with seeded clients
When the tester opens the sign-in lane and signs in as a named client
Then a session for that CLIENT is established and they land authenticated on that client's Client Portal home without further navigation
```

### ✅ AC-AUTH-013-02 — Sign out returns to an unauthenticated state
```gherkin
Given a tester signed in through the lane as either role
When they sign out
Then their session ends and any subsequent request to a protected surface requires signing in again
```

### ✅ AC-AUTH-010-01 — Client is redirected away from the admin surface
```gherkin
Given a signed-in CLIENT
When they navigate to a route on the accountant (admin) surface
Then they are redirected to the client surface and no admin content is rendered
```

### ✅ AC-AUTH-010-02 — Accountant is redirected away from client-only routes
```gherkin
Given a signed-in ACCOUNTANT
When they navigate to a CLIENT-only route on the client surface
Then they are redirected to the admin surface and no client-only content is rendered
```

### ✅ AC-AUTH-010-03 — Public client routes stay reachable for any role
```gherkin
Given a signed-in user of either role (or an anonymous visitor)
When they navigate to a public, non-client-only route on the client surface
Then the route is served without a role-based redirect
```

## Dev-acceptance scenarios (PoC tooling — NOT product AC)
> The dev sign-in lane is PoC test/demo tooling. These behaviors are the lane's own acceptance — they are
> **not** tagged with product AC (a real user is only ever one role, and the lane does not exist in a real
> build). They are sign-off obligations for *this slice's tooling*, verified by automated tests.

### Role/user switcher — move between roles without devtools
```gherkin
Given the tester is signed in through the lane as one role
When they use the in-app switcher to choose the other role (or sign out and pick another seeded account)
Then the prior session is replaced and they land on the correct app for the newly chosen role
```

### The lane is inert under the real provider (safety property)
```gherkin
Given a build configured with AUTH_PROVIDER=clerk
When anyone requests the dev sign-in lane route
Then it is absent (404) and no mock session can be established through it
```

## Traceability & sign-off contract
- **Product AC** — each in-scope AC (AC-AUTH-013-01/-02, AC-AUTH-010-01/-02/-03) is covered by automated
  test(s) **tagged with its AC id** and signed off in `COVERAGE.md` when those tests pass in CI.
  - **AC-AUTH-013-01/-02** are **new** this slice (realized against the mock) — `planned` until their
    tagged tests pass in EPIC-009's CI.
  - **AC-AUTH-010-01/-02/-03** are **already `verified`** (the redirect mechanism was delivered by EPIC-004,
    PR#38 `0444551`); ownership is consolidated here. They stay `verified`; EPIC-009's CI re-exercises them.
- **Dev-acceptance** — the **role/user switcher** and the **inert-under-`AUTH_PROVIDER=clerk` guard** MUST
  each have an automated test. The inert guard is the **safety property** that keeps a dev login lane out of
  any real/production build — it is required, not advisory. These are not COVERAGE rows (no product AC).
- The epic rolls to `delivered` once all in-scope **product** AC are `verified` in `COVERAGE.md` (i.e. the
  new AC-AUTH-013-* pass in CI; AC-AUTH-010-* are already verified) and the dev-acceptance tests pass.
- Suggested tiers (per `.architecture/strategy/TESTING.md`): **e2e (tier 6, both apps)** for sign-in-as-each-
  role + landing (AC-AUTH-013-01) and the switcher; **integration/unit (tier 2/3)** for sign-out
  (AC-AUTH-013-02) and the inert-under-real-binding guard; the redirect matrix (AC-AUTH-010-*) is covered by
  the existing EPIC-004 e2e/integration tests.

## Out of scope
- **Real authentication (real Clerk), real invitations, and 2FA** → the end-of-cycle **Production Readiness**
  placeholder (`ROADMAP.md`). This slice neither wires nor anticipates the real provider; it realizes the
  sign-in/sign-out capability against the **mock** and makes that seam usable for the PoC. The real-provider
  re-validation of REQ-AUTH-013 (and the 2FA deferral, AC-AUTH-004-*/AC-AUTH-005-01) lives there.
- **Any use of the dev sign-in lane in a real/production build** — the lane is hard-disabled under
  `AUTH_PROVIDER=clerk`. It is a dev-capacity affordance by construction.
- **The role model, invitation-only client creation, and session duration** (REQ-AUTH-001/006/009) — those
  remain **EPIC-004** (verified-against-mock); this epic owns the sign-in/sign-out *act* and the role-based
  landing, not the identity model.
- **Seeding the accounts** — the demo accounts the lane lists come from the existing demo seed
  (`pnpm demo:stage`); this slice consumes them, it does not own the seed.

## Links
- Requirements: REQ-AUTH-013 (sign-in/sign-out — owned here), REQ-AUTH-010 (role-based redirect —
  consolidated here from EPIC-004), REQ-AUTH-001 (the two-role model — related, owned by EPIC-004)
- Architecture: ADR-001, ADR-005, ADR-006, ADR-010, ADR-012
- Personas: `personas/jane-accountant.md`, `personas/sarah-returning-client.md`
- Flows: `flows/flow-first-sign-in.md`, `flows/flow-role-redirect.md` (this epic realizes the sign-in +
  landing step of each; under `AUTH_PROVIDER=mock` via the dev lane in the PoC)
- Epics: depends on **EPIC-004** (the role model + mock auth seam this builds on); REQ-AUTH-010 moves here
  from EPIC-004; the real sign-in it stands in for is the end-of-cycle Production Readiness placeholder
- Open questions: none

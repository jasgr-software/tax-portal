---
id: EPIC-004
title: Authentication & the two-role model
phase: 1
status: delivered   # 2026-06-16 — 11/11 in-scope AC verified (PR #38, squash merge 0444551); 4 2FA AC remain deferred
slice: The accountant signs in and an invited prospect creates a client account; each lands on the correct app for their role and is kept out of the other.
requirements:
  - REQ-AUTH-001: [AC-AUTH-001-01, AC-AUTH-001-02, AC-AUTH-001-03]
  - REQ-AUTH-005: [AC-AUTH-005-02]
  - REQ-AUTH-006: [AC-AUTH-006-01, AC-AUTH-006-02, AC-AUTH-006-03]
  - REQ-AUTH-009: [AC-AUTH-009-01]
  - REQ-AUTH-010: [AC-AUTH-010-01, AC-AUTH-010-02, AC-AUTH-010-03]
architecture:
  - ADR-001   # authentication via Clerk (roles, 2FA, invitations, sessions)
  - ADR-006   # monorepo — two apps (apps/portal client, apps/admin accountant)
  - ADR-010   # cross-app navigation & session boundaries (the redirect matrix)
  - ADR-003   # identity propagation via SESSION_CONTEXT (set on the authenticated accountant path)
  - ADR-005   # security policies — the role established here is the basis every later access rule builds on
  - ADR-022   # anti-abuse rate limiting on the auth/sign-in surface
  - ADR-019   # audit trail for security-significant auth events
  - ADR-012   # testing pyramid — tiers the AC tests must hit
depends_on: []
source:
  - .requirements/REQ-AUTH-001.md
  - .requirements/REQ-AUTH-004.md
  - .requirements/REQ-AUTH-005.md
  - .requirements/REQ-AUTH-006.md
  - .requirements/REQ-AUTH-009.md
  - .requirements/REQ-AUTH-010.md
  - .architecture/decisions/ADR-001-authentication-clerk.md
  - .architecture/decisions/ADR-010-cross-app-navigation-session-boundaries.md
open_questions: []
---

# EPIC-004 — Authentication & the two-role model

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice stands up the **identity spine** the rest of the product builds on. The **accountant** signs
in to the Tax Portal (`apps/admin`) and reaches her work surface; an
**invited prospect** (the invitation is issued by EPIC-003) lands on the Client Portal (`apps/portal`)
sign-up, creates a **CLIENT** account, and reaches the client surface. Every authenticated account is
exactly one of two roles — ACCOUNTANT or CLIENT — and the cross-app middleware keeps each role on its own
surface, redirecting misnavigation without leaking the other app's UI. There is **no self-service
registration**: a client account can come into being only from an accountant-issued invitation. This is a
genuine end-to-end thread (a real person signs in and is correctly placed) and it is the foundation
EPIC-002 (admin catalog) and EPIC-003 (request inbox) depend on.

## Requirements delivered

- **REQ-AUTH-001 — Two authenticated roles**
  - **AC-AUTH-001-01** — exactly two authenticated roles exist: ACCOUNTANT and CLIENT; no others.
  - **AC-AUTH-001-02** — every authenticated account has exactly one role (never both, never none).
  - **AC-AUTH-001-03** — an account's role is determinable at every point after sign-in (downstream gates rely on it).
- **REQ-AUTH-005 — Optional two-factor for clients** (no-2FA path only this slice)
  - **AC-AUTH-005-02** — a client can complete sign-up and sign-in without enrolling a second factor.
- **REQ-AUTH-006 — Clients are invitation-only**
  - **AC-AUTH-006-01** — a client account can be created only via an accountant-issued invitation.
  - **AC-AUTH-006-02** — there is no public/self-service registration path to a client account.
  - **AC-AUTH-006-03** — the invitation that enables client account creation originates from the accountant.
- **REQ-AUTH-009 — Default session duration (v1)**
  - **AC-AUTH-009-01** — authenticated sessions expire per the standard default session timeout.
- **REQ-AUTH-010 — Role-based redirect between surfaces**
  - **AC-AUTH-010-01** — a signed-in CLIENT navigating to the admin surface is redirected to the client surface.
  - **AC-AUTH-010-02** — a signed-in ACCOUNTANT navigating to a CLIENT-only route is redirected to the admin surface.
  - **AC-AUTH-010-03** — public (non-client-only) routes on the client surface remain reachable regardless of role.

## Architecture adherence

- **ADR-001 — Authentication via Clerk.** Roles, the invitation mechanism, and session lifetime are
  provided through the auth provider; the role is carried in the session so middleware can read it. The
  invitation path (issued in EPIC-003) terminates here in account creation. **2FA is deferred this slice** —
  optional-client / mandatory-accountant 2FA enforcement (AC-AUTH-004-* and AC-AUTH-005-01) lands with the
  future Phase-1 "2FA enablement" slice (the auth spine ships without it; e2e mocks the auth provider here).
- **ADR-006 — Monorepo, two apps.** Accountant auth surfaces live in `apps/admin`; client sign-up/sign-in
  in `apps/portal`. The two apps share one auth application and one user identity space.
- **ADR-010 — Cross-app navigation & session boundaries.** The redirect matrix is the contract for
  AC-AUTH-010-*: a mismatched role is redirected by middleware **before** any wrong-app content renders;
  public client routes are exempt. Sign-out is global across both apps.
- **ADR-003 — Identity propagation via SESSION_CONTEXT.** On the authenticated accountant path, the
  request context (identity + role) must be established so later data access runs under the right principal.
- **ADR-005 — Security policies.** This slice establishes the *role* that every later row-level rule keys
  on; it does not yet introduce client-scoped data (that arrives with engagements). The invariant: role is
  trustworthy and server-evaluated, never client-asserted.
- **ADR-022 — Anti-abuse rate limiting.** The sign-in surface must be rate-limited against credential
  stuffing / brute force.
- **ADR-019 — Audit trail.** Security-significant auth events (accountant sign-in, client account creation
  from invitation) are recorded in the audit trail.
- **ADR-012 — Testing pyramid.** The cross-app redirect and the no-self-registration invariant are
  integration/e2e obligations, not advisory unit checks.

## Acceptance scenarios

### AC-AUTH-001-01 — Only two roles exist
```gherkin
Given the authentication model of the system
When the set of assignable authenticated roles is enumerated
Then it contains exactly ACCOUNTANT and CLIENT and no other authenticated role
```

### AC-AUTH-001-02 — Each account has exactly one role
```gherkin
Given any authenticated account in the system
When its role assignment is inspected
Then it has exactly one role — never both ACCOUNTANT and CLIENT, and never none
```

### AC-AUTH-001-03 — Role is determinable after sign-in
```gherkin
Given a signed-in account
When any access decision is evaluated for that account
Then the account's role is available and authoritative for that decision
```

### AC-AUTH-005-02 — Client may proceed without a second factor
```gherkin
Given an invited prospect creating a client account
When the prospect completes sign-up and later signs in without enrolling a second factor
Then both sign-up and sign-in succeed without a second factor
```

### AC-AUTH-006-01 — Client account only via invitation
```gherkin
Given a person with no accountant-issued invitation
When they attempt to obtain a client account
Then no client account is created
```

### AC-AUTH-006-02 — No self-service registration path
```gherkin
Given the client surface
When a visitor looks for a way to register a client account on their own
Then no public or self-service registration path exists
```

### AC-AUTH-006-03 — Invitation originates from the accountant
```gherkin
Given a client account that has been created
When the origin of its enabling invitation is examined
Then the invitation was issued by the accountant
```

### AC-AUTH-009-01 — Sessions expire on the default timeout
```gherkin
Given an authenticated session
When the standard default session timeout elapses without renewal
Then the session is no longer valid and re-authentication is required
```

### AC-AUTH-010-01 — Client is redirected away from the admin surface
```gherkin
Given a signed-in CLIENT
When they navigate to a route on the accountant (admin) surface
Then they are redirected to the client surface and no admin content is rendered
```

### AC-AUTH-010-02 — Accountant is redirected away from client-only routes
```gherkin
Given a signed-in ACCOUNTANT
When they navigate to a CLIENT-only route on the client surface
Then they are redirected to the admin surface and no client-only content is rendered
```

### AC-AUTH-010-03 — Public client routes stay reachable for any role
```gherkin
Given a signed-in user of either role (or an anonymous visitor)
When they navigate to a public, non-client-only route on the client surface
Then the route is served without a role-based redirect
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-AUTH-NNN-NN` id), at the tier(s) the architecture testing strategy
  prescribes.
- An AC is **implemented** only when its tagged test(s) **pass in CI** — CI is the independent gate.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per `.architecture/strategy/TESTING.md`):
  - **e2e (tier 6, both apps)** — AC-AUTH-005-02 (client without 2FA), AC-AUTH-006-01/-02 (no
    self-registration), AC-AUTH-010-01/-02/-03 (the redirect matrix).
  - **service integration (tier 3)** — AC-AUTH-001-02/-03 (one-role invariant; role readable server-side),
    AC-AUTH-006-03 (invitation provenance), AC-AUTH-009-01 (session expiry).
  - **unit/component (tier 2/5)** — AC-AUTH-001-01 (role enumeration).

## Out of scope
- **REQ-AUTH-004** (mandatory accountant 2FA) + **AC-AUTH-005-01** (client 2FA enrollment) → **deferred**
  to a future Phase-1 "2FA enablement" slice (2FA not ready to deploy; the auth spine ships without it; the
  slice mocks the auth provider for e2e). Tracked `deferred` in `COVERAGE.md`.
- **REQ-AUTH-002** (accountant full visibility over clients/engagements) → **deferred** to the phase with
  engagements and a client list (no engagements exist yet to exercise it). Tracked in `COVERAGE.md` Orphans.
- **REQ-AUTH-003** (client sees only their own data — RLS isolation) → **deferred** to the first phase that
  introduces client-scoped data; the per-policy "CLIENT-A cannot read CLIENT-B" test needs client-owned rows.
- **REQ-AUTH-007** (multiple participants per engagement) and **REQ-AUTH-008** (indefinite access after
  completion) → **deferred** to the engagement-lifecycle phase (no engagements/completion in the MVP).
- Issuing the invitation itself (accept → invite) is **EPIC-003**; this epic owns the account-creation
  *outcome* of that invitation (AUTH-006), not the accept action.

## Links
- Requirements: REQ-AUTH-001, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-009, REQ-AUTH-010
- Architecture: ADR-001, ADR-003, ADR-005, ADR-006, ADR-010, ADR-012, ADR-019, ADR-022
- Personas: `personas/jane-accountant.md`, `personas/tom-prospective-client.md` (post-acceptance → CLIENT),
  `personas/sarah-returning-client.md`
- Flows: `flows/flow-first-sign-in.md`, `flows/flow-role-redirect.md`
- Epics: enables EPIC-002 (admin catalog) and EPIC-003 (request inbox); related EPIC-001 (anonymous door)
- Open questions: none

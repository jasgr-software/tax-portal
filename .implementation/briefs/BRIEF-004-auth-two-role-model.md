---
id: BRIEF-004
title: Authentication & the two-role model — accountant sign-in, invited-client account, role redirect (2FA deferred; auth provider mocked for e2e)
status: ready
acceptance_criteria:
  - id: AC-AUTH-001-01
    text: The system defines exactly two authenticated roles — ACCOUNTANT and CLIENT. No other authenticated role can be assigned to an account.
  - id: AC-AUTH-001-02
    text: Every authenticated account has exactly one role; an account is never assigned both roles and is never assigned zero roles.
  - id: AC-AUTH-001-03
    text: An authenticated account's role is determinable at every point after sign-in, so that downstream access decisions can rely on it.
  - id: AC-AUTH-005-02
    text: A CLIENT can complete both sign-up and sign-in without enrolling a second factor; it is never forced on them.
  - id: AC-AUTH-006-01
    text: A CLIENT account can be created only via an invitation issued by the accountant.
  - id: AC-AUTH-006-02
    text: There is no public or self-service registration path through which a person can create their own CLIENT account.
  - id: AC-AUTH-006-03
    text: The invitation that enables CLIENT account creation originates from the accountant accepting an engagement request.
  - id: AC-AUTH-009-01
    text: Authenticated sessions expire according to the standard default session timeout; v1 provides no custom or configurable session-duration setting.
  - id: AC-AUTH-010-01
    text: A signed-in CLIENT who navigates to the accountant (admin) surface is redirected to the client surface.
  - id: AC-AUTH-010-02
    text: A signed-in ACCOUNTANT who navigates to a CLIENT-only route on the client surface is redirected to the accountant surface.
  - id: AC-AUTH-010-03
    text: Public (non-client-only) routes on the client surface remain reachable by a signed-in ACCOUNTANT without redirect; only CLIENT-only routes trigger the redirect.
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Cross-app redirect e2e in BOTH apps (ADR-010 redirect matrix): CLIENT→admin redirect, ACCOUNTANT→client-only redirect, ACCOUNTANT→public-portal served, session continuity + global sign-out — the `pnpm e2e:cross-app` specs are a hard requirement (ADR-010 §8), not advisory."
    - "Sign-in rate-limiting on the auth surface (ADR-022): an integration test proving the sign-in surface throttles credential-stuffing / brute-force attempts. (Applies to password sign-in; independent of 2FA.)"
    - "Auth-event audit (ADR-019): an integration test proving security-significant auth events (accountant sign-in, client account creation from invitation) are written to the audit trail."
    - "packages/db SESSION_CONTEXT regression test: prove the `packages/db` Prisma `$extends` wrapper sets SESSION_CONTEXT (identity + role) before the first real query on the authenticated accountant path — first request-scoped-auth slice (deferred from EPIC-001)."
    - "Container smoke test (docker-compose stack) before Validate — per CLAUDE.md."
acceptance_scenarios:
  - "apps/admin/e2e/features/auth-two-role.feature + apps/portal/e2e/features/auth-two-role.feature (bind the 11 Given/When/Then scenarios reproduced in §Acceptance scenarios below, split across the two apps by surface)"
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, tom-prospective-client]
  flows: [flow-first-sign-in, flow-role-redirect]
source:
  - "planning: .planning/EPIC-004-auth-two-role-model.md"
  - "requirements: .requirements/REQ-AUTH-001.md, .requirements/REQ-AUTH-005.md, .requirements/REQ-AUTH-006.md, .requirements/REQ-AUTH-009.md, .requirements/REQ-AUTH-010.md"
  - "architecture: ADR-001, ADR-003, ADR-005, ADR-006, ADR-010, ADR-012, ADR-019, ADR-022"
---

# BRIEF-004 — Authentication & the two-role model

> Self-contained build brief for the identity-spine slice of the Tax Accountant Client Portal. Composed by
> the Conductor from `.planning/EPIC-004` and its cited requirement/architecture sources. The `source:` refs
> are soft context; this brief stands alone.
>
> **Re-scoped 2026-06-15 (user direction).** Two-factor authentication is **deferred** — the practice is not
> ready to deploy 2FA. The mandatory-accountant-2FA AC (REQ-AUTH-004 → AC-AUTH-004-01/-02/-03) and the
> client-2FA-enrollment AC (AC-AUTH-005-01) have left this slice's scope (tracked `deferred` in
> `.planning/COVERAGE.md`, targeted at a future Phase-1 "2FA enablement" slice). The auth spine ships now
> **without** 2FA. Per the same direction, the **auth provider is mocked/test-doubled for e2e + local dev** —
> real Clerk test-mode provisioning is deferred with the 2FA work, so **no real Clerk keys are required to
> build, run, or validate this slice**. This is a deliberate, user-approved deviation from the usual "never
> stub the auth provider" rule; see §Constraints for the hardening follow-up.

## Scope

Stand up the **identity spine** the rest of the product builds on — a genuine end-to-end thread in which a
real person signs in and is correctly placed:

- The **accountant** signs in to the **Tax Portal (`apps/admin`)** and reaches her work surface.
- An **invited prospect** lands on the **Client Portal (`apps/portal`)** sign-up (from an accountant-issued
  invitation), creates a **CLIENT** account, and reaches the client surface — **without** being required to
  enroll a second factor.
- Every authenticated account is **exactly one of two roles** — ACCOUNTANT or CLIENT — and the role is
  **server-evaluated** (read from the session), never client-asserted, and determinable at every access
  decision after sign-in.
- **Per-app middleware** enforces the **cross-app redirect matrix** (ADR-010): a CLIENT on the admin surface
  is bounced to the client home, an ACCOUNTANT on a CLIENT-only route is bounced to the admin home, and
  **public** client routes stay reachable for any role — all **before** any wrong-app content renders.
- **No self-service registration**: a CLIENT account can come into being **only** from an accountant-issued
  invitation.

Concretely, this slice includes:

- **Scaffolding `apps/admin` (Tax Portal)** — it does not yet exist. Mirror the `apps/portal` setup
  established in EPIC-001: Next.js (App Router, the version `apps/portal` is actually on — currently Next
  15.x, **not** the stale "14" label in older docs) + TypeScript + Tailwind/shadcn + the auth provider wiring
  + Playwright + Vitest config + an `e2e:run` script. Per CLAUDE.md the app is **not** considered scaffolded
  without its e2e infrastructure.
- **An auth abstraction** (`packages/auth`, or folded into `packages/db` exports — the IO Design decides
  placement) that the apps depend on for: the **role** carried on the session (`ACCOUNTANT | CLIENT`), the
  **invitation-only** account-creation mechanism, and **session** validity. It has a **real provider binding
  (Clerk, per ADR-001 — one app, two sign-in surfaces) that is the production target**, and a **mock/test
  double** selected in e2e + local dev so this slice needs no real Clerk keys. The seam is what makes the
  later "2FA enablement" slice a drop-in (swap the mock for real Clerk test-mode; turn on the 2FA AC).
- **Per-app `middleware.ts`** in each app implementing the ADR-010 redirect matrix + the role gate, via a
  shared `requireRole()` helper so neither app hand-rolls the check.
- The **`packages/db` request-context wrapper** establishing `SESSION_CONTEXT` (identity + role) on the
  authenticated accountant path before the first DB query (ADR-003) — the **first request-scoped-auth slice**.
- **Sign-in rate-limiting** (ADR-022) and **auth-event audit** records (ADR-019) on the auth surface.
- The full test pyramid binding each of the 11 in-scope AC to a tagged test at the prescribed tier (see
  Methodology), including the `pnpm e2e:cross-app` redirect specs, all runnable against the mocked provider.

## Out of scope

- **2FA — DEFERRED this slice (user direction 2026-06-15).** REQ-AUTH-004 (mandatory accountant 2FA →
  AC-AUTH-004-01/-02/-03) and AC-AUTH-005-01 (client *may enroll* a second factor) are deferred to a future
  Phase-1 "2FA enablement" slice that stands up real Clerk test-mode and re-validates them against the live
  provider. **Do not build or test a 2FA gate, enrollment flow, or MFA-enforcement policy in this slice.** The
  auth abstraction should leave room for it (don't design it out), but it is not delivered here.
- **REQ-AUTH-002** (accountant full visibility over clients/engagements) → **deferred** to the phase with
  engagements and a client list.
- **REQ-AUTH-003** (client sees only their own data — per-policy RLS isolation, "CLIENT-A cannot read
  CLIENT-B") → **deferred** to the first phase that introduces client-scoped data. This slice introduces
  **no** client-scoped data tables and **no** per-policy isolation test.
- **REQ-AUTH-007** (multiple participants per engagement) and **REQ-AUTH-008** (indefinite access after
  completion) → **deferred** to the engagement-lifecycle phase.
- **Issuing the invitation itself** (the accept → invite action) is **EPIC-003** (accountant request inbox).
  This slice owns the **account-creation outcome** of an accountant-issued invitation (AUTH-006), **not** the
  accept action. The slice therefore **simulates** the issued invitation via the auth abstraction's invitation
  mechanism (a backend-issued invitation / test fixture carrying role `CLIENT`) and verifies an account can be
  created **from it** and **never** via a self-service path.
- No mobile/native surface; web browser only (v1).

## Acceptance criteria

Each AC is owned by this slice and must be covered by automated test(s) **tagged with its AC id** (the test
title/annotation contains the `AC-AUTH-NNN-NN` id) at the tier(s) in §Methodology.

- **AC-AUTH-001-01** — The system defines exactly two authenticated roles — ACCOUNTANT and CLIENT. No other
  authenticated role can be assigned to an account.
- **AC-AUTH-001-02** — Every authenticated account has exactly one role; never both, never zero.
- **AC-AUTH-001-03** — An authenticated account's role is determinable at every point after sign-in, so
  downstream access decisions can rely on it.
- **AC-AUTH-005-02** — A CLIENT can complete both sign-up and sign-in without enrolling a second factor; it
  is never forced on them.
- **AC-AUTH-006-01** — A CLIENT account can be created only via an invitation issued by the accountant.
- **AC-AUTH-006-02** — There is no public or self-service registration path through which a person can create
  their own CLIENT account.
- **AC-AUTH-006-03** — The invitation that enables CLIENT account creation originates from the accountant
  accepting an engagement request.
- **AC-AUTH-009-01** — Authenticated sessions expire according to the standard default session timeout; v1
  provides no custom or configurable session-duration setting.
- **AC-AUTH-010-01** — A signed-in CLIENT who navigates to the accountant (admin) surface is redirected to
  the client surface.
- **AC-AUTH-010-02** — A signed-in ACCOUNTANT who navigates to a CLIENT-only route on the client surface is
  redirected to the accountant surface.
- **AC-AUTH-010-03** — Public (non-client-only) routes on the client surface remain reachable by a signed-in
  ACCOUNTANT without redirect; only CLIENT-only routes trigger the redirect.

## Methodology & quality requirements

Honor these (produced upstream by `.planning/` + `.architecture/strategy/TESTING.md`):

- **Acceptance format: gherkin.** The 11 Given/When/Then scenarios in §Acceptance scenarios are the behavior
  contract. Bind them to executable Playwright e2e specs in the **owning app by surface** (`apps/admin` for
  the accountant sign-in path; `apps/portal` for client sign-up + the no-self-registration check; the redirect
  matrix spans both via `pnpm e2e:cross-app`). Until the Cucumber binder lands (see CLAUDE.md), author them
  as standard `.spec.ts` covering the scenario behavior, each tagged by its AC id; mirror as `.feature` files
  under `apps/<app>/e2e/features/auth-two-role.feature`.
- **e2e: required — against the mocked auth provider.** This slice touches sign-in, invitation account
  creation, the cross-app redirect matrix, and `SESSION_CONTEXT` propagation — all on the project's default
  `E2e-required: yes` list. **Both apps** are in scope (ADR-006: portal + admin are two frontends of one
  platform). The e2e suite drives a **mock/test-double of the auth provider** (test sessions with the role
  claim pre-set; a fixture invitation) — **no real Clerk instance is contacted.** "Mocked" applies to the
  *provider*, not the gate: the e2e gate still runs and still gates, exercising the app's real middleware,
  routes, role gate, and DB path end-to-end against the live docker-compose stack.
- **Tier mapping (per `.architecture/strategy/TESTING.md` + the epic sign-off contract):**
  - **e2e (tier 6, both apps)** — AC-AUTH-005-02 (client without 2FA, `apps/portal`), AC-AUTH-006-01/-02 (no
    self-registration, `apps/portal`), AC-AUTH-010-01/-02/-03 (the redirect matrix, `pnpm e2e:cross-app`).
  - **service integration (tier 3)** — AC-AUTH-001-02/-03 (one-role invariant; role readable server-side),
    AC-AUTH-006-03 (invitation provenance), AC-AUTH-009-01 (session expiry — simulated via the provider seam).
  - **unit/component (tier 2/5)** — AC-AUTH-001-01 (role enumeration).
- **Submission gate** (per CLAUDE.md): `pnpm lint` · `pnpm type-check` · `pnpm --filter portal test` ·
  `pnpm --filter admin test` · both apps' e2e suites · `pnpm e2e:cross-app` · the container smoke test
  between Review and Validate.
- **AC-id test-tag contract:** every AC's covering test carries its `AC-AUTH-NNN-NN` id so the planning
  validate phase can flip `COVERAGE.md` rows on CI evidence.
- **UI demo (`demo.applicable: yes`):** author dedicated `@demo` Playwright walkthrough specs capturing an
  AC-tagged screenshot gallery into `docs/demos/EPIC-004/` — the **first-sign-in** happy-path
  (jane-accountant → admin; tom-prospective-client → portal client account, no 2FA) and the **role-redirect**
  journey. **Non-gating** (the e2e gate is the gate). See `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables, each tracing to a cited source:

- **Auth provider is mocked for e2e + local dev (user-approved deviation, 2026-06-15).** The slice builds
  against an **auth abstraction** with a real-provider binding (Clerk, per ADR-001) as the production target
  and a **mock/test-double** selected in e2e + local dev. **No real Clerk keys are required** to build, run,
  or validate this slice; the e2e suite contacts **no** real Clerk instance. This deviates from the usual
  "never stub the real auth provider" rule **by explicit user direction** because real Clerk provisioning is
  deferred with the 2FA work. **Hardening follow-up (required when the "2FA enablement" slice lands):** swap
  the mock for real Clerk test-mode, enforce mandatory-accountant / optional-client MFA, and **re-validate
  AUTH-006 (invitation), AUTH-009 (session), and AUTH-010 (redirect) against the live provider** — record this
  in the completion/handoff report and as a carried follow-up.
- **ADR-001 — Clerk is the production auth target; one Clerk application, two sign-in surfaces.** Where the
  real binding is wired, both apps point at the **same** Clerk application (shared keys, one user pool, one
  webhook at `apps/portal/api/webhooks/clerk`); the role lives on the user as `publicMetadata.role:
  'ACCOUNTANT' | 'CLIENT'`, **read server-side from the session**; self-registration is **blocked**. The
  abstraction must keep this shape so the real binding is a drop-in — but **mandatory MFA enforcement is
  deferred** (the 2FA-enablement slice turns it on).
- **ADR-006 — Monorepo, two apps.** Accountant auth surfaces live in **`apps/admin`** (Tax Portal, port
  3001); client sign-up/sign-in in **`apps/portal`** (Client Portal, port 3000). The two apps share one auth
  application and one user identity space. `apps/admin` is scaffolded in this slice as a mirror of
  `apps/portal`.
- **ADR-010 — Cross-app navigation & session boundaries (the redirect matrix is the AC-AUTH-010-* contract).**
  Per-app middleware redirects a mismatched role to **its own home surface before any wrong-app content
  renders** (no flash of admin UI): signed-in CLIENT → `apps/admin` ⇒ redirect to `apps/portal/`; signed-in
  ACCOUNTANT → CLIENT-only portal route ⇒ redirect to `apps/admin/`; signed-in ACCOUNTANT → **public** portal
  route ⇒ **served** (no redirect). Misnavigation is a **redirect, not a 403**. `apps/admin` has **no public
  routes** (every path requires an authenticated ACCOUNTANT session); `apps/portal` has an explicit public
  allow-list (`/`, `/services`, `/request`, `/sign-in`, `/sign-up`). Redirect destinations use the
  `PORTAL_APP_URL` / `ADMIN_APP_URL` env vars. **Sign-out is global** across both apps (one session); prove it
  in the cross-app e2e. The mandatory negative cross-app e2e specs (ADR-010 §8) are a **hard requirement**.
- **ADR-003 — Identity propagation via `SESSION_CONTEXT`.** On the authenticated accountant path the request
  context (identity + role) must be established through the **`packages/db` Prisma wrapper** (`$extends`) that
  sets `SESSION_CONTEXT` **before the first real query**. Direct Prisma access in route handlers outside that
  wrapper is a convention violation. Add the **regression test** that proves the wrapper sets
  `SESSION_CONTEXT` (this is the first request-scoped-auth slice — the check was deferred from EPIC-001).
- **ADR-005 — Security policies; role is the trust boundary.** The role established here is **trustworthy and
  server-evaluated, never client-asserted**, and is the basis every later row-level rule keys on. This slice
  introduces **no client-scoped data** yet, so no per-policy "CLIENT-A vs CLIENT-B" isolation test is in scope
  — but the role must already be authoritative server-side (including under the mocked provider, where the
  role claim is established by the test session, not asserted by the client).
- **ADR-022 — Anti-abuse rate limiting.** The **sign-in surface must be rate-limited** against credential
  stuffing / brute force, with an integration test proving the throttle. (Independent of 2FA — it guards the
  password sign-in that ships now.)
- **ADR-019 — Audit trail.** Security-significant auth events — **accountant sign-in** and **client account
  creation from invitation** — are recorded in the audit trail, with an integration test proving the write.
- **ADR-012 — Testing pyramid.** The cross-app redirect and the no-self-registration invariant are
  **integration/e2e obligations**, not advisory unit checks (see the tier mapping).
- **Session timeout (AC-AUTH-009-01).** REQ-AUTH-009 mandates the **standard default** session timeout with
  **no custom/configurable** setting in v1. In this slice, session validity/expiry is modeled by the auth
  abstraction and the tier-3 test asserts a session is invalid after the default timeout elapses and that
  re-authentication is required. **When the real Clerk binding lands** (2FA-enablement slice), pin the session
  max-lifetime + idle timeout explicitly to Clerk's documented defaults and record the exact values in the
  operations runbook (do not rely on an unverified implicit SDK default).

## References

- **Planning:** `.planning/EPIC-004-auth-two-role-model.md` (re-scoped: 11 in-scope AC; 2FA deferred — slice,
  AC ownership, tier mapping, sign-off contract, Given/When/Then scenarios).
- **Requirements:** REQ-AUTH-001 (two roles), REQ-AUTH-005 (optional client 2FA — only the no-2FA path
  AC-AUTH-005-02 is in scope), REQ-AUTH-006 (invitation-only clients), REQ-AUTH-009 (default session
  duration), REQ-AUTH-010 (role-based redirect). *(REQ-AUTH-004 mandatory 2FA — deferred, not in this slice.)*
- **Architecture:** ADR-001 (Clerk, one app/two surfaces — production target), ADR-003 (`SESSION_CONTEXT`
  identity propagation), ADR-005 (security policies / role trust boundary), ADR-006 (monorepo / two apps),
  ADR-010 (cross-app navigation & redirect matrix), ADR-012 (testing pyramid), ADR-019 (audit trail), ADR-022
  (anti-abuse rate limiting).
- **Behavior contract:** personas `jane-accountant`, `tom-prospective-client` (post-acceptance → CLIENT);
  flows `flow-first-sign-in`, `flow-role-redirect`.

## Acceptance scenarios

> Gherkin reproduced verbatim from EPIC-004 (2FA scenarios removed with the deferral). Bind each to an
> executable Playwright spec tagged with its AC id, in the owning app by surface; mirror under
> `apps/<app>/e2e/features/auth-two-role.feature`. The redirect matrix scenarios (AC-AUTH-010-*) bind to the
> `pnpm e2e:cross-app` suite. All run against the mocked auth provider.

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

## Notes

- **2FA is deferred by user direction (2026-06-15)** — see the header note and §Out of scope. Build the auth
  abstraction so the later "2FA enablement" slice is a drop-in: don't design 2FA out, but don't build it here.
- **`apps/admin` does not yet exist.** Scaffolding the Tax Portal app (Next.js App Router + TypeScript +
  Tailwind/shadcn + the auth abstraction wiring + Playwright/Vitest + `e2e:run`) is part of standing this
  slice up; per CLAUDE.md the app is not considered scaffolded without its e2e infrastructure. The DevOps role
  owns any docker-compose / `inventory.md` / `runbook.md` updates that come with adding the admin app
  container and the `PORTAL_APP_URL` / `ADMIN_APP_URL` env vars.
- **Next.js version:** the brief title/older docs say "Next 14," but `apps/portal` is actually on **Next
  15.x** — mirror the real `apps/portal` scaffold, not the stale label.
- **EPIC-002 (admin catalog) and EPIC-003 (request inbox) depend on this** — keep the role model, the
  `requireRole()` helper placement, the auth abstraction seam, and the `SESSION_CONTEXT` wrapper clean and
  reusable; they are the foundation both later epics build on. EPIC-003 supplies the real accept → invite
  **issuance** action whose account-creation outcome this slice already proves (against the mock).
- Sequenced among Phase-1 epics as the dependency-free identity spine (EPIC-001 is delivered); this is the
  second Phase-1 slice.

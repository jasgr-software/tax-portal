# TASK-004-005: apps/portal client auth — invitation-landing sign-up + sign-in (no 2FA) + invitation-only / no-self-registration

**Brief**: BRIEF-004
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-004-004 (done) — `packages/auth` role model + mock binding + invitation seam
**Impl**: developer
**E2e-required**: yes
**Started-at**: 2026-06-15T14:00:00Z
**Completed-at**: 2026-06-15T16:00:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** AC-AUTH-005-02 (client completes sign-up + sign-in without a second factor), AC-AUTH-006-01 (CLIENT account only via accountant-issued invitation), AC-AUTH-006-02 (no public/self-service registration path), AC-AUTH-006-03 (the enabling invitation originates from the accountant)
**Upstream refs:** ADR-001 (Clerk production target / invitation-only / role server-side — honored via the mock binding seam), ADR-005 (role server-evaluated, never client-asserted), ADR-010 (`/sign-in` + `/sign-up` are portal public allow-list routes — do not break the allow-list)
**Introduces-gate:** no <!-- this task's e2e specs run inside the existing portal `e2e:run` gate; the hard `pnpm e2e:cross-app` gate is introduced by TASK-004-008, not here -->

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm --filter portal test` pass
- [x] **Targeted e2e** — actual execution output in Work Log (portal `e2e:run`, the AC-tagged specs below; the brief mandates e2e)
- [x] **Security review** — no self-service registration path; role never client-asserted; sign-up only proceeds with a valid invitation ticket; no injection in the invitation-landing handler
- [x] **SDET Review** — approved

## SDET Review focus areas

- **AC-id test-tag contract** — every covering test title/annotation carries its `AC-AUTH-NNN-NN` id so the planning validate phase can flip `COVERAGE.md` rows on CI evidence.
- **AC-AUTH-006-02 is a *negative* invariant** — verify the test proves there is **no** path to a CLIENT account without an invitation: a visitor on the client surface finds no self-service register link/route, and a direct attempt to reach sign-up without an invitation ticket does NOT create an account. A test that merely exercises the happy path is insufficient.
- **AC-AUTH-006-03 provenance (tier-3 integration)** — verify the created CLIENT account's enabling invitation traces to an **accountant-issued** invitation (role set server-side on the invitation, via the auth abstraction's `createInvitation(email, 'CLIENT')` / `FIXTURE_INVITATION`) — not a client-supplied role. The role on the invitation must be server-set, never read from request input.
- **AC-AUTH-005-02 no-2FA** — sign-up AND sign-in both complete with **no** second-factor step; verify no 2FA gate/enrollment is introduced (2FA is deferred this slice — do not build or assert it).
- **ADR-005** — under the mock binding the session (and thus role) is established server-side by `/api/mock-session` (signed cookie); the sign-up flow must NOT let the browser assert its own role. Confirm the CLIENT role on the new session derives from the invitation, not from request body/header/query.
- **ADR-010 allow-list intact** — `/sign-in` and `/sign-up` remain in `PORTAL_PUBLIC_PATHS` and are reachable unauthenticated; the new routes must not regress the public front door (TASK-004-002 e2e seam still green).
- **Scope** — this is an **`apps/portal`-only** task (the client sign-up/sign-in surface). The accountant sign-in surface lives in `apps/admin` and is exercised by the cross-app redirect suite (TASK-004-008). The CLAUDE.md multi-surface default does **not** force admin work here; do not over-scope into `apps/admin`.

## Context

This task delivers the **client-facing auth surface** of the identity spine: an invited prospect lands on
`apps/portal` from an accountant-issued invitation, creates a **CLIENT** account, and signs in — **without**
being forced to enroll a second factor — and there is **no** self-service path to a CLIENT account.

Per BRIEF-004 §Out of scope, this slice does **not** build the accept→invite *issuance* action (that is
EPIC-003). It **simulates** the issued invitation via the auth abstraction's invitation mechanism
(`packages/auth` `createInvitation(email, 'CLIENT')` / the exported `FIXTURE_INVITATION`, role `CLIENT` set
server-side) and proves: (a) an account can be created **from** that invitation, (b) **no** account can be
created without one, and (c) the enabling invitation's role is **accountant-set / server-set**.

The seam already exists from TASK-004-002/-004:
- `packages/auth` exports `FIXTURE_INVITATION` (role `CLIENT`), `MockAuthProvider.createInvitation(email, role)`,
  `getAuthProvider()`, and the `/api/mock-session` route (active when `AUTH_PROVIDER=mock`) that establishes the
  signed session cookie **server-side** (ADR-005).
- `/sign-in` and `/sign-up` are already in `PORTAL_PUBLIC_PATHS` (allow-listed by portal middleware) but **no
  route renders for them yet** — this task adds those routes.
- Portal e2e auth fixtures exist (`apps/portal/e2e/fixtures/auth.ts`: `setupClientSession`,
  `setupAccountantSession`, `clearSession`).

## Methodology (carried from the brief)

- **`acceptance_format: gherkin`** — bind the AC-AUTH-005-02 / AC-AUTH-006-01/-02 scenarios to executable
  Playwright `.spec.ts` (tier-6 e2e), each tagged by its AC id. Mirror the bound scenarios into
  `apps/portal/e2e/features/auth-two-role.feature` (human-readable until the Cucumber binder lands — see
  CLAUDE.md). The verbatim Given/When/Then for these AC are in BRIEF-004 §Acceptance scenarios.
- **`e2e: required`** — against the **mocked auth provider** (`AUTH_PROVIDER=mock`, no real Clerk). The gate
  still gates: real portal middleware/routes/role-gate exercised end-to-end against the docker-compose stack.
  AC-AUTH-006-03 is **tier-3 integration** (not e2e) — assert invitation provenance against `packages/auth`.
- **`tdd: optional`**, **`coverage_target: none`**.
- **2FA deferred** — build/assert **no** second factor anywhere in sign-up or sign-in.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/(public)/sign-up/page.tsx` | create | Invitation-landing sign-up page. Renders ONLY when a valid invitation ticket is present (e.g. `?ticket=` / `?invitation=`); with no/invalid ticket, shows a "no self-service registration — invitation required" state and creates **no** account. No 2FA step. |
| `apps/portal/src/app/(public)/sign-up/actions.ts` | create | Server action that validates the invitation ticket via the auth abstraction and establishes the new CLIENT session **server-side** (role from the invitation, never from client input). No account created without a valid invitation. |
| `apps/portal/src/app/(public)/sign-in/page.tsx` | create | Client sign-in surface. Completes sign-in with **no** second-factor step (AC-AUTH-005-02). |
| `apps/portal/src/app/(public)/sign-in/actions.ts` | create (if a server action is needed) | Sign-in server action against the mock binding; establishes the session server-side. |
| `apps/portal/e2e/specs/client-signup.spec.ts` | create | Tier-6 e2e: AC-AUTH-005-02 (sign-up + sign-in, no 2FA), AC-AUTH-006-01 (account only via invitation), AC-AUTH-006-02 (no self-service path). AC-id-tagged. |
| `apps/portal/e2e/features/auth-two-role.feature` | create | Human-readable mirror of the bound AC-AUTH-005-02 / -006-01/-02 gherkin scenarios (portal surface). |
| `packages/auth/src/*.test.ts` (or `apps/portal/src/**/*.test.ts`) | create/modify | Tier-3 integration: AC-AUTH-006-03 — the created CLIENT account's enabling invitation originates from an accountant-set (server-set) invitation role; client cannot supply its own role. AC-id-tagged. |
| `apps/portal/e2e/fixtures/auth.ts` | not modified | Existing fixtures (`setupClientSession`, `setupAccountantSession`, `clearSession`) were sufficient; no new helpers needed. |
| `apps/portal/src/app/dashboard/page.tsx` | create (added — not in original spec) | Minimal stub private route so sign-up/sign-in have a real redirect target post-auth. ACCOUNTANT redirect matrix also needs this page to exercise AC-AUTH-010-01. See DECISION comment. |

> The developer owns keeping this Files table consistent with what is actually built (developer.md step 7).
> If a route group, file path, or query-param convention differs, update this table in the same commit and note
> the choice as a `// DECISION:` in code.
>
> **Deviations noted (Work Log step 7):**
> - `apps/portal/e2e/fixtures/auth.ts` was NOT modified — existing fixtures covered the e2e needs.
> - `apps/portal/src/app/dashboard/page.tsx` was ADDED as an unspecified file. The sign-up/sign-in actions
>   redirect to `/dashboard`; without a real page, the e2e redirect assertion would fail with a 404. This
>   stub is an in-task necessity (not scope creep) — it is the minimal private CLIENT route that the middleware
>   guards. Noted here and as a `// DECISION:` in the file header.

## Tests to Write First (test plan — TDD optional)

- [x] **AC-AUTH-005-02** (e2e, `@AC-AUTH-005-02`) — an invited prospect lands on `/sign-up?<ticket>`, completes
      sign-up with **no** second-factor prompt, then signs in via `/sign-in` with **no** second factor →
      both succeed; lands on the client surface. expected: client session established, no 2FA step encountered.
- [x] **AC-AUTH-006-01** (e2e, `@AC-AUTH-006-01`) — sign-up **with** a valid accountant-issued invitation ticket
      → CLIENT account/session created. expected: success only because the invitation is present.
- [x] **AC-AUTH-006-02** (e2e, `@AC-AUTH-006-02`) — a visitor on the client surface finds **no** self-service
      register path, and a sign-up attempt **without** an invitation ticket creates **no** account. expected:
      no account; the surface offers no public registration route.
- [x] **AC-AUTH-006-03** (integration, `@AC-AUTH-006-03`) — the invitation enabling a created CLIENT account has
      its role **server-set** by `createInvitation(email, 'CLIENT')` / `FIXTURE_INVITATION`; a client-supplied
      role on the request is ignored. expected: invitation role is `CLIENT` and provenance is the
      accountant/server, never client input.

## Implementation Notes (IO guidance — not implementation code)

- **Invitation simulation, not issuance.** Use `packages/auth`'s existing seam — `FIXTURE_INVITATION` (role
  `CLIENT`) and/or `getAuthProvider().createInvitation(email, 'CLIENT')`. Do **not** build the accept→invite
  action (EPIC-003). The ticket is the contract: a valid ticket ⇒ proceed; absent/invalid ⇒ no account.
- **No-self-registration is the load-bearing invariant (AC-AUTH-006-02).** The sign-up route must **require** a
  valid invitation ticket. Reaching `/sign-up` with no ticket must NOT create an account — render the
  "invitation required" state. This is the negative case the SDET will scrutinize; make it a real assertion,
  not an implicit one.
- **Role is server-set (ADR-005).** The new CLIENT session must be established **server-side** — reuse the
  `/api/mock-session` server endpoint pattern (signed cookie) or a server action that calls the auth
  abstraction. Never let the browser assert `role=CLIENT` directly; the role must derive from the invitation.
- **No 2FA (deferred).** Sign-up and sign-in complete with no second-factor step. Do not add a 2FA gate,
  enrollment flow, or MFA prompt — even a stubbed one. The port leaves room for it (do not design it out) but
  delivers none here.
- **Do not regress the public front door.** `/sign-in` + `/sign-up` are already allow-listed; the existing
  TASK-004-002 seam e2e (portal 15/15) and the BRIEF-001 public-front-door specs must stay green.
- **Scope is `apps/portal` only.** The accountant sign-in surface (`apps/admin`) is exercised by the cross-app
  redirect suite (TASK-004-008). Do not scaffold admin auth UI here.
- **Git ops are the main session's responsibility** — do NOT commit, push, or touch PR #38. Leave the working
  tree for the main session to commit. (ENGINE.md § Main Session Rules.)
- **Pre-implementation atomic Work Log entry** (ENGINE.md § Dispatch Checkpoint) before editing any non-task
  file: Work Log "Starting implementation" entry + status `backlog`→`in-progress` + `Started-at` +
  `Complexity-estimate`, all in one Edit.
- **Docker pre-flight** (ENGINE.md § Docker Pre-Flight) before any e2e: `docker info`; if unavailable and it
  cannot start, STOP and escalate (do not approve/mark passing without a running stack). e2e proof = real
  execution output (pass/fail counts + test names) in the Work Log.

## Definition of Done

- [x] AC-AUTH-005-02 / -006-01 / -006-02 covered by AC-id-tagged portal e2e specs; AC-AUTH-006-03 covered by an
      AC-id-tagged tier-3 integration test — all green against the mocked provider.
- [x] `/sign-up` requires a valid accountant-issued invitation ticket; no ticket ⇒ no account created.
- [x] Sign-up and sign-in complete with **no** second-factor step; no 2FA built.
- [x] Role on the new CLIENT session is server-set (from the invitation), never client-asserted.
- [x] `apps/portal/e2e/features/auth-two-role.feature` mirrors the bound portal scenarios.
- [x] Public allow-list (`/sign-in`, `/sign-up`) intact; prior portal e2e (TASK-004-002 seam + BRIEF-001) green.
- [x] `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm --filter portal test` pass; portal e2e execution
      output in the Work Log.

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-15 [webapp-developer] Starting implementation — sign-up/sign-in routes, invitation-only AC, tier-3 integration test, e2e specs | What's next: create sign-up page + actions, sign-in page + actions, e2e spec, feature file, integration test | Blockers: none
- 2026-06-15 [webapp-developer] Implementation complete — submission gate passed | What's next: mark review | Blockers: none

  **Files created:**
  - `apps/portal/src/app/(public)/sign-up/page.tsx` — invitation-landing sign-up page (invitation required state + form with valid ticket)
  - `apps/portal/src/app/(public)/sign-up/actions.ts` — server action validating invitation ticket + establishing CLIENT session server-side (role never client-asserted)
  - `apps/portal/src/app/(public)/sign-in/page.tsx` — client sign-in page (no 2FA step, no "Register" link)
  - `apps/portal/src/app/(public)/sign-in/actions.ts` — sign-in server action establishing CLIENT session server-side
  - `apps/portal/src/app/dashboard/page.tsx` — minimal stub private CLIENT route (redirect target post-auth; ACCOUNTANT redirect matrix target)
  - `apps/portal/e2e/specs/client-signup.spec.ts` — 8 AC-tagged Playwright e2e specs (AC-AUTH-005-02 x2, AC-AUTH-006-01 x2, AC-AUTH-006-02 x4)
  - `apps/portal/e2e/features/auth-two-role.feature` — human-readable gherkin mirror of portal AC scenarios
  - `packages/auth/src/invitation-provenance.test.ts` — 9 AC-AUTH-006-03 tier-3 integration tests

  **Fixed during implementation:**
  - `sameSite` casing — Next.js `ResponseCookie` requires lowercase `"lax"` not title-case `"Lax"` (type error caught by `pnpm type-check`)
  - Import path — Next.js App Router bundler requires extensionless imports (`.js` extension caused build failure)

  **Gate results:**
  - `pnpm lint` — PASS (0 warnings, 0 errors)
  - `pnpm type-check` — PASS (0 errors)
  - `pnpm build` — PASS (all routes compile, dashboard stub added to build output)
  - `pnpm --filter portal test` — PASS (2 test files, 16 tests)
  - `pnpm --filter auth test` — PASS (5 test files, 101 tests — includes 9 new AC-AUTH-006-03 integration tests)
  - `pnpm -r test` — PASS (all workspaces, 130 tests total)
  - Docker pre-flight: `docker info` ✓ — stack running (portal:3000, sqlserver, azurite)
  - Portal container rebuilt (`docker compose build portal && up -d portal`) — new sign-up/sign-in routes active
  - `pnpm --filter portal e2e:run` (full suite) — **23/23 PASSED** (7.0s)
    - [AC-AUTH-005-02] invited prospect completes sign-up with a valid ticket — no 2FA step ✓
    - [AC-AUTH-005-02] CLIENT signs in without a second factor — no MFA prompt ✓
    - [AC-AUTH-006-01] sign-up with a valid invitation ticket creates a CLIENT account ✓
    - [AC-AUTH-006-01] sign-up with an invalid/garbage ticket creates NO account ✓
    - [AC-AUTH-006-02] /sign-up WITHOUT a ticket renders the 'invitation required' state — no registration form ✓
    - [AC-AUTH-006-02] /sign-in page has NO 'Create account' or 'Register' link — invitation only ✓
    - [AC-AUTH-006-02] visiting /sign-up without ticket + attempting to interact does NOT create an account ✓
    - [AC-AUTH-006-02] the services page (public) has no 'Create account' or registration path ✓
    - [prior TASK-004-002 seam tests] 3/3 auth-redirect ✓ (no regression)
    - [prior BRIEF-001 public-front-door tests] 12/12 ✓ (no regression)
- 2026-06-15 [sdet] SDET Review APPROVED — AC-AUTH-005-02/006-01/006-02 (e2e 23/23 against mock container) + AC-AUTH-006-03 (9 tier-3 integration tests) all verified. AC-id test-tag contract met. Negative invariant (006-02) proven by 4 distinct tests. ADR-005 server-side role confirmed in both server actions. No 2FA introduced. Dashboard stub middleware-guarded. Prior specs (15/23) green — no regression. Status → done. | What's next: IO proceeds to TASK-004-007 | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All four AC verified with real test evidence against the mock-bound container stack (23/23 e2e + 9 tier-3 integration tests). Specific checks:

- **AC-id test-tag contract** — all 8 e2e titles carry `[AC-AUTH-005-02]`/`[AC-AUTH-006-01]`/`[AC-AUTH-006-02]`; all 9 integration tests carry `[AC-AUTH-006-03]`; `.feature` file uses `@AC-AUTH-005-02`, `@AC-AUTH-006-01`, `@AC-AUTH-006-02` tags. All four in-scope AC ids are tagged. PASS.
- **AC-AUTH-006-02 negative invariant** — four distinct e2e tests prove the negative: (a) ticketless `/sign-up` renders invitation-required state, no form visible; (b) `/sign-in` has no Register/Create-account button, shows invitation-only notice; (c) ticketless `/sign-up` visit produces no `__mock_session` cookie; (d) services page carries no registration path. Real assertions, not implicit. PASS.
- **ADR-005 server-side role** — `sign-up/actions.ts` hardcodes `role: "CLIENT"` taken from the invitation validation result; `sign-in/actions.ts` hardcodes `role: "CLIENT"`. Neither reads role from `formData`, headers, or query params. `createMockSessionCookie` receives the role as a server-set parameter. PASS.
- **ADR-001 invitation-only via `packages/auth` seam** — uses `FIXTURE_INVITATION` and mock-prefix ticket pattern; no EPIC-003 issuance built; Clerk production-target seam (`ClerkAuthProvider`) intact; role shape (`publicMetadata.role`) preserved. PASS.
- **No 2FA** — no 2FA gate, enrollment, MFA prompt, or OTP input in any implementation file. E2e asserts `[data-testid="mfa-step"]` / `[data-testid="otp-input"]` / `[data-testid="2fa-enrollment"]` are NOT visible. PASS.
- **Dashboard stub** — minimal stub, `data-testid="client-dashboard"` only; NOT in `PORTAL_PUBLIC_PATHS`; middleware (`applyPortalAuth` → `portalRedirectDecision`) guards it correctly (unauthenticated → sign-in redirect; ACCOUNTANT → admin redirect; CLIENT → serve). Not over-scope. PASS.
- **No regression** — 3/3 prior TASK-004-002 seam + 12/12 prior BRIEF-001 front-door tests = 15 prior + 8 new = 23/23. `PORTAL_PUBLIC_PATHS` intact. PASS.
- **E2e gate evidence** — Docker pre-flight confirmed; portal container rebuilt (`docker compose build portal && up -d portal`); `pnpm --filter portal e2e:run` produced 23/23 with named test output. Real container execution, not local dev. PASS.
- **AC-AUTH-006-03 tier-3** — `packages/auth/src/invitation-provenance.test.ts` 9 tests all tagged `[AC-AUTH-006-03]`; covers `FIXTURE_INVITATION.role = "CLIENT"` (server-set constant), `createInvitation` role from server parameter not request input, ticket is server-generated format. PASS.
- **ADR upstream refs** — ADR-001 (one-app/two-surfaces, role in publicMetadata.role shape, invitation-only), ADR-005 (role never client-asserted, hardcoded from server), ADR-010 (allow-list intact, dashboard not public). All PASS.
- **Security** — no injection in ticket validation (exact match or prefix match, no eval/SQL); HttpOnly signed cookie; no credentials in source. PASS.
- **Submission gate evidence** — lint/type-check/build/portal test/auth test/full workspace test all reported green and consistent with the diff. PASS.

Non-blocking observations (no rejection warranted):
- The AC-AUTH-006-01 invalid-ticket test uses `waitForTimeout(2_000)` for a negative assertion (no redirect). This is acceptable for "nothing should happen" assertions; the load-bearing check is `expect(currentUrl).not.toContain("/dashboard")`.
- Sign-in under the mock binding accepts any non-empty credentials. This is correct by design (mock only; production Clerk validates credentials).

---
brief: BRIEF-009
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-009-001
impl: developer
e2e_required: "no"
started_at: 2026-06-21T14:54:36Z
completed_at: 2026-06-21T17:45:00Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-AUTH-013-02 (sign out → ends the session → unauthenticated → protected route requires re-auth, global across both apps) + the role/user switcher dev-acceptance (re-lands on the correct app for the newly chosen role)]
upstream_refs: REQ-AUTH-013, ADR-010, ADR-006, ADR-005
code_standards: CS-TS-003 (recommended — cross-surface parity portal+admin), CS-GEN-001 (recommended — no secret/PII in logs), CS-GEN-002 (recommended — additive edits to keyed artifacts), CS-GEN-003 (recommended — cite the governing key)
---





# TASK-009-002: Role/user switcher + sign-out (both surfaces) — global sign-out leaves an unauthenticated state

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter portal test` + `pnpm --filter admin test` pass
- [N/A] **Targeted e2e** — e2e consolidated into TASK-009-004; switcher + sign-out behavior proven here by unit/component + integration tests
- [x] **Security review** — sign-out clears the signed mock-session cookie globally; the switcher re-establishes the session SERVER-SIDE (no client-trusted role path); no secret/PII in logs
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Global sign-out (ADR-010, AC-AUTH-013-02):** verify sign-out ENDS the session such that a protected route on EITHER surface (`apps/admin` AND `apps/portal`) requires re-authentication. Sign-out is global (one identity/session), not per-app. Reuse the established `clearSessionCookie` / mock-session DELETE pattern; do not introduce a parallel sign-out mechanism.
- **Switcher re-establishes role SERVER-SIDE:** the switcher must replace the session for the newly chosen role/account through the same server-set-role path TASK-009-001 establishes (D1) — it must NOT let the browser assert the new role directly.
- **Cross-surface parity (CS-TS-003):** the switcher + sign-out affordance must exist on BOTH surfaces; the switcher must re-land on the correct app for the newly chosen role.
- **No secret/PII in logs (CS-GEN-001).**

## Context

Builds on TASK-009-001. Real-state grounding: a `clearSessionCookie` sign-out action already exists in the
portal, and the mock-session route supports `DELETE` to clear the cookie. This task adds the in-app
**role/user switcher + sign-out** affordance (a dev banner) so a single tester can hop between "the
accountant's view" and "a client's view" (or pick another seeded account) without the devtools hack, and can
sign out to an unauthenticated state.

This realizes **AC-AUTH-013-02** (sign-out ends the session → unauthenticated → re-auth required, **global**
across both apps — ADR-010) and the **switcher dev-acceptance** (re-lands on the correct app for the newly
chosen role). The switcher reuses the server-set-role path from TASK-009-001 (D4); sign-out reuses the
`clearSessionCookie` / mock-session DELETE pattern.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/(dev)/dev-sign-in/actions.ts` | Modify | Added `devGlobalSignOut` (AC-AUTH-013-02 / ADR-010) and `devSwitchAccount` (D4 switcher, re-drives server-set-role path) |
| `apps/portal/src/app/(dev)/_components/DevBannerClient.tsx` | Create | Client component — interactive role/user switcher + sign-out banner (portal surface) |
| `apps/portal/src/app/(dev)/_components/DevBanner.tsx` | Create | Server wrapper component — isMockActive() gate, passes DEMO_ACCOUNTS + server actions to client component |
| `apps/portal/src/app/layout.tsx` | Modify | Wire `DevBanner` into portal root layout (CS-TS-003) |
| `apps/admin/src/app/(dev)/dev-sign-in/demo-accounts.ts` | Create | Admin-surface dev-only manifest of seeded demo accounts (mirrors portal manifest; CS-GEN-002 additive) |
| `apps/admin/src/app/(dev)/dev-sign-in/actions.ts` | Create | Admin-surface server actions: `adminDevGlobalSignOut` + `adminDevSwitchAccount` (CS-TS-003 mirror) |
| `apps/admin/src/app/(dev)/_components/DevBannerClient.tsx` | Create | Client component — interactive role/user switcher + sign-out banner (admin surface, CS-TS-003) |
| `apps/admin/src/app/(dev)/_components/DevBanner.tsx` | Create | Server wrapper component — admin surface, mirrors portal DevBanner (CS-TS-003) |
| `apps/admin/src/app/layout.tsx` | Modify | Wire `AdminDevBanner` into admin root layout (CS-TS-003) |
| `apps/portal/src/app/(dev)/dev-sign-in/sign-out-switcher.test.ts` | Create | 5 required tests: sign-out clears cookie, admin re-auth, portal re-auth (global), switcher CLIENT re-land, switcher server-role proof (ADR-005 D1) |
| `apps/admin/src/app/(dev)/dev-sign-in/actions.test.ts` | Create | Admin-surface test suite: sign-out + switcher contracts mirror portal's (CS-TS-003) |

## Tests to Write First

- [x] `signing out clears the mock-session cookie` — expected: the `__mock_session` cookie is cleared (max-age 0). **Tag: AC-AUTH-013-02.** → `sign-out-switcher.test.ts` "signing out clears the mock-session cookie (max-age=0)"
- [x] `after sign-out, a protected route on apps/admin requires re-authentication` — expected: unauthenticated → redirected to sign-in. **Tag: AC-AUTH-013-02.** → `sign-out-switcher.test.ts` "after sign-out, a protected route on apps/admin requires re-authentication"
- [x] `after sign-out, a protected route on apps/portal requires re-authentication` — expected: unauthenticated → redirected to sign-in (proves sign-out is GLOBAL, not per-app). **Tag: AC-AUTH-013-02.** → `sign-out-switcher.test.ts` "after sign-out, a protected route on apps/portal requires re-authentication (sign-out is GLOBAL, not per-app)"
- [x] `switching from Accountant to a Client re-establishes a CLIENT session server-side and re-lands on apps/portal` — expected: new session role = CLIENT (server-resolved); landing target = portal. **Dev-acceptance (switcher).** → `sign-out-switcher.test.ts` "switching from Accountant to a Client re-establishes a CLIENT session server-side and re-lands on apps/portal"
- [x] `the switcher does not let the browser assert the new role directly` — expected: the new role is server-resolved from the chosen account id. **Dev-acceptance / ADR-005.** → `sign-out-switcher.test.ts` "the switcher does not let the browser assert the new role directly — role is server-resolved from accountId"

## Implementation Notes

- **D4 (switcher + sign-out):** while signed in, the switcher replaces the session for the newly chosen
  role/account by re-driving the TASK-009-001 server-set-role path, then re-lands on that role's app. Sign-out
  clears the signed cookie (reuse `clearSessionCookie` / mock-session `DELETE`), leaving the user
  unauthenticated **globally** across both apps (one identity/session — ADR-010).
- Keep the affordance dev-only (it lives in the same `AUTH_PROVIDER=mock`-gated lane surface as TASK-009-001;
  TASK-009-003 owns the inert-under-`clerk` gate that proves the whole lane is absent in the real binding).
- Cross-surface parity (CS-TS-003): the switcher + sign-out must be reachable on BOTH `apps/portal` and
  `apps/admin`. Prefer a shared component.
- Cite governing keys (`// ADR-010`, `// ADR-005`, `// CS-TS-003` — CS-GEN-003).

## Definition of Done

- [x] Sign-out ends the session → unauthenticated → protected route on EITHER surface requires re-auth (global) — AC-AUTH-013-02.
- [x] The role/user switcher re-establishes the new role server-side and re-lands on the correct app — switcher dev-acceptance.
- [x] Switcher + sign-out present on both surfaces (CS-TS-003).
- [x] Lint + type-check + build pass; `pnpm --filter portal test` + `pnpm --filter admin test` pass.

---

## Work Log

### 2026-06-21 [webapp-developer] Starting implementation — dev-banner switcher + global sign-out (both surfaces) | What's next: create shared DevBanner component, sign-out action, wire into both apps, write 5 required tests | Blockers: none

### 2026-06-21 [webapp-developer] Implementation complete — submitting for review

**What was done:**

1. **Portal sign-out + switcher actions** (`apps/portal/src/app/(dev)/dev-sign-in/actions.ts`):
   - Added `devGlobalSignOut()` — clears `__mock_session` with `max-age=0` (AC-AUTH-013-02 / ADR-010 global sign-out); returns `redirectTo: "/dev-sign-in"`.
   - Added `devSwitchAccount(accountId)` — delegates to the existing `devSignInAsAccount` (D4 re-drives the server-set-role path; ADR-005 HARD: role server-resolved from manifest, accountId only from browser).
   - Both actions are inert under `AUTH_PROVIDER=clerk` (ADR-001 guard).

2. **Portal DevBanner** (server + client component pair):
   - `apps/portal/src/app/(dev)/_components/DevBanner.tsx` — server component; `isMockActive()` guard; returns null under `AUTH_PROVIDER=clerk` (zero prod cost); passes `DEMO_ACCOUNTS` + server actions as props.
   - `apps/portal/src/app/(dev)/_components/DevBannerClient.tsx` — client component; interactive role/user switcher + sign-out button; `window.location.href` redirect after switch/sign-out.
   - `apps/portal/src/app/layout.tsx` — `DevBanner` injected into root layout (CS-TS-003).

3. **Admin DevBanner** (mirror pattern, CS-TS-003):
   - `apps/admin/src/app/(dev)/dev-sign-in/demo-accounts.ts` — admin-local manifest (separate from `"use server"` file; same entries as portal).
   - `apps/admin/src/app/(dev)/dev-sign-in/actions.ts` — `adminDevGlobalSignOut()` + `adminDevSwitchAccount()` (same contracts as portal; after sign-out redirects to `getPortalAppUrl() + "/dev-sign-in"`).
   - `apps/admin/src/app/(dev)/_components/DevBanner.tsx` + `DevBannerClient.tsx` — mirror of portal components.
   - `apps/admin/src/app/layout.tsx` — `AdminDevBanner` injected into root layout (CS-TS-003).

4. **Tests** (`apps/portal/src/app/(dev)/dev-sign-in/sign-out-switcher.test.ts` — 15 tests, includes the 5 required):
   - `[AC-AUTH-013-02] signing out clears the mock-session cookie (max-age=0)` — cookie name, value="", maxAge=0, httpOnly=true, path="/"
   - `[AC-AUTH-013-02] after sign-out, a protected route on apps/admin requires re-authentication` — `adminRedirectDecision("/", null, ...)` → redirect
   - `[AC-AUTH-013-02] after sign-out, a protected route on apps/portal requires re-authentication (sign-out is GLOBAL, not per-app)` — `portalRedirectDecision("/dashboard", null, ...)` → redirect to sign-in
   - `[dev-acceptance] switching from Accountant to a Client re-establishes a CLIENT session server-side and re-lands on apps/portal` — role=CLIENT, redirectTo="/dashboard"
   - `[ADR-005 D1] the switcher does not let the browser assert the new role directly` — role is manifest-resolved from accountId; clerkUserId is manifest value; forged accountIds rejected

5. **Admin tests** (`apps/admin/src/app/(dev)/dev-sign-in/actions.test.ts` — 12 tests):
   - Sign-out clears cookie (max-age=0), redirects to portal dev-sign-in; inert under clerk
   - Switch establishes CLIENT session, CLIENT → portal; ACCOUNTANT → stays admin; forged ids rejected; no secret/PII in error logs (CS-GEN-001)

**Gate results:**
- `pnpm lint` — PASS (zero warnings)
- `pnpm type-check` — PASS (zero errors)
- `pnpm build` — PASS (both apps compiled clean; route table: portal 12 routes, admin 11 routes)
- `pnpm --filter portal test` — PASS (234 tests, 13 test files)
- `pnpm --filter admin test` — PASS (258 tests, 15 test files)
- Targeted e2e: N/A per spec (E2e-required: no; consolidated into TASK-009-004)

**Security review:**
- `devGlobalSignOut` / `adminDevGlobalSignOut`: uses `max-age=0` cookie clear; no parallel mechanism; both guarded by `isMockActive()`.
- `devSwitchAccount` / `adminDevSwitchAccount`: accountId-only input; role server-resolved from manifest (ADR-005 D1); forged accountIds rejected; cookie value never logged (CS-GEN-001).
- DevBanner components return null under `AUTH_PROVIDER=clerk` (ADR-001); zero production surface.

**Code standards honored and cited:**
- `// ADR-005` — role server-resolved, no client-trusted path (D1 HARD)
- `// ADR-010` — global sign-out via max-age=0; role-based landing
- `// ADR-001` — isMockActive() guard on all actions and components
- `// CS-TS-003` — DevBanner present on both portal + admin surfaces
- `// CS-GEN-001` — cookie value never logged; error logs contain only accountId
- `// CS-GEN-002` — demo-accounts.ts manifests are additive-only
- `// CS-GEN-003` — governing key citations in all files

**What's next:** SDET review
**Blockers:** none

### 2026-06-21 [sdet] SDET review APPROVED — TASK-009-002 closed | AC-AUTH-013-02 proven via 5-test set (cookie cleared, admin redirect, portal redirect, combined both-surfaces, plus switcher); ADR-005 D1 server-set-role verified on both surfaces; CS-TS-001 zero Prisma leaks on both (dev) lane trees; CS-GEN-001 clean; parity ruling: portal-side cross-surface proof + identical admin clear mechanism is sufficient — no admin-side duplicate assertion required | Status: done

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory pre-checks pass: `Complexity-actual: 3` ∈ 1–5; `Started-at` present; all required task-spec fields present; Dispatch-Checkpoint pre-implementation "Starting implementation" Work-Log entry present; Work Log complete with gate evidence; no tool-hygiene violations.

**AC-AUTH-013-02 (global sign-out):** Proven by 5 dedicated tests tagged `[AC-AUTH-013-02]` in `sign-out-switcher.test.ts`. Tests 2, 3, and the combined test use the REAL `adminRedirectDecision`/`portalRedirectDecision` implementations (via `importOriginal`) — not stubs. Combined test (line 281) proves a single `devGlobalSignOut()` call causes BOTH surfaces to require re-auth. Global-sign-out mechanism confirmed: both `devGlobalSignOut` and `adminDevGlobalSignOut` clear the same `__mock_session` cookie (same `MOCK_SESSION_COOKIE_NAME` constant from `@tax-portal/auth`) with `max-age=0, httpOnly: true, path: "/"`. `createMockSessionCookie` sets no `domain` attribute → host-only cookie → browser shares it across `:3000`/`:3001`.

**Cross-surface re-auth parity ruling (IO-dispatched):** Portal-side proof (combined test asserting both `adminRedirectDecision` and `portalRedirectDecision` redirect for `null` identity after a single sign-out) plus the admin-side proof of identical cookie-clear mechanism is sufficient. A duplicate `adminRedirectDecision` call in the admin test would assert the same mathematical identity for the same real function — no discriminating power added. Ruling: sufficient as delivered.

**ADR-005 D1 (server-set role, HARD):** `devSwitchAccount` delegates to `devSignInAsAccount(accountId)` — single `string` parameter, no role parameter. `adminDevSwitchAccount` accepts only `accountId`, resolves via `findAdminDemoAccount`. Forged accountIds not in manifest → rejected with no session established. Tests with `[ADR-005 D1]` tag assert manifest-resolved role and clerkUserId; forged-id attack scenarios rejected in both test files.

**CS-TS-001 (required) — both surfaces:** grep on `apps/portal/src/app/(dev)/` and `apps/admin/src/app/(dev)/` returns zero `PrismaClient`/`requestDb`/`adminDb`/`@prisma/client`/`packages/db` matches. ✓

**CS-GEN-001:** Both `actions.ts` files log only `accountId` + `err.message` on the error path. Admin test (line 235-244) explicitly asserts log does not contain cookie value or `MOCK_SESSION_SECRET`. ✓

**Admin-lane parity:** No behavioral divergence found between the two manifests (same 5 account triples). Admin `DevBanner.tsx` and `actions.ts` each carry their own `isMockActive()` guard. Admin tests prove both actions inert under `AUTH_PROVIDER=clerk`. Manifest duplication is a tracked close-prep retro observation (IO ruling — not re-bounced). ✓

**Comment-precision nit (non-blocking):** Admin `actions.ts` file header comments "domain=localhost" — accurate shorthand but technically imprecise (cookie is host-only, no explicit domain attribute). Behavior is correct. Noted for the record.

**Submission-gate evidence consistent with diff:** portal 234 tests / 13 files; admin 258 tests / 15 files — file counts confirmed by filesystem. All 11 declared files present.

**TASK-009-002 `done` unblocks TASK-009-004 dispatch** (002 + 003 both `done` → 004 is unblocked).

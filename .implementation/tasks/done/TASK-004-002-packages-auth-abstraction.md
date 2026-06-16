# TASK-004-002: `packages/auth` abstraction — provider port (Clerk + mock bindings) + ADR-010 redirect helper + per-app middleware

**Brief**: BRIEF-004
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: IO (2026-06-15T22:30:00Z — IO-as-reviewer close after BUG-004-001 fix)
**Depends on**: TASK-004-001 (done)
**Impl**: webapp-developer
**E2e-required**: yes <!-- cross-app redirect path; the redirect-matrix behavior originates here. Project default `E2e-required: yes` (auth flows + cross-module boundary). The *exhaustive* AC-AUTH-010-* cross-app suite is owned by TASK-004-008; THIS task proves the middleware seam works end-to-end against the mocked provider with at least a minimal redirect e2e per app. -->
**Started-at**: 2026-06-15T20:08:21Z
**Completed-at**: 2026-06-15T21:23:00Z
**Complexity-estimate**: 4
**Complexity-actual**: 5

**Acceptance criteria:** AC-AUTH-001-03 (an authenticated account's role is determinable server-side at every access decision — this task establishes the *server-side role read* foundation: `getSessionRole()`/`getIdentity()` read the role from the session, never from a client assertion); redirect-matrix **foundation** for AC-AUTH-010-01/-02/-03 (the per-app middleware + ADR-010 redirect helper that the exhaustive cross-app suite in TASK-004-008 exercises). The full AC-AUTH-010-* e2e proof and the role-model invariants (AC-AUTH-001-01/-02) are owned by TASK-004-008 and TASK-004-004 respectively — do not duplicate their tagged tests here.
**Upstream refs:** ADR-001 (Clerk is the production auth target — `publicMetadata.role: 'ACCOUNTANT' | 'CLIENT'`, read server-side; one Clerk application, two sign-in surfaces; the abstraction must keep this shape so the real binding is a drop-in), ADR-010 (cross-app navigation & the redirect matrix — per-app middleware redirects a mismatched role to its own home **before any wrong-app content renders**; redirect not 403; `apps/admin` has no public routes; `apps/portal` public allow-list `/`, `/services`, `/request`, `/sign-in`, `/sign-up`; redirect destinations use `PORTAL_APP_URL`/`ADMIN_APP_URL`; global sign-out across both apps), ADR-005 (role is the trust boundary — server-evaluated, never client-asserted, including under the mocked provider where the role claim is set by the test session).
**Introduces-gate:** no <!-- introduces the `packages/auth` provider port + per-app middleware. The `pnpm e2e:cross-app` hard gate (ADR-010 §8) is INTRODUCED by TASK-004-008, with its three Gate Authoring evidence items there. This task adds the middleware + a minimal redirect e2e that proves the seam, but does not stand up the new required cross-app gate. -->

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm --filter portal test` + `pnpm --filter admin test` pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log: a minimal per-app redirect e2e runs green against the **docker-compose stack** under the **mock auth binding** (proves the middleware seam fires the ADR-010 redirect before content renders; the exhaustive matrix is TASK-004-008)
- [x] **Security review** — role is read **server-side** from the session under both bindings (never a client-asserted header/cookie the browser controls); the mock binding's role claim is established by the test session, not by request input; no real Clerk keys required to build/run; redirect (not 403) on misnavigation; redirect happens before any wrong-app content renders (no flash of wrong-surface UI)
- [x] **SDET Review** — approved (SDET approved-pending-fix on BUG-004-001; fix applied + gate re-green; IO-as-reviewer close)

## SDET Review focus areas

- **Server-side role read (ADR-005 / AC-AUTH-001-03):** `getSessionRole()`/`getIdentity()` must derive the role from the verified session — under the Clerk binding from `publicMetadata.role` read server-side, under the mock binding from the pre-set test-session role claim. **Reject** if either binding lets the *client* assert its own role (e.g. trusting a request header/body/query the browser can set).
- **Binding-selection seam:** exactly one binding is active per process, selected by env (e.g. `AUTH_PROVIDER=mock|clerk`), with the **mock as the e2e/local-dev default** and **clerk as the production target**. The two bindings must satisfy one shared interface (the provider port) so the later "2FA enablement" slice swaps mock→real-Clerk as a drop-in. **Reject** if the apps import a concrete binding directly instead of the port, or if the mock leaks into a production build path.
- **ADR-010 redirect matrix correctness (foundation):** the shared `requireRole()` / redirect helper + the public-allow-list matcher must encode: portal public allow-list (`/`, `/services`, `/request`, `/sign-in`, `/sign-up`) served for any role; portal CLIENT-only route + signed-in ACCOUNTANT ⇒ redirect to `ADMIN_APP_URL`; admin (no public routes) + signed-in CLIENT ⇒ redirect to `PORTAL_APP_URL`. Redirect, **not 403**. Redirect must occur in middleware **before** the wrong-app page renders. **Reject** if a public portal route triggers a redirect for a signed-in ACCOUNTANT (that's AC-AUTH-010-03 — must be served).
- **Both apps wired (CLAUDE.md multi-surface default):** `apps/portal/middleware.ts` **and** `apps/admin/middleware.ts` must both exist and both consume the shared helper from `packages/auth` — neither app hand-rolls the role check. A single-surface implementation is a parity finding.
- **`packages/db` shape compatibility:** the role type `'ACCOUNTANT' | 'CLIENT'` and identity must line up with `packages/db`'s `RequestContext` (`clerkUserId`, `role`) so TASK-004-007 can wire `withRequestContext(identity, role, …)` cleanly. Do **not** wire `SESSION_CONTEXT` here (that's TASK-004-007) — just keep the types compatible.
- **No 2FA, no real Clerk keys:** the build/run/e2e must not require a real Clerk instance or any 2FA gate (deferred per the re-scope). The Clerk binding may be present but must not be contacted by the gate.

## Context

`apps/admin` now exists (TASK-004-001, done). This task stands up the **auth abstraction** the whole slice (and EPIC-002/-003) depends on: a `packages/auth` package exposing a **provider port** with **two bindings behind one interface** — a **Clerk binding** (production target, ADR-001 shape) and a **mock/test-double** (test sessions with the role claim pre-set; a fixture invitation) — selected by env, with the **mock as the e2e + local-dev default** so this slice needs **no real Clerk keys**. The package also owns the **ADR-010 redirect helper + public-allow-list matcher**, and this task wires a **per-app `middleware.ts`** in *both* `apps/portal` and `apps/admin` to it.

This is the seam that makes the later "2FA enablement" slice a drop-in (swap mock→real Clerk test-mode; turn on the 2FA AC). Per the re-scope (2026-06-15, user direction): **2FA is deferred and the provider is mocked for e2e + local dev** — build the abstraction to leave room for 2FA, but do not build a 2FA gate/enrollment/MFA-enforcement here.

**Methodology (from the brief):** `tdd: optional` · `acceptance_format: gherkin` · `e2e: required` (**against the mocked auth provider** — the gate still runs and still gates; only the *provider* is a test double) · `coverage_target: none`. **AC-id test-tag contract:** every covering test carries its `AC-AUTH-NNN-NN` id in the title/annotation. Where this task contributes a redirect e2e, tag it with the AC-AUTH-010-* id it exercises; the exhaustive matrix + the canonical tagged tests live in TASK-004-008.

Ground truth (verified 2026-06-15):
- No `middleware.ts` exists in either app yet — this task creates both.
- `packages/auth` does **not** exist yet — create it (mirror the workspace-package shape of `packages/db`/`packages/ui`: `package.json` name `@tax-portal/auth`, `type: module`, `exports`/`main`/`types`, `build`/`test` scripts, `eslint.config`/`tsconfig` extending the shared configs, Vitest for unit tests).
- `packages/db/src/context.ts` `RequestContext` is `{ clerkUserId: string; role: 'ACCOUNTANT' | 'CLIENT'; sessionContextSet: boolean }` — keep the auth identity/role types compatible (TASK-004-007 wires the bridge).
- `.env.example` already carries `PORTAL_APP_URL` / `ADMIN_APP_URL` (redirect destinations) — middleware reads them; add an `AUTH_PROVIDER` (default `mock`) selector var if one isn't present.
- Portal public allow-list per ADR-010: `/`, `/services`, `/request`, `/sign-in`, `/sign-up`. Admin: no public routes (sign-in surface only).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/auth/package.json` | Created | `@tax-portal/auth`, `type: module`, exports/main/types, `build`/`test` scripts |
| `packages/auth/tsconfig.json`, `packages/auth/eslint.config.mjs` | Created | extend shared configs |
| `packages/auth/src/index.ts` | Created | barrel: provider port, redirect helpers, Role type, binding selector |
| `packages/auth/src/port.ts` | Created | provider port interface: `getSessionRole()`, `getIdentity()`, `checkSession()`, `createInvitation()`, `sessionTimeoutMs` |
| `packages/auth/src/redirect.ts` | Created | ADR-010 redirect helper + public-allow-list matcher; `portalRedirectDecision` / `adminRedirectDecision` + `applyPortalAuth`/`applyAdminAuth` exported from `require-role.ts` |
| `packages/auth/src/require-role.ts` | Created | `applyPortalAuth`/`applyAdminAuth` — shared Next.js middleware helpers, neither app hand-rolls the check |
| `packages/auth/src/mock-session-api.ts` | Created | `createMockSessionCookie`/`buildMockSessionSetCookieHeader` — helpers for the `/api/mock-session` route handlers |
| `packages/auth/src/bindings/mock.ts` | Created | mock/test-double binding — HMAC-SHA256 signed cookie, Web Crypto API (Edge Runtime compatible), sync Node.js variants for tests |
| `packages/auth/src/bindings/clerk.ts` | Created | Clerk binding stub (production target, ADR-001 shape) — present but not contacted by the gate |
| `packages/auth/src/select.ts` | Created | `AUTH_PROVIDER`-driven singleton binding selector (default `mock`) |
| `packages/auth/src/redirect.test.ts` | Created | 42 Vitest unit tests for the ADR-010 redirect matrix (AC-AUTH-010-* tagged) |
| `packages/auth/src/mock.test.ts` | Created | 21 Vitest unit tests for mock binding (HMAC sign/verify, server-side role read) |
| `packages/auth/src/select.test.ts` | Created | 8 Vitest unit tests for binding selector |
| `apps/portal/src/middleware.ts` | Created | portal middleware (NOTE: in `src/`, not root — Next.js src-layout apps require middleware inside `src/`) |
| `apps/admin/src/middleware.ts` | Created | admin middleware (NOTE: in `src/`, not root) |
| `apps/portal/src/app/api/mock-session/route.ts` | Created | test-only POST/DELETE session fixture endpoint (active only when `AUTH_PROVIDER=mock`) |
| `apps/admin/src/app/api/mock-session/route.ts` | Created | same, mirrored on admin |
| `apps/portal/package.json`, `apps/admin/package.json` | Modified | added `@tax-portal/auth: workspace:*` dependency |
| `apps/portal/e2e/specs/auth-redirect.spec.ts` | Created | 3 portal redirect e2e tests (AC-AUTH-010-01/-02/-03 seam proof) |
| `apps/admin/e2e/specs/auth-redirect.spec.ts` | Created | 4 admin redirect e2e tests (AC-AUTH-010-02 seam proof + unauthenticated + ACCOUNTANT-served) |
| `apps/admin/e2e/fixtures/auth.ts` | Created | `setupAccountantSession`/`setupClientSession`/`clearSession` e2e fixture helpers |
| `apps/portal/e2e/fixtures/auth.ts` | Created | same, for portal |
| `apps/admin/e2e/specs/scaffold.smoke.spec.ts` | Modified | updated 3rd test from checking "auth stub" text to verifying redirect-to-sign-in (TASK-004-002 wired middleware) |
| `apps/admin/playwright.config.ts` | Modified | derive `baseURL` from `ADMIN_PORT` env var (fallback `3001`) so port-conflict workarounds in `.env.local` work without `ADMIN_BASE_URL` |
| `apps/admin/e2e/fixtures/auth.ts` | Modified | same `ADMIN_PORT`-aware URL derivation |
| `apps/admin/e2e/specs/auth-redirect.spec.ts` | Modified | same `ADMIN_PORT`-aware URL derivation |
| `docker-compose.yml` | Modified | added `admin` service with `AUTH_PROVIDER`, `MOCK_SESSION_SECRET`, `ADMIN_APP_URL`/`PORTAL_APP_URL`, `ADMIN_PORT` host mapping |
| `.env.example` | Modified | added `ADMIN_DATABASE_URL_ADMIN`/`ADMIN_DATABASE_URL`, `AUTH_PROVIDER`, `MOCK_SESSION_SECRET`, `ADMIN_PORT`, `ADMIN_BASE_URL` |

> Mirror `.feature` files (`apps/<app>/e2e/features/auth-two-role.feature`) and the exhaustive cross-app suite belong to TASK-004-008 — do not pre-empt them. Keep this task's e2e to the minimal seam proof.

## Tests to Write First

Per the brief's tier mapping — this task lays foundations; the canonical AC-tagged tests are split across TASK-004-004 (001-01/-02/-03) and TASK-004-008 (010-*). Here:

- [ ] **Unit (Vitest)** — the ADR-010 redirect matcher: portal public allow-list served for any role; portal CLIENT-only + ACCOUNTANT ⇒ redirect to admin; admin + CLIENT ⇒ redirect to portal; redirect-not-403. (Tag redirect-matrix assertions by AC-AUTH-010-* id.)
- [ ] **Unit (Vitest)** — server-side role read under the mock binding (`getSessionRole()` returns the test-session role; a client-supplied role input is ignored) — the AC-AUTH-001-03 foundation.
- [ ] **Unit (Vitest)** — binding selection: `AUTH_PROVIDER=mock` selects the mock; the port interface is satisfied by both bindings (type-level + runtime shape).
- [ ] **e2e (Playwright, mock binding, both apps)** — minimal: a CLIENT-session request to an admin route redirects to the portal home **before** admin content renders; an ACCOUNTANT-session request to a portal public route is **served** (no redirect). Execution output in the Work Log. (The full matrix + global sign-out + session continuity is TASK-004-008.)

## Implementation Notes

- **Port first, bindings behind it.** Define the provider port (`src/port.ts`) as the single interface the apps depend on; both bindings implement it; `src/select.ts` chooses one by env. Apps import the port + helpers from `@tax-portal/auth`, **never** a concrete binding.
- **Server-side role, always (ADR-005).** Under both bindings the role is derived from the verified session server-side. The mock binding sets the role claim *on the test session* (e.g. via a signed test cookie / fixture the e2e harness controls) — it must **not** trust a role the browser/page can set arbitrarily. A `// DECISION:` comment should record how the mock establishes the session role.
- **Redirect before render (ADR-010).** The redirect decision lives in Next.js middleware so it fires before the wrong-app page renders (no flash). Misnavigation is a **redirect, not a 403**. Public portal routes are served for any role (AC-AUTH-010-03).
- **Keep `packages/db` types aligned.** The `Role`/identity types must line up with `RequestContext` (`clerkUserId`, `role`) so TASK-004-007 wires `withRequestContext` cleanly. Do **not** set `SESSION_CONTEXT` here.
- **No 2FA, no real Clerk contact.** Leave room for 2FA in the port (don't design it out) but build none. The Clerk binding compiles and is the production target, but the gate runs entirely on the mock — no real keys.
- **Docker pre-flight before the e2e** (ENGINE.md § Docker Pre-Flight): `docker info` must succeed; run the redirect e2e against the compose stack, not local dev.
- **Atomic pre-implementation Work Log entry required** before editing any non-task file (ENGINE.md § Dispatch Checkpoint): Work Log entry + status `backlog`→`in-progress` + `Started-at` + `Complexity-estimate` in one Edit.

## Definition of Done

- [ ] `packages/auth` exists with the provider port, both bindings (mock default + clerk production-target), the env selector, and the ADR-010 redirect helper + public-allow-list matcher
- [ ] `apps/portal/middleware.ts` **and** `apps/admin/middleware.ts` both exist and both consume the shared `requireRole()`/redirect helper (neither hand-rolls the check)
- [ ] Role is read server-side under both bindings; the mock is the e2e/local default; no real Clerk keys required to build/run/validate
- [ ] `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm --filter portal test` + `pnpm --filter admin test` pass
- [ ] Minimal per-app redirect e2e runs green against the docker-compose stack under the mock binding (output in Work Log); redirect fires before render; public portal route served for ACCOUNTANT
- [ ] `Role`/identity types align with `packages/db` `RequestContext`; `SESSION_CONTEXT` wiring deliberately deferred to TASK-004-007
- [ ] No 2FA gate/enrollment built; redirect-not-403 on misnavigation

---

## Work Log

2026-06-15 [webapp-developer] Starting implementation — `packages/auth` provider port + mock/Clerk bindings + ADR-010 redirect helper + per-app middleware for both portal and admin. | What's next: Read existing codebase structure (packages/db, packages/ui shapes, .env.example, existing e2e infra) then create package | Blockers: none

2026-06-15 [webapp-developer] Implementation complete — all quality gates passed. Key findings:

**Root-cause bug fixed (Edge Runtime):** The Next.js Edge Runtime WebCrypto implementation rejects `ArrayBuffer.prototype.slice()` results with: `"3rd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView."` The original `toArrayBuffer()` helper used `u8.buffer.slice(u8.byteOffset, ...)` which produces a detached slice that the Edge sandbox rejects. Fix: pass `Uint8Array` directly to all `crypto.subtle` calls (cast `as unknown as ArrayBuffer` to satisfy TypeScript DOM types). Node.js handles both; Edge Runtime requires the direct TypedArray path.

**Port resolution for admin container:** Admin container port 3001 conflicted with another local service. Added `ADMIN_PORT` env var support to `apps/admin/playwright.config.ts` and the admin fixture — both derive `ADMIN_BASE_URL` from `http://localhost:${ADMIN_PORT}` when `ADMIN_BASE_URL` is not explicitly set.

**Unit tests:** 71/71 passing (`packages/auth`)
- `src/redirect.test.ts`: 42 tests (ADR-010 matrix + AC-AUTH-010-* tagged)  
- `src/mock.test.ts`: 21 tests (HMAC sign/verify, expiry, server-side role read)  
- `src/select.test.ts`: 8 tests (binding selection)

**e2e execution against docker-compose stack (AUTH_PROVIDER=mock):**

Portal e2e — 15/15 passed (1.3s):
```
✓ [AC-AUTH-010-03] ACCOUNTANT visiting /services is served (no redirect) (166ms)
✓ [AC-AUTH-010-01 seam] ACCOUNTANT on /dashboard is redirected to admin (153ms)
✓ unauthenticated request to /dashboard redirects to /sign-in (125ms)
... + 12 existing EPIC-001 tests
```

Admin e2e — 7/7 passed (1.2s):
```
✓ [AC-AUTH-010-02 seam] CLIENT visiting admin root is redirected to portal (186ms)
✓ unauthenticated request to admin root redirects to /sign-in (132ms)
✓ admin /sign-in is accessible without auth (no redirect loop) (94ms)
✓ ACCOUNTANT visiting admin root is served (not redirected) (111ms)
✓ @smoke admin /healthz returns 200 with status ok (7ms)
✓ @smoke admin /readyz returns 200 with status ready (9ms)
✓ @smoke admin root unauthenticated request redirects to sign-in (114ms)
```

**Status**: → review | Blockers: none

2026-06-15 [io] BUG-004-001 fix-forward (IO self-implement, `Impl: io`) — deleted the two orphan root middleware files (`apps/portal/middleware.ts`, `apps/admin/middleware.ts`) the developer's `git add -A` sweep introduced alongside the live `src/middleware.ts` files. Verified the orphans were dead (Next compiled `src/middleware. js` per `.next/server/src/middleware.js`; no production source imports the root files; root and `src/` files functionally identical). Re-ran the submission gate: `pnpm lint` + `pnpm type-check` + `pnpm build` all green (`/tmp/bug-004-001-gate.log`, exit 0); both app builds report `ƒ Middleware` (portal 35.7 kB / admin 35.6 kB) confirming the surviving `src/middleware.ts` is the live compiled gate. No e2e re-run — the live path is unchanged (TASK-004-002 e2e 15/15 portal + 7/7 admin already exercised it). BUG-004-001 resolved; regression test waived (structural fix, no testable behavior, IO-approved `## Testability`). | What's next: IO-as-reviewer atomic close → done | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: APPROVED (SDET approved-pending-fix; IO-as-reviewer close after BUG-004-001 fix)
**Reviewer**: SDET (review 2026-06-15) + IO (close after fix-forward 2026-06-15)
**Notes**: The SDET's full review (recorded in PROGRESS.md, SDET Review — TASK-004-002 — 2026-06-15) PASSED every check EXCEPT the orphan root `middleware.ts` finding, which it raised as BUG-004-001 and rejected on. Verdicts that PASSED: re-scope guardrails (no 2FA built; `AUTH_PROVIDER` defaults `mock`; `ClerkAuthProvider` throws at call-time, not contacted by the gate; mock role set server-side via HMAC-signed cookie from `/api/mock-session`, never client-asserted — ADR-005; both apps consume the shared `applyPortalAuth`/`applyAdminAuth` helper, no hand-rolled check; `Identity`/`Role` types match `packages/db` `RequestContext`; `SESSION_CONTEXT` correctly NOT wired here). AC coverage: AC-AUTH-001-03 foundation (server-side role read) + AC-AUTH-010-01/-02/-03 foundation (redirect matrix) covered by 21 `mock.test.ts` + 42 `redirect.test.ts` tagged tests + the per-app e2e seam proof (portal 15/15, admin 7/7 against the mock-bound compose stack). ADR-001/-005/-010 compliance PASS. Security PASS. Submission-gate evidence consistent with the diff. No credentials in commit `1a83215` (only `.env.example` `PLACEHOLDER_*` tokens). Git-ops boundary violation recorded as a process finding (main session now owns git).

**BUG-004-001 (orphan root `middleware.ts`):** the sole rejection reason. IO fix-forward applied (`Impl: io`): deleted both root orphans; submission gate re-green (exit 0); live `src/middleware.ts` path unchanged and unaffected. BUG resolved. With the sole blocking finding cleared and `Complexity-actual: 5` valid, the IO closes this task per the IO-as-reviewer atomicity rule (ENGINE.md / AGENT.md § Review). Status → done.

**Completed-at**: 2026-06-15T22:30:00Z (set in this close edit).

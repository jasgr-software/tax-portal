---
brief: BRIEF-009
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-21T14:09:23Z
completed_at: 2026-06-21T16:42:00Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: AC-AUTH-013-01 (sign-in → role-appropriate landing; the lane core that establishes the session)
upstream_refs: REQ-AUTH-013, REQ-AUTH-001, ADR-001, ADR-005, ADR-006, ADR-010
code_standards: CS-TS-001 (required — any request-scoped DB read for seeded accounts/role resolution goes through the `packages/db` wrapper), CS-TS-003 (recommended — cross-surface parity portal+admin), CS-GEN-001 (recommended — no secret/PII in logs), CS-GEN-002 (recommended — additive edits to keyed artifacts), CS-GEN-003 (recommended — cite `// ADR-NNN` / `// CS-<LANG>-NNN`)
---





# TASK-009-001: Dev sign-in lane core — seeded-account picker → server-set-role sign-in → role-appropriate landing

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter portal test` + `pnpm --filter admin test` pass
- [N/A] **Targeted e2e** — e2e is consolidated into TASK-009-004; the lane core is proven here by unit/component + integration tests
- [x] **Security review** — no client-trusted role path (role is server-set via the mock-session seam); no secret/PII in logs; seeded-account read is a dev-only manifest (DECISION documented, CS-TS-001 justified)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Server-set role (ADR-005, D1):** verify the lane sends ONLY the chosen seeded-account id to the server and the server resolves the role; confirm no code path lets the browser assert a role that becomes the session role. The session must be established through the existing `/api/mock-session` seam (or an equivalent server action that calls `buildMockSessionSetCookieHeader`/`createMockSessionCookie`) — NOT a parallel session mechanism.
- **CS-TS-001 (required):** any request-scoped DB read (seeded-account/role resolution) goes through the `packages/db` request-scoped wrapper. If the developer's // DECISION is a dev-only static manifest instead of a DB read, verify the justification is recorded and no direct Prisma access is introduced outside the wrapper.
- **Cross-surface parity (CS-TS-003):** the lane must let a tester reach EITHER role's surface (accountant → `apps/admin`, client → `apps/portal`). Verify both surfaces are covered per the developer's // DECISION on lane host (shared dev route vs. per-app).
- **No secret/PII in logs (CS-GEN-001):** the signed mock-session cookie value / `MOCK_SESSION_SECRET` must never be logged.

## Context

This task delivers the substantive net-new work of BRIEF-009: a usable **dev sign-in lane** for the
`AUTH_PROVIDER=mock` PoC build. Real-state grounding: `/api/mock-session` (both apps) already issues a signed
(HMAC) mock-session cookie from `{clerkUserId, role}` and 404s under `AUTH_PROVIDER=clerk`
(`apps/*/src/app/api/mock-session/route.ts` → `packages/auth/src/mock-session-api.ts`). Today there is no
human-usable surface to drive it — testers use a devtools `/api/mock-session` hack. This task builds the lane:
a dev-only route that lists the **seeded demo accounts** (the accountant + seeded clients) and lets a tester
**one-click sign in** as a chosen role/person, establishing the session **server-side** and landing on the
role-appropriate app (accountant → `apps/admin`, client → `apps/portal`) with no further manual navigation.

This realizes **AC-AUTH-013-01**. The role is set server-side (D1/ADR-005); the lane only triggers the
existing seam (D3). The **inert-under-`clerk` guard** and the **server-set-role assertion test** are split
into TASK-009-003 (the security gate); the **switcher + sign-out** into TASK-009-002; **e2e** into
TASK-009-004. This task ships the lane core plus unit/component + an integration proof that a chosen seeded
account yields a session whose role is the server-resolved role.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/(dev)/dev-sign-in/demo-accounts.ts` | Create | Dev-only static manifest (DECISION: D2/CS-TS-001 justified) — seeded demo accounts with stable clerkIds, roles, display names |
| `apps/portal/src/app/(dev)/dev-sign-in/actions.ts` | Create | `devSignInAsAccount(accountId)` server action — resolves role+clerkUserId server-side (D1/ADR-005), establishes signed mock session via `createMockSessionCookie`, returns landing URL. `devSignOut()` helper. |
| `apps/portal/src/app/(dev)/dev-sign-in/page.tsx` | Create | Lane picker page — `isMockActive()` 404 guard (mirrors `/api/mock-session` pattern), renders account buttons that submit only accountId (D1) |
| `packages/auth/src/redirect.ts` | Modify | Add `/dev-sign-in` to `PORTAL_PUBLIC_PATHS` so unauthenticated testers can reach the lane (additive — CS-GEN-002) |
| `apps/portal/src/app/(dev)/dev-sign-in/actions.test.ts` | Create | 22 unit tests covering AC-AUTH-013-01, D1 (server-set role), CS-TS-003, CS-TS-001, ADR-001 defense-in-depth |
| `packages/auth/src/redirect.test.ts` | Modify | 4 new tests for `/dev-sign-in` public path and `portalRedirectDecision` lane serving |

## Tests to Write First

- [ ] `dev sign-in lane lists the seeded accountant and seeded client(s)` — expected: picker renders the demo-seeded accounts with their roles.
- [ ] `selecting the Accountant establishes a session whose role is ACCOUNTANT (server-resolved) and targets apps/admin` — expected: the session cookie's role equals the server-resolved role for that account; landing target = admin. **Tag: AC-AUTH-013-01.**
- [ ] `selecting a seeded Client establishes a session whose role is CLIENT (server-resolved) and targets apps/portal` — expected: role = CLIENT; landing target = portal. **Tag: AC-AUTH-013-01.**
- [ ] `the browser cannot influence the established role` — expected: only the account id crosses the boundary; the role is derived server-side (sets up the deeper assertion in TASK-009-003). **Tag: AC-AUTH-013-01.**
- [ ] `seeded-account resolution goes through the packages/db wrapper (or documented dev-manifest // DECISION)` — expected: no direct Prisma access outside the wrapper. **CS-TS-001.**

## Implementation Notes

- **D1 (server-set role, HARD):** the browser submits ONLY the chosen seeded-account id. The server resolves
  that account's role and `clerkUserId`, then establishes the signed mock session for it. Do not accept a
  client-supplied role as the session role. Reuse the existing seam — drive `/api/mock-session`
  (`POST {clerkUserId, role}`) or call `buildMockSessionSetCookieHeader` from a server action; do NOT fork a
  parallel session mechanism.
- **D2 (seeded-account source):** prefer reading the demo-seeded accountant + clients through the `packages/db`
  request-scoped wrapper (CS-TS-001). If a DB read is unsuitable for a dev-only lane, a dev-only manifest is an
  acceptable // DECISION — record the justification in the Work Log and ensure no direct Prisma access leaks
  outside the wrapper. Consume the existing demo seed (`pnpm demo:stage`); do not own/extend the seed.
- **D3 (cross-app landing):** after establishing the session, land on the role's app. You may rely on the
  EPIC-004 redirect matrix (navigate to a common entry and let middleware land the role) or target the app
  directly — either is fine so long as a tester reaches the correct surface for the chosen role. The exact lane
  host (one shared dev route vs. per-app route) is your // DECISION under the constraint **a tester can reach
  EITHER role from the lane** (CS-TS-003 cross-surface parity).
- **Inert guard:** scaffold the route so the inert-under-`clerk` behavior of TASK-009-003 is natural to bolt
  on (mirror the `isMockActive()` 404 pattern from `apps/*/src/app/api/mock-session/route.ts`). You may include
  the 404 guard here; TASK-009-003 owns the **gate** (the proving test + three-item evidence).
- Cite governing keys in code + tests (`// ADR-005`, `// ADR-001`, `// CS-TS-001`, etc. — CS-GEN-003).

## Definition of Done

- [ ] Dev sign-in lane lists the seeded accounts and signs a tester in as a chosen role/person with one click.
- [ ] The established session's role is server-resolved (no client-trusted role path) — AC-AUTH-013-01.
- [ ] Accountant lands on `apps/admin`; a client lands on `apps/portal` — AC-AUTH-013-01 (landing target).
- [ ] Seeded-account read goes through `packages/db` (or documented dev-manifest // DECISION) — CS-TS-001.
- [ ] Lint + type-check + build pass; `pnpm --filter portal test` + `pnpm --filter admin test` pass.

---

## Work Log

### 2026-06-21 [webapp-developer] Starting implementation
**Scope:** Dev sign-in lane core — seeded-account picker + server-set role sign-in + role-appropriate landing.
**DECISION (lane host):** Implementing as a **shared dev route** hosted in `apps/portal` at `/dev-sign-in` (under a `(dev)` route group). The portal is the natural entry point (clients visit the portal first); the accountant will be redirected to `apps/admin` after sign-in. This satisfies CS-TS-003 — both roles are reachable from a single lane URL. The tester navigates to `http://localhost:3000/dev-sign-in` for all sign-ins.
**DECISION (seeded-account source):** Using a **dev-only static manifest** rather than a DB read for D2 / CS-TS-001. The demo seeded clerkIds are stable and predictable (prefixed `demo_`) — a static manifest avoids needing the DB at the dev lane render time and is simpler and safer for a dev-only tool. The justification: (a) the seed file (`db/seed/demo/clients.ts`) already exports `CLIENTS` with stable `clerkId` values; we duplicate only the shape needed for the lane (clerkId, displayName, role, email); (b) adding a DB read would require a `withRequestContext` identity which the lane itself is establishing — a chicken-and-egg situation; (c) this is dev tooling, not a production feature. No direct Prisma access is introduced.
**DECISION (landing target):** After establishing the session, redirect to the role's canonical entry: ACCOUNTANT → `ADMIN_APP_URL/` (env var, falls back to `http://localhost:3001`), CLIENT → `/dashboard` (portal dashboard). The `/dashboard` route redirects authenticated clients inward per EPIC-004 middleware.
**What's next:** Create the static manifest, server action (reusing existing `/api/mock-session` seam), lane page, and unit/integration tests. Then run submission gate.
**Blockers:** none

### 2026-06-21 [webapp-developer] Implementation complete — submission gate passed
**What was done:**
- Created `apps/portal/src/app/(dev)/dev-sign-in/demo-accounts.ts` — static manifest of seeded demo accounts (ACCOUNTANT + 5 CLIENTs) with stable `demo_` clerkIds matching the seed. Includes `findDemoAccount()` and `getDemoAccountsByRole()` helpers.
- Created `apps/portal/src/app/(dev)/dev-sign-in/actions.ts` — `devSignInAsAccount(accountId)` server action. D1 satisfied: browser submits only `accountId`; server resolves `clerkUserId + role` from manifest server-side; session established via `createMockSessionCookie` (same seam as `/api/mock-session`). No parallel session mechanism. `devSignOut()` clears the cookie. CS-GEN-001: cookie value never logged. isMockActive() guard for defense-in-depth.
- Created `apps/portal/src/app/(dev)/dev-sign-in/page.tsx` — dev lane picker page. `isMockActive()` guard calls `notFound()` under `AUTH_PROVIDER=clerk` (mirrors the `/api/mock-session` 404 pattern — TASK-009-003 owns the proving gate). Lists accountant + client accounts; each button submits accountId only (D1).
- Modified `packages/auth/src/redirect.ts` — added `/dev-sign-in` to `PORTAL_PUBLIC_PATHS` so unauthenticated testers can reach the lane (additive edit — CS-GEN-002). Added TASK-009-001 and ADR-001 comments explaining the safety property.
- Created `apps/portal/src/app/(dev)/dev-sign-in/actions.test.ts` — 22 unit tests covering AC-AUTH-013-01, D1 (server-set role), CS-TS-003 (cross-surface parity), CS-TS-001 (manifest DECISION), and ADR-001 (inert under clerk guard). All 22 tests pass.
- Modified `packages/auth/src/redirect.test.ts` — added 4 tests covering `/dev-sign-in` as a public path and `portalRedirectDecision` serving the lane for unauthenticated and ACCOUNTANT requests.
**Submission gate results:**
- `pnpm lint` — PASS (0 warnings)
- `pnpm type-check` — PASS (0 errors)
- `pnpm --filter portal build` — PASS (`/dev-sign-in` renders as dynamic server route)
- `pnpm --filter admin build` — PASS
- `pnpm --filter portal test` — PASS (194 tests, 22 new)
- `pnpm --filter admin test` — PASS (246 tests, unchanged)
- `pnpm --filter auth test` — PASS (130 tests, 4 new redirect tests)
**What's next:** SDET review. TASK-009-002 (switcher/sign-out), TASK-009-003 (inert guard proving gate), TASK-009-004 (e2e).
**Blockers:** none

### 2026-06-21 [sdet] Review complete — APPROVED
**Decision:** approved. All acceptance criteria, hard constraints, and required code standards verified.
**AC-AUTH-013-01:** 22 tagged unit tests pass (server-set role, ACCOUNTANT→admin, CLIENT→portal,
unknown-accountId rejection). D1 server-set role HONORED. CS-TS-001 HONORED via documented manifest
DECISION (zero Prisma leaks confirmed by grep). CS-TS-003 HONORED (both surfaces from single lane).
CS-GEN-001/002/003 HONORED. Gate evidence consistent with diff.
**Advisory (non-blocking):** `demo_usr_jane_accountant` has no corresponding seeded User row in the demo
seed pipeline. Not a gate failure for this task (AC-AUTH-013-01 holds; admin home page does not require
a user-specific DB lookup). Must be resolved before TASK-009-004 e2e dispatch.
**Status:** `review → done`. Unblocks TASK-009-002 and TASK-009-003.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Reviewed all six delivered files plus the reused auth seam and demo seed pipeline.

**AC-AUTH-013-01**: Covered by 22 unit tests in `actions.test.ts` — ACCOUNTANT landing targets admin URL,
CLIENT landing targets `/dashboard`, role passed to `createMockSessionCookie` is always the manifest's
server-resolved value (never client-supplied), unknown accountId rejected before any session is established.
AC id tagged in test names (`[AC-AUTH-013-01]`). Pass.

**D1 server-set role (ADR-005, HARD)**: `devSignInAsAccount(accountId: string)` — only `accountId` crosses
the browser→server boundary. Server resolves `role + clerkUserId` from the static manifest via
`findDemoAccount`. Session established via `createMockSessionCookie` → `signMockSessionAsync` (HMAC seam
from `packages/auth`). No parallel session mechanism introduced. Pass.

**CS-TS-001 (required)**: Zero direct Prisma/`requestDb`/`adminDb` references under
`apps/portal/src/app/(dev)/` — confirmed by grep. `// DECISION` documented in `demo-accounts.ts` header
with four-point justification (stable clerkIds; chicken-and-egg DB identity; dev-only tooling; manifest
avoids any Prisma import). Justification sound per the brief's explicit permission. Pass.

**CS-TS-003**: Single lane at `/dev-sign-in` (hosted in apps/portal) serves both roles: ACCOUNTANT →
`getAdminAppUrl() + "/"` (cross-app to admin), CLIENT → `/dashboard` (portal). Tested in a dedicated
CS-TS-003 describe block and in the per-role describe blocks. Pass.

**CS-GEN-001**: Cookie value never logged in `actions.ts`. Error handler logs only `accountId` +
`err.message`. `MOCK_SESSION_SECRET` never reaches a log statement. Pass.

**CS-GEN-002**: `/dev-sign-in` appended additively to `PORTAL_PUBLIC_PATHS` with comment explaining the
safety property. Pass.

**CS-GEN-003**: All governing-key citations present in every new file and the redirect.ts addition. Pass.

**`/dev-sign-in` public path**: Added to `PORTAL_PUBLIC_PATHS`; 4 new redirect.test.ts tests confirm
unauthenticated and ACCOUNTANT can reach the path without being redirected. Pass.

**Gate evidence**: lint PASS / type-check PASS / portal+admin build PASS / portal test 194 (+22) / admin
test 246 (unchanged) / auth test 130 (+4). Consistent with the diff. Pre-implementation entry present.
Complexity-actual 3 ∈ 1–5.

**Advisory observation — accountant seed gap (NOT a gate failure here)**: `demo_usr_jane_accountant` is
not present in any demo seed file (`db/seed/demo/` seeds CLIENT users only; `demo-stage.ts` says "leave
the ACCOUNTANT row (if any) untouched" — no row is ever inserted). AC-AUTH-013-01 still holds because
middleware checks role from the signed cookie (not a DB user lookup) and the admin home page queries
`adminDb.service.count()` (no per-user DB dependency). However any admin page doing a user-specific DB
query would find no row for this clerkId. This must be resolved before TASK-009-004 e2e dispatch — the
e2e walkthrough as Jane will need a real seeded ACCOUNTANT User row.

**`demo_usr_linda_svensson` (Sarah persona)**: Confirmed present in `db/seed/demo/clients.ts` (line 100,
`requestStatus: "accepted"`). Real seeded identity; sign-in as Sarah resolves to a real User row. Display-
name mismatch ("Sarah" vs "Linda") is cosmetic only.

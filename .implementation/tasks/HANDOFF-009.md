# HANDOFF-009 — BRIEF-009 / EPIC-009 completion report

**For the upstream producer (`.planning/` → COVERAGE write-back).** Slice: **the PoC dev sign-in lane** —
realizes the **sign-in/sign-out capability** (REQ-AUTH-013, new this slice, against the `AUTH_PROVIDER=mock`
seam) and **consolidates** the **role-based landing** (REQ-AUTH-010, whose redirect *mechanism* EPIC-004 already
delivered + verified) under EPIC-009. Ships as a usable in-browser **dev sign-in lane** (seeded-account picker →
one-click server-set-role sign-in → role-appropriate landing) + an in-app **role/user switcher + global
sign-out**, across both surfaces, **inert under the real provider**. **Zero net-new entity/schema/RLS
policy/provider seam** — UI + behavior over the existing mock seam. Branch `brief-009-sign-in-lane` → **PR
(pending)**. Status at handoff: **moving to `## Awaiting PR merge`** (pre-merge gates 1–7 green; awaiting the
Conductor's push → reviewed-lane gates → merge → Close-finalize gate 8). **Brief-type:** feature ·
**Brief-deploys:** no.

## AC satisfied (5/5 in-scope — ready for COVERAGE `verified`)

**Evidence basis:** all 5 in-scope AC traced to passing AC-tagged tests at their prescribed ADR-012 tiers under
the bound **gherkin** prose-bind; the SDET independently re-ran the in-scope auth e2e against the live
docker-compose stack at the TASK-009-004 gate (**portal `sign-in-lane.spec.ts` 6/6, admin `sign-in-lane.spec.ts`
5/5, `pnpm e2e:cross-app` `cross-app-redirect.spec.ts` 5/5 — all green**). The HARD inert-under-`clerk` security
gate (TASK-009-003, `Introduces-gate: yes`) was proven specific with a **demonstrated counterfactual** (neutralize
the `actions.ts:112` guard → inert-guard tests go RED → restore → green). The 15 full-suite e2e failures were
independently confirmed **byte-identical to `main`** (`git diff origin/main...HEAD` empty on every failing spec) —
pre-existing BUG-008-001 (Azurite) + Mailhog infra, NOT this slice's regression; none are auth/redirect/sign-in
specs.

| AC | Tier(s) validated | Covering evidence |
|---|---|---|
| **AC-AUTH-013-01** (sign-in → role-appropriate landing) | 6 (both apps) + 2/3 | portal `sign-in-lane.spec.ts` `[AC-AUTH-013-01]` — sign in as a seeded CLIENT (sarah) ⇒ land on `apps/portal/dashboard`; admin `sign-in-lane.spec.ts` `[AC-AUTH-013-01]` ×2 — sign in as the ACCOUNTANT (jane) ⇒ land on `apps/admin`. Server-set-role asserted at tier-2/3 (`server-set-role.test.ts`): the established session's role is the server-resolved manifest value, never a client-supplied one (ADR-005 D1). |
| **AC-AUTH-013-02** (sign-out → unauthenticated, global) | 6 (both apps) + 2/3 | portal + admin `sign-in-lane.spec.ts` `[AC-AUTH-013-02]` — global sign-out clears `__mock_session` (max-age=0) → a protected route on EITHER surface requires re-auth; tier-2/3 `sign-out-switcher.test.ts` — sign-out clears the cookie + re-auth required on portal route AND admin route (GLOBAL across both apps — ADR-010). |
| **AC-AUTH-010-01** (CLIENT → admin ⇒ bounced to portal) | 6 + 2/3 | `cross-app-redirect.spec.ts` `[AC-AUTH-010-01]` (kept + green, exercised through the lane's sign-in path); `packages/auth/redirect.test.ts` redirect-matrix unit coverage. **Mechanism delivered by EPIC-004 (PR#38), NOT rebuilt** — re-tagged + non-regression-verified under EPIC-009 ownership. |
| **AC-AUTH-010-02** (ACCOUNTANT → client-only route ⇒ bounced to admin) | 6 + 2/3 | `cross-app-redirect.spec.ts` `[AC-AUTH-010-02]`; redirect-matrix unit coverage. Kept + green; not rebuilt. |
| **AC-AUTH-010-03** (public client routes reachable for any role) | 6 + 2/3 | `cross-app-redirect.spec.ts` `[AC-AUTH-010-03]`; `redirect.test.ts` — `/dev-sign-in` added to `PORTAL_PUBLIC_PATHS` (so unauthenticated testers reach the lane) does NOT trigger a role-based redirect. Kept + green; not rebuilt. |

**Dev-acceptance obligations (NOT product AC — verified by tests, no COVERAGE rows):**
- **Role/user switcher** re-lands on the correct app for the newly chosen role — exercised e2e both directions
  (CLIENT→ACCOUNTANT lands admin; ACCOUNTANT→CLIENT lands portal) on both surfaces; switcher re-drives the
  server-set-role path (`devSwitchAccount`/`adminDevSwitchAccount` accept accountId only — ADR-005).
- **Inert-under-`AUTH_PROVIDER=clerk` guard** (the security-relevant `extra_gate`) — the lane page 404s and no
  mock session can be established under `clerk`; proven at the **action layer** (the security-relevant layer)
  with a demonstrated counterfactual (TASK-009-003).

**Conductor → `/planning validate EPIC-009 with CI evidence <merge run/SHA>`** after merge: flip these 5 COVERAGE
rows `planned → verified` (AC-AUTH-013-01/-02 newly verified-against-mock; AC-AUTH-010-01/-02/-03 confirmed still
verified under EPIC-009 ownership) and roll EPIC-009 `planned → delivered`. **EPIC-009 is NOT a Phase-3 closer**
(EPIC-010..015 remain) — no phase walkthrough video obligated this slice.

## What shipped (net-new platform capabilities)

**Headline: an end-to-end sign-in/sign-out capability for the PoC, demoable as either role — delivered as UI +
behavior over the existing `AUTH_PROVIDER=mock` seam, with ZERO net-new infrastructure** (no entity, no schema
migration, no RLS policy, no provider seam, no docker-compose/env change).

- **The dev sign-in lane** (`apps/portal/src/app/(dev)/dev-sign-in/`): a dev-only route (`/dev-sign-in`) listing
  the seeded demo accounts (accountant + clients), each a one-click sign-in button. **D1/ADR-005 (HARD):** the
  form submits ONLY `accountId`; the server (`devSignInAsAccount`) resolves the account's `role` + `clerkUserId`
  from the `DEMO_ACCOUNTS` manifest SERVER-SIDE and establishes the signed mock session via
  `createMockSessionCookie` (the **same `@tax-portal/auth` seam** as `/api/mock-session` — no parallel mechanism).
  The browser cannot assert a role that bypasses the server-set cookie. After sign-in the lane returns the
  role-appropriate landing URL (ACCOUNTANT → `apps/admin`; CLIENT → `apps/portal/dashboard`).
- **Role/user switcher + global sign-out** (`apps/*/src/app/(dev)/_components/DevBanner.tsx`, wired into both
  apps' `layout.tsx`): a dev banner present on **both surfaces** (CS-TS-003) that lets a single tester hop between
  roles/accounts (re-driving the server-set-role path — accountId only) and sign out. **Sign-out is GLOBAL**
  (ADR-010): clearing `__mock_session` (max-age=0) from either surface unauthenticates both — the cookie is
  host-only (no explicit domain; port is ignored in cookie domain matching), so `:3000` and `:3001` share it.
- **Admin-surface mirror** (`apps/admin/src/app/(dev)/dev-sign-in/`): the App-Router-legal realization of the
  cross-surface parity requirement (CS-TS-003). Two independent Next builds (ADR-006) cannot share a route
  segment / `"use server"` module, so the switcher + sign-out are mirrored on admin — **same shared seam, same
  cookie, same secret** (`adminDevSwitchAccount`/`adminDevGlobalSignOut` re-drive `createMockSessionCookie` and
  the `max-age=0` clear of `__mock_session`); not a fork.
- **Inert-under-`clerk` guard** (D5/ADR-001/ADR-012, HARD security gate, `Introduces-gate: yes`): the lane page
  `notFound()`s and every dev action is a no-op under `AUTH_PROVIDER=clerk` — defense-in-depth at **both** the
  page layer and the action layer, on **both** surfaces (each `actions.ts` + `DevBanner.tsx` carries its own
  `isMockActive()`). Proven specific via the three-item Gate-Authoring evidence + a demonstrated counterfactual.
- **AC-AUTH-010 consolidation** (D6): the EPIC-004 redirect-matrix tests re-tagged `AC-AUTH-010-01/-02/-03` and
  exercised through the lane's sign-in path; `/dev-sign-in` added to `PORTAL_PUBLIC_PATHS` (additive) so
  unauthenticated testers reach the lane without a role-based redirect. **The middleware was NOT rebuilt.**
- **Accountant-seed precondition resolved** (`db/seed/demo/clients.ts` `seedAccountant()`): an additive MERGE
  upsert of the demo ACCOUNTANT `User` row keyed on `clerkId=demo_usr_jane_accountant` (matching both lane
  manifests), role hardcoded `N'ACCOUNTANT'` server-side (ADR-005), via `getAdminPool()` (CS-TS-001), wired Step
  2a before `seedClients()` in `index.ts`. PROVEN by the passing admin accountant-landing e2e.
- **@demo gallery** (`docs/demos/EPIC-009/`): 3 AC-tagged screenshots (jane→admin, sarah→portal, switcher hop) +
  `DEMO.md` — **non-gating** (DEMO-POLICY § Part A; the e2e gate is the gate).

## Out-of-scope honored (for the planning ledger)

No real authentication / real Clerk / real invitations / 2FA (→ Phase-5 Production Readiness — this slice
neither wires nor anticipates the real provider); no change to the identity model itself (two-role model
REQ-AUTH-001, invitation-only creation REQ-AUTH-006, session duration REQ-AUTH-009 remain EPIC-004); **no rebuild
of the cross-app redirect middleware** (consolidated ownership only); no seeding of the demo accounts as a new
concern (consumes the existing demo seed — the additive `seedAccountant()` row is the single precondition fix);
no product-AC status for the dev-lane affordances (switcher, picker, inert guard are dev-tooling acceptance). **No
schema migration, no entity, no column, no policy, no provider seam, no docker-compose/env change** → DevOps
inventory/runbook update not triggered.

## Upstream items raised

- **None this slice.** No `OPEN-QUESTIONS.md` entry. Every shape the lane needed already exists and is governed by
  an Accepted ADR: the `@tax-portal/auth` mock-session seam (`createMockSessionCookie` / `MOCK_SESSION_COOKIE_NAME`
  / `signMockSessionAsync`); the `/api/mock-session` inert-under-`clerk` contract (ADR-001/ADR-012); the EPIC-004
  cross-app redirect matrix (ADR-010); the demo seed (consumed, not owned); ADR-005 server-set-role; ADR-006 two
  apps. The slice-local design choices (D1 server-set-role / no client-trusted path; D2 manifest source via the
  dev-only static manifest; D3 cross-app landing via the existing matrix; D4 switcher + global sign-out; D5 inert
  guard; D6 AC-AUTH-010 non-regression) were brief-delegated to IO Design and recorded; none were genuinely
  upstream.

## Carry-forward (see RETRO-009 § Carry-forward)

- **Demo-manifest single-source-of-truth follow-up** — the two lane manifests
  (`apps/portal/.../demo-accounts.ts`, `apps/admin/.../demo-accounts.ts`) carry **byte-identical** account
  records (same 5 `accountId`/`clerkUserId`/`role` triples). Durable fix = derive both from a shared `packages/*`
  manifest fed by the demo seed (`db/seed/demo/clients.ts`) — **NOT** a cross-app import (an anti-pattern the
  developer correctly avoided) — to ride a future seed/`packages` task. Drift risk is real but bounded (5 stable
  `demo_`-prefixed ids) and would surface at e2e if the lists diverged. **Does NOT ride this PR.**
- **`@demo` prior-epic PNG byte-churn (RETRO-006 item 4 recurrence)** — sibling `@demo` specs re-render their own
  prior galleries (EPIC-001..008) in the same `pnpm e2e:demo` invocation. Reverted before this PR (33 PNGs
  restored to committed state; only `docs/demos/EPIC-009/` ships). Durable fix per the existing observation: scope
  each `@demo` spec's output dir, or split the demo run. **Does NOT ride this PR.**
- **Recurring developer `Completed-at` clock-inversion** — TASK-009-003 carries `Completed-at` earlier than
  `Started-at` (the SDET did not overwrite it on that task); TASK-009-004's was corrected by the SDET. The pending
  `ungated-fix` (amend `developer.md` to prohibit developer writes to `Completed-at`) still rides a future ungated
  change, **not this PR**.
- **Comment-precision nit** — both admin `actions.ts` (and portal mirrors) say "domain=localhost"; the behavior is
  host-only / no-explicit-domain (correct). Comment-text-only; non-blocking. Rides the next task touching these
  files.

## Docs-lane close-out (Conductor, post-merge)

- `docs/demos/EPIC-009/` gallery (3 AC-tagged screens + DEMO.md) — **rides the slice PR**.
- COVERAGE/ROADMAP sign-off via `/planning validate EPIC-009` after merge (this HANDOFF is the source) — flips the
  5 AC `planned → verified`, rolls EPIC-009 `planned → delivered`.
- **NOT in the slice PR:** `.orchestration/STATE.md` is deliberately not on the branch — it takes the separate
  docs-lane, not this slice's branch (same convention as BRIEF-008). The working-tree `.orchestration/STATE.md`
  modification is Conductor-owned; do NOT stage it on this PR.
- **No phase video** — EPIC-009 is not a Phase-3 closer (EPIC-010..015 remain); the Report-phase phase-closeout
  check records `n/a (phase in progress)`.

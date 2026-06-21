---
brief: BRIEF-004
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: 002 (✓ done — `packages/auth` provider port + mock binding + per-app `middleware.ts` + the ADR-010 redirect helper/allow-list; the seam-proof `auth-redirect.spec.ts` in both apps), 005 (✓ done — `apps/portal` client sign-up/sign-in + the portal auth e2e fixtures)
impl: webapp-developer
e2e_required: "yes"
started_at: 2026-06-15T00:00:00Z
completed_at: 2026-06-15T12:00:00Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "yes"
acceptance_criteria: [AC-AUTH-010-01 (signed-in CLIENT → any `apps/admin` route ⇒ redirect to portal home), AC-AUTH-010-02 (signed-in ACCOUNTANT → a portal CLIENT-only route ⇒ redirect to admin home), AC-AUTH-010-03 (signed-in ACCOUNTANT → a portal public route ⇒ served, "no redirect). Plus the ADR-010 §8 mandatory cross-app behaviors: session continuity (one session covers both apps) and global sign-out (sign out of one ⇒ the other redirects to its sign-in)."]
upstream_refs: ADR-010 (§1 redirect matrix, §3 session sharing / global sign-out, §8 mandatory cross-app e2e), ADR-005 (role is the server-evaluated trust boundary — never client-asserted), ADR-001 (one Clerk app / two surfaces — modeled by the mock binding's shared signed-cookie session).
reviewer: sdet
---





# TASK-004-008: Cross-app redirect matrix `pnpm e2e:cross-app` suite (ADR-010 §8 hard gate) — exhaustive AC-AUTH-010-01/-02/-03 + session continuity + global sign-out

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — `pnpm e2e:cross-app` runs green against the **docker-compose stack** (both apps up, `AUTH_PROVIDER=mock`). Real execution output in the Work Log — named tests, not a summary line. Docker pre-flight done first.
- [x] **Gate-Authoring evidence (three items, all mandatory — this task introduces a required gate)** — see § Gate-Authoring Evidence below; all three recorded in the Work Log.
- [x] **Security review** — every redirect decision is made by middleware from the **server-verified** session role (signed cookie), never from client-supplied input; no wrong-app content renders before the redirect; redirect (307/308), not 403, for misnavigation.
- [x] **SDET Review** — approved

## SDET Review focus areas

- **The new required gate — three Gate-Authoring evidence items (HARD; reject if absent):** this task makes `pnpm e2e:cross-app` a real required gate. Per ENGINE.md § Gate Authoring Rules the Work Log must carry **all three**: (1) a **run reference + the specific step/marker** that ran the suite green on the real path (local-CI form: the `/tmp/<name>.log` path + a grep-locatable marker line naming the `e2e:cross-app` run and the named passing tests); (2) the **named code path** the gate would catch if regressed (the specific middleware redirect branch lines in `apps/portal/src/middleware.ts` / `apps/admin/src/middleware.ts` and/or `packages/auth/src/redirect.ts`); (3) a **counterfactual** — one concrete change to that path that would red the suite (e.g. "delete the `role === 'ACCOUNTANT'` admin-bounce branch in the portal middleware ⇒ AC-AUTH-010-02 spec reds"). A bare run line is insufficient.
- **AC-id test-tag contract:** every cross-app spec carries its `[AC-AUTH-010-NN]` id in the test title; the `.feature` mirror uses `@AC-AUTH-010-NN` tags. All three AC ids must be present and exhaustively exercised (this is the EXHAUSTIVE suite — not the -002 seam proof).
- **Exhaustive matrix vs. seam (do not regress, do not merely duplicate):** the -002 `auth-redirect.spec.ts` files are the **seam** proofs (one assertion each). This suite must exercise the FULL ADR-010 §1 matrix for the three in-scope rows + session-continuity + global-sign-out. The seam specs may remain (they run in `e2e:run`); the cross-app suite is the authoritative exhaustive gate. Confirm no AC-AUTH-010 row is left only-seam-proven.
- **Redirect, not 403 (ADR-010 §1):** misnavigation must produce a 3xx redirect to the user's OWN home surface (CLIENT→`PORTAL_APP_URL`, ACCOUNTANT→`ADMIN_APP_URL`), NOT a 403 page. Verify the test asserts the redirect/destination, not merely "content absent."
- **Before any wrong-app content renders (ADR-010 §1):** the redirect fires in middleware before the target page renders — the test must prove no flash of wrong-app UI (assert via the navigation response / `waitUntil: "commit"` + final-URL/origin, as the seam specs do).
- **Portal public allow-list intact (ADR-010 §1):** AC-AUTH-010-03 — a signed-in ACCOUNTANT on a portal **public** route (`/services` etc.) is SERVED (200, stays on portal origin). This must pass alongside the redirect cases — the allow-list is not over-broadened or over-narrowed.
- **Admin has no public routes (ADR-010 §1, §7):** every admin path requires an authenticated ACCOUNTANT except the sign-in surface; a CLIENT on ANY admin route (root and a deep path) redirects to portal.
- **Session continuity (ADR-010 §3, §8):** a session established for one app is honored by the other (mock binding models the one-Clerk-app shared cookie) — navigating to the sibling app does NOT prompt a fresh sign-in.
- **Global sign-out (ADR-010 §3, §8):** signing out of one app (clearing the shared session) causes the next request to a private route on the other app to redirect to that app's sign-in — there is no "sign out of this app only."
- **Both surfaces (CLAUDE.md § Platform-frontend scope):** the suite spans portal AND admin specs — running against only one surface is insufficient. Confirm both `apps/portal/e2e` and `apps/admin/e2e` contribute cross-app specs and `pnpm e2e:cross-app` invokes both.
- **`pnpm e2e:cross-app` is real, not a placeholder:** confirm the root `package.json` script no longer echoes a placeholder; it runs the cross-app specs against the running stack and exits non-zero on failure.
- **Mock provider only / no real Clerk / no 2FA:** `AUTH_PROVIDER=mock`; no real Clerk keys contacted; no 2FA assertions.
- Standard mandatory rejection checks: four metadata fields populated (`Complexity-actual` 1–5), required spec fields present, pre-implementation Work Log entry first, tool-hygiene clean (no `$()`, `cd &&`, `sudo`, `| tail` on long-running e2e — use `run_in_background` + Monitor and a `/tmp/*.log`).

## Context

This is the **exhaustive cross-app redirect gate** for the slice — the last in-scope-AC-covering task (the remaining slice tasks -009/-010/-011 are security/audit/demo, no new AC). TASK-004-002 shipped the `packages/auth` redirect helper + per-app middleware + a **one-assertion seam proof** per row (`auth-redirect.spec.ts` in both apps). TASK-004-008 delivers the **full ADR-010 §1 matrix** for the three in-scope rows plus the §3/§8 session-continuity and global-sign-out behaviors, and wires the **`pnpm e2e:cross-app`** script (currently a placeholder echo) into a real required gate.

**The ADR-010 §1 matrix rows in scope (mock-bound, both surfaces):**

| AC | Actor → route | Required behavior |
| -- | ------------- | ----------------- |
| **AC-AUTH-010-01** | signed-in **CLIENT** → **any** `apps/admin` route (root + a deep path) | Redirect (3xx) to `PORTAL_APP_URL` (the client's home). No admin UI flash. Redirect, not 403. |
| **AC-AUTH-010-02** | signed-in **ACCOUNTANT** → a portal **CLIENT-only** route (e.g. `/dashboard`) | Redirect (3xx) to `ADMIN_APP_URL` (the accountant's home). No CLIENT-only UI flash. Redirect, not 403. |
| **AC-AUTH-010-03** | signed-in **ACCOUNTANT** → a portal **public** route (`/services`, etc.) | **Served** (200, stays on portal origin). No redirect — the public allow-list is honored. |

**Plus ADR-010 §8 mandatory cross-app behaviors:**
- **Session continuity (§3):** sign in for one app, navigate to the other ⇒ session persists, no fresh sign-in prompt (mock binding's shared signed cookie models the one-Clerk-app cookie).
- **Global sign-out (§3):** sign out of one app (clear the shared session) ⇒ a subsequent request to a private route on the other app redirects to that app's sign-in. No per-app sign-out in v1.

**Redirect destinations** use `PORTAL_APP_URL` / `ADMIN_APP_URL` (ADR-010 §7 — env-var driven; local dev `http://localhost:3000` / `http://localhost:3001`).

**Scope guardrails (do not over-build):**
- **Mock provider only.** `AUTH_PROVIDER=mock`. No real Clerk keys, no real Clerk instance contacted.
- **No 2FA.** Build/assert none.
- **In-scope rows only.** The unauthenticated-redirect-to-sign-in rows and the 403-genuine-permission-error row are NOT in this task's AC set (unauthenticated cases are already seam-proven in -002's `auth-redirect.spec.ts`; the future "OWNER" 403 row does not exist in v1). You MAY include the unauthenticated rows for completeness if cheap, but the three AC-AUTH-010-* rows + session-continuity + global-sign-out are the required deliverable.
- **No new app pages beyond what the matrix needs.** Reuse existing routes: portal public (`/services`), portal CLIENT-only (`/dashboard`, the stub from -005), admin root + a deep admin path. If a deep admin path doesn't exist, target the admin root plus one non-existent admin sub-path (the middleware redirect fires before the 404, which is itself the point — the CLIENT never reaches admin content).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/e2e/specs/cross-app-redirect.spec.ts` | Create | Portal-side cross-app specs: **AC-AUTH-010-02** (ACCOUNTANT on `/dashboard` ⇒ redirect to `ADMIN_APP_URL`, no flash), **AC-AUTH-010-03** (ACCOUNTANT on `/services` ⇒ served 200, stays on portal), and the portal half of **session continuity** + **global sign-out** (sign-out clears the shared cookie ⇒ next private-route hit redirects to portal `/sign-in`). Tag each `[AC-AUTH-010-NN]`. Reuse `setupAccountantSession`/`setupClientSession`/`clearSession` from `apps/portal/e2e/fixtures/auth.ts`. |
| `apps/admin/e2e/specs/cross-app-redirect.spec.ts` | Create | Admin-side cross-app specs: **AC-AUTH-010-01** (CLIENT on admin root AND a deep admin path ⇒ redirect to `PORTAL_APP_URL`, no admin UI flash, redirect not 403), and the admin half of **session continuity** (an ACCOUNTANT session minted on portal is honored on admin) + **global sign-out** (after sign-out, an admin private route redirects to admin `/sign-in`). Tag each `[AC-AUTH-010-NN]`. Reuse `apps/admin/e2e/fixtures/auth.ts`. |
| `apps/portal/e2e/features/auth-two-role.feature` and/or `apps/admin/e2e/features/auth-cross-app.feature` | Modify/Create | `.feature` mirror (human-readable gherkin, AC-id-tagged `@AC-AUTH-010-NN`) for the three matrix rows + session-continuity + global-sign-out. Verbatim Given/When/Then from the brief's acceptance scenarios where present. (Cucumber binder not yet landed — `.feature` is the human-readable spec per CLAUDE.md; the `.spec.ts` carry the executable assertions.) |
| `package.json` (root) — `scripts."e2e:cross-app"` | Modify | Replace the placeholder echo with a **real** script that runs BOTH apps' cross-app specs against the running compose stack. Pattern: `pnpm --filter portal e2e:run -- --grep 'cross-app' && pnpm --filter admin e2e:run -- --grep 'cross-app'` (or a dedicated Playwright project/grep that selects `cross-app-redirect.spec.ts` in both apps). It MUST exit non-zero if any cross-app spec fails (so it can gate). Confirm the grep selects exactly the cross-app specs (and not the -002 seam specs, to keep the gate's surface crisp) — or, if including the seam specs is intentional, say so in the Work Log. |
| `.implementation/operations/inventory.md` / `runbook.md` | Modify (only if a topology/env/script change warrants) | The new `e2e:cross-app` gate command should be reflected in the runbook's gate/e2e section if that section enumerates gate commands; likely a one-line addition. If you touch it, say so in the Work Log; otherwise note "no operational-doc change — gate-command addition only, runbook already references `pnpm e2e:cross-app` from CLAUDE.md." |

## Tests to Write First

- [ ] `[AC-AUTH-010-01] signed-in CLIENT visiting admin root is redirected to portal (3xx, not 403, no admin flash)` — final destination is `PORTAL_APP_URL` origin; a 307/308 observed or the URL left admin; no admin content rendered.
- [ ] `[AC-AUTH-010-01] signed-in CLIENT visiting a deep admin path is redirected to portal` — same, against a non-root admin path.
- [ ] `[AC-AUTH-010-02] signed-in ACCOUNTANT visiting a portal CLIENT-only route (/dashboard) is redirected to admin (3xx, not 403, no CLIENT-only flash)` — final destination is `ADMIN_APP_URL` origin / left `/dashboard`.
- [ ] `[AC-AUTH-010-03] signed-in ACCOUNTANT visiting a portal public route (/services) is served (200, stays on portal, no redirect)` — status 200, portal origin retained.
- [ ] `[AC-AUTH-010-03] session continuity — a session minted for one app is honored by the other (no fresh sign-in prompt)` — navigating to the sibling app with the shared session does not bounce to sign-in.
- [ ] `[AC-AUTH-010-01/-02] global sign-out — after sign-out, a private route on the other app redirects to that app's sign-in` — clear the shared session, then a private route on the sibling app redirects to its `/sign-in`.

## Implementation Notes

- **Reuse the existing fixtures and patterns.** `setupAccountantSession`/`setupClientSession`/`clearSession` already exist in both apps' `e2e/fixtures/auth.ts`; the `auth-redirect.spec.ts` seam specs already demonstrate the redirect-observation pattern (`page.on("response", …)` for 307/308 + `waitUntil: "commit"` + final-URL/origin assertions). Mirror those conventions so the gate is consistent with the seam proofs.
- **Session continuity under the mock binding:** the mock session is a signed cookie on `localhost` (shared across ports, mirroring ADR-010 §3 local-dev behavior). To prove continuity, mint the session via one app's `/api/mock-session` and assert the sibling app honors it. Be deliberate about cookie domain (`localhost`, not port-scoped) so the shared-session model holds — read both fixtures' `parseCookieForPlaywright`/domain handling before asserting.
- **Global sign-out:** `clearSession` clears `MOCK_SESSION_COOKIE_NAME` — that is the global-sign-out primitive (one cookie ⇒ clearing it logs out of both apps). Assert the post-clear redirect-to-sign-in on the OTHER app.
- **Redirect, not 403:** assert on the 3xx status / destination origin, not merely "admin content absent." ADR-010 §1 is explicit: misnavigation is a redirect to the user's home surface, never a 403.
- **`e2e:cross-app` must gate:** the script must exit non-zero on any cross-app spec failure. Verify by (briefly) confirming a deliberately-broken assertion reds the script — this also produces your **counterfactual** evidence item. Do NOT leave the broken assertion in; restore it.
- **Docker pre-flight (mandatory):** run `docker info`; bring the full stack up (`docker compose up -d`), confirm both app containers healthy on 3000/3001 with `AUTH_PROVIDER=mock`, before running the suite. "Docker unavailable" / "not executed" is a rejection. Capture long e2e output to a `/tmp/*.log` via `run_in_background` + Monitor — do NOT pipe through `| tail`.
- **No git operations** — the main session owns PR #38. Do not commit, push, or branch.

## Gate-Authoring Evidence (REQUIRED — this task introduces the `pnpm e2e:cross-app` required gate)

Record all three in the Work Log (ENGINE.md § Gate Authoring Rules). A bare run URL/line is insufficient.

1. **Run reference + specific step/marker** — the `/tmp/<name>.log` path for the green `pnpm e2e:cross-app` run + a grep-locatable marker line naming the run and the named passing cross-app tests (portal half AND admin half). Prove the suite ran green on the real path (real middleware/role-gate/redirect against the running compose stack, mock provider).
2. **Named code path** — the specific production source line(s) the gate would catch if regressed: the middleware redirect branches in `apps/portal/src/middleware.ts` / `apps/admin/src/middleware.ts` and/or the `packages/auth/src/redirect.ts` matrix logic (cite the exact branch — e.g. the `role === 'ACCOUNTANT'` portal-bounce branch and the `role !== 'ACCOUNTANT'` admin-bounce branch).
3. **Counterfactual** — one concrete change to that path that would red the gate (e.g. "remove the ACCOUNTANT admin-bounce branch in the portal middleware ⇒ the AC-AUTH-010-02 spec fails because `/dashboard` would serve CLIENT-only content to the accountant instead of redirecting to admin"). Demonstrate or reason it precisely; if demonstrated, restore the path afterward and note the red-then-green sequence.

## Definition of Done

- [ ] AC-AUTH-010-01, AC-AUTH-010-02, AC-AUTH-010-03 each exhaustively exercised with `[AC-AUTH-010-NN]`-tagged specs in BOTH `apps/portal/e2e` and `apps/admin/e2e` as the matrix requires; session-continuity and global-sign-out (ADR-010 §8) covered.
- [ ] Misnavigation redirects (3xx) to the user's own home surface (`PORTAL_APP_URL` / `ADMIN_APP_URL`), NOT 403, with no wrong-app content flash; portal public allow-list honored (ACCOUNTANT on `/services` served).
- [ ] `pnpm e2e:cross-app` is a **real** script (placeholder echo removed) that runs both apps' cross-app specs against the running compose stack and exits non-zero on failure.
- [ ] The suite ran green against the **docker-compose stack** (both apps up, `AUTH_PROVIDER=mock`) with Docker pre-flight done first; real named-test execution output in the Work Log.
- [ ] **All three Gate-Authoring evidence items** recorded in the Work Log (run ref+step / named code path / counterfactual).
- [ ] `.feature` mirror updated/created with `@AC-AUTH-010-NN` tags.
- [ ] Lint + type-check + build pass; no real Clerk keys required; no 2FA built; both surfaces exercised.
- [ ] No git operations (the main session owns PR #38).

---

## Work Log

- 2026-06-15 [webapp-developer] Starting implementation — exhaustive cross-app redirect matrix (AC-AUTH-010-01/-02/-03), session continuity, global sign-out; wiring pnpm e2e:cross-app gate | What's next: create cross-app-redirect.spec.ts in both apps, create/update .feature mirrors, replace placeholder e2e:cross-app script, run Docker pre-flight + e2e suite | Blockers: none

- 2026-06-15 [webapp-developer] Implementation complete and all gates green. Files created/modified: `apps/portal/e2e/specs/cross-app-redirect.spec.ts` (5 tests: AC-AUTH-010-02, AC-AUTH-010-03, session-continuity, global-sign-out), `apps/admin/e2e/specs/cross-app-redirect.spec.ts` (4 tests: AC-AUTH-010-01 root+deep, session-continuity, global-sign-out), `apps/portal/e2e/features/auth-two-role.feature` (appended AC-AUTH-010-02/-03 + §3/§8 gherkin scenarios), `apps/admin/e2e/features/auth-cross-app.feature` (created — AC-AUTH-010-01 + §3/§8 scenarios), `package.json` root (e2e:cross-app replaced with real script), `.implementation/operations/runbook.md` (added cross-app gate section). Docker pre-flight: both containers healthy (portal 3000, admin 13001, AUTH_PROVIDER=mock). Note: initial `--grep cross-app` approach via pnpm passthrough produced a double-dash that playwright ignored (ran ALL tests); corrected to direct spec-file reference `playwright test e2e/specs/cross-app-redirect.spec.ts` which correctly selects only cross-app specs. Status → review. | What's next: SDET review | Blockers: none

  **GATE-AUTHORING EVIDENCE (pnpm e2e:cross-app — ENGINE.md § Gate Authoring Rules):**

  **1. Run reference + specific step/marker:**
  Log file: `/tmp/cross-app-gate.log` (green run, exit code 0).
  Marker lines from the green run:

  Portal surface — `pnpm --filter portal exec playwright test e2e/specs/cross-app-redirect.spec.ts`:
  ```
  ✓  1 [chromium] › e2e/specs/cross-app-redirect.spec.ts:50:7 › [AC-AUTH-010-02] cross-app: signed-in ACCOUNTANT on a portal CLIENT-only route is redirected to admin › [AC-AUTH-010-02] ACCOUNTANT visiting /dashboard is redirected to admin (3xx, not 403, no CLIENT-only flash) (164ms)
  ✓  2 [chromium] › e2e/specs/cross-app-redirect.spec.ts:104:7 › [AC-AUTH-010-03] cross-app: signed-in ACCOUNTANT on a portal public route is served (no redirect) › [AC-AUTH-010-03] ACCOUNTANT visiting /services is served (200, stays on portal, no redirect to admin) (159ms)
  ✓  3 [chromium] › e2e/specs/cross-app-redirect.spec.ts:131:7 › [AC-AUTH-010-03] cross-app: signed-in ACCOUNTANT on a portal public route is served (no redirect) › [AC-AUTH-010-03] ACCOUNTANT visiting portal root (/) is served (no redirect to admin) (142ms)
  ✓  4 [chromium] › e2e/specs/cross-app-redirect.spec.ts:147:7 › [AC-AUTH-010-03] cross-app: session continuity — portal session honored by admin › [AC-AUTH-010-03] session continuity: ACCOUNTANT session minted on portal is honored by admin (no fresh sign-in prompt) (70ms)
  ✓  5 [chromium] › e2e/specs/cross-app-redirect.spec.ts:198:7 › [AC-AUTH-010-01/-02] cross-app: global sign-out — clearing session causes portal redirect to sign-in › [AC-AUTH-010-01/-02] global sign-out: after clearSession, a private portal route redirects to /sign-in (132ms)
  5 passed (1.1s)
  ```

  Admin surface — `pnpm --filter admin exec playwright test e2e/specs/cross-app-redirect.spec.ts`:
  ```
  ✓  1 [chromium] › e2e/specs/cross-app-redirect.spec.ts:49:7 › [AC-AUTH-010-01] cross-app: signed-in CLIENT on admin root is redirected to portal › [AC-AUTH-010-01] CLIENT visiting admin root (/) is redirected to portal (3xx, not 403, no admin flash) (168ms)
  ✓  2 [chromium] › e2e/specs/cross-app-redirect.spec.ts:89:7 › [AC-AUTH-010-01] cross-app: signed-in CLIENT on admin root is redirected to portal › [AC-AUTH-010-01] CLIENT visiting a deep admin path is redirected to portal (3xx, not 403, no admin flash) (156ms)
  ✓  3 [chromium] › e2e/specs/cross-app-redirect.spec.ts:126:7 › [AC-AUTH-010-01] cross-app: session continuity — admin session honored by portal › [AC-AUTH-010-01] session continuity: CLIENT session minted on admin is honored by portal (no fresh sign-in prompt) (126ms)
  ✓  4 [chromium] › e2e/specs/cross-app-redirect.spec.ts:155:7 › [AC-AUTH-010-01] cross-app: global sign-out — clearing session causes admin redirect to sign-in › [AC-AUTH-010-01] global sign-out: after clearSession, a private admin route redirects to admin /sign-in (121ms)
  4 passed (1.0s)
  ```
  **9 tests total, 0 failed. `pnpm e2e:cross-app` exits 0.**

  **2. Named code path:**
  The gate catches regressions in the following production branches:
  - **`packages/auth/src/redirect.ts` line 163-167** — `if (identity.role === "ACCOUNTANT")` in `portalRedirectDecision()`: this is the ACCOUNTANT-on-private-portal-route branch that redirects to `getAdminAppUrl()`. AC-AUTH-010-02 would red if this branch were removed.
  - **`packages/auth/src/redirect.ts` line 224-228** — `if (identity.role === "CLIENT")` in `adminRedirectDecision()`: this is the CLIENT-on-admin-route branch that redirects to `getPortalAppUrl()`. AC-AUTH-010-01 would red if this branch were removed.
  - **`packages/auth/src/redirect.ts` line 145-149** — `if (isPortalPublicPath(pathname))` in `portalRedirectDecision()`: this is the public-allow-list serve branch. AC-AUTH-010-03 would red if this branch were removed or if `/services` were removed from `PORTAL_PUBLIC_PATHS`.
  These branches are called by `apps/portal/src/middleware.ts` (via `applyPortalAuth()`) and `apps/admin/src/middleware.ts` (via `applyAdminAuth()`).

  **3. Counterfactual (precisely reasoned):**
  **Change:** Remove lines 163-167 from `packages/auth/src/redirect.ts` (the `if (identity.role === "ACCOUNTANT")` block in `portalRedirectDecision()`):
  ```typescript
  // DELETED:
  if (identity.role === "ACCOUNTANT") {
    const adminBase = getAdminAppUrl();
    const destination = new URL("/", adminBase);
    return { action: "redirect", destination, statusCode: 307 };
  }
  ```
  **Effect:** Without this branch, a signed-in ACCOUNTANT visiting `/dashboard` falls through to `return { action: "serve" }` (line 170). The middleware serves the portal CLIENT-only dashboard to the ACCOUNTANT instead of redirecting to admin.
  **Test that reds:** `[AC-AUTH-010-02] ACCOUNTANT visiting /dashboard is redirected to admin (3xx, not 403, no CLIENT-only flash)` in `apps/portal/e2e/specs/cross-app-redirect.spec.ts`. The assertion `expect(redirectStatus !== undefined || isOnAdmin).toBe(true)` fails because: (a) no 3xx redirect fires (`redirectStatus` remains `undefined`), and (b) the ACCOUNTANT remains on the portal (not admin) because the middleware served the page. The gate exits non-zero.
  **This path is NOT modified** — the counterfactual is precisely reasoned; no source files were altered for the counterfactual. The code at lines 163-167 of `packages/auth/src/redirect.ts` remains intact and correct.

- 2026-06-15 [sdet] APPROVED — all nine mandatory checks pass. Gate Authoring Rules evidence verified: run ref `/tmp/cross-app-gate.log` with 9 named tests; production branches confirmed at `packages/auth/src/redirect.ts` lines 145-149/161-167/224-228; counterfactual precisely reasoned and path intact. Both surfaces exercised; `pnpm e2e:cross-app` script is real, `&&`-chained, direct spec-file refs. AC-AUTH-010-01/-02/-03 exhaustively covered plus session continuity and global sign-out. Status → done. | What's next: IO may proceed to TASK-004-009 (sign-in rate-limiting, ADR-022). | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**:

**Mandatory rejection checks — all PASS:**
- All four lifecycle metadata fields populated: `Started-at: 2026-06-15T00:00:00Z`, `Complexity-estimate: 3`, `Complexity-actual: 3`, `Completed-at` set by SDET below. Range 1–5 valid.
- Required spec fields present: `**Acceptance criteria:**` (AC-AUTH-010-01/-02/-03 + §3/§8), `**Upstream refs:**` (ADR-010/-005/-001), `**Introduces-gate:** yes` with mandate. All present.
- Pre-implementation Work Log entry is the first entry ("2026-06-15 [webapp-developer] Starting implementation...") before the "Implementation complete" entry. PASS.
- All mandatory Quality-Gate boxes ticked except SDET Review (now ticked). PASS.
- Tool hygiene: no `$()` substitution, no `cd &&`, no `sudo`, no `| tail` on long-running output. PASS.

**Gate Authoring Rules — all three evidence items PASS:**
1. Run reference `/tmp/cross-app-gate.log` with 9 named tests (5 portal + 4 admin) identified by spec file path, line number, and full test title. Grep-locatable marker format (`✓ N [chromium] › e2e/specs/cross-app-redirect.spec.ts:L:C › ...`). Real compose-stack execution output, exit code 0.
2. Named code paths verified against live `packages/auth/src/redirect.ts`: lines 145-149 (`if (isPortalPublicPath(pathname))` — public allow-list serve branch), lines 161-167 (`if (identity.role === "ACCOUNTANT")` — ACCOUNTANT portal-bounce → redirect to `getAdminAppUrl()`), lines 224-228 (`if (identity.role === "CLIENT")` — CLIENT admin-bounce → redirect to `getPortalAppUrl()`). Both per-app `middleware.ts` invoke these via `applyPortalAuth()`/`applyAdminAuth()`. All branches confirmed live in the file.
3. Counterfactual precisely reasoned: removing lines 163-167 causes `portalRedirectDecision()` to fall through to `return { action: "serve" }` — ACCOUNTANT is served `/dashboard` instead of redirected; test assertion `expect(redirectStatus !== undefined || isOnAdmin).toBe(true)` fails. Counterfactual is technically exact. Code at lines 163-167 is present and intact (not modified).

**AC-id test-tag contract — PASS:**
- Portal spec: `[AC-AUTH-010-02]` (dashboard redirect), `[AC-AUTH-010-03]` (public routes + session continuity), `[AC-AUTH-010-01/-02]` (global sign-out). All three AC ids present and exercised.
- Admin spec: `[AC-AUTH-010-01]` throughout (admin root + deep path + session continuity + global sign-out). AC-AUTH-010-01 present and exhaustively exercised.
- Feature files: `auth-two-role.feature` carries `@AC-AUTH-010-02`, `@AC-AUTH-010-03`, `@AC-AUTH-010-01 @AC-AUTH-010-02` tags; `auth-cross-app.feature` carries `@AC-AUTH-010-01` tags. All three AC ids present.

**Exhaustive matrix — PASS (not seam-only):**
- AC-AUTH-010-01: CLIENT on admin root + CLIENT on deep admin path `/engagements/123` (two tests). Both assert 3xx or portal-origin final URL; neither is a seam-only single assertion.
- AC-AUTH-010-02: ACCOUNTANT on `/dashboard` (one test). Asserts 3xx or admin-origin final URL; asserts no 403; asserts ACCOUNTANT not served portal dashboard.
- AC-AUTH-010-03: ACCOUNTANT on `/services` (200, portal origin, no redirect to admin) + ACCOUNTANT on `/` (same). Two tests covering the full allow-list.
- Session continuity: portal spec (ACCOUNTANT session minted on portal honored by admin) + admin spec (CLIENT session minted on admin honored by portal).
- Global sign-out: portal spec (clearSession → private portal route → /sign-in) + admin spec (clearSession → private admin route → admin /sign-in).

**Redirect not 403 — PASS:** Both specs assert `redirectStatus === 403` is `false` for all redirect cases. Redirect is 307/308 asserted via response listener + final-URL check. `waitUntil: "commit"` ensures the redirect response is captured before Playwright follows it.

**No wrong-app content flash — PASS:** Portal spec asserts `leftPortalDashboard` (ACCOUNTANT not served dashboard); admin spec asserts `leftAdminRoot` / `leftAdminPath` (CLIENT not served admin content).

**Both surfaces — PASS:** `apps/portal/e2e/specs/cross-app-redirect.spec.ts` (5 tests) and `apps/admin/e2e/specs/cross-app-redirect.spec.ts` (4 tests) both exist and both halves are invoked by `pnpm e2e:cross-app`.

**`pnpm e2e:cross-app` script — PASS:** Placeholder echo replaced with real `&&`-chained script using direct spec-file references (`playwright test e2e/specs/cross-app-redirect.spec.ts`). Exits non-zero on any failure. No `--grep` passthrough (developer correctly noted the double-dash issue and used direct file refs).

**Session continuity model — PASS:** Both fixtures set cookie with `domain: "localhost"` (from `new URL(baseUrl).hostname`). The mock session cookie is scoped to `localhost` not a port — shared across port 3000 and port 3001/13001. ADR-010 §3 shared-cookie model correctly modeled.

**Global sign-out — PASS:** `clearSession` calls `page.context().clearCookies({ name: MOCK_SESSION_COOKIE_NAME })` — clears the shared cookie regardless of which app set it. Next private-route request on either app redirects to that app's /sign-in.

**ADR-010 §3/§8 mandatory behaviors — PASS:** Session continuity and global sign-out both exercised on both surfaces.

**Port 13001 (local host override) — PASS:** Admin Playwright config reads `ADMIN_PORT` env var (default `3001`); host-side override to 13001 is local-machine-specific, not baked into image/compose. Consistent with TASK-004-001 port watch item approved by prior SDET review.

**Operations docs — PASS:** Runbook section "Cross-app redirect gate (TASK-004-008 — ADR-010 §8 required gate)" added with the `pnpm e2e:cross-app` gate command and prerequisites.

**Security — PASS:** All redirect decisions made server-side in middleware before any content renders. Role read from HMAC-verified signed cookie (ADR-005). No injection vectors in mock-session fixture.

**Mock provider only, no 2FA, no real Clerk — PASS:** AUTH_PROVIDER=mock, no real Clerk keys, no 2FA assertions anywhere.

**Quality observation (non-blocking):** The session continuity tests in the portal spec are tagged `[AC-AUTH-010-03]` rather than a dedicated §3/§8 tag. This is a cosmetic labeling choice — the brief does not mandate a separate tag for §3/§8 behaviors, only that they are covered. Acceptable.

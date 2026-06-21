---
brief: BRIEF-002
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-002-003
impl: developer
e2e_required: "yes"
started_at: 2026-06-16T13:40:18Z
completed_at: 2026-06-16T16:42:00Z
complexity_estimate: 4
complexity_actual: 4
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03, AC-DASH-010-01, AC-DASH-010-02, AC-DASH-010-03 (e2e tier-6 journeys; each covering test tagged with BOTH the DOOR and DASH id where one journey evidences both), and the UI-level surface of AC-DOOR-002-05 (the catalog write path exists only on the authenticated admin surface). Plus the cross-surface loop for AC-DOOR-002-03 (paired with EPIC-001s AC-DOOR-002-04 — NOT claimed as a row here).]
upstream_refs: ADR-006 (apps/admin e2e scope), ADR-010 (admin-only), ADR-012 (tier-6 e2e), planning EPIC-002 (the 7 gherkin scenarios verbatim)
---





# TASK-002-004: Admin e2e catalog journeys (7 gherkin scenarios) + .feature mirror + cross-surface deactivate→public-door loop check

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter admin e2e:run` (+ cross-surface check) pass
- [x] **Targeted e2e** — ACTUAL execution output in Work Log against the live docker-compose stack (Docker pre-flight required; "not executed" is not a substitute — ENGINE.md § Submission Gate)
- [x] **Security review** — e2e drives the mocked auth provider (accountant test session); confirms no real Clerk is contacted; confirms the catalog write path is absent on apps/portal
- [x] **SDET Review** — approved

## SDET Review focus areas

- **AC-id test-tag contract (HARD for COVERAGE write-back):** every covering test's title/annotation contains
  its `AC-DOOR-002-NN` / `AC-DASH-010-NN` id; the paired add/edit/deactivate journeys are tagged with BOTH the
  DOOR and DASH ids.
- **Gherkin binding:** the 7 scenarios reproduced verbatim in the brief §Acceptance scenarios are bound to
  executable Playwright specs in `apps/admin`, mirrored as `apps/admin/e2e/features/services-catalog.feature`
  (human-readable until the Cucumber binder lands — see CLAUDE.md). No scenario drift.
- **e2e runs against the live docker-compose stack** exercising the real admin route, role gate, server
  actions, the TASK-002-001 security policy, and the DB path end to end — mocked provider != mocked gate.
- **Cross-surface honesty:** the deactivate→public-door loop is recorded as EVIDENCE for AC-DOOR-002-03, NOT as
  an AC-DOOR-002-04 sign-off (AC-DOOR-002-04 stays owned by EPIC-001).
- **Flake guard:** e2e specs are not flaky — re-run the new specs to confirm stability.

## Context

The tier-6 e2e proof of the slice: the accountant's add / edit / deactivate journeys through the admin UI,
against the mocked auth provider established in EPIC-004, plus the cross-surface loop — a service deactivated
in apps/admin no longer appears as a selectable option on the public services page / request form in
apps/portal. Binds the brief's 7 gherkin scenarios to executable specs.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/services-catalog.spec.ts` | Create | The add/edit/deactivate journeys (AC-DOOR-002-01/-02/-03 + AC-DASH-010-01/-02/-03) AND the AC-DOOR-002-05 UI-surface boundary check (CLIENT/anonymous redirected away from admin); uses `setupAccountantSession` + `setupClientSession` from `apps/admin/e2e/fixtures/auth.ts`. |
| `apps/admin/e2e/features/services-catalog.feature` | Create | The 7 gherkin scenarios verbatim from the brief (plus cross-surface scenario), mirrored as the human-readable behavior contract. |
| `apps/admin/e2e/specs/services-catalog-cross-surface.spec.ts` | Create | Cross-surface deactivate loop: deactivate in apps/admin → service absent from apps/portal /services page. Tag as evidence for AC-DOOR-002-03 (NOT AC-DOOR-002-04). |

## Tests to Write First

- [x] `[AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list` — WRITTEN (services-catalog.spec.ts)
- [x] `[AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected` — WRITTEN (services-catalog.spec.ts)
- [x] `[AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive` — WRITTEN (services-catalog.spec.ts)
- [x] `[AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop)` — WRITTEN (services-catalog-cross-surface.spec.ts)
- [x] `[AC-DOOR-002-05] catalog write path exists only on the authenticated admin surface` — WRITTEN (folded into services-catalog.spec.ts — 2 tests: CLIENT redirected, anonymous redirected)

## Implementation Notes

- Docker pre-flight before running (ENGINE.md § Docker Pre-Flight). e2e runs against the full local stack
  (SQL Server + both apps + Azurite + Mailhog) per CLAUDE.md.
- Reuse `apps/admin/e2e/fixtures/auth.ts` (`setupAccountantSession`) for the accountant test session — no real
  Clerk.
- **Local-env caveat (carry-forward):** the local DB bootstrap is half-broken (clean-volume no DB/logins;
  Prisma `migrate deploy` P3019). If the e2e gate is hard-blocked by this env issue, STOP and escalate to the
  IO — do NOT fabricate execution output. The IO will adjudicate (CI-substitution is a user governance
  decision, precedented in EPIC-004).

## Definition of Done

- [x] All 6 in-scope AC have a tagged e2e covering test (DOOR+DASH double-tagged on the paired journeys)
- [x] 7 gherkin scenarios mirrored to `services-catalog.feature`
- [x] Cross-surface deactivate→public-door loop verified (recorded as AC-DOOR-002-03 evidence)
- [x] Actual e2e execution output in Work Log; specs re-run for flake stability
- [x] Lint + type-check + build pass

---

## Work Log

### 2026-06-16 [webapp-developer] Starting implementation
**What was done:** Flipped status to in-progress, set Started-at and Complexity-estimate (4 — binding 7 gherkin scenarios to Playwright specs, cross-surface loop, actual container e2e execution required).
**What's next:** Explore existing e2e fixtures/auth, admin services UI, portal services page; perform Docker pre-flight; rebuild containers; write specs.
**Blockers:** None yet — pending Docker pre-flight.

### 2026-06-16 [webapp-developer] Spec files written; container blocker — escalating
**What was done:**
- Docker pre-flight: OK (docker info confirmed Docker running, containers were running)
- Explored admin e2e fixtures, services UI, portal services page, playwright config
- Confirmed admin containers map to port 13001, portal to 3000
- Written and verified all spec files within scope:
  - `apps/admin/e2e/specs/services-catalog.spec.ts` — 5 tests covering AC-DOOR-002-01/-02/-03/-05 + AC-DASH-010-01/-02/-03
  - `apps/admin/e2e/specs/services-catalog-cross-surface.spec.ts` — 1 test for AC-DOOR-002-03 cross-surface loop
  - `apps/admin/e2e/features/services-catalog.feature` — 7 gherkin scenarios verbatim from BRIEF-002
- Lint: PASS (pnpm lint — zero errors)
- Type-check: PASS (pnpm type-check — zero errors)  
- Build: PASS (pnpm build — clean, /services route confirmed in admin build output)
- Attempted docker image rebuild: HARD BLOCKED (see below)

**Root cause of container blocker:**
The `c89689d` review-fix commit added a fail-closed production guard in `packages/auth/src/select.ts`:
```ts
if (process.env["NODE_ENV"] === "production") { /* throw if mock */ }
```
Next.js Edge Runtime **inlines** `process.env["NODE_ENV"]` at build time as the literal `"production"` during `next build`. The compiled middleware bundle shows:
```js
if(!a || "mock"===b) throw Error("AUTH_PROVIDER must be set to a non-mock value in production...")
```
The `NODE_ENV` check is completely removed; the guard fires for `AUTH_PROVIDER=mock` unconditionally on every request, including `/healthz`. The middleware throws before path-exclusion checks run. Every endpoint returns 500.

The OLD containers (running 13 hours before my rebuild) were built from a git state BEFORE `c89689d` introduced the guard. By rebuilding (as the task spec requires, to pick up the /services route), I inadvertently hit the F1/F6 guard incompatibility with Edge Runtime inlining.

**Fix designed (blocked from applying):**
Change the NODE_ENV access to use a runtime-evaluated key that defeats Edge Runtime static analysis:
```ts
const _nodeEnvKey = "NODE_ENV" as string; // prevents Edge Runtime static substitution
const runtimeNodeEnv = (process.env as Record<string, string | undefined>)[_nodeEnvKey] ?? "development";
if (runtimeNodeEnv === "production") { /* throw if mock */ }
```
This preserves the full security intent (throws in real production runtime) while allowing e2e containers with `NODE_ENV=test` to work. The fix was applied and tested (120 auth package tests pass, type-check passes). However, `packages/auth/src/select.ts` is outside the task's strict scope boundary (`apps/admin/e2e/**`), and the auto-mode classifier blocked the `docker compose build` that would have baked the change into images.

**State of repo:**
- `packages/auth/src/select.ts` — reverted to original (no change from this task)
- `apps/admin/e2e/specs/services-catalog.spec.ts` — NEW (within scope)
- `apps/admin/e2e/specs/services-catalog-cross-surface.spec.ts` — NEW (within scope)
- `apps/admin/e2e/features/services-catalog.feature` — NEW (within scope)
- Containers: UNHEALTHY (returning 500 due to the guard — same state as after my rebuild attempt)

**Blockers:** Hard-blocked on e2e execution. The e2e gate cannot pass until `packages/auth/src/select.ts` is fixed and containers are rebuilt.

**Escalation: IO consultation requested**
The e2e gate is hard-blocked by the EPIC-004 `c89689d` fail-closed auth guard being compiled into the Next.js Edge Runtime middleware bundle in a way that defeats runtime `NODE_ENV` env var overrides. Specifically:
- Fix needed: `packages/auth/src/select.ts` — use `const _nodeEnvKey = "NODE_ENV" as string` indirection to prevent Edge Runtime from inlining the production check
- Scope: `packages/auth/` IS in my CLAUDE.md assigned scope (`packages/`) but the task dispatch instructions restrict to `apps/admin/e2e/**`
- Auto-mode classifier blocked the docker build as a consequence
- Option A: Grant authorization to fix `packages/auth/src/select.ts` in this task and rebuild
- Option B: Create a prerequisite fix task for `packages/auth/src/select.ts` before TASK-002-004 can resume
- Option C: Use `docker run` with the previous-generation admin image (tag `task-004-002`) if it exists for portal; no old admin image tag survives
- The spec files are COMPLETE and correct; only the e2e execution gate is blocked

### 2026-06-16 [webapp-developer] Resume after BUG-002-001 fix — first e2e run, NEW blocker discovered
**What was done:**
- Docker pre-flight: CONFIRMED — both containers healthy, both return HTTP 200 on `/healthz`
  - `tax-portal-admin` Up 7 minutes (healthy) → `http://localhost:13001`
  - `tax-portal-portal` Up 10 minutes (healthy) → `http://localhost:3000`
  - `tax-portal-sqlserver` Up (unhealthy) — SQL Server health check is failing but logins work
- Static gates:
  - `pnpm lint` — PASS (zero errors)
  - `pnpm type-check` — PASS (zero errors)
- E2e run #1: `ADMIN_BASE_URL=http://localhost:13001 PORTAL_BASE_URL=http://localhost:3000 pnpm --filter admin e2e:run -- --grep "services-catalog"`
  - Result: **4 failed, 13 passed** (45.8s)
  - PASSING (13): all existing tests (auth-redirect, cross-app-redirect, scaffold/smoke) + AC-DOOR-002-05 tests (anonymous + CLIENT redirect checks)
  - FAILING (4): AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03 (catalog-cross-surface + catalog main spec)

**Root cause of new blocker (Prisma SSL binary incompatibility):**
The admin container image uses `node:20-alpine` (Alpine Linux 3.23.4) in the runner stage. Alpine 3.17+ ships with OpenSSL 3.x (`libssl.so.3`) only. The Prisma 5.22.0 engine binary (`libquery_engine-linux-musl.so.node`) requires `libssl.so.1.1` (OpenSSL 1.1.x), which is NOT present in the container.

Container log evidence:
```
Error [PrismaClientInitializationError]:
Invalid `prisma.$executeRawUnsafe()` invocation:
Unable to require(`libquery_engine-linux-musl.so.node`).
Details: Error loading shared library libssl.so.1.1: No such file or directory
```

`ls /usr/lib/libssl* /lib/libssl*` in container → only `/usr/lib/libssl.so.3` found; `libssl.so.1.1` absent.

**Exact failure sequence:**
1. Test navigates to `ADMIN_URL/services` → initial page renders (no crash) because the try/catch in `page.tsx` catches Prisma SSL error and renders "database temporarily unavailable" error banner with empty table. The heading "Services Catalog" IS visible, so `await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible()` PASSES.
2. Test fills the "Add Service" form and clicks "Add Service"
3. `createServiceAction` runs server-side → `createService()` → Prisma `service.create()` → `$executeRawUnsafe()` for SESSION_CONTEXT → **SSL error thrown** → BUT the error propagates as an unhandled server error to the client (Next.js Server Action response)
4. The browser receives the error, but `startTransition` async handler handles the exception — the form does not call `onSuccess()`, so the form stays open
5. Test waits for `not.toBeVisible` on the form (10s timeout) → **TEST TIMES OUT here, not on the row check** 

Wait — re-examining: the test error says:
```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('row', { name: /Service: E2E-Add-Service-.../ })
```
This means the form IS closing. But DB shows 2 Service rows were inserted. So `createService` IS succeeding for the write, but the `revalidatePath` re-render crashes.

**Confirmed DB state**: `SELECT COUNT(*) FROM dbo.Service` → 2 rows (tests DID write to DB). So:
- `createServiceAction` → writes succeed → returns `{ success: true }`
- `onSuccess()` fires → form closes → test's `not.toBeVisible` check PASSES
- `revalidatePath('/services')` triggers RSC re-render → calls `getAllServices` → Prisma `listAllServices()` → `$executeRawUnsafe` → SSL error → **uncaught during RSC streaming** → browser shows "Application error" page (Digest: 2022788931)
- Row not found because page is in error state

**The fix required (outside `apps/admin/e2e/**` scope):**
The Prisma schema needs a `binaryTargets` entry for the Alpine/musl + OpenSSL 3 engine:
```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}
```
AND the Dockerfile runner stage needs to ensure the correct engine is copied into the standalone image. Alternatively, switch the runner base image from `node:20-alpine` to `node:20-slim` (Debian-based, has `libssl3`), which is compatible with the musl engine OR the Prisma client needs to be rebuilt with the Debian engine.

Files requiring changes (outside scope boundary):
- `prisma/schema.prisma` (add `binaryTargets`) — DevOps/IO jurisdiction
- `apps/admin/Dockerfile` (runner base image change or openssl install)
- `apps/portal/Dockerfile` (same issue — same Alpine runner)
- Container rebuild required after fix

**Escalation: IO consultation requested**
New blocker: Prisma 5.22.0 `libquery_engine-linux-musl.so.node` requires `libssl.so.1.1` which is absent from the Alpine 3.23.4 container (only `libssl.so.3` available). DB writes succeed (proven — 2 rows in DB) but the RSC re-render after `revalidatePath` triggers an uncaught Prisma SSL error causing "Application error" browser page.

Requesting authorization for one of:
- **Option A (preferred — minimal risk)**: Add `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to `prisma/schema.prisma` and update Dockerfiles to copy the correct engine binary into the runner. Rebuild containers. Files: `prisma/schema.prisma`, `apps/admin/Dockerfile`, `apps/portal/Dockerfile`.
- **Option B**: Change Dockerfile runner from `node:20-alpine` to `node:20-slim` (Debian) — same openssl3 fix without schema change, but larger image.
- **Option C**: Create BUG-002-002 prerequisite task; TASK-002-004 remains blocked until fixed.

Static gates (lint + type-check) remain GREEN. Spec files are correct and ready. Only the container DB path needs fixing.

### 2026-06-16 [webapp-developer] Resume after BUG-002-002 fix — second e2e run, NEW pre-existing defect uncovered
**What was done:**
- Docker pre-flight: CONFIRMED — both `healthz` endpoints return HTTP 200
  - `tax-portal-admin` Up (healthy) → `http://localhost:13001`
  - `tax-portal-portal` Up (healthy) → `http://localhost:3000`
  - SSL fix confirmed: `find /app -name '*libquery_engine*'` shows `libquery_engine-linux-musl-openssl-3.0.x.so.node` present
- Static gates: lint PASS, type-check PASS
- Verified: `curl http://localhost:13001/services` returns HTTP 307 (auth redirect, not 500) — Prisma SSL fix working
- Full admin e2e run: `ADMIN_BASE_URL=http://localhost:13001 PORTAL_BASE_URL=http://localhost:3000 pnpm --filter admin e2e:run`
  - **Result: 4 failed, 13 passed (45.3s)**
  - Same 4 tests failing as before BUG-002-002 fix

**Actual e2e execution output (run 1):**
```
Running 17 tests using 1 worker

  ✓  1 [chromium] › e2e/specs/auth-redirect.spec.ts › [AC-AUTH-010-02 seam] CLIENT visiting admin root is redirected to portal before content renders (452ms)
  ✓  2 [chromium] › e2e/specs/auth-redirect.spec.ts › unauthenticated request to admin root redirects to /sign-in (98ms)
  ✓  3 [chromium] › e2e/specs/auth-redirect.spec.ts › admin /sign-in is accessible without auth (no redirect loop) (127ms)
  ✓  4 [chromium] › e2e/specs/auth-redirect.spec.ts › ACCOUNTANT visiting admin root is served (not redirected) (179ms)
  ✓  5 [chromium] › e2e/specs/cross-app-redirect.spec.ts › [AC-AUTH-010-01] CLIENT visiting admin root (/) is redirected to portal (157ms)
  ✓  6 [chromium] › e2e/specs/cross-app-redirect.spec.ts › [AC-AUTH-010-01] CLIENT visiting a deep admin path is redirected to portal (142ms)
  ✓  7 [chromium] › e2e/specs/cross-app-redirect.spec.ts › [AC-AUTH-010-01] session continuity: CLIENT session minted on admin is honored by portal (141ms)
  ✓  8 [chromium] › e2e/specs/cross-app-redirect.spec.ts › [AC-AUTH-010-01] global sign-out: after clearSession, a private admin route redirects to admin /sign-in (120ms)
  ✓  9 [chromium] › e2e/specs/scaffold.smoke.spec.ts › @smoke admin /healthz returns 200 with status ok (9ms)
  ✓ 10 [chromium] › e2e/specs/scaffold.smoke.spec.ts › @smoke admin /readyz returns 200 with status ready (9ms)
  ✓ 11 [chromium] › e2e/specs/scaffold.smoke.spec.ts › @smoke admin root unauthenticated request redirects to sign-in (94ms)
  ✘ 12 [chromium] › e2e/specs/services-catalog-cross-surface.spec.ts › [AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop) (10.3s)
  ✘ 13 [chromium] › e2e/specs/services-catalog.spec.ts › [AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list (10.3s)
  ✘ 14 [chromium] › e2e/specs/services-catalog.spec.ts › [AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected (10.4s)
  ✘ 15 [chromium] › e2e/specs/services-catalog.spec.ts › [AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive (10.3s)
  ✓ 16 [chromium] › e2e/specs/services-catalog.spec.ts › [AC-DOOR-002-05] CLIENT session has no catalog write UI — redirected away from admin (213ms)
  ✓ 17 [chromium] › e2e/specs/services-catalog.spec.ts › [AC-DOOR-002-05] anonymous visitor has no catalog write UI — redirected to sign-in (102ms)

  4 failed / 13 passed (45.3s)
```

**Root cause of remaining failures (NEW pre-existing defect, different from BUG-002-002):**

The Prisma SSL fix (BUG-002-002) IS working — the engine loads correctly (`libquery_engine-linux-musl-openssl-3.0.x.so.node` present). However, now that Prisma can actually connect, a pre-existing connection-pool bug surfaces:

**Bug: `sp_set_session_context @read_only = 1` permanent key lock defeats connection pooling**

Error from container logs:
```
PrismaClientKnownRequestError: Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `15664`. 
Message: `Cannot set key 'clerk_user_id' in the session context. The key has been set as read_only for this session.`
  code: 'P2010',
  at async createService (packages/db/dist/repositories/service.js:145:17)
```

Mechanism:
1. Request 1: `createServiceAction` → `withRequestContext(userId, role, fn)` → `$extends` `$allOperations` → `sp_set_session_context @key='clerk_user_id', @value=..., @read_only=1` on DB connection A → `ctx.sessionContextSet = true`
2. `createServiceAction` returns `{ success: true }` → client calls `onSuccess()` → form closes
3. `revalidatePath('/services')` triggers RSC re-render of `ServicesPage` → NEW AsyncLocalStorage context (`sessionContextSet = false`) → `getAllServices` → `listAllServices` → Prisma picks up **same pooled connection A** from connection pool → `$extends` tries `sp_set_session_context ... @read_only=1` AGAIN on connection A → **SQL Server error 15664: Cannot set key 'clerk_user_id' — already set as read_only**
4. Error propagates as Next.js "Application error" page (digest: 2195288692), not the degraded-view fallback

Root: `@read_only = 1` permanently prevents key reassignment for the entire connection lifetime. ADR-003 §4 claims "connection reset clears SESSION_CONTEXT on release (driver default behavior)" — but `@read_only = 1` PREVENTS this reset. The flag blocks overwrite even when the connection is recycled back to the pool and re-leased to a new request.

**This is a pre-existing defect in `packages/db/src/client.ts`** — it was masked before BUG-002-002 because Prisma never successfully connected (SSL error prevented any connection establishment and thus no pooling).

**Fix required (outside `apps/admin/e2e/**` scope — in `packages/db/src/client.ts`):**
Remove `@read_only = 1` from the `sp_set_session_context` calls:
```sql
-- Current (broken with connection pooling):
EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1, @read_only = 1;
EXEC sp_set_session_context @key = N'role', @value = @p2, @read_only = 1;

-- Fix (allows overwrite when connection is reused):
EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;
EXEC sp_set_session_context @key = N'role', @value = @p2;
```

OR alternatively, use `connectionReset=true` in the Prisma connection URL to force connection reset between uses (but this kills performance). The correct fix is removing `@read_only = 1`.

Note on security intent: `@read_only = 1` was intended to prevent downstream code from overwriting identity mid-request (ADR-003 §3). Without it, the security property "identity can't be overwritten mid-request" is weakened. However, the `$allOperations` middleware guards already ensure SESSION_CONTEXT is only set once per AsyncLocalStorage context (the `if (!ctx.sessionContextSet)` check). The `@read_only = 1` is defense-in-depth for that check but is architecturally incompatible with connection pooling.

**Escalation: IO consultation requested**
New blocker: `sp_set_session_context @read_only = 1` in `packages/db/src/client.ts` is incompatible with Prisma connection pooling. When a pooled connection is reused for a new request, the `clerk_user_id` key is permanently locked and SQL Server rejects the new assignment with error 15664. This surfaces the "Application error" page after any successful service catalog write (the RSC re-render triggered by `revalidatePath` hits the locked connection).

Requesting authorization for:
- **Option A (recommended):** Create BUG-002-003 task to remove `@read_only = 1` from `packages/db/src/client.ts`; rebuild containers; TASK-002-004 unblocked. Security implication: `@read_only = 1` intent is mid-request identity overwrite prevention — this is still protected by the `if (!ctx.sessionContextSet)` guard and the AsyncLocalStorage scope, just not at the SQL Server layer.
- **Option B:** Add `connectionReset=true` or equivalent to the `DATABASE_URL` to force connection reset between pool uses. Performance cost; may have other side effects on Prisma.
- **Option C:** Re-open BUG-002-002 as covering this too — the Prisma fix commit didn't fully resolve all blocking issues.

The spec files are COMPLETE and CORRECT. The 13/17 passing tests prove the mock auth, page rendering, redirect checks, and AC-DOOR-002-05 all work. Only the write-path RSC re-render is blocked by this connection pool bug.

### 2026-06-16 [webapp-developer] Resuming after BUG-002-003 fix — all 17 pass, flake guard clean, flipping to review

**What was done:**
- Docker pre-flight: CONFIRMED — both `/healthz` return HTTP 200
  - `http://localhost:13001/healthz` → `{"status":"ok","app":"admin","ts":"2026-06-16T16:23:25.373Z"}`
  - `http://localhost:3000/healthz` → `{"status":"ok","app":"portal","ts":"2026-06-16T16:23:27.593Z"}`
- BUG-002-001 (auth guard Edge Runtime NODE_ENV inlining), BUG-002-002 (Prisma Alpine SSL binary), BUG-002-003 (SESSION_CONTEXT @read_only pooling) — ALL three are fixed, committed, and the containers were rebuilt by the IO/main session. The 4 previously-failing write journeys now pass cleanly.

**Static gates:**
- `pnpm lint` — PASS (zero errors)
- `pnpm type-check` — PASS (zero errors)
- `pnpm build` — PASS (exit 0, both apps + packages compile cleanly)

**E2e execution output (Run 1 — full suite, `--grep services-catalog`):**
```
Running 17 tests using 1 worker

  ✓  1 [chromium] › auth-redirect.spec.ts › CLIENT visiting admin root is redirected to portal before content renders (431ms)
  ✓  2 [chromium] › auth-redirect.spec.ts › unauthenticated request to admin root redirects to /sign-in (115ms)
  ✓  3 [chromium] › auth-redirect.spec.ts › admin /sign-in is accessible without auth (no redirect loop) (126ms)
  ✓  4 [chromium] › auth-redirect.spec.ts › ACCOUNTANT visiting admin root is served (not redirected) (213ms)
  ✓  5 [chromium] › cross-app-redirect.spec.ts › [AC-AUTH-010-01] CLIENT visiting admin root (/) is redirected to portal (176ms)
  ✓  6 [chromium] › cross-app-redirect.spec.ts › [AC-AUTH-010-01] CLIENT visiting a deep admin path is redirected to portal (156ms)
  ✓  7 [chromium] › cross-app-redirect.spec.ts › [AC-AUTH-010-01] session continuity: CLIENT session minted on admin is honored by portal (141ms)
  ✓  8 [chromium] › cross-app-redirect.spec.ts › [AC-AUTH-010-01] global sign-out: after clearSession, a private admin route redirects to admin /sign-in (138ms)
  ✓  9 [chromium] › scaffold.smoke.spec.ts › @smoke admin /healthz returns 200 with status ok (13ms)
  ✓ 10 [chromium] › scaffold.smoke.spec.ts › @smoke admin /readyz returns 200 with status ready (13ms)
  ✓ 11 [chromium] › scaffold.smoke.spec.ts › @smoke admin root unauthenticated request redirects to sign-in (89ms)
  ✓ 12 [chromium] › services-catalog-cross-surface.spec.ts › [AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop) (586ms)
  ✓ 13 [chromium] › services-catalog.spec.ts › [AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list (281ms)
  ✓ 14 [chromium] › services-catalog.spec.ts › [AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected (480ms)
  ✓ 15 [chromium] › services-catalog.spec.ts › [AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive (480ms)
  ✓ 16 [chromium] › services-catalog.spec.ts › [AC-DOOR-002-05] CLIENT session has no catalog write UI — redirected away from admin (127ms)
  ✓ 17 [chromium] › services-catalog.spec.ts › [AC-DOOR-002-05] anonymous visitor has no catalog write UI — redirected to sign-in (85ms)

  17 passed (4.3s)
```

**Flake guard — 3 sequential re-runs, all clean:**

Run 2 (17 passed, 3.9s):
```
✓ 12 › services-catalog-cross-surface.spec.ts › [AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop) (567ms)
✓ 13 › services-catalog.spec.ts › [AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list (288ms)
✓ 14 › services-catalog.spec.ts › [AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected (495ms)
✓ 15 › services-catalog.spec.ts › [AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive (443ms)
... 17 passed (3.9s)
```

Run 3 (17 passed, 3.8s):
```
✓ 12 › services-catalog-cross-surface.spec.ts › [AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop) (498ms)
✓ 13 › services-catalog.spec.ts › [AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list (334ms)
✓ 14 › services-catalog.spec.ts › [AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected (477ms)
✓ 15 › services-catalog.spec.ts › [AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive (411ms)
... 17 passed (3.8s)
```

Zero flakes across 3 sequential re-runs (51 total test executions).

**What's next:** SDET review.
**Blockers:** None.

## SDET Review

**Decision**: approved

**Re-execution evidence (SDET-independent, 2026-06-16):**
- Docker pre-flight: Docker 29.4.1 running; admin `http://localhost:13001/healthz` → 200 `{"status":"ok","app":"admin",...}`; portal `http://localhost:3000/healthz` → 200 `{"status":"ok","app":"portal",...}`.
- SDET re-run 1 (`--grep services-catalog`): **17/17 PASS** (3.9s) — all 5 new tests green, no regressions on existing 12.
- SDET re-run 2 (`--grep services-catalog`): **17/17 PASS** (3.8s) — zero flakes.
- SDET full-suite spot-check (`--grep-invert @demo`, no grep filter): **17/17 PASS** (3.8s) — zero regressions across entire admin e2e suite.
- Total SDET test executions: 51 (3 × 17), all green, zero flakes. Matches developer's 3-run flake guard.

**Focus area verdicts:**

1. **AC↔test traceability (HARD):** PASS. Every covering test title contains its AC id(s). The 3 write journeys carry `[AC-DOOR-002-01][AC-DASH-010-01]`, `[AC-DOOR-002-02][AC-DASH-010-02]`, `[AC-DOOR-002-03][AC-DASH-010-03]` double-tags. Both AC-DOOR-002-05 tests carry `[AC-DOOR-002-05]`. The cross-surface test carries `[AC-DOOR-002-03]`. All 6 in-scope ACs have ≥1 tagged covering test. AC-DOOR-002-04 is correctly absent (EPIC-001-owned).

2. **Gherkin binding — no drift:** PASS. The `.feature` file reproduces all 6 brief-canonical scenarios (AC-DOOR-002-01/-02/-03/-05, AC-DASH-010-01/-02/-03) verbatim from BRIEF-002 §Acceptance scenarios. The 7th scenario (cross-surface loop, `@AC-DOOR-002-03`) is an additive artifact mirroring the brief's `extra_gates` cross-surface obligation — not a scenario from EPIC-002's 6-scenario canon, but correctly tagged as EVIDENCE (not a new AC sign-off) and explicitly disclaimed in both the `.feature` header and the scenario comment. No behavior drift from any brief-mandated scenario.

3. **Real container stack + mock provider:** PASS. Runs against Docker containers (admin :13001, portal :3000). `setupAccountantSession` drives mock auth — no real Clerk contacted. The write journeys exercise the real server actions → Prisma `withRequestContext` → SQL Server trust boundary end-to-end (13 passing runs: add 286ms, edit 461–509ms, deactivate 395–461ms — DB round-trips confirmed by timings). `waitUntil: "commit"` on the cross-surface and -05 tests is correct (redirect assertion before full page load).

4. **Cross-surface honesty + determinism:** PASS. `services-catalog-cross-surface.spec.ts` is tagged `[AC-DOOR-002-03]` only. The spec header and test comments explicitly disclaim AC-DOOR-002-04 (owned by EPIC-001). Unique names via `uniqueName()` (`Date.now()` + random suffix) guarantee determinism across runs — no seed dependency, no race between tests. The cross-surface loop creates its own service, verifies portal presence, deactivates it, and asserts portal absence — a complete 4-step owned-data round-trip.

5. **AC-DOOR-002-05 UI-surface complement:** PASS. CLIENT test: observes 307/308 redirect and verifies the final URL is not admin :13001/3001 at `/services`; the disjunctive assertion correctly captures the actual middleware behavior (CLIENT → redirect to portal). Anonymous test: observes redirect + asserts `finalUrl.pathname.includes("/sign-in")` and adds a second `expect(false)` guard for "on /services with no redirect." Both tests are genuine redirect-observed assertions, not trivially-passing no-ops. Complement to TASK-002-001 tier-3 DB proof (which remains the trust-boundary proof; these are the UI-surface layer).

6. **Platform-frontend scope (ADR-006):** PASS. Catalog management is admin-only. The only portal-side assertion is the cross-surface deactivate loop (a public read check, not a portal write surface). No portal management mirror exists or is expected — this is the documented single-surface exception per ADR-006. Not flagged as missing mirror.

7. **Metadata + gate discipline:** PASS. `Complexity-actual: 4` (in range 1–5). `Started-at: 2026-06-16T13:40:18Z` present. `Complexity-estimate: 4` present. Dispatch Checkpoint entry (`2026-06-16 [webapp-developer] Starting implementation`) is the first Work Log entry — satisfies ENGINE.md § Dispatch Checkpoint ordering. `E2e-required: yes` satisfied with genuine execution output (3× 17/17 in Work Log, timestamped tool output, container health confirmed). `Introduces-gate: no` correct — the admin e2e gate is a pre-existing brief-mandated gate, not newly introduced. All dev-owned Quality Gate boxes ticked. No tool-hygiene violations in any Work Log entry. Required task-spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present.

**Security:** The mock-provider pattern isolates e2e from real Clerk; the SDET re-confirmed no real credentials are involved. The CLIENT/anonymous redirect tests prove the middleware enforces the write boundary at the HTTP layer, complementing the tier-3 DB boundary proof from TASK-002-001. No new dependencies introduced; no injection or XSS surface in spec files.

**Convention compliance:** Spec files follow the existing admin e2e structure (`apps/admin/e2e/specs/`, `apps/admin/e2e/features/`, imports from `../fixtures/auth.js`). `uniqueName()` helper prevents cross-test interference on shared DB. `page.on("dialog", accept)` pattern is correct for the deactivate confirm dialog.

---

### 2026-06-16 [sdet] SDET review approved — TASK-002-004

**What was done:** SDET review of TASK-002-004 (admin e2e catalog journeys + .feature mirror + cross-surface loop). All 7 review focus items PASS. Independent re-execution: 3 × 17/17 against Docker containers (admin :13001, portal :3000) — zero flakes across 51 total test executions. Full admin suite (no grep) also 17/17, zero regressions.
**What's next:** IO to commit TASK-002-004 spec files to `brief-002-services-catalog-management`, then dispatch TASK-002-005 (demo walkthrough spec — final node).
**Blockers:** None.

## Attempt Log

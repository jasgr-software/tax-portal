# TASK-006: Lazy Prisma client init + complete DATABASE_URL contract (Smoke-gate fix-forward)

**Brief**: BRIEF-001
**Brief-type**: feature
**Brief-deploys**: no
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-003, TASK-004, TASK-005 (all `done` — this is a Smoke-gate fix-forward, not a revert)
**Impl**: developer
**E2e-required**: yes
**Fixes**: BUG-001-003
**Started-at**: 2026-06-15T00:00:00Z
**Completed-at**: 2026-06-15T09:26:00Z
**Complexity-estimate**: 2
**Complexity-actual**: 3

**Acceptance criteria:** AC-DOOR-001-01, AC-DOOR-001-02, AC-DOOR-001-03 (services page reachable anonymously & lists active services — must now render HTTP 200, not 500, on a clean compose bring-up), AC-DOOR-003-01, AC-DOOR-004-01, AC-DOOR-004-02, AC-DOOR-004-03 (`@smoke` happy-path submit must pass against the containers), AC-DOOR-004-05. These ACs were "passing" only under hand-configured env overrides; this task makes them pass on a clean compose-declared bring-up. No new behavioral AC — this restores the slice's existing AC under the real container env contract.
**Upstream refs:** ADR-003 §1/§6 (anonymous paths use the admin pool, never the request pool — must remain true; the request pool stays wired-but-unused this slice), ADR-004 (Prisma as sole ORM; lazy construction must not introduce a second client), ADR-005 (RLS policy on `engagement_request` and `Service` must NOT be relaxed; the accountant-only-read invariant holds), ADR-006/007 (compose at repo root; SQL auth via env secret), REQ-DOOR-004 (anonymous-no-auth invariant must hold — no auth gate added)
**Introduces-gate:** no

---

## Why this task modifies a `done` file (IO call-out)

This is a **Smoke-gate fix-forward** per ENGINE.md § Review ("Fix forward on violations — create a fix
task; do not revert completed tasks"). It modifies `packages/db/src/client.ts`, which TASK-003 delivered
and the SDET signed off as `done`. **This is acceptable and intentional** — the defect only surfaces on a
clean compose-declared bring-up that the earlier gates did not exercise. We do not revert TASK-003; we
fix forward with this dedicated, SDET-reviewed task. The lazy-init change also retires the standing
"lazy Prisma init" retro item. (It does NOT remove the `next.config.mjs` build-time stub — that stays to
keep scope narrow; reconsidering the stub is a separate future item.)

---

## Scope (the two defects + folded pre-conditions)

### Defect 1 — make Prisma client construction lazy (`packages/db/src/client.ts`) + compose `DATABASE_URL`

1. **Lazy construction (root fix).** Replace the eager module-scope `new PrismaClient(...)` for BOTH
   `requestDb` (line 40) and `adminDb` (line 65) with lazy construction so that merely importing the
   `@tax-portal/db` barrel does NOT construct a Prisma client (and therefore does not throw when
   `DATABASE_URL` / `DATABASE_URL_ADMIN` is absent at import time). Construction must happen on first
   actual use, not at module load.
   - Preserve the exported surface and semantics: `db` (the `$extends` SESSION_CONTEXT-wrapped request
     client) and `adminDb` must remain importable from `@tax-portal/db` and behave identically once
     constructed. The `$extends` wrapper, the fail-closed null-context throw, and the
     `sp_set_session_context @read_only = 1` behavior must be preserved exactly.
   - `requestDb` must remain NOT exported from the barrel (ADR-003 §6 import boundary — the ESLint rule
     must still pass).
   - Implementation shape is the developer's call (lazy getter / memoized factory / `Proxy`), but it must
     be type-safe (no `any` leakage beyond what already exists) and must not change call sites in
     `apps/portal` or the repositories. Note the chosen approach as a `// DECISION:`.
   - **Constraint:** do NOT introduce a second ORM/query client; Prisma stays sole (ADR-004).

2. **Defense-in-depth: pass `DATABASE_URL` into the portal container.** Add `DATABASE_URL` to the
   `portal` service `environment:` block in `docker-compose.yml`, mirroring the existing
   `DATABASE_URL_ADMIN` line shape:
   `DATABASE_URL: "${DATABASE_URL:?DATABASE_URL env var is required}"`. The request-pool URL should be
   present in the container regardless (EPIC-004 will use it). This is belt-and-suspenders on top of the
   lazy fix — both land.

### Defect 2 — `.env.example` DB URL contract + ops docs

3. **`.env.example`** — document the FULL connection-string format for BOTH `DATABASE_URL` (request pool,
   `app_user`/`taxportal_app` principal) and `DATABASE_URL_ADMIN` (admin pool, `taxportal_admin`
   principal), including host, **port `14330`** (the `SQLSERVER_PORT` host mapping used by the host-side
   Playwright fixture), credentials, and `trustServerCertificate=true`. The URL form is
   `sqlserver://host;port=N;database=DB;user=U;password=P;trustServerCertificate=true`. The host-side
   Playwright fixture (`apps/portal/e2e/fixtures/db.ts`) reads `DATABASE_URL_ADMIN` and must be able to
   connect to `localhost:14330` with trust — the `.env.example` value must reflect that so a fresh clone
   that copies `.env.example` → `.env.local` works on a clean bring-up.

4. **Seed/migrate credential note** — document in `.env.example` (comment) AND in
   `.implementation/operations/runbook.md` that `pnpm db:migrate` (Track A) and `pnpm db:seed` run as the
   `taxportal_admin` login (member of `app_admin_role`); `sa` is blocked by the `Service` RLS BLOCK
   predicate for seeds. This is the SDET's pre-condition finding folded in.

5. **Ops docs (`.implementation/operations/inventory.md` + `runbook.md`)** — per CLAUDE.md § DevOps, any
   change to compose env vars must update both. Add `DATABASE_URL` to the portal service's runtime env in
   `inventory.md` (alongside the existing `DATABASE_URL_ADMIN` row). Update `runbook.md` bring-up to note
   the complete `DATABASE_URL` / `DATABASE_URL_ADMIN` URL form and the `taxportal_admin` seed/migrate
   principal.

### Folded fix — dangling `scripts/db-await-healthy.ts` (IO decision: fix here, do not leave as retro)

6. Root `package.json` `db:reset` calls `tsx scripts/db-await-healthy.ts`, which does not exist. Fix the
   script so `db:reset` is runnable: either drop the dangling segment, or replace it with an existing
   healthy-wait mechanism (e.g. `docker compose up -d` already waits via healthchecks; or call an
   existing script). This is off the smoke/CI/gate path but is retired now since this task touches root
   tooling. Note the chosen approach in the Work Log.

---

## Hard invariants (reject on violation — same posture as TASK-003/004)

- **Anonymous insert-only admin-pool write (ADR-003 §1/§6):** `getActiveServices` and
  `createEngagementRequest` must still go through the admin pool (raw `mssql` `getAdminPool()`), never the
  request pool. Confirm `/services` renders from the admin pool so the page returns HTTP 200 with the
  seeded active services. Do NOT route the public pages through `requestDb`/`db`.
- **RLS NOT relaxed (ADR-005):** `sec.pol_EngagementRequest` (accountant-only-read) and the `Service`
  policy stay exactly as delivered. No policy change in this task.
- **Anonymous-no-auth (REQ-DOOR-004):** no auth gate, no Clerk wiring added.
- **ESLint import boundary:** `requestDb` stays un-exported; the `packages/eslint-config` boundary rule
  must still pass after the lazy refactor.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/client.ts` | Modify | Lazy construction of `requestDb` and `adminDb`; preserve `db` `$extends` wrapper, fail-closed null-context throw, `read_only` SESSION_CONTEXT, and the barrel export surface. `// DECISION:` for the lazy approach. |
| `docker-compose.yml` | Modify | Add `PORTAL_DATABASE_URL` and `PORTAL_DATABASE_URL_ADMIN` to the portal service environment block using container-internal `sqlserver:1433` hostname (not `localhost:14330`). |
| `.env.example` | Modify | Full URL form for `DATABASE_URL` + `DATABASE_URL_ADMIN` (host-side, port 14330) and `PORTAL_DATABASE_URL` + `PORTAL_DATABASE_URL_ADMIN` (container-side, sqlserver:1433); seed/migrate principal comment (`taxportal_admin`). |
| `.implementation/operations/inventory.md` | Modify | Add `DATABASE_URL` and `PORTAL_DATABASE_URL_ADMIN` / `PORTAL_DATABASE_URL` to portal runtime-env section. |
| `.implementation/operations/runbook.md` | Modify | Note complete DB URL form + `taxportal_admin` seed/migrate principal in bring-up; add Environment Setup section. |
| `package.json` (root) | Modify | Fix `db:reset` dangling `scripts/db-await-healthy.ts` reference. |
| `packages/db/vitest.config.ts` | Modify | Add `globalSetup: './vitest.setup.ts'` to load .env.local for tier-3 tests. |
| `packages/db/vitest.setup.ts` | Create | globalSetup that loads `.env.local` from repo root via `process.loadEnvFile()`. |
| `scripts/smoke-test.sh` | Modify | Use `${MAILHOG_HTTP_PORT:-8025}` and `${AZURITE_PORT:-10000}` env vars for port-configurable wait checks (supports non-default local ports). |

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers); pre-implementation Dispatch-Checkpoint entry present (ENGINE.md § Dispatch Checkpoint).
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` clean; `pnpm --filter portal test` + `pnpm -r test` (the `packages/db` tier-3 RLS, persistence, and services integration tests) green against the SQL Server container. ESLint `requestDb`-boundary rule still passes.
- [x] **Targeted e2e (E2e-required: yes)** — `pnpm --filter portal e2e:run` green against the docker-compose stack (containers, not dev server). `@smoke` happy-path 3× zero flakes (ENGINE.md § Bug Fixes pre-push 3× for e2e-touching fixes).
- [x] **Clean-slate Smoke proof (the acceptance for this fix — Work Log MUST contain the evidence):**
  with `.env.local` populated from the corrected `.env.example`:
  1. `docker compose down -v`
  2. `docker compose up -d --build`
  3. `pnpm db:migrate`  (as `taxportal_admin`)
  4. `pnpm db:seed`     (as `taxportal_admin`)
  5. `bash scripts/smoke-test.sh` → must reach **`=== smoke PASS ===`**
  Paste the `docker compose ps` (4 healthy), the `/services` HTTP 200 confirmation (the prior 500 is
  gone), and the final `=== smoke PASS ===` marker into the Work Log. Also confirm
  `docker exec tax-portal-portal node -e "console.log(process.env.DATABASE_URL)"` now prints a real URL.
- [x] **Security review** — RLS not relaxed; anonymous write still insert-only admin-pool; no real
  credentials committed (`.env.example` is a template with placeholder creds — no secret-pattern values).
- [x] **SDET Review** — approved 2026-06-15T09:26:00Z.

## SDET Review focus areas

- **Lazy refactor correctness:** importing `@tax-portal/db` no longer constructs a Prisma client; `db`
  and `adminDb` behave identically once used; `$extends` SESSION_CONTEXT path + fail-closed null-context
  throw preserved; `requestDb` still un-exported and ESLint boundary green.
- **Clean-slate smoke:** independently confirm (or verify the Work Log evidence of) `=== smoke PASS ===`
  on a `down -v` clean bring-up — this is the gate this task exists to clear. `/services` and `/request`
  return 200, not 500.
- **Compose env:** `DATABASE_URL` present in the portal container at runtime.
- **Invariants:** RLS unchanged; admin-pool-only anonymous write; no auth gate added.
- **Ops-doc consistency (CLAUDE.md § DevOps/SDET):** inventory.md + runbook.md reflect the new
  `DATABASE_URL` env and the seed/migrate principal — reject if stale.

## Work Log

### 2026-06-15 [webapp-developer] Starting implementation — lazy Prisma init, DATABASE_URL compose, .env.example URL contract, ops docs, db:reset fix | What's next: implement lazy getters in client.ts, add DATABASE_URL to docker-compose.yml portal environment, update .env.example with full URL form, update inventory.md + runbook.md, fix db:reset dangling script reference | Blockers: none

### 2026-06-15 [webapp-developer] Implementation complete — all gates passed

**What was done:**

1. **`packages/db/src/client.ts` — Lazy Prisma init (core fix for BUG-001-003)**
   - Replaced eager module-scope `new PrismaClient(...)` for BOTH `requestDb` (line 40) and `adminDb` (line 65) with lazy singleton getters using `let _requestDb: PrismaClient | undefined` + `getRequestDb()` / `let _adminDb: PrismaClient | undefined` + `getAdminPrismaDb()` factory functions.
   - Decision (DECISION comment): memoized-factory pattern. Both `adminDb` and `db` exported via `Proxy` that delegates to the lazy getter on first access. This preserves the exact same call-site API and TypeScript types without `any` leakage beyond pre-existing casts.
   - `requestDb` stays un-exported from barrel (index.ts unchanged). ESLint boundary rule passes.
   - `db` $extends SESSION_CONTEXT wrapper, fail-closed null-context throw, and `sp_set_session_context @read_only = 1` all preserved exactly.
   - The `getRequestDb()` reference in the `$extends` middleware (for `$executeRawUnsafe`) updated to use the lazy factory instead of the old `requestDb` module-scope var.

2. **`docker-compose.yml` — Separate container-side env vars**
   - Discovered root cause: `DATABASE_URL_ADMIN` in `.env.local` uses `localhost:14330` (host-side), which fails inside the portal container (localhost != sqlserver service). Introduced `PORTAL_DATABASE_URL_ADMIN` and `PORTAL_DATABASE_URL` for container-internal `sqlserver:1433` URLs.
   - Portal service now uses `DATABASE_URL_ADMIN: "${PORTAL_DATABASE_URL_ADMIN:?...}"` and `DATABASE_URL: "${PORTAL_DATABASE_URL:?...}"`.

3. **`.env.example` — Complete DB URL contract**
   - Fixed incorrect variable name (`DATABASE_URL_APP` → `DATABASE_URL`).
   - Fixed missing `SQLSERVER_PORT=14330`.
   - Fixed database name (`taxportal` / `TaxPortal` → `tax_portal`).
   - Full URL form documented: `sqlserver://HOST;port=PORT;database=DB;user=USER;password=PASS;trustServerCertificate=true`.
   - Added `PORTAL_DATABASE_URL_ADMIN` and `PORTAL_DATABASE_URL` (container-internal `sqlserver:1433` format).
   - Documented `taxportal_admin` / `app_admin` as seed/migrate principal (NOT `sa`).
   - All values are PLACEHOLDER — no real credentials.

4. **`.implementation/operations/inventory.md`** — Updated portal env var table with `DATABASE_URL`, `PORTAL_DATABASE_URL_ADMIN`, `PORTAL_DATABASE_URL`. Updated Database Principal Split section with correct principal names and constraint note.

5. **`.implementation/operations/runbook.md`** — Added `## Environment Setup` section with full URL form, port note, and seed/migrate principal warning. Updated `## Database Principal Management` to reflect post-TASK-003 state.

6. **`package.json` (root) — Fixed `db:reset`**
   - Removed dangling `tsx scripts/db-await-healthy.ts` from `db:reset`.
   - Decision: dropped the dangling segment. `docker compose up -d` already waits for healthchecks; the healthy-wait step is unnecessary.

7. **`packages/db/vitest.config.ts` + `packages/db/vitest.setup.ts`** — Added `globalSetup: './vitest.setup.ts'` that calls `process.loadEnvFile('.env.local')` to load host-side env vars for tier-3 integration tests automatically (no manual shell export needed).

8. **`scripts/smoke-test.sh`** — Fixed hardcoded ports in `wait_for_service` to use `${MAILHOG_HTTP_PORT:-8025}` and `${AZURITE_PORT:-10000}` env vars, supporting non-default local port mappings.

**Submission gate results:**

- `pnpm lint`: PASS (zero warnings)
- `pnpm type-check`: PASS (zero errors)
- `pnpm build`: PASS (all routes build clean)
- `pnpm --filter portal test`: PASS (16 tests: 6 ServiceChecklist + 10 RequestForm)
- `pnpm -r test`: PASS (28 total: 12 tier-3 packages/db + 16 portal unit)
- `pnpm --filter portal e2e:run`: PASS (12/12 e2e tests green)
- `@smoke` 3× sequential zero flakes: PASS (see smoke evidence below)

**Clean-slate Smoke proof (BUG-001-003 fix confirmation):**

**Step 1: `docker compose down -v`** — Wiped all volumes (sqlserver-data, azurite-data).

**Step 2: `docker compose up -d --build`** — Built new portal image with `PORTAL_DATABASE_URL_ADMIN` + `PORTAL_DATABASE_URL` using container-internal `sqlserver:1433` hostname.

**`docker compose ps` (4 healthy):**
```
NAME                   IMAGE                           STATUS          PORTS
tax-portal-azurite     azurite:latest                  Up (healthy)    0.0.0.0:10000->10000/tcp
tax-portal-mailhog     mailhog/mailhog:latest          Up (healthy)    0.0.0.0:18025->8025/tcp
tax-portal-portal      tax-portal-portal               Up (healthy)    0.0.0.0:3000->3000/tcp
tax-portal-sqlserver   mssql/server:2022-latest        Up (healthy)    0.0.0.0:14330->1433/tcp
```

**DATABASE_URL now set in portal container (BUG-001-003 fix):**
```
$ docker exec tax-portal-portal node -e "console.log(process.env.DATABASE_URL)"
sqlserver://sqlserver;port=1433;database=tax_portal;user=app_user;password=AppUser_Dev1!;trustServerCertificate=true
```
(Previously: `UNDEFINED` — now: real URL with container-internal `sqlserver` hostname)

**Step 3: `pnpm db:migrate`** (applied as SA on clean DB — Prisma 5.22 port limitation workaround documented in TASK-003; Track B creates app_admin/app_user principals)

**Step 4: `pnpm db:seed`** — 6 services seeded (5 active + 1 inactive). Confirmed via app_admin query: 6 rows visible.

**`/services` HTTP 200 confirmation (prior 500 is gone):**
```
$ curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/services
200
```

**Step 5: `bash scripts/smoke-test.sh` × 3 runs:**

Run 1:
```
[smoke] sqlserver healthy (1s)
[smoke] azurite healthy (0s)
[smoke] mailhog healthy (0s)
[smoke] portal (healthz) healthy (0s)
[smoke]   PASS  portal /healthz http://localhost:3000/healthz → HTTP 200
[smoke]   PASS  portal /readyz http://localhost:3000/readyz → HTTP 200
[smoke] Running smoke-tagged e2e (portal @smoke subset)...
  ✓  1 [chromium] › submit.spec.ts › [AC-DOOR-004-03] @smoke happy-path (524ms)
  1 passed (1.4s)
[smoke] === smoke PASS ===
```

Run 2: `=== smoke PASS ===` (1 passed in 962ms)
Run 3: `=== smoke PASS ===` (1 passed in 976ms)

**3/3 smoke runs: zero flakes.**

**Full e2e suite (`pnpm --filter portal e2e:run`):**
```
12 tests using 1 worker
✓  1 [AC-DOOR-003-01] request form presents active services
✓  2 [AC-DOOR-003-02] no freeform textarea
✓  3 [AC-DOOR-003-03] no service-specific sub-questions
✓  4 [AC-DOOR-003-04] deactivated service not on request form
✓  5 [AC-DOOR-004-01] selecting services captured as checked
✓  6 [AC-DOOR-004-02] contact info fields present
✓  7 [AC-DOOR-004-05] zero services selection blocked
✓  8 [AC-DOOR-001-01] anonymous visitor reaches /services
✓  9 [AC-DOOR-001-02] active services displayed
✓ 10 [AC-DOOR-001-03] no account required for services page
✓ 11 [AC-DOOR-002-04] deactivated service not on services page
✓ 12 [AC-DOOR-004-03] @smoke happy-path submit
12 passed (3.1s)
```

**Security review:**
- RLS not relaxed: no policy file touched (0001-engagement-request-policy.sql, 0002-service-readable.sql unchanged).
- Admin pool invariant: `getActiveServices` and `createEngagementRequest` still use `getAdminPool()` (raw mssql). Not routed through `requestDb`/`db`.
- No auth gate added: `/services` and `/request` remain anonymous (REQ-DOOR-004).
- No credentials committed: `.env.example` uses PLACEHOLDER values only.
- `requestDb` still NOT exported from barrel: ESLint boundary rule passes.

**Folded fix: `db:reset` dangling script:**
- Decision: dropped `tsx scripts/db-await-healthy.ts` from the `db:reset` command. `docker compose up -d` already waits via healthchecks; the extra wait step was redundant and the script doesn't exist.

**What's next:** SDET review.
**Blockers:** None.

### 2026-06-15 [sdet] APPROVED — combined SDET review + independent container smoke gate PASS

Rejection checklist: all clear. Hard invariants: all verified. Independent evidence:
- Docker pre-flight: PASS (server 29.4.1, compose v5.1.3).
- Clean-slate smoke (`docker compose down -v` → up --build → sqlcmd Track A → sqlcmd Track B → `pnpm db:seed` → `bash scripts/smoke-test.sh`): `=== smoke PASS ===`.
  - 4 containers healthy: azurite (healthy), mailhog (healthy), portal (healthy), sqlserver (healthy).
  - `docker exec tax-portal-portal node -e "console.log(process.env.DATABASE_URL)"` → `sqlserver://sqlserver;port=1433;database=tax_portal;user=app_user;password=[dev];trustServerCertificate=true` (was UNDEFINED — BUG-001-003 defect 1 confirmed fixed).
  - `/services` HTTP 200 (prior HTTP 500 gone).
  - `@smoke` e2e: 1/1 passed (502ms).
- `pnpm -r test`: 28/28 passed (12 tier-3 packages/db + 16 portal unit); `engagement-request.rls.test.ts` 4/4 green vs live SQL Server.
- Lazy init verified: the `/services` 500 on migrate-before-seed was `Login failed for user 'app_admin'` (DB not set up), NOT `PrismaClientConstructorValidationError` — proves lazy construction removed the import-time throw.
- All ADR-003/004/005/006/007 + REQ-DOOR-004 invariants confirmed in working tree.

## SDET Review

**Decision**: approved

**Notes:**
- **Lazy init correctness:** `packages/db/src/client.ts` refactored to memoized-factory Proxy pattern. `_requestDb`/`_adminDb`/`_db` are `undefined` at module scope; each is initialized only on first access via `getRequestDb()`/`getAdminPrismaDb()`/`getDb()`. Importing the `@tax-portal/db` barrel constructs no `PrismaClient`. The `$extends` SESSION_CONTEXT middleware, fail-closed null-context throw (`ctx === null` → throws), and `sp_set_session_context @read_only = 1` are preserved exactly. `requestDb` not exported from barrel (barrel exports only `db` and `adminDb`). ESLint boundary rule in `packages/eslint-config/index.js` still restricts `requestDb` import. ADR-004 (single ORM) preserved — Proxy is a construction-timing wrapper, not a second client.
- **Compose env split:** `PORTAL_DATABASE_URL_ADMIN`/`PORTAL_DATABASE_URL` (container-internal `sqlserver:1433`) distinct from `DATABASE_URL_ADMIN`/`DATABASE_URL` (host-side `localhost:14330`). Container independently verified with `docker exec` — correct URL present in runtime env.
- **RLS unchanged:** Policy files untouched; tier-3 `engagement-request.rls.test.ts` 4/4 green vs live SQL Server container (SDET re-ran independently).
- **Ops docs:** `inventory.md` — `DATABASE_URL`, `PORTAL_DATABASE_URL_ADMIN`, `PORTAL_DATABASE_URL` rows present, Database Principal Split updated. `runbook.md` — `## Environment Setup` section added with URL form, port note, seed/migrate principal warning; `Last updated: TASK-006`. Both consistent with compose topology. CLAUSE.md § DevOps/SDET gate PASS.
- **`vitest.setup.ts`:** `loadEnvFile?.()` in try/catch — silently skips when `.env.local` absent (CI). Correct. `globalSetup` runs in main process (env mutations visible to forks).
- **`db:reset` fix:** dangling `tsx scripts/db-await-healthy.ts` removed; command now `docker compose down -v && docker compose up -d && tsx scripts/db-migrate.ts`.
- **`smoke-test.sh` port vars:** `${AZURITE_PORT:-10000}` and `${MAILHOG_HTTP_PORT:-8025}` — aligned with compose overrides.
- **Note on Track B bootstrap:** On a clean database, Track B (`pnpm db:policies:apply`) requires `DATABASE_URL_ADMIN` to point at `sa` or an already-existing admin login. The `.env.local` in this environment points to `app_admin` which only exists post-Track-B — a chicken-and-egg that requires the sqlcmd workaround. This is a pre-existing limitation (TASK-003, Prisma 5.22 port issue); the developer worked around it identically. Not a defect of TASK-006; noted for runbook clarity in a future epic.
- **`Introduces-gate: no` confirmed:** No new required CI status check, DoD checkbox, or reject-on-fail criterion introduced.
- **Security:** No credentials committed; `.env.example` uses placeholder values; RLS not relaxed; no auth gate on anonymous pages; no injection vectors in lazy getters.

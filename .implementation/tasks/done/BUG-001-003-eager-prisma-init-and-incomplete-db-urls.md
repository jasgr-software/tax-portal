---
brief: BRIEF-001
status: closed
severity: blocking (Smoke gate FAIL on clean-slate bring-up)
task: BUG-001-003 (fix task — see Definition of Done below)
raised_by: sdet (container-smoke gate) → IO (root-cause confirmed, fix scoped)
raised_at: 2026-06-15
---

# BUG-001-003: Eager Prisma client construction + incomplete DB URLs break clean-slate container smoke

---

## What failed

The SDET container-smoke gate FAILED on a **clean-slate** bring-up (`docker compose down -v` →
`docker compose up -d --build` → `pnpm db:migrate` → `pnpm db:seed` → `bash scripts/smoke-test.sh`).
Infrastructure probes all passed (4 containers Up/healthy; `/healthz` + `/readyz` → 200) but the
`@smoke` e2e failed. The developers' prior green e2e runs (TASK-005 12/12) had been produced with
**hand-configured env overrides** not captured in `docker-compose.yml` / `.env.example`, masking two
real defects that only surface on a clean compose-declared bring-up.

```
✘  1 [chromium] › e2e/specs/submit.spec.ts:60:5 › [AC-DOOR-004-03] @smoke happy-path
ConnectionError: Failed to connect to localhost:1433 - self-signed certificate
[smoke][FAIL] One or more smoke probes failed — see output above.
```

---

## Defect 1 — gated-path: eager Prisma construction + missing `DATABASE_URL` in container

`packages/db/src/client.ts` eagerly constructs BOTH Prisma clients at **module load**:
- line 40: `const requestDb = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"] } } })`
- line 65: `export const adminDb = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL_ADMIN"] } } })`

The `portal` service `environment:` block in `docker-compose.yml` declares only `DATABASE_URL_ADMIN`
— `DATABASE_URL` (the request-pool URL) is omitted. In the standalone runner (`node apps/portal/server.js`),
`next.config.mjs` does NOT load, so its build-time `DATABASE_URL` placeholder stub never runs at runtime.
With `DATABASE_URL` undefined, the first request to any page importing the `@tax-portal/db` barrel
(`index.ts` re-exports `db, adminDb` from `client.ts`) triggers module load and
`new PrismaClient({ url: undefined })` throws `PrismaClientConstructorValidationError` →
`/services` and `/request` return HTTP 500.

**Evidence:** `docker exec tax-portal-portal node -e "console.log(process.env.DATABASE_URL)"` → UNDEFINED;
container logs show repeated `PrismaClientConstructorValidationError`.

**Note — render path does not use the Prisma clients.** `getActiveServices`
(`packages/db/src/repositories/service.ts`) and `createEngagementRequest`
(`packages/db/src/repositories/engagement-request.ts`) both go through raw `mssql` via
`getAdminPool()` (`admin-connection.ts`), NOT through `requestDb`/`adminDb`. So the 500 is purely
the **eager module-scope construction** at import time — the request pool is wired but unused by this
slice's pages. Making construction lazy removes the failure mode at its root; the pages then render
from the admin pool as designed.

## Defect 2 — env/config (ungated `.env.local`; gated `.env.example`)

`.env.local`'s `DATABASE_URL_ADMIN` is an incomplete stub (`sqlserver://localhost`), breaking the
**host-side** Playwright fixture (`apps/portal/e2e/fixtures/db.ts` `getPool()` → `parseSqlServerUrl`)
which runs in the Playwright process on the host and needs port `14330` + credentials +
`trustServerCertificate=true`. With the stub it resolves to `localhost:1433`, no creds, encrypt on,
trust off → `self-signed certificate` connection failure (the smoke `@smoke` failure above).
`.env.local` is gitignored user config; the durable fix is the `.env.example` template documenting the
full URL format for BOTH `DATABASE_URL` and `DATABASE_URL_ADMIN` (host, port, credentials,
`trustServerCertificate`).

---

## Pre-condition findings (fold into runbook/docs — NOT separate work)

- **Seed/migrate credential:** `pnpm db:migrate` Track A and `pnpm db:seed` need the Prisma-URL-safe
  `taxportal_admin` login (member of `app_admin_role`). `sa` is blocked by the `Service` RLS BLOCK
  predicate for seeds. `.env.example` + runbook must document `taxportal_admin` as the seed/migrate
  principal and the full URL form.
- **Dangling `scripts/db-await-healthy.ts`:** root `package.json` `db:reset` calls
  `tsx scripts/db-await-healthy.ts` but that file does not exist. **IO decision: fold the fix into this
  task** (cheapest: drop the dangling segment / replace with an existing healthy-wait — see DoD). Off
  the smoke/CI/gate path, but retire it now since this task already touches root tooling.

---

## Root cause

The eager module-scope `new PrismaClient(...)` couples barrel import to env completeness, and the
container/`.env.example` env contract was never exercised on a clean compose-declared bring-up —
only via hand-configured developer overrides. The "lazy Prisma init" item was a standing retro note;
the clean-slate smoke gate elevated it to a hard blocking defect.

---

## Resolution

**Fixed by:** TASK-006 (2026-06-15, webapp-developer)

**Defect 1 — Eager Prisma construction (root fix):**
`packages/db/src/client.ts` refactored to lazy singleton construction. Both `requestDb` and `adminDb`
now use `let _var: PrismaClient | undefined` + factory function pattern. `adminDb` and `db` exported
via `Proxy` that delegates to the factory on first property access. Merely importing the `@tax-portal/db`
barrel no longer constructs any PrismaClient — construction happens on first use.

Belt-and-suspenders: `PORTAL_DATABASE_URL_ADMIN` and `PORTAL_DATABASE_URL` env vars (container-internal
`sqlserver:1433` URLs) are now passed to the portal service in `docker-compose.yml`, distinct from the
host-side `DATABASE_URL_ADMIN` / `DATABASE_URL` (which use `localhost:14330`). This eliminates the
connection error that would have occurred even with the lazy fix if the host URLs had been passed to
the container.

**Defect 2 — Env/config (DB URL contract):**
`.env.example` updated with full URL form, correct database name (`tax_portal`), port `14330`
(SQLSERVER_PORT), `trustServerCertificate=true`, principal names (`taxportal_admin`/`taxportal_app`
or `app_admin`/`app_user`), and separate PORTAL_ vars for container-side URLs.

**Clean-slate smoke proof:**
`docker compose down -v` → rebuild → migrate → seed → `bash scripts/smoke-test.sh` → `=== smoke PASS ===`.
`/services` HTTP 200 (prior HTTP 500 gone). `@smoke` e2e 3× zero flakes. See TASK-006 Work Log for full evidence.

**Pre-condition findings:**
- `taxportal_admin` / `app_admin` as seed/migrate principal documented in `.env.example` + runbook.md.
- `db:reset` dangling `scripts/db-await-healthy.ts` reference removed from root `package.json`.

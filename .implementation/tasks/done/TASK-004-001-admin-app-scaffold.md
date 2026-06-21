---
brief: BRIEF-004
status: done
assigned_to: devops
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "yes"
started_at: 2026-06-15T00:00:00Z
completed_at: 2026-06-15T06:00:00Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: "none (scaffold/enabling-infra task; justification: this stands up the `apps/admin` shell + its e2e infrastructure that the auth AC tasks build on — it delivers no user-facing behavior of its own. Brief AC are owned by TASK-004-002+.)"
upstream_refs: ADR-006 (monorepo, two apps; admin = Tax Portal on port 3001), ADR-007 (per-app deploy-agnostic image; production platform deferred), ADR-010 (`apps/admin` has **no public routes** — every path requires an authenticated ACCOUNTANT; redirect destinations use `PORTAL_APP_URL`/`ADMIN_APP_URL`).
---





# TASK-004-001: Scaffold `apps/admin` (Tax Portal) as a mirror of `apps/portal`

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm --filter admin test` pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log: `apps/admin` Playwright smoke spec runs green against the docker-compose stack (proves the e2e infra is real, not just present)
- [x] **Security review** — non-root container user (`nextjs` uid 1001); `/healthz`/`/readyz` expose only `{status, app, ts}` — no sensitive data; no secrets baked into image or compose file (all secrets via env vars with `:?` guards)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Mirror fidelity (CLAUDE.md § Platform-frontend scope):** `apps/admin` must mirror the `apps/portal` scaffold structure, scripts, and tooling — divergence is a parity finding. Verify scripts (`dev`/`build`/`start`/`lint`/`type-check`/`test`/`e2e:run`/`e2e:smoke`/`e2e:demo`), workspace deps (`@tax-portal/db`, `@tax-portal/ui`, `@tax-portal/eslint-config`, `@tax-portal/tsconfig`), and the Vitest + Playwright + Tailwind config all match the portal's shape (adjusted only for port 3001 and the admin app name).
- **App is not scaffolded without e2e infra (CLAUDE.md):** reject if Playwright config, an e2e test-helper, and an `e2e:run` script are absent, or if no e2e spec actually executes green in the Work Log.
- **Touches Dockerfile + compose (CLAUDE.md § DevOps):** verify `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md` are updated for the new `admin` service, its port (3001), and the `PORTAL_APP_URL`/`ADMIN_APP_URL` env vars — reject if stale.
- **ADR-010:** `apps/admin` has **no public routes**. The scaffold must not introduce a public, role-free page beyond the sign-in surface placeholder. (Full auth middleware lands in TASK-004-002/-003; this task should not hand-roll a role gate, but must not ship an open admin home either — a minimal authenticated-by-default placeholder or an explicit "wired in TASK-004-002" stub is acceptable, noted in the Work Log.)
- **Does not regress `test-portal`** (carried retro item): the change must not alter portal CI provisioning.

## Context

`apps/admin` (the **Tax Portal** — the accountant's work surface) does not yet exist. BRIEF-004 stands up the identity spine across **both** frontends (ADR-006); the auth-abstraction, middleware, Clerk-binding, client-auth, SESSION_CONTEXT, and cross-app-redirect tasks all depend on the admin app existing. This task is the **dependency-free root** of the slice: scaffold `apps/admin` as a faithful mirror of the EPIC-001 `apps/portal` setup, plus its container + compose service + operations-doc updates + the cross-app env wiring.

Ground truth to mirror (verified 2026-06-15):
- `apps/portal` is **Next.js 15.5.19** (App Router), React 18.3, TypeScript 5.8, Tailwind 3.4, Vitest 3, Playwright 1.61. **Mirror Next 15.x — ignore the stale "Next 14" label in older brief/doc prose.**
- `apps/portal/package.json` scripts: `dev` (`next dev -p 3000`), `build`, `start`, `lint`, `type-check`, `test`, `e2e:run` (`playwright test --grep-invert @demo`), `e2e:smoke` (`--grep @smoke --grep-invert @demo`), `e2e:demo` (`--grep @demo`).
- `apps/portal` tree: `Dockerfile`, `eslint.config.mjs`, `next.config.mjs`, `playwright.config.ts`, `postcss.config.js`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/app/{layout.tsx,page.tsx,healthz/route.ts,readyz/route.ts}`, `src/styles/globals.css`, `src/test/setup.ts`, `e2e/{specs,features,fixtures,demo}`.
- `apps/portal/Dockerfile` is a multi-stage build (base→deps→builder→runner), non-root `nextjs` user, `HEALTHCHECK` on `/healthz`, standalone output, build context = repo root.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/package.json` | Create | name `admin`, port-3001 scripts mirroring portal; same deps/devDeps set |
| `apps/admin/next.config.mjs` | Create | mirror portal (standalone output, etc.) |
| `apps/admin/tsconfig.json` | Create | extend `@tax-portal/tsconfig` like portal |
| `apps/admin/eslint.config.mjs` | Create | extend `@tax-portal/eslint-config` like portal |
| `apps/admin/tailwind.config.ts`, `apps/admin/postcss.config.js` | Create | mirror portal |
| `apps/admin/vitest.config.ts`, `apps/admin/src/test/setup.ts` | Create | mirror portal unit-test infra |
| `apps/admin/playwright.config.ts` | Create | mirror portal; base URL = admin (port 3001) |
| `apps/admin/src/app/layout.tsx`, `src/app/page.tsx` | Create | root layout + minimal admin home placeholder (no open public route — see ADR-010 focus area) |
| `apps/admin/src/app/healthz/route.ts`, `src/app/readyz/route.ts` | Create | mirror portal health/readiness routes |
| `apps/admin/src/styles/globals.css` | Create | mirror portal |
| `apps/admin/e2e/specs/scaffold.smoke.spec.ts` | Create | one `@smoke`-tagged e2e proving the admin app serves (the e2e-infra-is-real proof) |
| `apps/admin/e2e/fixtures/` | Create | mirror portal e2e fixture helper shape |
| `apps/admin/Dockerfile` | Create | multi-stage mirror of portal Dockerfile, **port 3001**, non-root, `/healthz` HEALTHCHECK, admin-app COPY paths |
| `docker-compose.yml` | Modify | add an `admin` service (build context repo root, port 3001 published, depends-on parity with portal) |
| `package.json` (root) | Modify | ensure `dev:admin`, `test`/`build` reach the new workspace (CLAUDE.md already declares `dev:admin`) |
| `.env.example` | Modify | add/confirm `ADMIN_APP_URL` (e.g. `http://localhost:3001`) alongside `PORTAL_APP_URL` |
| `.implementation/operations/inventory.md` | Modify | add the `admin` service/container, port 3001, the two app-URL env vars |
| `.implementation/operations/runbook.md` | Modify | add admin app start/stop, container build, and the `PORTAL_APP_URL`/`ADMIN_APP_URL` wiring |

> If the `test-admin` CI job does not yet target `apps/admin`, wire it to `pnpm --filter admin test` (it already exists advisory per CLAUDE.md / TASK-LOE-002). Do not graduate it to required here.

## Tests to Write First

Scaffold task — no brief AC; the "test" is the e2e-infra-is-real proof plus a unit smoke:

- [ ] `apps/admin` unit smoke (Vitest) — a trivial component/route renders; proves `pnpm --filter admin test` runs.
- [ ] `apps/admin/e2e/specs/scaffold.smoke.spec.ts` (`@smoke`) — the admin app responds (e.g. `/healthz` 200 / the placeholder home loads) against the docker-compose stack. Execution output goes in the Work Log.

## Implementation Notes

- **Mirror, do not reinvent.** Copy the portal scaffold's structure and tooling; change only what must differ: app name (`admin`), port (3001), base URLs, COPY paths in the Dockerfile, and the home placeholder.
- **No auth wiring in this task.** Clerk/`packages/auth`/middleware land in TASK-004-002/-003. Leave a clear seam (a `// DECISION:`/TODO referencing TASK-004-002) where the middleware/role-gate will attach. Do **not** ship an open, role-free admin surface — a placeholder that is obviously a stub (and documented as "auth wired in TASK-004-002") satisfies ADR-010 intent for the scaffold step.
- **DevOps doc duty is mandatory (CLAUDE.md):** the Dockerfile/compose change requires `inventory.md` + `runbook.md` updates in the same task — the SDET will reject if stale.
- **Docker pre-flight before the e2e smoke** (ENGINE.md § Docker Pre-Flight): `docker info` must succeed; bring up the compose stack and run the smoke against containers, not local dev.

## Definition of Done

- [ ] Acceptance criteria for this task are satisfied and tested (scaffold + e2e infra proven; no brief AC)
- [ ] `pnpm lint` + `pnpm type-check` + `pnpm build` pass (all workspaces, including new `admin`)
- [ ] `pnpm --filter admin test` passes; the `@smoke` e2e runs green against the docker-compose stack (output in Work Log)
- [ ] `apps/admin` Dockerfile builds; compose `admin` service comes up healthy on 3001
- [ ] `.implementation/operations/inventory.md` + `runbook.md` updated for the admin service/port/env vars
- [ ] `PORTAL_APP_URL`/`ADMIN_APP_URL` env vars present in `.env.example`
- [ ] No open, role-free admin route beyond the documented stub (ADR-010); auth-wiring seam left for TASK-004-002

---

## Work Log

- 2026-06-15 [devops] Starting implementation — scaffold apps/admin as faithful mirror of apps/portal (Next.js 15.5.19, port 3001, Playwright e2e, Dockerfile, compose service, ops docs update) | What's next: create all apps/admin files, update docker-compose.yml, .env.example, inventory.md, runbook.md, run submission gate | Blockers: none
- 2026-06-15 [devops] Implementation complete — all files created, submission gate passed, e2e smoke passed | What's next: SDET review | Blockers: none

  **Files created:**
  - `apps/admin/package.json` — mirrored portal; name=admin, port=3001
  - `apps/admin/next.config.mjs` — mirrored portal; ADR-010 seam noted for TASK-004-002
  - `apps/admin/tsconfig.json` — extends @tax-portal/tsconfig/nextjs.json
  - `apps/admin/eslint.config.mjs` — mirrors portal flat config (ADR-003 §6 import guard)
  - `apps/admin/tailwind.config.ts`, `postcss.config.js` — mirrors portal
  - `apps/admin/vitest.config.ts` — mirrors portal (jsdom, globals, @/* alias)
  - `apps/admin/playwright.config.ts` — mirrors portal; baseURL=http://localhost:3001; ADMIN_BASE_URL env var
  - `apps/admin/src/styles/globals.css`, `src/test/setup.ts` — mirrors portal
  - `apps/admin/src/app/layout.tsx` — root layout stub with TASK-004-002 auth seam documented
  - `apps/admin/src/app/page.tsx` — ADR-010 compliant stub (visible auth-pending notice, no open admin page)
  - `apps/admin/src/app/healthz/route.ts`, `readyz/route.ts` — health/readiness (app=admin)
  - `apps/admin/src/app/healthz/route.test.ts` — Vitest unit smoke (1 test)
  - `apps/admin/e2e/fixtures/base.ts` — base fixture (re-exports test/expect; auth fixture seam for TASK-004-002)
  - `apps/admin/e2e/specs/scaffold.smoke.spec.ts` — @smoke tagged Playwright spec (3 tests)
  - `apps/admin/e2e/demo/.gitkeep`, `e2e/features/.gitkeep` — directory structure mirrors portal
  - `apps/admin/public/.gitkeep` — public dir (copied in Dockerfile runner stage)
  - `apps/admin/Dockerfile` — multi-stage mirror of portal Dockerfile; port 3001; non-root nextjs user; HEALTHCHECK

  **Files modified:**
  - `docker-compose.yml` — added `admin` service (port 3001, depends_on sqlserver healthy, HEALTHCHECK /healthz)
  - `package.json` (root) — added `pnpm --filter admin build` to the `build` script
  - `.env.example` — added ADMIN_DATABASE_URL_ADMIN, ADMIN_DATABASE_URL (container-side URLs for admin service)
  - `.implementation/operations/inventory.md` — updated admin service status, port env var, healthcheck params, app services env vars table
  - `.implementation/operations/runbook.md` — added admin container bring-up docs, ADMIN_ env var guidance, admin health probe commands

  **ADR-010 compliance:** `apps/admin/src/app/page.tsx` renders a clearly-labelled auth stub — no open role-free admin surface. A `// DECISION (TASK-004-002)` comment documents the seam. Auth middleware lands in TASK-004-002/-003.

  **Submission gate results:**
  - `pnpm lint` — PASS (fixed await-thenable error in route.test.ts; GET() is synchronous)
  - `pnpm type-check` — PASS
  - `pnpm build` — PASS (portal + admin both build; admin routes: /, /_not-found, /healthz, /readyz)
  - `pnpm --filter admin test` — PASS: 1 test file, 1 test, 613ms duration
  - `pnpm --filter portal test` — PASS (regression check, no portal regressions)

  **Docker pre-flight:** `docker info` — PASS

  **E2e smoke execution output (against docker-compose admin container, port 13001 — host port 3001 occupied by another project):**
  ```
  > admin@0.0.1 e2e:smoke /home/ccox/repos/tax-portal/apps/admin
  > playwright test --grep @smoke --grep-invert @demo

  Running 3 tests using 1 worker

    ✓  1 [chromium] › e2e/specs/scaffold.smoke.spec.ts:21:5 › @smoke admin /healthz returns 200 with status ok (38ms)
    ✓  2 [chromium] › e2e/specs/scaffold.smoke.spec.ts:38:5 › @smoke admin /readyz returns 200 with status ready (8ms)
    ✓  3 [chromium] › e2e/specs/scaffold.smoke.spec.ts:55:5 › @smoke admin root page serves HTML (auth stub placeholder visible) (215ms)

    3 passed (695ms)
  ```

  **Note on host port:** Local host port 3001 was occupied by `journey-for-jasmine-auth-api-1` (another project). The admin container was started with `ADMIN_PORT=13001` (compose env var override) and the smoke was run with `ADMIN_BASE_URL=http://localhost:13001`. The container listens on port 3001 internally — the `ADMIN_PORT` env var only affects the host binding. This is expected local-dev behavior; the SDET smoke gate should use the canonical port 3001.

  **Security review:**
  - Container user: `nextjs` (uid 1001, non-root) per Dockerfile
  - `/healthz` response: `{"status":"ok","app":"admin","ts":"..."}` — no credentials, no DB data, no PII
  - `/readyz` response: `{"status":"ready","app":"admin","ts":"..."}` — same
  - Compose file: all secrets via env vars with `:?` guards (fail-fast if unset); no hardcoded credentials

- 2026-06-15 [sdet] SDET review complete — approved. Mirror fidelity, e2e infra, ADR-010 stub, operational docs, env vars, port canonicality, and security all verified. Status → done. | What's next: IO dispatches TASK-004-002 | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Mirror fidelity confirmed — `apps/admin` package.json scripts (`dev`/`build`/`start`/`lint`/`type-check`/`test`/`e2e:run`/`e2e:smoke`/`e2e:demo`), all workspace deps (`@tax-portal/db`, `@tax-portal/ui`, `@tax-portal/eslint-config`, `@tax-portal/tsconfig`), and tooling (Playwright 1.61, Vitest 3, Tailwind 3.4, TS 5.8, Next 15.5.19) match `apps/portal` exactly, adjusted only for port 3001 and the `admin` name. E2e infra is real and executed green (3 `@smoke` tests against the admin container). Port watch item resolved — compose default publishes canonical 3001 (`"${ADMIN_PORT:-3001}:3001"`); the 13001 host override was purely local-dev and not baked into the image/compose default. ADR-010 satisfied — `apps/admin/src/app/page.tsx` is a documented auth-pending stub, `// DECISION (TASK-004-002)` seam in place, no open role-free admin surface. Operational docs (`inventory.md`, `runbook.md`) updated for the admin service, port 3001, healthcheck, and all new env vars. `PORTAL_APP_URL`/`ADMIN_APP_URL` confirmed in `.env.example`. Security: non-root `nextjs` uid 1001, health endpoints expose no sensitive data, no baked-in secrets. `test-admin` CI job targets `pnpm --filter admin test`, stays `continue-on-error: true` (advisory), portal regression clean. No rejections found.

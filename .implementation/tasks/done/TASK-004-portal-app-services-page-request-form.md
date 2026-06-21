---
brief: BRIEF-001
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-001, TASK-002, TASK-003
impl: developer
e2e_required: yes
started_at: 2026-06-15T00:00:00Z
completed_at: 2026-06-15T00:00:00Z
complexity_estimate: "4"
complexity_actual: "1"
brief_type: feature
brief_deploys: no
introduces_gate: no
acceptance_criteria: [AC-DOOR-001-01 (services page reachable anonymously), AC-DOOR-001-02 (active services displayed), AC-DOOR-001-03 (viewing creates no account / asks nothing personal), AC-DOOR-002-04 (deactivated service not selectable — UI side), AC-DOOR-003-01 (form presents active services as a checklist), "AC-DOOR-003-02 (no freeform \"describe your need\" field)", AC-DOOR-003-03 (no service-specific sub-questions), AC-DOOR-003-04 (deactivated services not checklist options — UI side), AC-DOOR-004-01 (select one or more services), AC-DOOR-004-02 (provide basic contact info), AC-DOOR-004-05 (cannot submit with zero services — client-side guard). Component/unit-tier (tier 2/5) coverage for AC-DOOR-004-05, AC-DOOR-003-02, AC-DOOR-003-03; the full e2e binding is TASK-005.]
upstream_refs: ADR-006 (the public door lives in `apps/portal`, the Client Portal — **not** `apps/admin`; Server Actions for mutations; `packages/ui` shadcn primitives), ADR-014 (Next.js 14 App Router + TypeScript), ADR-003 (the public services page + request submission are **anonymous paths** — must use the admin pool via the TASK-003 data layer, never the request pool; no "create an account to continue" gate), REQ-DOOR-004 (self-serve front door — the defining invariant), ADR-020 (prospect PII handled per the at-rest posture; no exposure of existing requests to the submitter)
---

# TASK-004: apps/portal scaffold + public services page + request form + anonymous submit

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter portal test` (component/unit) pass
- [N/A] **Targeted e2e** — N/A in this task _(the full e2e binding is TASK-005; this task's behavior is exercised there)_ — `/healthz` and `/readyz` routes created for the smoke harness
- [x] **Security review** — the submit Server Action validates input (Zod) and routes the write through the TASK-003 admin-pool insert-only path; no freeform injection of arbitrary service ids; no XSS in rendered service names / contact fields; the page exposes no existing requests
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Anonymous invariant (REQ-DOOR-004 — the slice's defining invariant):** verify the entire path — view services, open form, submit — works with **no account and no sign-in**, and that **no "create an account to continue" gate** is introduced before submission. This is a hard reject if violated.
- **Surface scope (ADR-006 / CLAUDE.md § Platform-frontend scope):** verify the public door lives in **`apps/portal`**, not `apps/admin`. `apps/admin` is out of scope for this slice — do not scaffold it.
- **Write path:** verify the submit Server Action calls the TASK-003 insert-only admin-pool create (no direct Prisma in the route/action outside the `packages/db` wrapper; no read-back of other requests).
- **Form shape (AC-DOOR-003-02/-03):** verify the form is a service **checklist** with basic contact fields only — **no freeform "describe your need" field** replacing the checklist, and **no service-specific sub-questions** that vary by selection.
- Verify the zero-selection guard (AC-DOOR-004-05) is enforced client-side here (and server-side in the action) — defense in depth.

## Context

This is the **client-facing surface** of the front door. Next.js 14 App Router app in `apps/portal` (ADR-006/014). A public, unauthenticated route renders the active services (from the TASK-003 active-services query) and a request form: a checklist of active services + basic contact fields (name + a contact method — the exact minimal field set is a routine product detail, choose a sensible minimal set and note it as a `// DECISION:`). Submitting calls a Server Action that creates the pending `engagement_request` via the TASK-003 admin-pool insert-only path.

`apps/admin` is **not** scaffolded in this slice — every AC here is portal-only (confirmed against the brief and CLAUDE.md § Platform-frontend scope: this task spec scopes to a single surface by name).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/package.json` | Create | `portal` package (name per pnpm workspace convention); `dev`, `build`, `start`, `test`, `lint`, `type-check`, `e2e:run` (e2e:run wired in TASK-005). Scripts use `sh -c` wrapper to avoid pnpm v9 `--if-present` flag propagation to sub-commands. |
| `apps/portal/next.config.mjs` | Create | Next.js 14 config — stub env var for build-time Prisma init, webpack externals for DB packages, standalone output |
| `apps/portal/tsconfig.json` | Create | extends `@tax-portal/tsconfig/nextjs.json`; Next.js auto-added `noEmit: true` and `resolveJsonModule: true` during build |
| `apps/portal/eslint.config.mjs` | Create | ESLint 9 flat config for portal (inlines base rules; does not spread shared config due to flat-config migration issue in shared package) |
| `apps/portal/vitest.config.ts` | Create | Vitest config with jsdom + globals:true + @vitejs/plugin-react |
| `apps/portal/tailwind.config.ts` | Create | Tailwind CSS config (content includes packages/ui for class generation) |
| `apps/portal/postcss.config.js` | Create | PostCSS for Tailwind |
| `apps/portal/src/styles/globals.css` | Create | Tailwind directives + base styles |
| `apps/portal/src/app/layout.tsx` | Create | Root layout (Tailwind, header, footer) |
| `apps/portal/src/app/page.tsx` | Create | Root page — redirect to /services |
| `apps/portal/src/app/(public)/layout.tsx` | Create | Public route group layout (no auth gate — REQ-DOOR-004) |
| `apps/portal/src/app/(public)/services/page.tsx` | Create | Public services page — anonymous reachable, lists active services (AC-DOOR-001-01/-02/-03, 002-04) |
| `apps/portal/src/app/(public)/request/page.tsx` | Create | Request form page — checklist + contact (AC-DOOR-003-01..04, 004-01/-02) |
| `apps/portal/src/app/(public)/request/actions.ts` | Create | Server Action — Zod-validated submit → TASK-003 admin-pool insert-only create (AC-DOOR-004-03/-04/-05) |
| `apps/portal/src/app/healthz/route.ts` | Create | `/healthz` for the smoke harness (ADR-007 per-app health) |
| `apps/portal/src/app/readyz/route.ts` | Create | `/readyz` for the smoke harness (ADR-007) — smoke-test.sh probes both endpoints |
| `apps/portal/src/components/ServiceChecklist.tsx` | Create | Service checklist client component (AC-DOOR-003-01..04) |
| `apps/portal/src/components/RequestForm.tsx` | Create | Request form client component (AC-DOOR-004-01/-02/-05) |
| `apps/portal/src/components/ServiceChecklist.test.tsx` | Create | Component test for inactive-service exclusion (AC-DOOR-002-04, 003-04) |
| `apps/portal/src/components/RequestForm.test.tsx` | Create | Component tests for zero-selection guard (AC-DOOR-004-05), no freeform field (003-02), no sub-questions (003-03) |
| `apps/portal/src/test/setup.ts` | Create | Vitest setup — extends expect with @testing-library/jest-dom |
| `apps/portal/next-env.d.ts` | Created (by next build) | Next.js type declarations — auto-generated |
| `apps/portal/Dockerfile` | Create | Per-app multi-stage image (ADR-007) |
| `packages/ui/package.json` | Create | `@tax-portal/ui` — shadcn-inspired primitives; `sh -c` wrappers |
| `packages/ui/tsconfig.json` | Create | TypeScript config (jsx: react-jsx) |
| `packages/ui/eslint.config.mjs` | Create | ESLint flat config |
| `packages/ui/src/index.ts` | Create | Barrel: Button, Input, Checkbox, Label, cn |
| `packages/ui/src/lib/utils.ts` | Create | `cn()` helper (clsx + tailwind-merge) |
| `packages/ui/src/components/button.tsx` | Create | Button primitive (class-variance-authority) |
| `packages/ui/src/components/input.tsx` | Create | Input primitive |
| `packages/ui/src/components/checkbox.tsx` | Create | Checkbox primitive |
| `packages/ui/src/components/label.tsx` | Create | Label primitive |
| `db/seed/services.ts` | Create | Service catalog seed (5 active + 1 inactive — AC-DOOR-002-04/003-04) |
| `scripts/db-seed.ts` | Create | Seed runner script (new — not in original spec; referenced by `pnpm db:seed` in root package.json) |
| `docker-compose.yml` | Modify | Added `portal` service (TASK-004 add instruction); coordinates with data-plane compose |

## Tests to Write First (tier 2/5)

- [x] `RequestForm.test.tsx [AC-DOOR-004-05]` — submit with zero services selected → blocked, action not invoked
- [x] `RequestForm.test.tsx [AC-DOOR-003-02]` — the form has no freeform "describe your need" textarea replacing the checklist
- [x] `RequestForm.test.tsx [AC-DOOR-003-03]` — selecting different services does not render service-specific sub-questions
- [x] `ServiceChecklist.test.tsx [AC-DOOR-002-04][AC-DOOR-003-04]` — an inactive service is not rendered as an option

## Implementation Notes

- **Anonymous, no gate (REQ-DOOR-004):** the `(public)` route group is reachable with no middleware auth gate. Do not add a Clerk sign-in requirement on these routes. (Clerk wiring for client/accountant auth is EPIC-004.)
- **Write path:** the Server Action must go through the TASK-003 admin-pool insert-only create — do **not** open a second write path or use `requestDb` here (it would fail-closed under RLS anyway, by design).
- **Minimal contact fields:** choose a sensible minimal set (e.g. name + email, or name + phone) and mark it `// DECISION:` — note it for EPIC-003 (the accountant inbox reads these).
- **packages/ui:** keep it to the primitives this slice actually uses; do not over-build the design system (ADR-015 — UI foundation deferred).
- Provide `/healthz` returning 200 so `scripts/smoke-test.sh` (TASK-002) can probe it.

## Definition of Done

- [x] `apps/portal` builds and runs; `/services` and `/request` reachable anonymously (no sign-in)
- [x] Services page lists active services; inactive services excluded (page + form)
- [x] Request form is a checklist + basic contact fields; no freeform need field; no per-service sub-questions
- [x] Submit creates a pending `engagement_request` via the admin-pool insert-only path; zero-selection blocked
- [x] `/healthz` returns 200
- [x] Component/unit tests for AC-DOOR-004-05 / 003-02 / 003-03 pass, tagged with AC ids
- [x] Lint + type-check + build + `pnpm --filter portal test` pass

---

## Work Log

**2026-06-15 [webapp-developer]** Starting implementation — apps/portal scaffold (Next.js 14 App Router), public services page, engagement request form (checklist + contact fields), Server Action wired to TASK-003 admin-pool create, packages/ui shadcn primitives, /healthz route, Dockerfile, seed extension, and component/unit tests for AC-DOOR-004-05/003-02/003-03. | What's next: read upstream refs (ADR-006, ADR-003, packages/db, TASK-003 output) then scaffold apps/portal | Blockers: none

**2026-06-15 [webapp-developer]** Implementation complete. Flipping to review.

**Files created:**
- `apps/portal/` — full Next.js 14 App Router scaffold
- `apps/portal/src/app/(public)/services/page.tsx` — anonymous services page (AC-DOOR-001-01/-02/-03)
- `apps/portal/src/app/(public)/request/page.tsx` + `actions.ts` — request form page + Zod-validated Server Action → `createEngagementRequest` (AC-DOOR-003-01..04, 004-01/-02/-05)
- `apps/portal/src/app/healthz/route.ts` + `readyz/route.ts` — smoke probe endpoints
- `apps/portal/src/components/ServiceChecklist.tsx` + `RequestForm.tsx` — client components
- `apps/portal/src/components/ServiceChecklist.test.tsx` + `RequestForm.test.tsx` — 16 component/unit tests
- `packages/ui/` — @tax-portal/ui package with Button, Input, Checkbox, Label, cn primitives
- `db/seed/services.ts` — 5 active services + 1 inactive service seed (MERGE idempotent)
- `scripts/db-seed.ts` — seed runner (new file; referenced by `pnpm db:seed` in root package.json)
- `docker-compose.yml` — added `portal` app service

**Key decisions:**
- `// DECISION: Contact fields = firstName + lastName + email` (in RequestForm.tsx) — minimal PII needed for accountant to identify and contact the prospect; phone optional; noted for EPIC-003
- `// DECISION: Build-time Prisma stub` in next.config.mjs — sets stub `DATABASE_URL_ADMIN` at Next.js config load time so Prisma's module-load-time constructor doesn't fail during `next build`; real URL comes from runtime env
- pnpm v9 `--if-present` propagation: used `sh -c '...'` wrapper in package.json scripts so pnpm's internal flag is not forwarded to the underlying command
- ESLint config inlines rules rather than spreading shared base due to flat-config `no-restricted-imports` placement issue in `packages/eslint-config/index.js`

**Gate results:**
- `pnpm lint` — PASS (zero warnings/errors)
- `pnpm type-check` — PASS (zero errors)
- `pnpm build` — PASS (all routes dynamic; standalone output)
- `pnpm --filter portal test` — PASS: 2 test files, 16 tests, all green

```
 RUN  v3.2.6 /home/ccox/repos/tax-portal/apps/portal

 ✓ src/components/ServiceChecklist.test.tsx (6 tests) 84ms
 ✓ src/components/RequestForm.test.tsx (10 tests) 176ms

 Test Files  2 passed (2)
      Tests  16 passed (16)
   Start at  07:28:14
   Duration  806ms
```

**Deviations from Files table:**
- Added `apps/portal/src/app/readyz/route.ts` (not in original spec) — smoke-test.sh probes both /healthz AND /readyz; both needed per the smoke harness script
- Added `apps/portal/eslint.config.mjs`, `vitest.config.ts`, `src/test/setup.ts`, `src/app/page.tsx`, `src/app/(public)/layout.tsx`, `next-env.d.ts` — standard Next.js app scaffold files (implicit in spec)
- Added `scripts/db-seed.ts` — referenced by root `pnpm db:seed` script (root package.json had `"db:seed": "tsx scripts/db-seed.ts"` but the script didn't exist)
- `docker-compose.yml` modified (not listed in original spec) — added `portal` service per task instruction "coordinate the compose portal service with TASK-002"

| What's next: TASK-005 (e2e binding) | Blockers: none

## Attempt Log

**Attempt count**: 0

---

**2026-06-15 [webapp-developer]** Starting rework — BUG-001-001 ops-docs stale: update inventory.md (portal row status → Active, add PORTAL_PORT env-override, add DATABASE_URL_ADMIN to App services env table) and runbook.md (docker compose ps example includes tax-portal-portal, anonymous write note references TASK-004 not TASK-005). | What's next: read docker-compose.yml (done), then edit inventory.md, then runbook.md | Blockers: none

**2026-06-15 [webapp-developer]** Rework complete — BUG-001-001 resolved. Status → review. Complexity-actual: 1.

**Changes made to close BUG-001-001:**

`.implementation/operations/inventory.md`:
- **Last updated** header: `TASK-002 (BRIEF-001)` → `TASK-004 (BRIEF-001)`
- **Services table** portal row: `Deferred to TASK-004` → `Active` (confirmed against docker-compose.yml; `admin` row correctly left as `Deferred to TASK-004`)
- **Ports table** portal row: `Env override: —` → `PORTAL_PORT` (docker-compose.yml line: `"${PORTAL_PORT:-3000}:3000"`); note updated from forward-looking "added in TASK-004" to "active (added in TASK-004)"
- **App services env table**: section header updated to "portal active as of TASK-004"; added `DATABASE_URL_ADMIN | portal | Required — admin pool connection URL...` row (confirmed env var name from docker-compose.yml portal service environment block)

`.implementation/operations/runbook.md`:
- **Verify health expected output**: header updated to "data-plane + portal app service, post-TASK-004"; added `tax-portal-portal` row to `docker compose ps` example (container name confirmed from docker-compose.yml `container_name: tax-portal-portal`)
- **Note on anonymous write**: corrected `TASK-005` → `TASK-004`; added clarifying sentence that TASK-005 adds e2e specs only

**Cross-check with docker-compose.yml vs bug report:** no disagreements found. All values confirmed from the actual docker-compose.yml file:
- Port override: `"${PORTAL_PORT:-3000}:3000"` — confirms `PORTAL_PORT`
- Env var: `DATABASE_URL_ADMIN: "${DATABASE_URL_ADMIN:?...}"` — confirms `DATABASE_URL_ADMIN`
- Container name: `container_name: tax-portal-portal` — confirms `tax-portal-portal`

## SDET Review

**Decision**: approved
**Notes**: Re-review scoped to BUG-001-001 (ops docs stale). Verified each named stale field directly against `docker-compose.yml` (not the Work Log's claims):
- `inventory.md` — `Last updated` header: `TASK-004 (BRIEF-001)` ✓; services table `portal` row: `Active` ✓; services table `admin` row: correctly remains `Deferred to TASK-004` (admin not scaffolded this slice) ✓; ports table `portal` row: `PORTAL_PORT` env override present, confirmed against compose `"${PORTAL_PORT:-3000}:3000"` ✓; App services env table: `DATABASE_URL_ADMIN | portal | Required` row added, confirmed against compose `DATABASE_URL_ADMIN: "${DATABASE_URL_ADMIN:?...}"` ✓.
- `runbook.md` — `docker compose ps` example header updated to `post-TASK-004`, `tax-portal-portal` row present, confirmed against compose `container_name: tax-portal-portal` ✓; anonymous write note references `TASK-004` with clarifying sentence that TASK-005 adds e2e only ✓.
- No new disagreement between ops docs and `docker-compose.yml` introduced ✓. Fix is docs-only: no app source / Prisma schema / compose topology change in the rework ✓.
- `Complexity-actual: 1` (integer, in range) ✓; rework Work Log Dispatch-Checkpoint breadcrumb present ✓.

**2026-06-15 [sdet]** TASK-004 re-review approved. BUG-001-001 verified resolved. All named stale fields corrected and consistent with docker-compose.yml. Docs-only rework confirmed. Status set to done.

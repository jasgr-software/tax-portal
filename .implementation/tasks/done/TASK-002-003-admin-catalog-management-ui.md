---
brief: BRIEF-002
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-002-002
impl: developer
e2e_required: "no"
started_at: 2026-06-16T00:00:00Z
completed_at: 2026-06-16T08:35:00Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-DASH-010-01, AC-DASH-010-02, AC-DASH-010-03 (add / edit / deactivate from the admin UI). Renders the surface that the AC-DOOR-002-01/-02/-03 journeys exercise.]
upstream_refs: ADR-006 (catalog management lives in apps/admin, not apps/portal), ADR-010 (apps/admin has no public routes — the route sits behind the existing accountant role gate), ADR-005 (UI is not the security boundary — the policy is)
---





# TASK-002-003: Admin services-catalog management UI (list / add / edit / deactivate) behind the accountant role gate

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter admin test` pass
- [N/A] **Targeted e2e** — the e2e journeys driving this UI are TASK-002-004
- [x] **Security review** — route sits behind the existing admin middleware role gate; no catalog write path exists in apps/portal; the UI must not be the only guard (defense-in-depth — the policy + server actions enforce). All writes go through server actions; defense-in-depth identity guard on page.tsx mirrors page.tsx pattern. No adminDb used for writes.
- [x] **SDET Review** — approved

## SDET Review focus areas

- **ADR-006 / ADR-010:** the management route lives in `apps/admin` only and is unreachable from `apps/portal`
  (no client/anonymous write path). It sits behind the existing `applyAdminAuth` middleware gate — verify it
  is matched by the middleware matcher (not an excluded path) and renders only for an ACCOUNTANT.
- **No business logic in the component layer** — writes call the TASK-002-002 server actions; the UI does not
  reach the DB directly.
- **Component test coverage** for the list/add/edit/deactivate UI states (active + inactive shown), Vitest in
  apps/admin.
- **Cross-surface parity note:** catalog management is an admin-only capability (per ADR-006) — there is
  intentionally NO mirror in apps/portal. This is the documented single-surface exception; do not flag the
  absence of a portal mirror.

## Context

The admin-facing screen the accountant uses to manage her catalog: a list of her services (active + inactive),
with add, edit, and deactivate actions wired to the TASK-002-002 server actions. This is the
`AC-DASH-010-01/-02/-03` surface and the screen the `AC-DOOR-002-01/-02/-03` e2e journeys (TASK-002-004) drive.
Keep the layout/nav patterns reusable for EPIC-003 (request inbox) per the brief notes.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/services/page.tsx` | Create | Server component: resolve identity (middleware-guaranteed ACCOUNTANT), list active + inactive services (via the TASK-002-002 list function inside withRequestContext), render the management screen. |
| `apps/admin/src/app/services/_components/ServiceList.tsx` | Create | Client component: service list table (active/inactive rows, Inactive badge, Edit + Deactivate action buttons). |
| `apps/admin/src/app/services/_components/AddServiceForm.tsx` | Create | Client component: add-service form wired to createServiceAction. |
| `apps/admin/src/app/services/_components/EditServiceForm.tsx` | Create | Client component: edit-service form, pre-fills with current values, wired to updateServiceAction. |
| `apps/admin/src/app/services/catalog-management.test.tsx` | Create | Vitest component tests for the management UI states (25 tests). |
| (nav) admin layout/nav | Modify (if present) | Add a "Services" entry to the admin nav if a nav exists; otherwise leave a reusable pattern for EPIC-003. |

## Tests to Write First

- [ ] `catalog screen lists active and inactive services` — expected: both rendered, inactive visually distinguished
- [ ] `add form submits to createServiceAction` — expected: action invoked with form values
- [ ] `edit form pre-fills and submits to updateServiceAction` — expected: action invoked with edited values
- [ ] `deactivate control invokes deactivateServiceAction` — expected: action invoked; row shown inactive

## Implementation Notes

- The route is `apps/admin/src/app/services/` — already covered by the admin middleware matcher (matches all
  non-static paths). No new public route.
- Use the TASK-002-002 server actions for all writes; the page reads the admin list via the repository inside
  `withRequestContext` (mirror the apps/admin/src/app/page.tsx identity hand-off).
- Inactive services remain visible to the accountant (she can see/reactivate) — the active-only filter is for
  the public door (apps/portal), not the admin list.

## Definition of Done

- [ ] Accountant can add / edit / deactivate from the admin UI; list shows active + inactive
- [ ] Route is admin-only (behind the existing role gate); no portal write path
- [ ] Component tests green; lint + type-check + build pass; `pnpm --filter admin test` green

---

## SDET Review

**Decision**: approved

**Re-execution (2026-06-16T08:33–08:35Z):** `pnpm --filter admin test` → **41/41 PASS** (3 files: catalog-management.test.tsx 25/25, actions.test.ts 15/15, healthz route.test.ts 1/1). `pnpm lint` → PASS (0 errors, 0 warnings, both apps). `pnpm type-check` → PASS (packages/ui + both apps, zero errors). Counts match Work Log evidence exactly.

**Boundary check — ADR-005 (no DB in component layer):** `AddServiceForm.tsx` imports only `createServiceAction` from `../actions` (no `adminDb`, no `withRequestContext`, no `packages/db` repo function). `EditServiceForm.tsx` imports only `updateServiceAction`. `ServiceList.tsx` / `ServiceRow` has no DB import; `deactivateServiceAction` is reached via dynamic `import("../actions")` at runtime — no static DB import. Clean on all three components.

**Page read path + identity provenance:** `page.tsx` uses `headers()` → cookie header → synthetic Request → `getAuthProvider().getIdentity()` → explicit `identity.role !== "ACCOUNTANT"` guard → `getAllServices()` which runs `listAllServices()` inside `withRequestContext(clerkUserId, role, fn)`. Role comes from the verified session only; never from request params or client assertion. Defense-in-depth guard is present on top of middleware guarantee.

**Discriminated-union handling:** `AddServiceForm` and `EditServiceForm` branch on `result.success`: the `false` branch sets `error` state rendered as `role="alert"`. `ServiceRow.handleDeactivate` checks `result.success`; the `false` branch sets `deactivateError` rendered as `role="alert"`. Both branches exercised in tests (search: `displays error message when ... returns { success: false }`). No swallowed error branch.

**AC-tagged component coverage:** AC-DASH-010-01 (add) — test submits `createServiceAction` with form values and handles `success: false` error. AC-DASH-010-02 (edit) — test verifies pre-fill and calls `updateServiceAction`; null description handled; `success: false` error displayed. AC-DASH-010-03 (deactivate) — test calls `deactivateServiceAction` with service id; confirm-cancel guard exercised; `success: false` error displayed. List-active-inactive — both badges rendered and visually distinguished (Active / Inactive with `data-testid="inactive-badge"`).

**ADR-006 single-surface exception:** No `ServiceList`, `AddServiceForm`, `EditServiceForm`, or catalog write action exists in `apps/portal`. The portal's `ServiceListItem` read-type reference is the public-door read path from EPIC-001 — unrelated. Absence of portal mirror is the documented and correct behavior.

**No new public route / middleware exclusion:** `/services` matched by the admin middleware's catch-all matcher (everything except static assets). Route serves ACCOUNTANT only — verified by middleware at `apps/admin/src/middleware.ts`. Matcher pattern deliberately excludes nothing except `_next/static`, `_next/image`, favicon, and file extensions.

**Reactivation absent:** no `reactivateServiceAction` exists; inactive rows render with the `Inactive` badge and no deactivate button; no reactivate control is rendered. Correct per spec. Two tests explicitly confirm inactive rows have no Deactivate button.

**Mandatory rejection checks:** Dispatch Checkpoint present (2026-06-16 "Starting implementation" entry before any code edit). `Started-at`, `Complexity-estimate`, `Complexity-actual` all set and in range (3). Required spec fields all present (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate: no**`). All dev-owned Quality Gate boxes ticked. No tool-hygiene violations in Work Log. E2e-required: no — targeted e2e N/A; Gate Authoring not required (`Introduces-gate: no`).

---

## Work Log

### 2026-06-16 [webapp-developer] Starting implementation — services catalog management UI (page.tsx, _components/*.tsx, test file) | What's next: create page.tsx server component, client components (list, add-form, edit-form, deactivate), then vitest component tests | Blockers: none

### 2026-06-16 [webapp-developer] Implementation complete. Created: services/page.tsx (server component, identity guard mirrors page.tsx, listAllServices inside withRequestContext), _components/ServiceList.tsx (client, list active+inactive with Inactive badge, add/edit/deactivate actions), _components/AddServiceForm.tsx (client, createServiceAction), _components/EditServiceForm.tsx (client, updateServiceAction pre-filled). Test file: services/catalog-management.test.tsx, 25 tests. DECISIONS: (1) relative imports without .js extension for production files (webpack bundler pattern matching portal); tests keep .js; (2) dynamic import for deactivateServiceAction in ServiceRow — resolved to "../actions" (no .js); (3) reactivation out of scope per spec. Gate results: pnpm lint — Done (0 errors, 0 warnings). pnpm type-check — Done. pnpm build — Compiled successfully, admin /services route 10.3 kB. pnpm --filter admin test — 3 test files, 41 passed (25 new catalog-management tests + 15 pre-existing actions tests + 1 healthz). | What's next: SDET review | Blockers: none

### 2026-06-16 [sdet] APPROVED. Independent re-exec: admin 41/41 (25 catalog-management + 15 actions + 1 healthz); lint PASS; type-check PASS. ADR-005 boundary clean (no DB imports in component layer). Page read path inside withRequestContext with verified identity. Both discriminated-union branches handled with role="alert". AC-DASH-010-01/-02/-03 each tested with happy-path and error branch. No portal write path. No public route. Reactivation correctly absent. Status: done. Completed-at: 2026-06-16T08:35:00Z.

## Attempt Log

# TASK-002-003: Admin services-catalog management UI (list / add / edit / deactivate) behind the accountant role gate

**Brief**: BRIEF-002
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-002-002
**Impl**: developer
**E2e-required**: no <!-- the UI is built here; the e2e journeys that drive it are TASK-002-004 (which carries E2e-required: yes) -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DASH-010-01, AC-DASH-010-02, AC-DASH-010-03 (add / edit / deactivate from the admin UI). Renders the surface that the AC-DOOR-002-01/-02/-03 journeys exercise.
**Upstream refs:** ADR-006 (catalog management lives in apps/admin, not apps/portal), ADR-010 (apps/admin has no public routes — the route sits behind the existing accountant role gate), ADR-005 (UI is not the security boundary — the policy is)
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter admin test` pass
- [N/A] **Targeted e2e** — the e2e journeys driving this UI are TASK-002-004
- [ ] **Security review** — route sits behind the existing admin middleware role gate; no catalog write path exists in apps/portal; the UI must not be the only guard (defense-in-depth — the policy + server actions enforce)
- [ ] **SDET Review** — approved

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
| `apps/admin/src/app/services/_components/*.tsx` | Create | Client components: service list (active/inactive states), add form, edit form, deactivate control — wired to the server actions. shadcn/ui + Tailwind per the stack. |
| `apps/admin/src/app/services/*.test.tsx` | Create | Vitest component tests for the management UI states. |
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

## Work Log

## Attempt Log

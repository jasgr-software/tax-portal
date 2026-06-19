# TASK-008-003: Admin surface — render the onboarding-complete notification + a minimal engagement-status observable

**Brief**: BRIEF-008
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-008-001
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-006-01, AC-ONBD-007-01, AC-ONBD-007-02, AC-MSG-013-04
**Upstream refs:** REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013; ADR-005, ADR-006
**Introduces-gate:** no

<!-- Brief-type: feature · Brief-deploys: no -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the full e2e path is TASK-008-004; this task is covered by admin component/unit tests
- [ ] **Security review** — the feed renders only what `listNotifications` (RLS-scoped, accountant-only `0004`) returns; no client-readable surface; XSS-safe rendering of the title/body
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Notification feed extension (D6):** `NotificationsIndicator.tsx` currently HARD-FILTERS to
  `NOTIFICATION_TYPE_NEW_REQUEST`; it must also render `NOTIFICATION_TYPE_ONBOARDING_COMPLETE` (imported from
  `@tax-portal/db`). The onboarding-complete notification must show its title/body identifying the engagement +
  client (AC-ONBD-007-02). Verify it does not over-broaden to render unrelated/future types implicitly (render
  the two known types; a default for unknown types is a judgment call — keep minimal).
- **Engagement-status observable (AC-ONBD-006-01 UI):** a minimal read-only "Status: In Progress / New" display
  on the existing admin per-engagement surface (`engagements/[engagementId]/document-requests/page.tsx`).
  Admin-side only — this is NOT a client-facing lifecycle label (those remain Phase-3 out-of-scope). Keep it
  minimal; do not build an engagement list/pipeline UI (Phase 3).
- **ADR-005/006:** the surface is accountant-only (admin app); reads go through the RLS-scoped request pool
  (`listNotifications`), which the `0004` policy already constrains to ACCOUNTANT.
- **XSS:** title/body rendered as text (React default-escaped); no `dangerouslySetInnerHTML`.

## Context

The completion notification is a new `type` (`onboarding_completed`). The admin feed today only surfaces
`new_engagement_request`, so the new type would be invisible without this change. This task makes the accountant
actually receive + read the onboarding-complete notification (AC-ONBD-007-01/-02, AC-MSG-013-04) and gives
AC-ONBD-006-01 a UI observable (the engagement showing "In Progress") for the e2e (TASK-008-004).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx` | Modify | Also render `onboarding_completed` notifications (title/body identifying engagement + client) alongside `new_engagement_request` |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/page.tsx` | Modify | Add a minimal read-only engagement-status display (e.g. `data-testid="engagement-status"` → "New" / "In Progress") |
| `apps/admin/src/app/requests/notifications.test.ts` (or a co-located component test) | Modify/Create | Assert the feed renders an `onboarding_completed` notification; assert the status display reflects the engagement status |
| `packages/db` engagement read (if needed) | Modify | If the admin engagement page lacks a status read, add/extend a minimal admin-pool engagement-by-id read returning `status` (reuse existing seams; no new entity) |

## Tests to Write First

- [ ] the notification feed renders an `onboarding_completed` notification with its title/body — **AC-ONBD-007-01 / AC-MSG-013-04**
- [ ] the rendered onboarding-complete notification identifies the engagement + client (title/body content) — **AC-ONBD-007-02**
- [ ] the admin per-engagement page shows the engagement status, reading "In Progress" once transitioned — **AC-ONBD-006-01 (UI observable)**
- [ ] the feed still renders `new_engagement_request` (non-regression)

## Implementation Notes

- Import `NOTIFICATION_TYPE_ONBOARDING_COMPLETE` from `@tax-portal/db` (added by TASK-008-001) — mirror the
  existing `NOTIFICATION_TYPE_NEW_REQUEST` usage. Extend the filter/render to the set of known types.
- Keep the status display minimal and admin-only. If a small db read is required for the engagement status,
  reuse an existing admin-pool engagement read or add a minimal one in `packages/db` (no new entity/column).
- Cross-surface note (CLAUDE.md § Platform-frontend scope): this is the admin half of the slice; the portal
  half is TASK-008-002. The e2e (TASK-008-004) exercises both + cross-app.

## Definition of Done

- [ ] The accountant feed renders the `onboarding_completed` notification identifying engagement + client
- [ ] A minimal admin engagement-status observable exists for the e2e
- [ ] `new_engagement_request` rendering unchanged
- [ ] Lint + type-check + build pass; admin unit/component tests pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

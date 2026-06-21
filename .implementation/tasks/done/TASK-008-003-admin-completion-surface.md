---
brief: BRIEF-008
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-008-001
impl: developer
e2e_required: no
started_at: 2026-06-19T22:27:08Z
completed_at: 2026-06-19T17:40:00Z
complexity_estimate: "2"
complexity_actual: "2"
introduces_gate: no
acceptance_criteria: [AC-ONBD-006-01, AC-ONBD-007-01, AC-ONBD-007-02, AC-MSG-013-04]
upstream_refs: REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013; ADR-005, ADR-006
---

# TASK-008-003: Admin surface — render the onboarding-complete notification + a minimal engagement-status observable

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the full e2e path is TASK-008-004; this task is covered by admin component/unit tests
- [x] **Security review** — the feed renders only what `listNotifications` (RLS-scoped, accountant-only `0004`) returns; no client-readable surface; XSS-safe rendering of the title/body
- [x] **SDET Review** — approved

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
| `apps/admin/src/app/engagements/[engagementId]/document-requests/page.tsx` | Modify | Add a minimal read-only engagement-status display (`data-testid="engagement-status"` → "New" / "In Progress") |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/actions.ts` | Modify | Added `getEngagementStatusAction` + `GetEngagementStatusResult` type (ACCOUNTANT-guarded admin-pool status read) |
| `apps/admin/src/app/requests/_components/NotificationsIndicator.test.tsx` | Create | Component tests: feed renders onboarding_completed (AC-ONBD-007-01/AC-MSG-013-04), identifies client (AC-ONBD-007-02), non-regression for new_engagement_request, unknown types filtered |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/engagement-status.test.ts` | Create | Unit tests: getEngagementStatusAction returns 'New'/'In Progress' (AC-ONBD-006-01), identity guard, not-found, validation |
| `packages/db/src/repositories/engagement.ts` | Modify | Added `getEngagementStatusForAdmin` (admin pool, `SELECT [id], [status]` — no new entity/column) |
| `packages/db/src/index.ts` | Modify | Export `getEngagementStatusForAdmin` from barrel |

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

- [x] The accountant feed renders the `onboarding_completed` notification identifying engagement + client
- [x] A minimal admin engagement-status observable exists for the e2e
- [x] `new_engagement_request` rendering unchanged
- [x] Lint + type-check + build pass; admin unit/component tests pass

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation — admin completion surface (NotificationsIndicator extension + engagement status observable)
**What was done:** Dispatch checkpoint. Read ENGINE.md, developer.md, task file, TASK-008-001 engine constants, existing NotificationsIndicator.tsx, document-requests page.tsx, engagement repository, notification repository, onboarding-completion.ts (confirms NOTIFICATION_TYPE_ONBOARDING_COMPLETE = "onboarding_completed" exported from barrel). Confirmed: (1) admin engagement page has NO existing status read — must add minimal admin-pool engagement-by-id status read to packages/db; (2) NotificationsIndicator hard-filters to NOTIFICATION_TYPE_NEW_REQUEST only — must extend to also include NOTIFICATION_TYPE_ONBOARDING_COMPLETE; (3) NOTIFICATION_TYPE_ONBOARDING_COMPLETE already exported from @tax-portal/db barrel (index.ts:231-234).
**What's next:** (1) Add `getEngagementStatusForAdmin` to `packages/db/src/repositories/engagement.ts` (admin pool, returns `{ id, status } | null`); export from barrel. (2) Extend NotificationsIndicator to render onboarding_completed notifications with their title/body. (3) Add engagement status display to document-requests page. (4) Write component/unit tests covering all four AC-tagged scenarios. (5) Run submission gate (lint + type-check + admin tests).
**Blockers:** none

### 2026-06-19 [webapp-developer] Submitting for review — all gates passed
**What was done:**
- Added `getEngagementStatusForAdmin` (admin pool, `SELECT [id], [status]` by engagementId) to `packages/db/src/repositories/engagement.ts`. No new entity/column/policy (ADR-005). Exported from barrel (index.ts). Built `packages/db` to regenerate dist types.
- Extended `NotificationsIndicator.tsx` to filter to the set of two known types: `NOTIFICATION_TYPE_NEW_REQUEST` + `NOTIFICATION_TYPE_ONBOARDING_COMPLETE`. Renders both types; does NOT over-broaden to unknown/future types. Unread badge counts across both. Body rendered as React text (XSS-safe, no `dangerouslySetInnerHTML`). Added `data-notification-type` attribute on `<li>` items. "Review request" link shown when `engagementRequestId` present (works for both types per D4 FK reuse).
- Added `GetEngagementStatusResult` type and `getEngagementStatusAction` to `apps/admin/.../document-requests/actions.ts`. ACCOUNTANT identity guard, delegates to `getEngagementStatusForAdmin` (admin pool, ADR-003).
- Updated `apps/admin/.../document-requests/page.tsx`: imports `getEngagementStatusAction`, calls it, renders minimal read-only `<span data-testid="engagement-status" data-status={status}>` badge ("New" / "In Progress"). AC-ONBD-006-01 UI observable.
- Created `apps/admin/src/app/requests/_components/NotificationsIndicator.test.tsx` (16 tests): [AC-ONBD-007-01 / AC-MSG-013-04] feed renders onboarding_completed; [AC-ONBD-007-02] title/body identifies client; XSS safety; non-regression for new_engagement_request; unknown types filtered.
- Created `apps/admin/src/app/engagements/.../engagement-status.test.ts` (7 tests): [AC-ONBD-006-01] 'New' and 'In Progress' statuses returned; identity guard; not-found case; validation.
- Upstream refs honored: ADR-005 (no new policy, read existing column), ADR-006 (admin-only), ADR-003 (admin pool for admin reads, no direct Prisma outside wrapper).

**Gate results:**
- `pnpm lint`: PASSED (zero warnings/errors, both apps)
- `pnpm type-check`: PASSED (zero errors, after `pnpm --filter @tax-portal/db build`)
- `pnpm --filter admin test`: PASSED — 246 tests in 14 files, 0 failures (includes 16 new NotificationsIndicator + 7 new engagement-status tests)
- `pnpm --filter portal test`: PASSED — 172 tests in 9 files (ADR-006 non-regression: portal untouched)
- Targeted e2e: [N/A] — brief mandates no e2e for this task (TASK-008-004 carries the cross-app e2e)

**Security review:**
- XSS: title/body rendered as React JSX text (default-escaped). No `dangerouslySetInnerHTML`. XSS test included.
- RLS boundary: `listNotifications()` is already constrained to ACCOUNTANT by `0004-notification-policy.sql`. No new policy. Render-layer change only (D6, ADR-005).
- `getEngagementStatusForAdmin` uses admin pool with ACCOUNTANT identity guard in the action layer. No CLIENT-accessible surface (ADR-006).
- `apps/portal` untouched.

**What's next:** SDET review.
**Blockers:** none. `Completed-at` left blank (SDET-authored field).

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All five mandatory focus areas pass. (1) No-schema additive DB read confirmed: `git diff HEAD` shows zero changes to `prisma/schema.prisma`, `db/migrations/`, or `db/policies/`. `getEngagementStatusForAdmin` uses `getAdminPool()` + raw `mssql` `SELECT [id],[status]` — consistent with the existing admin-pool pattern (createEngagement, recordLetterSignature); no direct Prisma access outside the wrapper (ADR-003). Admin pool choice is justified: accountant-gated admin surface with no CLIENT SESSION_CONTEXT; reads only `Engagement.status` — a different surface from notification rows; no client-scoped row leakage possible. (2) Notification feed extension is minimal and non-regressing: filter is an explicit two-element `||` guard (lines 80–83); unknown/future types are dropped, not rendered. Tests verify `some_future_type` is not in the DOM. Unread badge counts across both known types. "Review request" link preserved for both types when `engagementRequestId` is set. XSS: title and body rendered as JSX text children; no `dangerouslySetInnerHTML` anywhere in the component or the page. (3) AC dual-tags present and assertive: `[AC-ONBD-007-01 / AC-MSG-013-04]` describe block + 3 `it` titles; `[AC-ONBD-007-02]` describe block + 3 `it` titles (content text assertions confirm client name in title/body); `[AC-ONBD-006-01]` asserts both 'New' and 'In Progress' with argument check `toHaveBeenCalledWith(ENGAGEMENT_ID)`. (4) Scope discipline confirmed: `apps/portal` diff is zero lines; no engagement list/pipeline/lifecycle controls; no client-facing labels; TASK-008-001 engine and TASK-008-002 portal files are untouched by this diff. (5) Independent gate re-runs on the uncommitted working tree: `pnpm lint` — PASS (zero warnings, both apps); `pnpm type-check` — PASS (zero errors, all packages + apps); `pnpm --filter admin test` — 246/246 PASS (14 files, includes 16 new NotificationsIndicator + 7 new engagement-status tests); `pnpm --filter portal test` — 172/172 PASS (ADR-006 non-regression; portal untouched). Pre-existing stderr (MOCK_SESSION_SECRET warning, D5 containment console.error) are known-good test artifacts, not failures. Metadata: `Complexity-actual: 2` (valid 1–5); `Completed-at` was blank at review as required. Pre-impl Work Log entry present with status flip, plan, and complexity-estimate before any file edits. Required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present. `Introduces-gate: no` — no Gate Authoring Rules evidence required.

### Work Log — SDET approval breadcrumb
**2026-06-19T17:40:00Z [sdet]** TASK-008-003 APPROVED. Independent gate re-runs: lint PASS, type-check PASS, admin 246/246 PASS, portal 172/172 PASS (ADR-006 non-regression). All five mandatory focus areas pass. Status → done; Completed-at → 2026-06-19T17:40:00Z.

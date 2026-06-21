---
brief: BRIEF-005
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-005-001 (LetterTemplate schema + repo)
impl: developer
e2e_required: no
started_at: 2026-06-18T14:00:00Z
completed_at: 2026-06-18T09:16:00Z
complexity_estimate: "2"
complexity_actual: "2"
brief_deploys: no
introduces_gate: no
acceptance_criteria: [AC-IDNT-007-01 (system default present out-of-box), AC-IDNT-007-02 (accountant edits content, persists). AC-IDNT-007-03 (edited template shown to the client at the letter step) is delivered in TASK-005-005/-006/-007 (the client surface) — this task owns the admin write side + the default.]
upstream_refs: ADR-003 (template-edit write under the **accountant** principal via `withRequestContext`), ADR-006 (template editing is an `apps/admin` setting — must NOT be reachable from `apps/portal`), ADR-024 §6 (authoring is the app's concern, not the provider's).
---

# TASK-005-004: Engagement-letter template setting (admin) — default present + accountant edit persists

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _admin edit→sign cross-surface e2e is TASK-005-007_
- [x] **Security review** — ACCOUNTANT-only write (role server-evaluated, never client-asserted); no XSS (template content auto-escaped where rendered); template-edit not reachable from portal
- [x] **SDET Review** — approved

## SDET Review focus areas

- **ADR-006 surface boundary** — template editing lives only in `apps/admin`; confirm no template-edit route/action under `apps/portal`. Reuse the admin `getAccountantIdentity()` guard pattern (`apps/admin/src/app/requests/actions.ts`) — role from the verified session, never from form data.
- **ADR-003 accountant-principal write** — the edit UPDATE runs through `withRequestContext(clerkUserId, 'ACCOUNTANT', …)`, not the admin pool. (The `LetterTemplate` table is accountant-owned and NOT in a client-isolation policy; an accountant-only convention applies — confirm no client read path exists.)
- **AC-IDNT-007-01 default** — the seeded default (from TASK-005-001) is present on a fresh DB without the accountant authoring anything. Confirm the setting page renders the default content on first open.

## Context

A system-provided default engagement-letter template exists out of the box (AC-IDNT-007-01 — seeded in TASK-005-001); the accountant can edit its content (AC-IDNT-007-02); her edited content is what the client later signs (AC-IDNT-007-03, client surface). This task delivers the admin setting page + the edit action.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/settings/letter-template/page.tsx` | create | Accountant-guarded setting page; renders current template content into an editable form |
| `apps/admin/src/app/settings/letter-template/actions.ts` | create | `getLetterTemplateAction` (read current) + `updateLetterTemplateAction(content)` (accountant-principal write) |
| `apps/admin/src/app/settings/letter-template/_components/TemplateEditor.tsx` | create | Client component — textarea/editor + save; reflects persisted content |
| `apps/admin/src/app/settings/letter-template/actions.test.ts` | create | tier-2 — default present on first read; edit persists + re-read returns edited content; non-ACCOUNTANT rejected |
| `apps/admin/src/app/settings/letter-template/template-editor.test.tsx` | create | tier-5 component — renders default; save invokes the action |

## Implementation Notes

- Mirror the EPIC-002 `services` admin CRUD page + the EPIC-003 `requests/actions.ts` identity-guard pattern (`getAccountantIdentity()` → `withRequestContext`). Single current `LetterTemplate` row (DECISION-D) — `updateLetterTemplate` UPDATEs it, sets `updatedBy` = accountant clerkId, and (optionally) clears `isSystemDefault`.
- The accountant edits **content** (plain text / markdown — keep it simple for Phase 2; the e-sign provider renders whatever content the app supplies, ADR-024 §6). No rich-text requirement in the AC.
- Add a nav entry to the admin layout if one exists; keep it minimal.

## Tests to Write First

- [x] `[AC-IDNT-007-01] getLetterTemplateAction returns the seeded system default on a fresh DB`
- [x] `[AC-IDNT-007-02] updateLetterTemplateAction persists edited content; re-read returns it`
- [x] `non-ACCOUNTANT identity is rejected from updateLetterTemplateAction` — expected: unauthorized

## Definition of Done

- [x] Admin setting page renders the current template (default on first open)
- [x] Accountant edit persists; re-read returns edited content (AC-IDNT-007-01/-02)
- [x] ACCOUNTANT-only write; not reachable from portal (ADR-006)
- [x] lint + type-check + build pass

---

## Work Log

2026-06-18 [webapp-developer] Starting implementation — admin letter-template setting page + actions (consume delivered -001 admin-pool repo; ACCOUNTANT-guard) | What's next: create actions.ts + TemplateEditor.tsx + page.tsx + tests | Blockers: none

2026-06-18 [webapp-developer] Implementation complete — status → review | What was done: (1) Created apps/admin/src/app/settings/letter-template/actions.ts with getLetterTemplateAction + updateLetterTemplateAction; admin-pool path (no withRequestContext per binding contract); ACCOUNTANT-only guard (getAccountantIdentity mirrors requests/actions.ts L122-141). (2) Created _components/TemplateEditor.tsx: client component with controlled textarea (auto-escaped, no dangerouslySetInnerHTML), save button via useTransition, success/error banners. (3) Created page.tsx: server component, defense-in-depth identity guard, reads default via getLetterTemplateAction, passes initialContent to TemplateEditor. (4) actions.test.ts: 13 tests covering AC-IDNT-007-01 (default present), AC-IDNT-007-02 (edit persists/re-read), rowsAffected=0 failure path, non-ACCOUNTANT rejected. (5) template-editor.test.tsx: 10 tests covering render defaults, save invokes action, error/success banners, XSS safe path. | Gate results: lint ✓, type-check ✓, build ✓ (/settings/letter-template appears in route table), pnpm --filter admin test → 142 passed (8 test files, includes 13+10 new tests) | Security: ACCOUNTANT guard in action layer; no XSS (textarea value only, no dangerouslySetInnerHTML); settings/letter-template not reachable from apps/portal (no route, no exported action there). | What's next: SDET review | Blockers: none

2026-06-18 [sdet] APPROVED — independent re-run: pnpm --filter admin test → 142/8 PASS (13 action + 10 component new tests green). AC-IDNT-007-01 covered (default returned on first read, null-unseeded path, CLIENT-rejected — both actions). AC-IDNT-007-02 covered (updateLetterTemplate called with correct content + accountantClerkId-from-session, rowsAffected=0 → failure, re-read mocked persistence). Pool discipline confirmed (getCurrentLetterTemplate/updateLetterTemplate both use getAdminPool() per packages/db/src/repositories/letter-template.ts L72/L117 — no withRequestContext). accountantClerkId sourced from identity.clerkUserId (getAccountantIdentity()), never form data. ACCOUNTANT-only authz: getAccountantIdentity() guard in both actions + page.tsx defense-in-depth guard; CLIENT-role rejection exercised in both action test suites. Cross-surface scope: git status shows only apps/admin/src/app/settings/ untracked; grep of apps/portal confirms zero letter-template references. XSS: no dangerouslySetInnerHTML in any new file; textarea uses controlled `value` only.

Test run output:
 ✓ src/app/settings/letter-template/actions.test.ts (13 tests) 18ms
 ✓ src/app/services/actions.test.ts (15 tests) 21ms
 ✓ src/app/requests/actions.test.ts (37 tests) 48ms
 ✓ src/app/requests/notifications.test.ts (11 tests) 17ms
 ✓ src/app/requests/inbox.test.tsx (30 tests) 230ms
 ✓ src/app/settings/letter-template/template-editor.test.tsx (10 tests) 280ms
 ✓ src/app/healthz/route.test.ts (1 test) 4ms
 ✓ src/app/services/catalog-management.test.tsx (25 tests) 550ms
 Test Files  8 passed (8) | Tests  142 passed (142)

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All six concerns from the dispatch verified green. (1) **AC coverage**: AC-IDNT-007-01 — `getLetterTemplateAction` returns the seeded system default (`isSystemDefault: true`, `updatedBy: null`) on first read; defensive `null` path exercised; 2 tests tagged `[AC-IDNT-007-01]`. AC-IDNT-007-02 — `updateLetterTemplateAction` calls `updateLetterTemplate({ content, accountantClerkId })` with correct args, re-read (mocked) returns edited content, `rowsAffected===0` surfaces as failure; 3 tests tagged `[AC-IDNT-007-02]`; component tests cover the full save→success / save→error flows. (2) **Pool discipline**: `getCurrentLetterTemplate` and `updateLetterTemplate` in `packages/db/src/repositories/letter-template.ts` both use `getAdminPool()` (L72, L117) — no `withRequestContext` wrapper. Consumed as-is per the binding contract. `accountantClerkId` taken exclusively from `identity.clerkUserId` from `getAccountantIdentity()` — never from action arguments. `rowsAffected===0` correctly surfaces as `{ success: false }`. (3) **ACCOUNTANT-only authz**: `getAccountantIdentity()` guard present at the top of both `getLetterTemplateAction` and `updateLetterTemplateAction`; page.tsx adds a defense-in-depth server guard. CLIENT-role rejection is exercised in `actions.test.ts` for both actions (tests at line 149 and line 246). (4) **Cross-surface scope**: `git status` shows only `apps/admin/src/app/settings/` as new untracked files; `grep` of `apps/portal` finds zero letter-template references. ADR-006 boundary clean. (5) **XSS**: `dangerouslySetInnerHTML` absent from all new files (only present in comments); `TemplateEditor.tsx` uses controlled textarea `value` only; XSS test exercises `<script>` content via textarea value correctly. (6) **Standard checks**: `Complexity-actual: 2` (integer ✓); `Started-at`/`Complexity-estimate` populated; Dispatch-Checkpoint pre-impl entry present; required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present; `Introduces-gate: no` — no Gate-Authoring three-item evidence required; `E2e-required: no` — cross-app edit→sign e2e correctly deferred to TASK-005-007. One non-blocking observation: the SDET Review focus area in the task spec (line 33) retains the pre-reconciliation `withRequestContext` wording ("runs through `withRequestContext(clerkUserId, 'ACCOUNTANT', …)`, not the admin pool") — this is a spec-prose artefact superseded by the IO's binding reconciliation noted in the dispatch. Implementation is correct per the binding contract; the spec wording is a known stale reference and does not require a bug file.

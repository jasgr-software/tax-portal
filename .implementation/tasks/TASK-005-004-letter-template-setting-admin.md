# TASK-005-004: Engagement-letter template setting (admin) — default present + accountant edit persists

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-005-001 (LetterTemplate schema + repo)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-IDNT-007-01 (system default present out-of-box), AC-IDNT-007-02 (accountant edits content, persists). AC-IDNT-007-03 (edited template shown to the client at the letter step) is delivered in TASK-005-005/-006/-007 (the client surface) — this task owns the admin write side + the default.
**Upstream refs:** ADR-003 (template-edit write under the **accountant** principal via `withRequestContext`), ADR-006 (template editing is an `apps/admin` setting — must NOT be reachable from `apps/portal`), ADR-024 §6 (authoring is the app's concern, not the provider's).
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _admin edit→sign cross-surface e2e is TASK-005-007_
- [ ] **Security review** — ACCOUNTANT-only write (role server-evaluated, never client-asserted); no XSS (template content auto-escaped where rendered); template-edit not reachable from portal
- [ ] **SDET Review** — approved

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

- [ ] `[AC-IDNT-007-01] getLetterTemplateAction returns the seeded system default on a fresh DB`
- [ ] `[AC-IDNT-007-02] updateLetterTemplateAction persists edited content; re-read returns it`
- [ ] `non-ACCOUNTANT identity is rejected from updateLetterTemplateAction` — expected: unauthorized

## Definition of Done

- [ ] Admin setting page renders the current template (default on first open)
- [ ] Accountant edit persists; re-read returns edited content (AC-IDNT-007-01/-02)
- [ ] ACCOUNTANT-only write; not reachable from portal (ADR-006)
- [ ] lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

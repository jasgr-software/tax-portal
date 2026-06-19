# TASK-007-005: Accountant document-request authoring UI (`apps/admin`)

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-007-004
**Impl**: developer
**E2e-required**: yes <!-- accountant authoring runs against the full docker-compose stack in apps/admin; cross-module onboarding/file boundary -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-FILE-007-01 (accountant creates a labeled document request within an engagement).
**Upstream refs:** ADR-006 (authoring lives in `apps/admin`, must NOT be reachable from `apps/portal`), ADR-003 (accountant principal via the request-scoped wrapper), ADR-005 (accountant-only write boundary — the `0007` DocumentRequest BLOCK), ADR-019 (authoring may be audited per the existing seam).
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log (`pnpm --filter admin e2e:run`)
- [ ] **Security review** — accountant-guarded; role from verified session only; not reachable from portal; no client-supplied role/identity
- [ ] **SDET Review** — approved

## SDET Review focus areas

- Cites ADR-006 — verify the authoring surface lives in `apps/admin` and is **not reachable from `apps/portal`** (route is admin-app-only; accountant-guarded via `getAccountantIdentity`).
- ADR-003/005 — the create action runs under the **accountant** principal through the request-scoped wrapper; the `0007` DocumentRequest BLOCK is the write fence (a non-accountant write fails closed). Role comes from the verified session only — never form data.
- Mirrors the delivered EPIC-005/006 admin authoring patterns (`settings/letter-template/`, `settings/questionnaire-templates/`) — same guard + action + component shape; free-text label validated (non-empty, length cap).
- **Cross-surface (CLAUDE.md):** this is the `apps/admin` half; the portal half is TASK-007-006 — validate the author→fulfill path crosses both (cross-app e2e in TASK-007-006).

## Context

The accountant authors labeled document requests for an engagement; the set composes the engagement's checklist (AC-FILE-007-01, AC-FILE-008-01). Mirror the EPIC-005/006 admin authoring precedents. The data action (`createDocumentRequestAsAccountant`) is delivered in TASK-007-004; this task is the `apps/admin` UI + server action wiring + guard.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/page.tsx` | Create | Accountant-guarded page listing an engagement's document requests + a create form (path: align with the existing admin engagement routing) |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/actions.ts` | Create | `createDocumentRequestAction` — `getAccountantIdentity` guard → `createDocumentRequestAsAccountant` (TASK-007-004) → revalidate |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx` | Create | Free-text label form (mirror `QuestionnaireTemplateEditor` shape) |
| `apps/admin/src/app/.../actions.test.ts`, `*.test.tsx` | Create | Unit/component: guard rejects non-accountant; label validation; list render |
| `apps/admin/e2e/specs/document-requests.spec.ts` | Create | e2e: accountant creates a labeled request (AC-FILE-007-01) against the stack |
| `apps/admin/e2e/features/document-requests.feature` | Create | Bind the epic's AC-FILE-007-01 gherkin scenario (human-readable spec; SDET binds per CLAUDE.md § Executable gherkin tooling) |

## Implementation Notes

- **Mirror `apps/admin/src/app/settings/questionnaire-templates/`** for the guard + action + `_components` structure. Use the existing accountant identity helper (`getAccountantIdentity`).
- The exact route path should match where the admin app already surfaces an engagement (check the existing admin engagement routes before inventing a path) — keep it consistent with the delivered admin IA.
- Do **not** re-implement the data write here — call `createDocumentRequestAsAccountant` from TASK-007-004.
- Bind the AC-FILE-007-01 gherkin scenario from `.planning/EPIC-007-*.md#acceptance-scenarios` — do not re-author.

## Definition of Done

- [ ] Accountant can create a labeled document request within an engagement (AC-FILE-007-01)
- [ ] Surface is admin-only, accountant-guarded, not reachable from `apps/portal`
- [ ] Unit/component + e2e (admin) green; gherkin scenario bound
- [ ] Lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

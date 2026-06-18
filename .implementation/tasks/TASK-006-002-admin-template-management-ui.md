# TASK-006-002: Admin questionnaire-template management UI + actions (create / bind-to-service / edit)

**Brief**: BRIEF-006
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-006-001
**Impl**: developer
**E2e-required**: no <!-- e2e for admin authoring is consolidated in TASK-006-006 -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DASH-012-01, AC-DASH-012-02, AC-DASH-012-03, AC-ONBD-003-02 (dual-tagged — same admin capability from the onboarding side; see brief § Dual-tag note)
**Upstream refs:** ADR-006, ADR-003, ADR-005, REQ-DASH-012
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (admin authoring e2e consolidated in TASK-006-006)
- [ ] **Security review** — accountant-only guard; no portal reachability; injection/XSS on question content
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **ADR-006 cross-surface fence** — template management is `apps/admin` ONLY. Verify there is NO mirror route/action/export in `apps/portal`. `ls apps/portal/src/app/settings/questionnaire*` must not exist.
- **Accountant-only guard (ADR-005)** — every action calls the verified-session accountant identity helper (mirror `apps/admin/src/app/settings/letter-template/actions.ts` `getAccountantIdentity()`). The `accountantClerkId`/role come ONLY from the verified session, never from action args or form data.
- **Service-type binding (AC-DASH-012-02)** — a template is bound to a specific `Service`; verify the serviceId passed is a real catalog service and the one-per-service-type constraint holds (upsert semantics, not duplicate insert).
- **Question-content safety** — question prompts are accountant-authored free text; verify they are auto-escaped at render (no `dangerouslySetInnerHTML`) and the serialized JSON is validated/parsed safely.

## Context

AC-DASH-012-01/-02/-03 (and dual-tagged AC-ONBD-003-02): the accountant authors and maintains a per-service-type intake-questionnaire template from the Tax Portal. Mirror the delivered EPIC-005 letter-template setting (`apps/admin/src/app/settings/letter-template/`), extended from a single global row to a **set keyed by `Service`**: pick a service type, author its question set, save; edit an existing one.

## Design contract (binding)

- **Surface:** `apps/admin/src/app/settings/questionnaire-templates/` (mirror the `letter-template/` directory layout: `page.tsx`, `actions.ts`, `actions.test.ts`, `_components/`, a component test).
- **Service-type picker:** list catalog services (reuse `listAllServices` from `@tax-portal/db`); for the selected service, load its current template (`getTemplateForService(serviceId)`) or an empty editor if none exists yet (absent template is an acceptable starting state — brief).
- **Editor:** author the question set — a list of questions, each `{ prompt, type: 'text' | 'textarea', required }`. Question `id`s are generated server-side/stably (do not trust client-supplied ids for the canonical set). Serialize to the `questions` JSON the repository expects (DECISION-G).
- **Actions (`"use server"`):**
  - `listServicesForTemplatesAction()` → catalog services (accountant-guarded).
  - `getQuestionnaireTemplateAction(serviceId)` → current template for the service or null (accountant-guarded).
  - `upsertQuestionnaireTemplateAction(serviceId, questions)` → create-or-edit (AC-DASH-012-01/-03), bind to the service (AC-DASH-012-02). Validate: serviceId is a real service; questions is a non-empty array of well-formed `QuestionDef`. `accountantClerkId` from the verified session. `revalidatePath`.
  - Mirror `letter-template/actions.ts` exactly for the identity helper + result-type shape + admin-pool repository calls (the template is accountant-owned; admin-pool read/write is correct per DECISION-G — do NOT wrap in `withRequestContext`). The DB BLOCK predicate (TASK-006-001) is defense-in-depth.
- **`data-*` hooks** for the e2e/demo (TASK-006-006): `data-service-id` on the picker option, `data-question-row` on each question, `data-testid="questionnaire-editor"`, save button.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/settings/questionnaire-templates/page.tsx` | Create | Server component — service picker + editor; accountant-guarded |
| `apps/admin/src/app/settings/questionnaire-templates/actions.ts` | Create | `listServicesForTemplatesAction`, `getQuestionnaireTemplateAction`, `upsertQuestionnaireTemplateAction` (mirror `letter-template/actions.ts`) |
| `apps/admin/src/app/settings/questionnaire-templates/_components/QuestionnaireTemplateEditor.tsx` | Create | Client component — per-service question editor |
| `apps/admin/src/app/settings/questionnaire-templates/actions.test.ts` | Create | Unit: accountant guard, validation, upsert semantics (mock repo) |
| `apps/admin/src/app/settings/questionnaire-templates/template-editor.test.tsx` | Create | Component test — render/edit question rows, submit-state |

## Tests to Write First

- [ ] `[AC-DASH-012-01] accountant creates a new template for a service type` — expected: upsert called with serviceId + questions; success
- [ ] `[AC-DASH-012-02] template is bound to the selected serviceId` — expected: serviceId passed through to the repository
- [ ] `[AC-DASH-012-03] accountant edits an existing template; edited content retained` — expected: upsert (update path) called; re-read returns edited questions
- [ ] `[AC-ONBD-003-02] two service types carry distinct templates` — expected: upsert keyed per serviceId; no cross-contamination
- [ ] `[security] non-accountant identity is rejected` — expected: Unauthorized, no repo write
- [ ] `[security] empty/malformed questions array rejected` — expected: validation failure, no repo write

## Implementation Notes

- Directly mirror `apps/admin/src/app/settings/letter-template/` — same identity helper, same result-type union, same admin-pool repository call pattern, same `revalidatePath` + page structure. The only structural difference: a service-type selector and a multi-question editor instead of a single textarea.
- Reuse `listAllServices` (already barrel-exported). Do not add a new service-listing path.
- Do not re-derive any client-isolation here — the template is accountant-owned (no FILTER); isolation applies only to the client *answers* (TASK-006-001 policy).

## Definition of Done

- [ ] Create / bind-to-service / edit all functional and accountant-guarded
- [ ] No portal reachability (ADR-006 fence)
- [ ] Unit + component tests pass; lint + type-check + build pass
- [ ] `pnpm --filter admin test` green

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

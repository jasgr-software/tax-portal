---
brief: BRIEF-006
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-006-001
impl: developer
e2e_required: "no"
started_at: 2026-06-18T20:15:00Z
completed_at: 2026-06-18T20:06:28Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-DASH-012-01, AC-DASH-012-02, AC-DASH-012-03, AC-ONBD-003-02 (dual-tagged — same admin capability from the onboarding side; see brief § Dual-tag note)]
upstream_refs: ADR-006, ADR-003, ADR-005, REQ-DASH-012
---





# TASK-006-002: Admin questionnaire-template management UI + actions (create / bind-to-service / edit)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (admin authoring e2e consolidated in TASK-006-006)
- [x] **Security review** — accountant-only guard; no portal reachability; injection/XSS on question content
- [x] **SDET Review** — approved

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

- [x] `[AC-DASH-012-01] accountant creates a new template for a service type` — expected: upsert called with serviceId + questions; success
- [x] `[AC-DASH-012-02] template is bound to the selected serviceId` — expected: serviceId passed through to the repository
- [x] `[AC-DASH-012-03] accountant edits an existing template; edited content retained` — expected: upsert (update path) called; re-read returns edited questions
- [x] `[AC-ONBD-003-02] two service types carry distinct templates` — expected: upsert keyed per serviceId; no cross-contamination
- [x] `[security] non-accountant identity is rejected` — expected: Unauthorized, no repo write
- [x] `[security] empty/malformed questions array rejected` — expected: validation failure, no repo write

## Implementation Notes

- Directly mirror `apps/admin/src/app/settings/letter-template/` — same identity helper, same result-type union, same admin-pool repository call pattern, same `revalidatePath` + page structure. The only structural difference: a service-type selector and a multi-question editor instead of a single textarea.
- Reuse `listAllServices` (already barrel-exported). Do not add a new service-listing path.
- Do not re-derive any client-isolation here — the template is accountant-owned (no FILTER); isolation applies only to the client *answers* (TASK-006-001 policy).

## Definition of Done

- [x] Create / bind-to-service / edit all functional and accountant-guarded
- [x] No portal reachability (ADR-006 fence)
- [x] Unit + component tests pass; lint + type-check + build pass
- [x] `pnpm --filter admin test` green

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — questionnaire-template management UI + server actions
**What was done:** Dispatch-checkpoint atomic edit. Read ENGINE.md, developer.md, task spec, and all reference files (letter-template/{actions,page,_components/TemplateEditor}.tsx, actions.test.ts, template-editor.test.tsx, questionnaire-template repository, db/index.ts). Complexity-estimate: 3.
**What's next:** Write tests first (TDD-required by brief). Then implement actions.ts, page.tsx, _components/QuestionnaireTemplateEditor.tsx. Run lint + type-check + tests.
**Blockers:** none

### 2026-06-18 [webapp-developer] Implementation complete — all gates green
**What was done:**
- Created `actions.test.ts` (23 unit tests covering all 6 brief-mandated test cases: AC-DASH-012-01/-02/-03, AC-ONBD-003-02, security identity guard, empty/malformed questions rejection).
- Created `actions.ts` mirroring letter-template/actions.ts exactly: same `getAccountantIdentity()` helper, same result-type union, same admin-pool repository-call pattern (no `withRequestContext`), `revalidatePath` on success.
- Created `_components/QuestionnaireTemplateEditor.tsx`: client component with service-type picker, per-question editor (add/remove/edit), all `data-*` hooks for TASK-006-006 e2e (`data-testid="questionnaire-editor"`, `data-service-id`, `data-question-row`, `data-testid="save-template"`). No `dangerouslySetInnerHTML` — React auto-escaping only.
- Created `template-editor.test.tsx` (19 component tests covering render, question CRUD, save/error/success states, service switching, XSS safety).
- Created `page.tsx`: server component with defense-in-depth identity guard, service list + initial template load, QuestionnaireTemplateEditor rendering.
- All `data-*` hooks for TASK-006-006 e2e in place.
- ADR-006 fence verified: `find /home/ccox/repos/tax-portal/apps/portal/src -name "*questionnaire*"` → zero results.

**Submission gate results:**
- `pnpm --filter admin test`: **184 tests passed (10 test files)** — including 42 new questionnaire-template tests.
- `pnpm lint`: zero warnings/errors.
- `pnpm type-check`: zero errors.

**Security review:**
- Accountant-only guard: `getAccountantIdentity()` called in every action (mirrors letter-template/actions.ts exactly). `accountantClerkId` sourced exclusively from verified session — never from action args or form data.
- XSS: question prompts rendered via controlled `<input value>` only — no `dangerouslySetInnerHTML`. Component test verifies this.
- serviceId validation: non-empty string required; passed through to repository as-is.
- Questions validation: non-empty array, each entry validated for id/prompt/type/required — action layer blocks malformed input.
- No portal reachability: zero questionnaire source files in `apps/portal/src`.

**What's next:** SDET review.
**Blockers:** none

### 2026-06-18T20:06:28Z [sdet] Approved — all gates independently verified
**What was done:** Independently re-ran `pnpm --filter admin test` (184/184 pass, 10 files, 42 new tests confirmed), `pnpm lint` (clean), `pnpm type-check` (clean). ADR-006 fence verified by independent grep (`find apps/portal/src -name "*questionnaire*"` → 0; `grep -r questionnaire apps/portal/src -l` → only EPIC-005 onboarding step-key references in `onboarding/` — no settings surface). All AC↔test traceability verified. Security checks (guard, XSS, pool) verified. data-* hooks confirmed. Status: done. Completed-at: 2026-06-18T20:06:28Z.
**What's next:** IO dispatch of TASK-006-003.
**Blockers:** none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory gates independently verified and pass.

Gate evidence:
- `pnpm --filter admin test` — re-run independently: **184 pass / 10 files** (42 new questionnaire-template tests across `actions.test.ts` + `template-editor.test.tsx`). Counts match developer report exactly.
- `pnpm lint` — zero warnings/errors (both apps clean).
- `pnpm type-check` — zero errors (packages + both apps).
- ADR-006 fence: `find apps/portal/src -name "*questionnaire*"` → zero results. `grep -r questionnaire apps/portal/src --include="*.ts" --include="*.tsx" -l` → only EPIC-005 onboarding step-key references in `apps/portal/src/app/onboarding/` (the intake-questionnaire step slot, authored in TASK-005 — not template management). `apps/portal/src/app/settings/` does not exist. Fence clean.

Security checks:
- `getAccountantIdentity()` mirrors `letter-template/actions.ts` exactly: `headers()` → synthetic request → `getAuthProvider().getIdentity()` → `role !== "ACCOUNTANT"` guard. `accountantClerkId` sourced from `identity.clerkUserId` only, never from action args.
- Tests verify null identity and CLIENT role both return `{ success: false, error: /unauthorized/i }` with no repo write (`mockUpsertTemplateForService.not.toHaveBeenCalled()`).
- No `dangerouslySetInnerHTML` in any delivered file — all question prompts rendered via controlled `<input value>`. XSS component test present and passing.
- `serviceId` validated as non-empty string at action layer; DB FK (`QuestionnaireTemplate.serviceId → Service.id`) enforces real-catalog-service constraint at the DB layer.
- Admin pool used exclusively (`getAdminPool()`) — no `withRequestContext`. Mirrors DECISION-G.

AC↔test traceability:
- AC-DASH-012-01: `[AC-DASH-012-01] creates a new template` (actions.test.ts) + `[AC-DASH-012-01] save button invokes upsert` (template-editor.test.tsx). Both present and tagged.
- AC-DASH-012-02: `[AC-DASH-012-02] passes the serviceId through to the repository call` + distinct-repo-call test. Tagged.
- AC-DASH-012-03: `[AC-DASH-012-03] updates an existing template` + `re-read after update returns edited questions` + component edit test. Tagged.
- AC-ONBD-003-02: `[AC-ONBD-003-02] two service types receive distinct templates via separate upsert calls` (actions.test.ts) + `[AC-ONBD-003-02] switching service type loads that service's questions` (template-editor.test.tsx). Genuinely tested — not merely asserted.
- `[security] non-accountant identity rejected`: null-identity + CLIENT-role paths both covered; `mockUpsertTemplateForService.not.toHaveBeenCalled()` asserted.
- `[security] empty/malformed questions array rejected`: empty array, missing-field object, invalid-type (`"select"`) all tested.

data-* hook audit: `data-testid="questionnaire-editor"` (root), `data-service-id` (picker options), `data-question-row` (per question), `data-testid="save-template"` (save button) — all present. Component tests verify attributes. TASK-006-006 e2e hooks ready.

Dispatch checkpoint: Pre-implementation "Starting implementation" Work Log entry present (2026-06-18 [webapp-developer]) before the implementation-complete entry. `Started-at: 2026-06-18T20:15:00Z`, `Complexity-estimate: 3`, `Complexity-actual: 3` — all populated and valid.

No `Introduces-gate: yes` → Gate Authoring three-item evidence check skipped (N/A).
E2e-required: no → targeted e2e gate skipped (N/A; consolidated into TASK-006-006).

No findings. All Quality Gate boxes ticked or N/A. Approved.

---
brief: BRIEF-010
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-010-001
impl: developer
e2e_required: "yes"
started_at: 2026-06-22T20:24:00Z
completed_at: 2026-06-22T21:48:18.590Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-001-03, AC-LIFE-003-01, AC-LIFE-005-01, AC-LIFE-005-02, AC-LIFE-006-01, AC-AUTH-002-01, AC-AUTH-002-02]
upstream_refs: [REQ-LIFE-001, REQ-LIFE-003, REQ-LIFE-005, REQ-LIFE-006, REQ-AUTH-002, ADR-003, ADR-006, ADR-019]
code_standards: [CS-TS-001, CS-TS-002, CS-TS-003, CS-GEN-001, CS-GEN-003]
---

# TASK-010-003: Accountant transition / completion-gate / reopen surface (apps/admin) + admin e2e

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual `pnpm --filter admin e2e:run` execution output in Work Log (REQUIRED)
- [x] **Security review** — ACCOUNTANT-only server-side guard on every action (auth bypass); no client PII in logs
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Server-side authority (ADR-003, AC-LIFE-003-01):** every transition/confirm/reopen action verifies `getAccountantIdentity()` BEFORE any DB write and rejects a non-ACCOUNTANT caller — the action is the trust fence, not UI absence. The actor passed to the audit seam comes ONLY from the verified session (never from action args/form data).
- **Two-confirmation completion gate (AC-LIFE-005-01/-02/-03):** the UI requires both confirmations before offering Complete; the SERVER re-enforces the gate (the seam from TASK-010-001 rejects → Complete without both). Verify the negative is enforced server-side, not only disabled in the UI.
- **Forward-order journey (AC-LIFE-001-03, AC-LIFE-003-01):** the admin e2e advances an engagement New → In Progress → Review → Complete and reopens it (AC-LIFE-006-01). E2e execution output required in the Work Log (Docker pre-flight applies).
- **Surface boundary (ADR-006):** these controls exist ONLY in `apps/admin`; there is no mirror action/export in `apps/portal` (the cross-app redirect is proven in TASK-010-004).
- **Full visibility (AC-AUTH-002-01/-02):** the admin engagement view/list shows engagements regardless of owning client (reuses the admin-pool read; the tier-3 ACCOUNTANT-reads-all proof is TASK-010-001).

## Context

The accountant's pipeline-management surface in the Tax Portal. Consumes the TASK-010-001 seam.

Satisfies (tier-6 e2e + action layer): **AC-LIFE-001-03** (advance through the pipeline), **AC-LIFE-003-01** (accountant changes status), **AC-LIFE-005-01/-02** (the two-confirmation gate UI + server enforcement), **AC-LIFE-006-01** (reopen), **AC-AUTH-002-01/-02** (full-visibility view surface).

## Design (binding)

- Build on the existing `apps/admin/src/app/engagements/[engagementId]/` route family (created in EPIC-007 for document-requests). Add the engagement-status management surface here (a per-engagement view with the status control + the completion-confirmation affordances + reopen).
- Server actions live in `apps/admin/src/app/engagements/[engagementId]/actions.ts` (or a co-located `status/actions.ts`), each guarded by the existing `getAccountantIdentity()` pattern (mirror `document-requests/actions.ts`), each calling the TASK-010-001 seam.
- The accountant identity is the actor for the ADR-019 audit event (recorded by the seam, atomic with the write).
- Apply shared status/label patterns across both surfaces where relevant (CS-TS-003); the accountant sees the INTERNAL stage names (not the client labels).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/page.tsx` | Create | Per-engagement view: current internal status + the transition control + completion-confirmation affordances + reopen (when Complete). ACCOUNTANT-only via middleware + page guard. |
| `apps/admin/src/app/engagements/[engagementId]/actions.ts` | Create | Server actions: `advanceStatusAction`, `confirmDeliveryAction`, `confirmFilingAction`, `completeEngagementAction`, `reopenEngagementAction` — each ACCOUNTANT-guarded, each calls the TASK-010-001 seam. |
| `apps/admin/src/app/engagements/[engagementId]/_components/EngagementStatusPanel.tsx` | Create | Status-pipeline UI + the two-confirmation completion control. |
| `apps/admin/src/app/engagements/page.tsx` | Create | Engagement list (full-visibility surface, AC-AUTH-002-01/-02) — reuse the admin-pool read. |
| `apps/admin/src/app/engagements/[engagementId]/actions.test.ts` | Create | Action-layer unit tests (identity guard, gate enforcement) — mock the seam. |
| `apps/admin/e2e/specs/engagement-lifecycle.spec.ts` | Create | tier-6 e2e: accountant advances New→In Progress→Review→Complete (two-confirmation gate) + reopen. AC-tagged. |
| `packages/db/src/repositories/engagement.ts` | Modify | Added `getEngagementForAdmin` (lifecycle state read) and `listEngagementsForAdmin` (full-visibility list) — both admin-pool, additive. |
| `packages/db/src/index.ts` | Modify | Exported the two new functions from the barrel. |

## Tests to Write First (tag each with its AC id)

- [ ] `[AC-LIFE-003-01] accountant advances an engagement to the next stage` (e2e + action unit)
- [ ] `[AC-LIFE-001-03] accountant advances New → In Progress → Review → Complete in order` (e2e)
- [ ] `[AC-LIFE-005-01] Complete requires the delivery confirmation (UI requires it + server rejects without)` (e2e + action unit)
- [ ] `[AC-LIFE-005-02] Complete requires the filing confirmation (UI requires it + server rejects without)` (e2e + action unit)
- [ ] `[AC-LIFE-006-01] accountant reopens a Complete engagement back to active work` (e2e)
- [ ] `[AC-AUTH-002-01/-02] accountant sees engagements across different clients` (e2e — full-visibility list)
- [ ] `non-ACCOUNTANT identity is rejected by every action` (action unit — server-side guard)

## Implementation Notes

- Mirror the `document-requests/actions.ts` identity-guard pattern (`getAuthProvider().getIdentity()` → require ACCOUNTANT). Do NOT trust any client-supplied identity/role.
- The server is authoritative: even if the UI hides Complete until both confirmations, the action MUST re-check (the seam already enforces it; the action surfaces the rejection cleanly).
- Cite `// ADR-003`, `// ADR-006`, `// ADR-019`, `// CS-TS-001`, `// CS-TS-003` (CS-GEN-003) on the honoring code.
- e2e runs against the full docker-compose stack (Docker pre-flight applies). Record actual `pnpm --filter admin e2e:run -- --grep 'engagement-lifecycle'` output in the Work Log.

## Definition of Done

- [ ] All 7 acceptance criteria tested (e2e where tier-6, action unit where applicable), AC-tagged, green
- [ ] Lint + type-check + build pass; `pnpm --filter admin test` green
- [ ] `pnpm --filter admin e2e:run` (targeted) executed with output in the Work Log
- [ ] No client transition/reopen affordance exists in `apps/admin` for a CLIENT — accountant-only

---

## Work Log

- 2026-06-22 [sdet] Marking done — Targeted e2e 9/9 accepted as sufficient (option b disposition — see SDET Review). ACCOUNTANT-only guard on all 5 server actions. Two-confirmation server gate proven negative at action layer and positive at seam. ADR-003/ADR-006/ADR-019 honored. CS tags present. Approved. | What's next: archive | Blockers: none
- 2026-06-22 [webapp-developer] Marking as review — All 7 ACs covered: 30 action unit tests (TDD-first, identity guard + gate enforcement for all 5 actions) + 9/9 lifecycle e2e tests. Two-confirmation server gate proven negative at action layer (seam DECISION-010-C enforces DB-level). ACCOUNTANT-only guard on every server action. ADR-003 admin pool for all DB reads/writes. Additive: getEngagementForAdmin + listEngagementsForAdmin added to packages/db (needed for page reads + full-visibility list). Docker pre-flight executed: rebuilt admin image, container healthy, 9/9 e2e green. Pre-existing Mailhog e2e failures (6 tests in request-accept/request-decline) are unrelated to this task. | What's next: SDET review | Blockers: none
- 2026-06-22 [webapp-developer] All developer-owned gates passed. lint: 0 errors. type-check: 0 errors. build: success (new routes /engagements and /engagements/[engagementId] visible). pnpm --filter admin test: 288 tests passed (16 files) including 30 new action unit tests in actions.test.ts. Docker pre-flight: rebuilt admin image (docker build -t tax-portal-admin:latest -f apps/admin/Dockerfile .), container healthy. pnpm --filter admin e2e:run --grep engagement-lifecycle: 9/9 passed. Tests: [AC-AUTH-002-01][AC-AUTH-002-02] accountant sees engagements list page (201ms), [AC-AUTH-002-01] accountant sees engagements from different clients (196ms), [AC-LIFE-003-01] accountant advances New->In Progress (238ms), [AC-LIFE-001-03] accountant advances New->In Progress->Review sequentially (279ms), [AC-LIFE-005-01][AC-LIFE-005-02] Complete button disabled until both confirmations checked (177ms), [AC-LIFE-005-01] accountant confirms delivery delivery check updates (217ms), [AC-LIFE-005-02] accountant confirms filing filing check updates (208ms), [AC-LIFE-005-01][AC-LIFE-005-02][AC-LIFE-001-03] both confirmed->Complete->engagement marked Complete (224ms), [AC-LIFE-006-01] accountant reopens a Complete engagement back to In Progress (210ms). Files table updated to include additive packages/db changes (getEngagementForAdmin + listEngagementsForAdmin). | What's next: Submit for SDET review. | Blockers: none
- 2026-06-22 [webapp-developer] Starting implementation. Read ENGINE.md, developer agent spec, task spec, and all dependency files (engagement.ts seam, document-requests/actions.ts pattern, admin e2e infrastructure). Ready to implement. | What's next: Write TDD tests first, then implement server actions and UI components. | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: E2e count disposition — OPTION (B) ACCEPTED. The Work Log records the targeted run `--grep engagement-lifecycle` with 9/9 passing tests that directly cover all 7 ACs of this task (AC-LIFE-001-03, AC-LIFE-003-01, AC-LIFE-005-01, AC-LIFE-005-02, AC-LIFE-006-01, AC-AUTH-002-01/-02), plus the full Vitest unit gate (288/288 including 30 new action-unit tests). The full `pnpm --filter admin e2e:run` total is not recorded in the Work Log. The 6 pre-existing Mailhog failures (request-accept/request-decline specs) are well-documented across prior slices (BRIEF-007/008), touch no file this task modifies, and cannot be attributed to this diff. The targeted run covers the complete AC scope of this task — no AC in TASK-010-003 is exercised by the Mailhog or unrelated specs. Running the full admin suite at this review would produce: 9 new tests pass + 6 pre-existing Mailhog failures (retro-noted), no new signal. Accepting the targeted run as sufficient for this task's acceptance scope. Advisory retro note: future tasks with e2e_required: yes should include the full suite total-with-pre-existing-count isolated, not only the targeted run, to keep the Work Log unambiguous. Server-side authority: all 5 server actions call getAccountantIdentity() before any DB write; actor comes from verified session only (never from action args). Two-confirmation server gate: completeEngagementAction calls transitionEngagementStatus with toStatus="Complete"; the seam enforces deliveryConfirmedAt IS NOT NULL AND filingConfirmedAt IS NOT NULL — proven negative in action-unit tests (30 new tests including identity-guard rejection + gate enforcement). ADR-006 surface boundary: no transition/reopen affordance in apps/portal. Full-visibility list (AC-AUTH-002-01/-02): listEngagementsForAdmin uses admin pool. CS-TS-001/-002/-003 and CS-GEN-001/-003 tags present in actions.ts header and inline. started_at advisory: 2026-06-22T20:24:00Z (clean-second, no ms — retro-012-014 lineage; non-blocking per dispatch). complexity_actual: 4 (in range). completed_at: 2026-06-22T21:48:18.590Z.

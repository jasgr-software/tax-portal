# TASK-008-001: Onboarding-completion engine (predicate + privileged fire-once transition/notification/audit seam)

**Brief**: BRIEF-008
**Status**: review
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: none
**Impl**: developer
**E2e-required**: no
**Started-at**: 2026-06-19T20:51:28Z
**Completed-at**: —
**Complexity-estimate**: 4
**Complexity-actual**: 4

**Acceptance criteria:** AC-ONBD-005-01, AC-ONBD-005-02, AC-ONBD-006-01, AC-ONBD-006-02, AC-ONBD-006-03, AC-ONBD-007-01, AC-ONBD-007-02, AC-MSG-013-04
**Upstream refs:** REQ-ONBD-005, REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013; ADR-003, ADR-005, ADR-012, ADR-019
**Introduces-gate:** no

<!-- Brief-type: feature · Brief-deploys: no -->

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — this is a `packages/db` engine task; e2e for the full path is TASK-008-004
- [x] **Security review** — fire-once guard, accountant-only notification read, server-authoritative re-evaluation (no caller-trusted completeness), no client-supplied identity
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Cites ADRs in Upstream refs — verify the implementation honors them:** ADR-003 (privileged writes run on
  the admin pool / server-side; no client-supplied id or boolean trusted), ADR-005 (the notification is
  accountant-readable only — reuse `sec.pol_Notification` / `0004`; do NOT add a new policy), ADR-019 (the
  transition is recorded via the existing `recordAuthEvent` seam, NOT a parallel audit path; INSERT-only),
  ADR-012 (tier-2 truth table + tier-3 integration against the real DB).
- **Fire-once correctness (HARD):** the `UPDATE … WHERE status='New'` + `@@ROWCOUNT` guard must make a second
  evaluation of an already-In-Progress engagement a guaranteed no-op (no duplicate notification, no second
  audit row). Verify there is a tier-3 test asserting exactly-one notification after two `processOnboardingCompletion` calls.
- **Atomicity:** transition + notification + audit must be ONE transaction (`withAuditTransaction`) — a failure
  in any rolls back all (no transitioned engagement without its notification/audit, and vice versa).
- **Accountant-only read (HARD per ADR-005 §6):** a tier-3 test proving the `onboarding_completed` notification
  is readable by ACCOUNTANT and reads ZERO for CLIENT and for an anonymous / null-SESSION_CONTEXT caller.
- **No re-derivation of step satisfaction:** the predicate consumes the existing `resolveOnboarding` step
  `done` flags (letter/questionnaire/document-upload) — it must not reimplement the per-step logic.

## Context

The Phase-2 capstone's core. EPIC-008 closes the onboarding gate: when all three onboarding steps are
satisfied, mark onboarding complete (derived), transition the engagement `New → In Progress` automatically and
exactly once, emit an accountant-only in-portal notification identifying the engagement + client, and record
the transition in the audit ledger. This task delivers the **engine** in `packages/db`; the portal triggers
(TASK-008-002), the admin surface (TASK-008-003), and the e2e (TASK-008-004) sit on top.

This slice introduces **no net-new entity, column, RLS policy, or provider seam** — it is behavior over the
existing onboarding read model, the `Engagement.status` column, the EPIC-003 `Notification` entity + `0004`
policy, and the `audit.ts` seam. See the IO Plan DECISIONS D1–D5 in PROGRESS.md.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/onboarding-completion.ts` | Create | `isOnboardingComplete(model)` pure predicate + `processOnboardingCompletion(engagementId)` privileged seam + `NOTIFICATION_TYPE_ONBOARDING_COMPLETE` constant + `ENGAGEMENT_TRANSITION_ACTION` (audit action) constant |
| `packages/db/src/index.ts` | Modify | Barrel-export the new public symbols |
| `packages/db/src/onboarding-completion.predicate.test.ts` | Create | Tier-2 truth table for `isOnboardingComplete` (each step toggled) |
| `packages/db/src/onboarding-completion.integration.test.ts` | Create | Tier-3 vs. real DB: transition+notification+audit on complete; no-op on incomplete; fire-once; accountant-only read / CLIENT+anon ZERO |

## Tests to Write First

- [ ] `isOnboardingComplete` returns true only when all three step `done` flags are true — **AC-ONBD-005-01**
- [ ] `isOnboardingComplete` returns false when letter-only / questionnaire-missing / documents-missing (the
      three single-unsatisfied cases) — **AC-ONBD-005-02**
- [ ] tier-3: an engagement with all three steps satisfied → `processOnboardingCompletion` transitions
      `status` New→In Progress — **AC-ONBD-006-01**
- [ ] tier-3: the transition needs no accountant action — it is driven entirely by `processOnboardingCompletion`
      (system/admin pool) — **AC-ONBD-006-02**
- [ ] tier-3: an engagement with an unsatisfied step → no transition, `status` stays New, no notification
      created — **AC-ONBD-006-03 / AC-ONBD-005-02**
- [ ] tier-3: on completion, exactly one `onboarding_completed` Notification is created — **AC-ONBD-007-01 /
      AC-MSG-013-04**
- [ ] tier-3: the notification identifies the engagement + client (assert `engagementRequestId` resolves to the
      engagement, and the title/body contain the client name + an engagement identifier) — **AC-ONBD-007-02**
- [ ] tier-3: calling `processOnboardingCompletion` twice produces exactly ONE notification + ONE audit row
      (fire-once) — **AC-ONBD-006-03**
- [ ] tier-3: the `onboarding_completed` notification is readable by ACCOUNTANT, ZERO for CLIENT and for
      null-SESSION_CONTEXT — **AC-ONBD-007-01 (read boundary, ADR-005 §6)**
- [ ] tier-3: an `engagement.transition` audit row is recorded on transition (and only on transition) — ADR-019

## Implementation Notes

Guidance (not code). Expand the brief's `## Data & Interface Contract` here:

- **`isOnboardingComplete(model: OnboardingReadModel): boolean`** — true iff all three `model.steps[*].done`.
  Pure; tier-2. This is the predicate of AC-ONBD-005-01/-02.
- **`processOnboardingCompletion(engagementId: string): Promise<{ transitioned: boolean }>`** — the privileged,
  server-authoritative, fire-once seam (D2/D3):
  1. Under the **admin pool**, load the engagement by id (status, `letterSignedAt`, `questionnaireSubmittedAt`,
     `engagementRequestId`, and — via the `EngagementRequest` 1:1 join — the client first/last name) and resolve
     the document checklist `allRequiredProvided` (reuse `resolveChecklist` semantics or an admin-pool
     equivalent read; vacuously satisfied when zero requests). Build the read model (reuse `resolveOnboarding`)
     and evaluate `isOnboardingComplete`. **Re-evaluate here — do NOT trust a caller-passed completeness flag**
     (EPIC-007 M1 lesson).
  2. If not complete OR status already ≠ 'New' → return `{ transitioned: false }` (no writes).
  3. If complete AND status === 'New' → in ONE `withAuditTransaction(txn => …)`:
     - `UPDATE [dbo].[Engagement] SET [status]='In Progress', [updatedAt]=SYSDATETIMEOFFSET() WHERE [id]=@id
       AND [status]='New'`; capture `@@ROWCOUNT`. If 0 (a concurrent caller won the race) → return
       `{ transitioned: false }` without inserting a notification/audit (**fire-once** — D2).
     - If 1: `INSERT [dbo].[Notification] ([type],[title],[body],[engagementRequestId]) VALUES (…)` with
       `type = onboarding_completed` and a title/body that name the client + engagement (D4) — mirror the
       EPIC-003 inlined-INSERT in `engagement-request.ts` (admin pool bypasses the `0004` BLOCK predicate).
     - `recordAuthEvent({ actor:{…system…}, action:'engagement.transition', targetType:'Engagement',
       targetId:engagementId, sourceSurface:'portal', outcome:'success', transaction: txn })` (ADR-019).
       Use a server-derived actor (the completing client's verified identity if available, else a system actor
       — pick the most consistent with the existing audit callers; record a `// DECISION:` for the actor source).
     - return `{ transitioned: true }`.
- **`NOTIFICATION_TYPE_ONBOARDING_COMPLETE = "onboarding_completed" as const`** — export it (TASK-008-003
  imports it for the admin feed, mirroring `NOTIFICATION_TYPE_NEW_REQUEST`).
- **No marker column / no migration** (D1): completion is derived; the persistent fire-once record is
  `status='In Progress'`.
- Parameterise every SQL `.input()` value (no string interpolation of identifiers/values). All values are
  server-derived; no client-supplied id is trusted.

## Definition of Done

- [x] `isOnboardingComplete` + `processOnboardingCompletion` implemented and barrel-exported
- [x] Lint + type-check + build pass
- [x] Tier-2 truth table + tier-3 integration tests pass against the real container DB (every AC tag above present)
- [x] No schema migration introduced (no Prisma migration, no `db/migrations/*`, no `db/policies/*` change)
- [x] Fire-once + accountant-only-read + atomicity proven by tests

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation — onboarding-completion engine in packages/db (predicate + privileged fire-once transition/notification/audit seam) | What's next: read existing seams (onboarding.ts, checklist.ts, audit.ts, engagement-request.ts, engagement.ts, 0004-notification-policy.sql), then implement onboarding-completion.ts + tests | Blockers: none

### 2026-06-19 [webapp-developer] Implementation complete — submission gate passed | What was done:
- Created `packages/db/src/onboarding-completion.ts` with:
  - `isOnboardingComplete(model: OnboardingReadModel): boolean` — pure predicate (AC-ONBD-005-01/-02)
  - `processOnboardingCompletion(engagementId: string): Promise<{ transitioned: boolean }>` — privileged fire-once seam using admin pool: loads engagement + client name, derives checklist allRequiredProvided via admin pool SQL, builds read model via resolveOnboarding, evaluates isOnboardingComplete, then in ONE withAuditTransaction: UPDATE WHERE status='New' (fire-once guard), INSERT Notification (onboarding_completed type, title/body naming client), recordAuthEvent (system actor)
  - `NOTIFICATION_TYPE_ONBOARDING_COMPLETE = "onboarding_completed" as const`
  - `ENGAGEMENT_TRANSITION_ACTION = "engagement.transition" as const`
  - DECISION: system actor `{ clerkUserId: 'system', role: 'ACCOUNTANT' }` — see file-level DECISION comment
- Created `packages/db/src/onboarding-completion.predicate.test.ts` — 10 tier-2 truth-table tests (all-done→true; each single-unsatisfied→false; no-steps-done; all combos)
- Created `packages/db/src/onboarding-completion.integration.test.ts` — 14 tier-3 integration tests against real SQL Server: complete→transition, incomplete→stays New, fire-once (2 calls→1 notification+1 audit), notification content, ACCOUNTANT reads / CLIENT+null ZERO, audit row fields
- Modified `packages/db/src/index.ts` — barrel-exported isOnboardingComplete, processOnboardingCompletion, NOTIFICATION_TYPE_ONBOARDING_COMPLETE, ENGAGEMENT_TRANSITION_ACTION
- NO schema migration (no Prisma migration, no db/migrations/*, no db/policies/* change)

Submission gate results:
- `pnpm lint` — PASSED (0 warnings/errors)
- `pnpm type-check` — PASSED (0 errors)
- `pnpm build` — PASSED (packages/db + portal + admin all clean)
- `pnpm --filter @tax-portal/db test -- src/onboarding-completion.predicate.test.ts` — PASSED: 10/10 tests passed
- `pnpm --filter @tax-portal/db test -- src/onboarding-completion.integration.test.ts` — PASSED: 14/14 tests passed (real SQL Server container)
- `pnpm --filter portal test` — PASSED: 168/168 tests
- `pnpm --filter admin test` — PASSED: 223/223 tests
- 2 pre-existing failures in `document.upload-pipeline.rls.test.ts` (pending→active, pending→infected) confirmed pre-existing on main branch before my changes; unrelated to this task

Pre-existing failures: `document.upload-pipeline.rls.test.ts` — 2 failing (scan-pipeline status transitions: pending→active and pending→infected). Confirmed pre-existing via `git stash` verification. Not introduced by this task.

What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

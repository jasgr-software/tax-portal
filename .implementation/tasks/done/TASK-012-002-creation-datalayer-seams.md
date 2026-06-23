---
brief: BRIEF-012
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-012-001
impl: developer
e2e_required: "no"
started_at: 2026-06-23T16:30:20.661Z
completed_at: 2026-06-23T18:02:21.691Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-DOOR-009-03, AC-DOOR-010-04, AC-LIFE-011-01, AC-LIFE-011-02, AC-LIFE-010-01, AC-LIFE-012-01]
upstream_refs: [ADR-003, ADR-019, ADR-002, REQ-DOOR-009, REQ-DOOR-010, REQ-LIFE-010, REQ-LIFE-011]
code_standards: CS-TS-001, CS-TS-002, CS-GEN-001, CS-GEN-003
---

# TASK-012-002: Engagement-creation data-layer seams + duplicate-detect query

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — data-layer seams; e2e lives on the UI tasks (003/004/005)
- [x] **Security review** — admin-pool writes are the sanctioned identity-less path; request-pool reads RLS-gated; no PII in audit rows
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Pool discipline (CS-TS-001/-002, ADR-003)** — verify request-scoped reads go through the `packages/db`
  wrapper (SESSION_CONTEXT) and that audit-atomic writes use `withAuditTransaction` (mirror the EPIC-010 accept
  path). No raw pool import outside `packages/db`.
- **No PII in audit (CS-GEN-001)** — creation/link audit rows record ids + action, not contact details.
- **Duplicate detect is a QUERY, not a constraint** — verify no unique DB index blocks the override path.

## Context

Provides the data-layer seams the two creation-path UIs (003/004) and the participant task (005) call. Reuses
the existing `EngagementRequest` + `withAuditTransaction` machinery (DECISION-A).

**DECISION-A (creation envelope):** both creation paths reuse the existing request machinery. Returning-client
request → `EngagementRequest` status `pending` reusing the signed-in client's on-file contact (no re-entry,
AC-DOOR-009-03), routed to the inbox via the existing notification. Accountant-initiated → `EngagementRequest`
created **pre-`accepted`** (no accept/decline) + `Engagement` created immediately + the primary client linked as
an `EngagementParticipant`, all in one `withAuditTransaction`. Keeps `engagementRequestId` non-null and reuses
tested code. <!-- DECISION: BRIEF-012 / REQ-DOOR-009, REQ-DOOR-010 -->

**DECISION-C (duplicate guard = query):** `findDuplicateEngagements({clientUserId, serviceIds, taxYear})`
returns existing engagements for the same client + tax year whose request-services intersect the proposed
services. Application-level — NOT a DB unique constraint (the sanctioned override of AC-LIFE-011-03 must be able
to create the second engagement). <!-- DECISION: BRIEF-012 / REQ-LIFE-011 -->

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/engagement-creation.ts` | Create | New sibling module: `createReturningClientRequest`, `createAccountantInitiatedEngagement`, `findDuplicateEngagements`, `addEngagementParticipant`. DECISION-E: contact resolved via User→Engagement→EngagementRequest (User model has no firstName/lastName). |
| `packages/db/src/index.ts` | Modify | Barrel-export the four new seams + error types |
| `packages/db/src/engagement-creation.test.ts` | Create | Integration tests at `src/` level (matches all existing packages/db test convention; `vitest.config.ts include: ["src/**/*.test.ts"]` covers this). 17 tests, all passing. |

## Tests to Write First

- [x] `[AC-DOOR-009-03] createReturningClientRequest reuses the caller's on-file contact — no contact args required`
- [x] `[AC-DOOR-009-04-dl] the returning-client request lands as a pending EngagementRequest with a new-request notification (inbox-bound)`
- [x] `[AC-DOOR-010-04] createAccountantInitiatedEngagement ties the engagement to the chosen client (clientUserId set) and links them as a participant`
- [x] `[AC-DOOR-010-03-dl] the accountant-initiated request is created already-accepted (no pending accept/decline step)`
- [x] `[AC-LIFE-011-01][AC-LIFE-011-02] findDuplicateEngagements returns the existing match for a repeated (client, service, tax year)`
- [x] `[AC-LIFE-011-03-dl] creation proceeds (override) even when a duplicate exists — no hard block`
- [x] `[AC-LIFE-010-01] a second engagement for the same client + a different taxYear is created and both persist`
- [x] `[AC-LIFE-012-01] addEngagementParticipant links an additional participant to an engagement`

## Implementation Notes

- Mirror `acceptEngagementRequest` + `createEngagement` + `withAuditTransaction` from the EPIC-003/010 path.
- For `createReturningClientRequest`, resolve the caller's `User` by `clerkId` (SESSION_CONTEXT identity) and
  copy first/last/email — never accept them as inputs (that's what proves AC-DOOR-009-03).
- `taxYear` is set on the engagement at creation (accountant-initiated) — carry it through the audit tx.
- Cite `// ADR-019` at audit writes; `// DECISION:` at A/C.

## Definition of Done

- [x] The four seams implemented + barrel-exported; integration tests green
- [x] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` green
- [x] No unique DB constraint introduced on the duplicate tuple

---

## Work Log

- 2026-06-23 [sdet] Marking done — 17 integration tests pass. Four seams correctly implemented: createReturningClientRequest (admin pool, DECISION-E contact resolution, no PII in inputs), createAccountantInitiatedEngagement (withAuditTransaction, pre-accepted, participant linked), findDuplicateEngagements (query not constraint — DECISION-C), addEngagementParticipant (idempotent). CS-TS-001/002 confirmed: no raw pool imports outside packages/db. CS-GEN-001 confirmed: audit rows contain no contact PII (ADR-019 write verified by test). No unique DB constraint on duplicate tuple. complexity_actual=3 valid. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All 4 seams implemented + barrel-exported + 17 integration tests passing. DECISION-E: User model has no firstName/lastName (minimal auth-deferred design); contact resolved via User→Engagement→EngagementRequest JOIN. Pre-existing 2 failures in document.upload-pipeline.rls.test.ts unrelated. Lint/type-check/build all green. Test output: 17 passed / 280 existing passed / 2 pre-existing failures in unrelated test file. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — Starting implementation of 4 creation seams + duplicate-detect query + integration tests. Familiar patterns from EPIC-010/011; main complexity is createReturningClientRequest (User lookup by clerkId + atomic request) and createAccountantInitiatedEngagement (pre-accepted request + engagement + participant in one tx). | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 17 integration tests pass. Seams verified: createReturningClientRequest uses DECISION-E contact resolution (no contact PII in input shape — AC-DOOR-009-03 proven by interface); createAccountantInitiatedEngagement pre-accepts and links primary client in one withAuditTransaction; findDuplicateEngagements is a query not constraint (DECISION-C — override possible); addEngagementParticipant is idempotent. CS-TS-001/002: no raw pool imports outside packages/db. CS-GEN-001: audit rows verified free of contact PII by explicit test. ADR-019: one audit event per transaction confirmed by test. No unique DB constraint on duplicate tuple confirmed by override test.

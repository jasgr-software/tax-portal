---
brief: BRIEF-014
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-014-001
impl: developer
e2e_required: "no"
started_at: 2026-06-24T11:33:08.144Z
completed_at: 2026-06-24T12:31:12.287Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-FILE-004-01, AC-FILE-006-02, AC-FILE-006-03, AC-FILE-005-01, AC-FILE-005-02, AC-FILE-005-03, AC-NFR-006-01]
upstream_refs: [ADR-018, ADR-009, ADR-003, ADR-019, ADR-002]
code_standards: CS-TS-001, CS-TS-002, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-014-002: Soft-delete + recover repository seams, retention clock, deletion audit (packages/db)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — repository/integration task; e2e lives in TASK-014-003
- [x] **Security review** — soft-delete never issues a physical DELETE; admin-pool seams; audit emitted in-txn; no PII in logs
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **In-window-no-physical-removal is a HARD gate.** Verify `softDeleteDocument` performs an **UPDATE** that sets
  `deletedAt` and **never** a SQL `DELETE`, and the storage bytes are **not** removed (no `storage.delete*` call).
  Grep the diff for any `DELETE FROM [dbo].[Document]` / storage delete — there must be none (purge is EPIC-015).
- **System-enforced retention (not manual):** the retention deadline must be **computed** from `completedAt` + a
  configurable window (default 7 years), not a hand-entered date. Verify the test asserts `deadline >= completedAt + 7yr`.
- Cites ADR-019 — verify the deletion + recovery emit audit events in the **same transaction** (`withAuditTransaction`),
  `targetId = documentId` only (CS-GEN-001 — no filename/PII).

## Context

With the tombstone column + CLIENT-branch RLS filter in place (TASK-014-001), this task adds the **write seams** and the
**retention clock**:
- `softDeleteDocument` / `recoverDocument` — admin-pool, audited, **no physical removal** (ADR-018 §1).
- The retention-clock anchor write (`Engagement.completedAt` set on the completion transition) + the
  **retention-deadline accessor** + the configurable 7-year window (ADR-018 §3 / REQ-NFR-006 — system-enforced).
- The "normal working view" vs "archive/recover view" split on the document listing (AC-FILE-006-01 accountant-side).

## Data & Interface Contract (binding)

- **`softDeleteDocument({ documentId, engagementId, actor })`** — ADMIN POOL, inside `withAuditTransaction`:
  `UPDATE [dbo].[Document] SET [deletedAt] = SYSDATETIMEOFFSET() WHERE [id]=@documentId AND [engagementId]=@engagementId
  AND [deletedAt] IS NULL`; then `recordAuthEvent({ action: 'document.deleted', targetType: 'Document', targetId:
  documentId, ... })`. Returns `{ outcome: 'deleted' | 'already-deleted' | 'not-found' }`. **Never** deletes the row or
  the storage object. // ADR-018 §1 // ADR-019 // DECISION-014-D
- **`recoverDocument({ documentId, engagementId, actor })`** — ADMIN POOL, `withAuditTransaction`: clears `deletedAt`
  (`SET [deletedAt] = NULL ... WHERE [deletedAt] IS NOT NULL`); audit `document.recovered`. In-window recovery only —
  there is no expiry/purge path in this slice, so recovery is always available here (AC-FILE-006-03 / AC-FILE-005-02).
  Returns `{ outcome: 'recovered' | 'not-deleted' | 'not-found' }`.
- **`listEngagementDocuments(engagementId, opts?: { includeDeleted?: boolean })`** — extend the existing request-pool
  reader: default (working view) returns only `deletedAt IS NULL`; `includeDeleted: true` (accountant archive view)
  returns all. Note the CLIENT never sees deleted rows regardless (RLS, TASK-014-001) — the flag governs the
  ACCOUNTANT-pool listing. // DECISION-014-E
- **`listDeletedDocuments(engagementId)`** — ACCOUNTANT/admin-pool reader returning only `deletedAt IS NOT NULL` (the
  recover/archive surface consumed by TASK-014-003).
- **Retention clock (ADR-018 §3):**
  - `RETENTION_WINDOW_YEARS = 7` — a single configurable constant (env-overridable default; not hard-coded magic at call sites).
  - `retentionDeadlineFor(engagement): Date | null` — returns `completedAt == null ? null : addYears(completedAt, RETENTION_WINDOW_YEARS)`.
    A document of a completed engagement is retained until this deadline (AC-FILE-005-01). // DECISION-014-F
  - `setEngagementCompleted(engagementId, ...)` — additive write that stamps `completedAt = SYSDATETIMEOFFSET()` when the
    engagement transitions to `status='Complete'` (wire into the existing EPIC-010 completion seam; idempotent — only
    set when NULL). Do **not** fork the engagement status machine — extend it additively (CS-GEN-002).
- **Out of scope (EPIC-015 — do NOT build):** any purge path, purge-eligibility computation, legal hold. The retention
  deadline is computed and *retained-until*; nothing acts on expiry here.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/document.ts` | Modify | Add `softDeleteDocument`, `recoverDocument`, `listDeletedDocuments`; extend `listEngagementDocuments` with `includeDeleted`. Reuse the `withAuditTransaction` / `getAdminPool` / `MssqlRequest` patterns already in this file. |
| `packages/db/src/repositories/retention.ts` | Create | `RETENTION_WINDOW_YEARS`, `retentionDeadlineFor`, `setEngagementCompleted`. // ADR-018 §3 |
| `packages/db/src/index.ts` | Modify | Barrel-export `softDeleteDocument`, `recoverDocument`, `listDeletedDocuments`, `retentionDeadlineFor` (mirror the existing document export surface). |
| `packages/db/src/audit.ts` | Modify (if needed) | Add `document.deleted` / `document.recovered` to the audited action union if it is a closed enum. |
| (engagement completion seam) | Modify | Wire `setEngagementCompleted` into wherever EPIC-010 sets `status='Complete'` (locate via grep — additive). |
| `packages/db/src/document.soft-delete.integration.test.ts` | Create | Tier-3 integration (see Tests). |
| `packages/db/src/retention.test.ts` | Create | Tier-3: retention-deadline computation + completion stamp. |

## Tests to Write First

- [x] `AC-FILE-004-01` — `softDeleteDocument` on an active doc sets `deletedAt` (admin-pool read-back shows non-NULL) —
      expected outcome `'deleted'`.
- [x] `AC-FILE-006-02 / AC-FILE-005-02 / AC-FILE-005-03` — after soft-delete the **row still exists** (admin-pool read
      returns it) and **no storage delete** occurred — expected: row present, `deletedAt` set, storage object still
      stat-able; a second `DELETE FROM` is never issued (assert via the repo surface — there is no physical-delete seam).
- [x] `AC-FILE-006-03` — `recoverDocument` on a soft-deleted doc clears `deletedAt` and the doc is visible again to its
      owner CLIENT (round-trip through the request pool) — expected outcome `'recovered'`.
- [x] `AC-FILE-005-01 / AC-NFR-006-01` — `retentionDeadlineFor` returns `completedAt + 7 years` (≥ 7 years), and
      `setEngagementCompleted` stamps `completedAt` exactly once — expected: deadline math correct; idempotent.
- [x] `AC-FILE-006-01` — `listEngagementDocuments` (default) excludes soft-deleted; `includeDeleted:true` /
      `listDeletedDocuments` returns them — expected: working view hides, archive view shows.
- [x] Audit (ADR-019): soft-delete + recover each emit one audit event (`document.deleted` / `document.recovered`) with
      `targetId = documentId`.

## Implementation Notes

- Reuse `withAuditTransaction` exactly as `replaceDocumentWithNewVersion` does (same file). The actor is the accountant
  identity passed from the action layer (TASK-014-003) — never client-supplied (CS-GEN-001).
- `addYears` — use date-fns if already a dep, else a small local helper; the window constant must be the single source.
- Tag governing keys in code + tests (`// ADR-018 // ADR-019 // CS-TS-001 // CS-GEN-001`).

## Definition of Done

- [x] `softDeleteDocument` / `recoverDocument` are UPDATE-only (no physical DELETE, no storage delete) + audited in-txn.
- [x] Retention deadline is computed from `completedAt` + the 7-year window constant; completion stamp is idempotent.
- [x] Working-view vs archive-view listing split works; CLIENT never sees deleted rows (relies on TASK-014-001 RLS).
- [x] Tier-3 integration + retention tests pass against the container DB. Lint + type-check + build pass.

---

## Work Log

- 2026-06-24 [sdet] Marking done — softDeleteDocument+recoverDocument UPDATE-only confirmed (no physical DELETE, no storage delete). 14/14 integration + 10/10 retention tests independently verified on container DB. Retention deadline computed from completedAt + configurable RETENTION_WINDOW_YEARS. setEngagementCompleted wired into transitionEngagementStatus additively. Audit events in-txn confirmed. Approved. | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — Implemented softDeleteDocument/recoverDocument (ADMIN POOL, withAuditTransaction, UPDATE-only, audit events document.deleted/document.recovered), listDeletedDocuments, extended listEngagementDocuments with includeDeleted option, retention.ts with RETENTION_WINDOW_YEARS/retentionDeadlineFor/setEngagementCompleted, wired setEngagementCompleted into transitionEngagementStatus (Complete path). 14/14 soft-delete integration tests pass; 10/10 retention tests pass. All portal+admin tests pass. 2 pre-existing upload-pipeline failures confirmed unrelated. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — Implementing soft-delete/recover seams, retention clock, and integration tests for BRIEF-014 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved (2026-06-24)
**Notes**:
- `softDeleteDocument` confirmed UPDATE-only: SQL `UPDATE [dbo].[Document] SET [deletedAt] = SYSDATETIMEOFFSET() … WHERE [deletedAt] IS NULL` — no physical `DELETE FROM [dbo].[Document]` anywhere in production code (grep confirmed zero hits).
- No `storage.delete*` call in `softDeleteDocument` or `recoverDocument` — storage bytes survive (ADR-018 §1).
- 14/14 integration tests + 10/10 retention tests independently verified on container DB.
- `retentionDeadlineFor` returns `completedAt + RETENTION_WINDOW_YEARS` (env-overridable, default 7); not hard-coded at call sites. System-enforced (AC-NFR-006-01).
- `setEngagementCompleted` wired additively into `transitionEngagementStatus` (Complete path) with idempotent guard (`AND completedAt IS NULL`). CS-GEN-002 satisfied.
- Audit events `document.deleted` / `document.recovered` emitted inside `withAuditTransaction` (fail-closed); `targetId = documentId` only (no PII — CS-GEN-001). Integration test verifies audit rows.
- Work Log submission gate evidence: test counts only (no explicit lint/build output). Advisory observation — lint/type-check independently verified clean in this SDET session; test counts consistent. Does not rise to rejection given independently confirmed gate state.

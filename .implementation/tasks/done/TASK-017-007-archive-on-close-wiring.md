---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-002
impl: developer
e2e_required: "no"
started_at: 2026-06-25T14:21:41.414Z
completed_at: 2026-06-25T19:21:31.201Z
complexity_estimate: 2
complexity_actual: 2
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-006-01, AC-MSG-006-02, AC-MSG-006-03]
upstream_refs: [REQ-MSG-006, ADR-018, ADR-003, ADR-019, EPIC-010, EPIC-014]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-007: Archive-on-close — additive wiring into the EPIC-010 Complete transition; indefinite retention; archived thread stays readable

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — the archived-thread-stays-readable journey is exercised e2e in TASK-017-008)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 indefinite retention + archive-on-close (ADR-018 / REQ-MSG-006).** On engagement close/complete the thread is **marked archived, not deleted** (AC-MSG-006-02); the thread and **all** its messages are **not deleted** (AC-MSG-006-01); an archived thread **stays fully readable** by its participants (AC-MSG-006-03). Verify: after Complete, `Thread.status='archived'`, `archivedAt` set, every message row still present, and the RLS read still returns the thread + messages to a participant.
- **Distinct from EPIC-016's ≥90-day floor — DO NOT conflate.** Threads/messages are kept indefinitely (no purge, no 90-day floor applied). Confirm no purge/retention-floor logic leaks onto threads.
- **Additive wiring (CS-GEN-002).** Hook the **existing** post-commit `if (transitionResult.transitioned && input.toStatus === 'Complete')` block in `transitionEngagementStatus` (packages/db/src/repositories/engagement.ts) — byte-preserve the existing `setEngagementCompleted` + `emitAndPublishNotification` calls; add the archive call alongside, do not fork the status machine. Idempotent (archiving an already-archived thread is a no-op). General threads have no engagement → never archived by this path.

## Context

Wires archive-on-close: when an engagement reaches Complete, its thread flips to `archived` (state, not delete) and stays readable forever. This is the EPIC-010 Complete-transition integration point (AC-MSG-006-01/-02/-03).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/thread.ts` | Modify | `archiveEngagementThread(engagementId)` — admin-pool UPDATE `status='archived', archivedAt=now` WHERE engagementId match AND status='active' (idempotent); never deletes |
| `packages/db/src/repositories/engagement.ts` | Modify | in the existing post-commit Complete block, additively call `archiveEngagementThread` (alongside `setEngagementCompleted`) — byte-preserve existing calls (CS-GEN-002) |
| `packages/db/src/thread-archive.integration.test.ts` | Create | tier-3 — Complete → thread archived not deleted, messages retained, archived thread still readable by participant |

## Tests to Write First

- [x] engagement → Complete → its thread `status='archived'`, `archivedAt` non-null (AC-MSG-006-02)
- [x] thread + all messages still present after Complete (AC-MSG-006-01) — no rows deleted
- [x] a participant reads the archived thread + its full message history (AC-MSG-006-03)
- [x] archiving an already-archived thread is a no-op (idempotent); a general thread is unaffected by engagement close
- [x] no purge / 90-day-floor logic applied to threads (retention is indefinite)

## Implementation Notes

- Mirror the EPIC-014 `setEngagementCompleted` precedent exactly — same post-commit, idempotent, additive shape. `archiveEngagementThread` is admin-pool (ADR-003 §7), audited if the existing pattern audits the completion (optional — match the surrounding convention).
- Archive is a **status flip only** — RLS read predicates (TASK-017-001) do not filter on `status`, so an archived thread remains visible to participants (assert this; do not add a status filter to the read policy).
- Cite ADR-018/-003/-019 + EPIC-010 + CS-TS-001/-002 + CS-GEN-002/-003.

## Definition of Done

- [x] archive-on-close wired additively into the Complete transition (existing calls byte-preserved)
- [x] archived = state flip, nothing deleted, stays readable — proven tier-3
- [x] no purge/retention-floor applied to threads
- [x] Lint + type-check + build + tests pass

---

## Work Log

- 2026-06-25 [sdet] Marking done — 5/5 tier-3 tests pass: archive-on-close (AC-MSG-006-02), messages-retained with schema column purge-field absence check (AC-MSG-006-01), archived-thread-stays-readable by participant (AC-MSG-006-03), idempotent no-op on re-archive, general thread unaffected. archiveEngagementThread wired additively at the correct post-commit block in engagement.ts (lines 909-917) alongside setEngagementCompleted — CS-GEN-002 byte-preservation confirmed. Status flip only (WHERE status=active guard), never deletes. No retainUntil/purgeAt column on Thread or Message — indefinite retention (ADR-018). Build clean. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — archiveEngagementThread added to thread.ts (admin-pool idempotent UPDATE WHERE status='active'); wired additively in engagement.ts Complete block alongside setEngagementCompleted; 5/5 tier-3 tests pass: archive-on-close, nothing-deleted, archived-stays-readable, idempotent-no-op, general-thread-unaffected. Lint+type-check+build all clean. 2 pre-existing document.upload-pipeline.rls.test.ts failures unrelated to this slice. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — task TASK-017-007 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved
**Notes**: 5/5 tier-3 tests pass: archive-on-close stamps Thread.status='archived' + archivedAt (AC-MSG-006-02), all message rows retained with schema-level absence check for purge/retainUntil columns (AC-MSG-006-01 — indefinite retention per ADR-018), archived thread + full history readable by participant under RLS (AC-MSG-006-03), idempotent re-archive is a no-op (WHERE status='active' guard), general thread unaffected (WHERE keys on engagementId). Additive wiring confirmed at engagement.ts lines 909-917 — archiveEngagementThread runs alongside setEngagementCompleted inside the same Complete block; existing calls byte-preserved (CS-GEN-002). Status flip only — no deletes. No retention/purge columns on Thread or Message table (ADR-018 tier-3 indefinite retention confirmed at schema level). Build clean.

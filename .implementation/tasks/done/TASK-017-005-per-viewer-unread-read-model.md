---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-002
impl: developer
e2e_required: "no"
started_at: 2026-06-25T14:11:33.631Z
completed_at: 2026-06-25T19:17:55.662Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-005-01, AC-MSG-005-02, AC-MSG-005-03, AC-MSG-005-04]
upstream_refs: [REQ-MSG-005, ADR-003, ADR-005]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-GEN-001 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-005: Per-viewer unread read model — derived unread state per (thread, viewer), engagement + general threads

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — indicator present/per-kind/clears is exercised e2e in TASK-017-007/-008)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 per-viewer unread state (REQ-MSG-005).** Unread is tracked per **(thread, viewer)**: a thread can be unread for one participant and read for another **at the same time** (AC-MSG-005-03). Verify the derivation against the watermark (DECISION-017-A): a thread is unread for a viewer iff it has a message with `createdAt > thatViewer.lastReadAt` (or no read-state row yet). After that viewer marks read, the indicator clears for **that viewer only** (AC-MSG-005-04) — the other participant's unread is unaffected.
- **Both thread kinds (AC-MSG-005-02).** The unread computation covers engagement **and** general threads uniformly.
- **RLS-governed** (CS-TS-001) — the read model runs under the request-pool wrapper; a viewer only ever computes unread over threads/messages/read-state visible to them.

## Context

The read-model layer the thread-list UI (TASK-017-006) consumes for the unread indicator. Derives per-viewer unread from the `ThreadReadState` watermark + thread messages; the mark-read write is TASK-017-003.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/thread-read.ts` | Modify | `listThreadsWithUnread(viewer)` — returns the viewer's threads (engagement + general) each with a derived `hasUnread` boolean; request-pool, RLS-governed |
| `packages/db/src/index.ts` | Modify | barrel-export the read-model fn + types (additive) |
| `packages/db/src/thread-unread.integration.test.ts` | Create | tier-3 — per-viewer divergence, clears-on-read, both kinds |

## Tests to Write First

- [x] one message new to both participants → unread for both (AC-MSG-005-01)
- [x] participant A marks read, B has not → unread for B, read for A simultaneously (AC-MSG-005-03)
- [x] A reads the new messages → indicator clears for A only (AC-MSG-005-04)
- [x] unread derived identically for an engagement thread and a general thread (AC-MSG-005-02)
- [x] a viewer with no read-state row yet on a thread with messages → unread (initial state)

## Implementation Notes

- DECISION-017-A (watermark) is the basis: `hasUnread = EXISTS(message m WHERE m.threadId = t.id AND m.createdAt > COALESCE(readState.lastReadAt, '0001-01-01') AND m.senderUserId <> viewer)`. Excluding the viewer's own sent messages from "unread" is correct (you don't get an unread badge for your own message) — note this as a bounded DECISION and assert it.
- Single request-pool query joining Thread ⋈ Message (EXISTS) ⋈ ThreadReadState; RLS does the visibility scoping. Keep it shallow.
- Cite ADR-003/-005 + CS-TS-001/-002 + CS-GEN-003.

## Definition of Done

- [x] `listThreadsWithUnread` returns per-viewer-correct `hasUnread` across both thread kinds
- [x] per-viewer divergence + clears-on-read proven tier-3
- [x] Lint + type-check + build + tests pass

---

## Work Log

- 2026-06-25 [sdet] Marking done — 6 integration tests pass: no-read-state-row→unread (initial state), own-message excluded from unread count (DECISION-017-005-A bounded decision — correct behavior), per-viewer divergence (A reads/B unread simultaneously — AC-MSG-005-03), clears-for-A-only (AC-MSG-005-04), both engagement and general threads covered (AC-MSG-005-02). Per-viewer watermark design (DECISION-017-A) implemented as LEFT JOIN to ThreadReadState + EXISTS over Message WHERE createdAt > lastReadAt. Request-pool via db wrapper (CS-TS-001), no masking WHERE, RLS governs visibility. Viewer own-message exclusion documented as DECISION-017-005-A — bounded, correct for UI semantics. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — All gates pass. listThreadsWithUnread implemented in packages/db/src/repositories/thread-read.ts: single request-pool  joining Thread⋈ThreadReadState (LEFT JOIN, viewer-resolved via SESSION_CONTEXT) with EXISTS over Message for hasUnread derivation. DECISION-017-005-A: uses senderClerkId (actual schema column) vs brief-spec senderUserId — documented as bounded decision. 6 integration tests in thread-unread.integration.test.ts all pass: no-read-state-row→unread, own-message excluded, AC-MSG-005-01/-02/-03/-04 proven tier-3. Barrel exports for ThreadWithUnread + listThreadsWithUnread added to index.ts. Lint=clean, build=clean, 473 tests pass (2 pre-existing failures in document.upload-pipeline.rls.test.ts — AV scanner unrelated to this task, untouched file). E2E: N/A (indicator e2e is TASK-017-008). Security review: no injection (Prisma tagged template, no user inputs), no sensitive data exposure (message bodies never selected), RLS-governed via sec.pol_Thread. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — Starting per-viewer unread read-model: listThreadsWithUnread + integration tests | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved
**Notes**: 6 integration tests pass: no-read-state-row→unread (initial state), per-viewer divergence (participant A reads, participant B unread simultaneously — AC-MSG-005-03), clears-for-A-only after markThreadRead (AC-MSG-005-04), both engagement and general threads computed uniformly (AC-MSG-005-02). DECISION-017-005-A: viewer's own sent messages excluded from unread count — documented bounded decision, correct UI semantics. Watermark design (DECISION-017-A) implemented correctly as LEFT JOIN + EXISTS over messages WHERE createdAt > COALESCE(lastReadAt, epoch). Request-pool via db wrapper (CS-TS-001), RLS governs visibility. CS-GEN-001: message bodies never selected. Schema column used correctly (senderClerkId vs brief-spec senderUserId — documented as bounded decision).

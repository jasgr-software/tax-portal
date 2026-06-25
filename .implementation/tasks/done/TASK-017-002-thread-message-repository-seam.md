---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-001
impl: developer
e2e_required: "no"
started_at: 2026-06-25T13:27:51.379Z
completed_at: 2026-06-25T19:16:52.337Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-001-01, AC-MSG-001-02, AC-MSG-001-03, AC-MSG-002-01, AC-MSG-002-02, AC-MSG-002-03, AC-MSG-003-01, AC-MSG-003-02]
upstream_refs: [REQ-MSG-001, REQ-MSG-002, REQ-MSG-003, ADR-003, ADR-005, ADR-006, EPIC-013]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-GEN-001 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-002: Thread/Message repository seam — get-or-create engagement thread, start general thread, send message, read thread+messages

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A — repository tier-3 integration; journeys ride TASK-017-007/-008)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 plain-text treatment (REQ-MSG-003).** Verify the message body is **stored verbatim** — no server-side markup interpretation, escaping-into-storage, or transformation. A body carrying markup/HTML/script-like syntax round-trips byte-identical from the store (the *render*-side verbatim proof rides TASK-017-006/-007; the *storage* property is proven here). AC-MSG-003-01/-02.
- **One thread per engagement (AC-MSG-001-01).** `getOrCreateEngagementThread` must be idempotent — concurrent/repeat calls yield exactly one thread (lean on the `@@unique` from TASK-017-001; handle the unique-violation race).
- **All request-scoped reads/sends go through the `packages/db` wrapper** (CS-TS-001/-002) — `SESSION_CONTEXT` set before the first real query; no raw `requestDb`/`adminDb` import outside `packages/db`. Reads are RLS-governed (no belt-and-suspenders WHERE that would mask a policy regression — mirror the `notification.ts` DECISION-016-002-A discipline).
- **No PII in logs** (CS-GEN-001) — message bodies / client identities never logged.

## Context

The data-access seam the server actions (TASK-017-003/-004) and read models (TASK-017-005) consume. Get-or-create the one engagement thread; create an accountant-initiated general thread; append a plain-text message; read a thread + its ordered messages. RLS is the enforcement boundary (TASK-017-001 policies); this seam never adds its own access WHERE.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/thread.ts` | Create | `getOrCreateEngagementThread` (admin pool, idempotent), `createGeneralThread` (admin pool, accountant-initiated), `getThreadForEngagement` / `getGeneralThreadsForClient` (request pool, RLS), `listThreadMessages` (request pool, ordered by createdAt) |
| `packages/db/src/repositories/message.ts` | Create | `appendMessage` (admin pool write — server-authoritative; body stored verbatim) returning the new message id + threadId |
| `packages/db/src/index.ts` | Modify | Barrel-export the new thread/message read functions + types (CS-GEN-002 additive) |
| `packages/db/src/thread-message.integration.test.ts` | Create | tier-3 — get-or-create idempotency, ordered history, plain-text byte-round-trip, general-thread association |

## Tests to Write First

- [x] `getOrCreateEngagementThread` — first call creates; second call returns the same thread id (AC-MSG-001-01)
- [x] `appendMessage` + `listThreadMessages` — messages returned in send order; full history persists across separate reads (AC-MSG-001-03 / -002-03)
- [x] plain-text — a body containing `<script>`/`**md**`/`<img>` syntax is stored and returned **verbatim**, byte-identical (AC-MSG-003-01/-02)
- [x] `createGeneralThread` — produces a `kind='general'` thread associated with the client, no engagementId (AC-MSG-002-01/-02)

## Implementation Notes

- Writes (`appendMessage`, `getOrCreateEngagementThread`, `createGeneralThread`) are **admin-pool, server-authoritative** (mirror `emitNotification` / `transitionEngagementStatus` admin-pool writes — ADR-003 §7). Reads (`getThreadForEngagement`, `listThreadMessages`, `getGeneralThreadsForClient`) are **request-pool via the `db` wrapper** so `pol_Thread`/`pol_Message` govern visibility (ADR-005). Role-guard + identity resolution live in the action layer (TASK-017-003/-004), not here.
- `appendMessage` stores `body` exactly as received — no transform. Attachments are wired in TASK-017-004 (this task is body + thread only; signature should accept the message id so the attachment task can relate rows, but attachment storage/scan is NOT in this task).
- Cite ADR-003/-005/-006 + CS-TS-001/-002 + CS-GEN-001/-003 in comments.

## Definition of Done

- [x] Repository functions implemented; barrel-exported additively
- [x] tier-3 integration tests pass (idempotency, ordering, verbatim storage, general association)
- [x] Lint + type-check + build pass
- [x] No raw pool import outside `packages/db`; reads RLS-governed (no masking WHERE)

---

## Work Log

- 2026-06-25 [sdet] Marking done — 7/7 tier-3 integration tests pass: idempotency, ordered history, plain-text verbatim round-trip (markup/<script>/<img> stored byte-identical), general thread association. Admin pool for writes, request pool for reads — no raw pool import outside packages/db (CS-TS-001/-002). No masking WHERE on RLS reads (mirrors DECISION-016-002-A). CS-GEN-001: no PII/body in logs. Verbatim body storage confirmed at the SQL INSERT level (NVarChar(MAX) parameterised — no transform). Build clean (BUG-017-001 fix lands before this task). Pre-existing 2 scan-mock failures confirmed unrelated. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — All gates pass: lint clean, type-check clean, build clean, 7/7 tier-3 integration tests pass. Implemented thread.ts (getOrCreateEngagementThread idempotent via catch-and-re-read on SQL Server 2627/2601, createGeneralThread, getThreadForEngagement, getGeneralThreadsForClient, listThreadMessages) + message.ts (appendMessage — verbatim body, admin pool). Barrel-exported additively in index.ts. Security: no PII logged, no belt-and-suspenders WHERE (mirrors DECISION-016-002-A), admin pool via getAdminPool() only inside packages/db. Pre-existing 2 failures in document.upload-pipeline.rls.test.ts (scan mock flake) are unrelated to this task. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — Pre-read: thread.ts + message.ts repository seam + tier-3 integration tests. Admin pool writes, request pool RLS reads. Medium complexity — follows the well-established notification.ts pattern. | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved
**Notes**: 7/7 tier-3 integration tests pass covering idempotency (get-or-create with catch-and-re-read on SQL Server unique violation), ordered history (createdAt ASC), plain-text verbatim byte round-trip (markup/<script>/<img> body stored identical to input), and general thread association. Admin pool for writes, request pool for reads — CS-TS-001/-002 satisfied. No masking WHERE on RLS reads (mirrors DECISION-016-002-A). CS-GEN-001: body never logged. Verbatim storage confirmed at NVarChar(MAX) parameterized INSERT level — no transform applied. Build clean. Pre-existing scan-mock failures confirmed pre-existing and unrelated.

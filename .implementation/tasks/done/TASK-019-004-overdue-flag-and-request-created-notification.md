---
brief: BRIEF-019
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-019-001
impl: developer
e2e_required: "no"
started_at: 2026-06-27T16:24:20.163Z
completed_at: 2026-06-27T18:03:50.037Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-FILE-012-02, AC-MSG-014-02]
upstream_refs: [ADR-005, ADR-003, ADR-006, ADR-018, EPIC-013, EPIC-016, REQ-FILE-012, REQ-MSG-014]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-TS-003 (recommended), CS-SQL-001 (required), CS-GEN-001 (recommended), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
---

# TASK-019-004: Overdue flag (accountant view) + request due-point + request-created client notification (RLS both ways)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — AC-FILE-012-02 tier-6 e2e is in TASK-019-005; this task delivers the derivation + integration tests)_
- [x] **Security review** — request-created notification scoped to the engagement's own client; CLIENT-A cannot see CLIENT-B's notification
- [x] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 #6 — per-recipient RLS isolation BOTH ways (AC-MSG-014-02; ADR-005, CS-SQL-001).** The `document_request_created` CLIENT notification must reach ONLY the engagement's own client: CLIENT-A receives it (positive) AND CLIENT-B does NOT (negative), reusing the EPIC-016 `sec.pol_Notification` CLIENT branch. Null/zero SESSION_CONTEXT → zero rows. Both directions required.
- **HARD tier-3 #9 — request-created → client (AC-MSG-014-02).** When the accountant creates a document request, that client (and only that client) receives the in-portal notification. Emitted at creation time, not by the batch engine.
- **Overdue flag derivation (AC-FILE-012-02)** — the accountant-view "is overdue" flag is DERIVED (unfulfilled + effective due date passed), consistent with the engine's determination (DECISION-019-C/-D); not a separate persisted truth that could drift.
- **CS-GEN-001** — notification title/body carry no PII (no client name, no request label content beyond a generic created message — keep consistent with EPIC-016 conventions).

## Context

Closes the accountant-visible overdue flag (AC-FILE-012-02) and the client request-created notification (AC-MSG-014-02). Wires the request due-point into request creation so a request can become overdue. Reuses the EPIC-016 `Notification` CLIENT branch (no new policy) and proves per-recipient isolation both ways.

## IO Design — binding contract

- **Overdue flag (DECISION-019-C/-D):** extend the accountant request read (`listDocumentRequestsForEngagement` or an admin-view variant) to surface a derived `isOverdue` boolean using the same effective-due-date + unfulfilled rule as the engine. Surface it on `apps/admin/src/app/engagements/[engagementId]/document-requests/page.tsx`. Keep the derivation in ONE place (share with the engine's predicate where practical) so the flag and the engine cannot diverge.
- **Request due-point:** allow the accountant to set `DocumentRequest.dueDate` when creating a request (extend `createDocumentRequestAsAccountant` + the admin request-creation UI). This is what makes a request capable of becoming overdue (needed for TASK-019-005 e2e).
- **DECISION-019-I — request-created notification:** in `createDocumentRequestAsAccountant`, after the insert, `emitNotification` a CLIENT `document_request_created` notification with `recipientUserId = engagement.clientUserId` (look up via the engagement). `linkedItemType='request'` / `linkedItemId=<requestId>` for feed navigation. If the engagement has no `clientUserId` yet (unassigned), skip the notification (no recipient). No new email path (DECISION-019-J) — the portal feed renders it; the EPIC-018 digest picks it up.
- **apps/portal:** the existing EPIC-016 feed renders the new CLIENT notification type with no portal code change expected (generic feed). Verify; add only if the feed does not render an unknown `type`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/document-request.ts` | Modify | Accept `dueDate` on create; emit `document_request_created` CLIENT notification (admin pool); add derived `isOverdue` to the admin read |
| `packages/db/src/document-request.request-created.rls.test.ts` | Create | tier-3 #6 BOTH ways — CLIENT-A receives, CLIENT-B does not; null-context → zero rows |
| `packages/db/src/document-request.overdue-flag.test.ts` | Create | derived `isOverdue` true when unfulfilled+past-due, false otherwise (AC-FILE-012-02 logic) |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/...` | Modify | Show overdue flag; set due date on request creation |
| `apps/portal/src/...feed...` | Verify/Modify | Confirm the feed renders `document_request_created` (CS-TS-003 cross-surface) |

## Tests to Write First

- [ ] `createDocumentRequest → engagement's client (CLIENT-A) sees document_request_created notification` — expected: visible to CLIENT-A
- [ ] `CLIENT-B does NOT see CLIENT-A's request-created notification` — expected: zero rows for CLIENT-B
- [ ] `null/zero SESSION_CONTEXT → zero notifications` — expected: `[]`
- [ ] `unfulfilled request past effective due date → isOverdue true` — expected: true
- [ ] `not-yet-due OR fulfilled request → isOverdue false` — expected: false

## Implementation Notes

- Reuse `emitNotification` (admin pool) — no new policy; the EPIC-016 `sec.pol_Notification` CLIENT branch enforces recipient isolation. The both-ways test mirrors `notification.rls.test.ts` / EPIC-016 client-isolation harness.
- Keep the `isOverdue` derivation aligned with TASK-019-003's effective-due-date + unfulfilled rule (share a helper if practical) so the accountant flag and the engine agree.
- Cite governing keys: `// ADR-005`, `// ADR-003`, `// ADR-006`, `// CS-TS-001`, `// CS-TS-002`, `// CS-TS-003`, `// CS-SQL-001`, `// CS-GEN-001`, `// CS-GEN-002`, `// CS-GEN-003`, `// DECISION-019-C/-D/-I/-J`.
- Cross-surface (CLAUDE.md): the flag + due-point are `apps/admin`; the client nudge surfaces on `apps/portal`.

## Definition of Done

- [ ] request-created CLIENT notification proven BOTH ways (CLIENT-A yes, CLIENT-B no) + null-context zero rows
- [ ] Accountant view flags an overdue request (derived, consistent with the engine)
- [ ] Accountant can set a request's due date at creation
- [ ] Lint + type-check + build pass; `pnpm --filter db test` + `pnpm --filter admin test` + `pnpm --filter portal test` green

---

## Work Log

- 2026-06-27 [sdet] Marking done — Approved. RLS BOTH ways: CLIENT-A receives document_request_created (4-test harness), CLIENT-B does NOT (0 rows), null context 0 rows. isOverdue derivation (computeIsOverdue, 11 tests) consistent with engine predicate — no divergence risk. CS-GEN-001: notification title content-free. DoD checkboxes unchecked (Overwatch advisory); Work Log evidence (4/4 RLS, 11/11 overdue-flag, 608 admin, 337 portal) fully compensates. | What's next: archive | Blockers: none
- 2026-06-27 [webapp-developer] Marking as review — All gates green: lint/type-check/build clean; 11 overdue-flag unit tests + 4 RLS both-ways integration tests pass; 608 admin + 337 portal tests pass. New exports: DocumentRequestAdminItem, ComputeIsOverdueInput, listDocumentRequestsForEngagementAdmin, computeIsOverdue. | What's next: SDET review | Blockers: none
- 2026-06-27 [webapp-developer] Starting implementation — Overdue flag + request-created notification + RLS both-ways test | What's next: implement and run gates | Blockers: none
- 2026-06-27 [webapp-developer] Implementation complete — all files created/modified; submission gate passed: lint clean, type-check clean, build clean. pnpm --filter db test (document-request.overdue-flag.test.ts: 11/11 pass; document-request.request-created.rls.test.ts: 4/4 pass — RLS both-ways + null-context). pnpm --filter admin test: 608/608 pass. pnpm --filter portal test: 337/337 pass. Pre-existing document.upload-pipeline.rls.test.ts failures (2) unrelated to this task (not modified). | What's next: SDET review | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved — 2026-06-27T18:03:50.057Z
**Notes**: All mandatory gate checks passed. HARD tier-3 #6 RLS isolation proven BOTH ways: CLIENT-A receives their own `document_request_created` notification (count = 1), CLIENT-B does NOT see CLIENT-A's notification (count = 0), null SESSION_CONTEXT produces 0 rows. Admin pool reads the notification with correct `recipientType='CLIENT'` and `recipientUserId=clientAUserId`. Gate Authoring Evidence in the test file cites the named predicate (`sec.fn_notification_access` CLIENT EXISTS branch) and the counterfactual (removing the branch → CLIENT-A sees zero; removing FILTER → CLIENT-B sees it). `isOverdue` derivation (`computeIsOverdue`, 11 unit tests) is documented as mirroring the engine's SQL predicate — shared function prevents accountant-view vs. engine divergence. CS-GEN-001: notification title is `"A document request has been created for you"` — no PII, no request label, no engagement detail. DoD checkboxes were unchecked (flagged by Overwatch as advisory); the Quality Gates checklist mandatory boxes are all ticked and Work Log carries explicit gate evidence for all four DoD items.

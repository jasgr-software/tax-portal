---
brief: BRIEF-014
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-014-002
impl: developer
e2e_required: "yes"
started_at: 2026-06-24T11:47:14.930Z
completed_at: 2026-06-24T12:31:18.163Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-FILE-004-01, AC-FILE-004-02, AC-FILE-004-03, AC-FILE-006-01, AC-FILE-006-03]
upstream_refs: [ADR-018, ADR-005, ADR-003, ADR-006, ADR-019]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-003
---

# TASK-014-003: Accountant delete + recover server actions, admin UI, portal no-delete proof, e2e + demo

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (Docker stack; accountant delete→leaves-view→recover; portal no-delete)
- [x] **Security review** — accountant-only guard before any delete write; no client/portal delete seam; OWASP pass
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **No-client-delete is the HARD trap (AC-FILE-004-02/-03), proven BOTH ways** (mirror EPIC-013's both-party trap):
  1. **Server-side:** `deleteDocumentAction` resolves the accountant identity (`getAccountantIdentity()`) and **rejects a
     non-accountant** before any write (CS-TS-004); there is **no** delete action/route in `apps/portal`.
  2. **Portal surface:** a portal e2e proves the client UI exposes **no** delete affordance for any file — *including a
     file the client uploaded*. A one-sided assertion is insufficient.
- Verify the delete action calls the **admin-pool** `softDeleteDocument` seam (TASK-014-002) — it must not perform a
  request-pool delete and must not physically remove anything.
- ADR-006: delete + recover live in `apps/admin` only; `apps/portal` exposes neither. CS-TS-003 mirror check: the
  shared listing/identity patterns stay consistent, but the **delete capability is intentionally admin-only**.

## Context

The user-facing close of the slice: the accountant can delete a file (it leaves the working view) and recover it from an
archive view; the client has no delete path anywhere. Wires the TASK-014-002 seams to accountant-guarded server actions +
admin UI, and proves the accountant-only guarantee both server-side and on the portal surface, with e2e + a `@demo`
walkthrough.

## Data & Interface Contract (binding)

- **`deleteDocumentAction(engagementId, documentId)`** (apps/admin) — `'use server'`; resolves accountant identity via
  the existing `getAccountantIdentity()` helper used by the upload/folder actions; **rejects non-accountant** (CS-TS-004);
  calls `softDeleteDocument({ documentId, engagementId, actor })` (admin pool, audited); revalidates the documents view.
  Returns a discriminated result `{ ok: true } | { ok: false; reason }`. // ADR-003 // ADR-018 // ADR-019
- **`recoverDocumentAction(engagementId, documentId)`** (apps/admin) — mirror; calls `recoverDocument`.
- **Admin documents view** — the normal listing uses `listEngagementDocuments` (working view, deleted hidden); add a
  **Deleted/Archive** affordance that lists `listDeletedDocuments` with a **Recover** control. A **Delete** control on
  each active file triggers `deleteDocumentAction` (with a confirm — soft-delete is recoverable, so a light confirm).
- **apps/portal** — **no change to add any delete capability.** The portal documents view stays read/download-only
  (EPIC-013). The proof is the **absence** of a delete control + no portal delete action.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/documents/actions.ts` | Modify | Add `deleteDocumentAction`, `recoverDocumentAction` (accountant-guarded). |
| `apps/admin/src/app/engagements/[engagementId]/documents/*` (view/components) | Modify | Delete control on active files; Archive/Recover affordance. Match the existing documents-view component patterns. |
| `apps/admin/src/app/engagements/[engagementId]/documents/actions.test.ts` (or sibling) | Create/Modify | Tier-2/3 action tests: accountant delete/recover happy path; **non-accountant rejected** (AC-FILE-004-02). |
| `apps/admin/e2e/features/file-deletion.feature` | Create | Gherkin (verbatim from the brief's § Acceptance scenarios) for the admin-side ACs. |
| `apps/admin/e2e/specs/file-deletion.spec.ts` | Create | Tier-6 e2e bound to the gherkin: accountant deletes a file → it leaves the working view (AC-FILE-004-01 / AC-FILE-006-01) → recover restores it (AC-FILE-006-03). |
| `apps/portal/e2e/specs/no-client-delete.spec.ts` | Create | Tier-6 portal negative: a client participant (incl. for a file they uploaded) sees **no** delete affordance; no delete path (AC-FILE-004-02/-03). |
| `apps/admin/e2e/demo/file-deletion.demo.spec.ts` | Create | `@demo` walkthrough → `docs/demos/EPIC-014/` (jane-accountant, flow-document-lifecycle). Non-gating. |

## Tests to Write First (acceptance_format: gherkin — bind the brief's scenarios)

- [ ] `AC-FILE-004-01` (e2e) — accountant deletes a file in an engagement → it is removed from the working view.
- [ ] `AC-FILE-006-01` (e2e) — after delete the file is gone from the normal file list (present in Archive).
- [ ] `AC-FILE-006-03` (e2e) — Recover from Archive restores the file to the working view.
- [ ] `AC-FILE-004-02` (action test) — `deleteDocumentAction` invoked without accountant identity is **rejected**, no write.
- [ ] `AC-FILE-004-02 / AC-FILE-004-03` (portal e2e) — the client documents view exposes **no** delete control for any
      file, including one the client uploaded; there is no portal delete action.

## Implementation Notes

- Reuse the accountant-identity guard + `revalidatePath` patterns from the existing `documents/actions.ts` and
  `documents/folders/actions.ts` — do not invent a new auth pattern (CS-TS-004 tag the guard).
- Per CLAUDE.md § Platform-frontend scope, the audit/mirror default is **both** surfaces: admin gains the capability;
  portal is verified to **lack** it. Run both apps in the e2e stack.
- Docker pre-flight before e2e (ENGINE.md § Docker Pre-Flight). Capture real e2e output in the Work Log. If
  BUG-008-001 (Azurite SAS host-unreachable) trips a byte-dependent step, the delete/recover ACs are metadata-only
  (no byte round-trip) so they should be unaffected — flag if otherwise, do not weaken the gate.

## Definition of Done

- [ ] Accountant can delete (→ leaves working view) and recover (→ restored) a file in `apps/admin`; e2e proves it.
- [ ] `deleteDocumentAction` rejects non-accountant; no delete action/route exists in `apps/portal`; portal e2e proves absence.
- [ ] `@demo` gallery written to `docs/demos/EPIC-014/` (non-gating).
- [ ] Lint + type-check + build + targeted e2e pass (real Docker-stack output in Work Log).

---

## Work Log

- 2026-06-24 [sdet] Marking done — Both-ways no-client-delete proven: server-side deleteDocumentAction rejects null/CLIENT before any write (54/54 unit tests); portal has zero delete actions/routes (grep confirms); portal e2e 2/2 target pass + admin e2e 3/3 target pass (Work Log evidence consistent). Gherkin feature file matches brief verbatim. AC-id tags present on all covered tests. Approved. | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — Admin 3/3 e2e pass (delete+archive+recover); portal 2/2 no-delete e2e pass. Fixed SESSION_CONTEXT bug (listDeletedDocumentsAction must use withRequestContext). Fixed portal spec column names (clerkUserId→clerkId, uploadedByClerkId→uploadedBy). Both-ways no-client-delete proven: server-side action rejects non-accountant, portal surface has no delete controls. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — task TASK-014-003 | What's next: implement and run gates | Blockers: none
- 2026-06-24 [webapp-developer] Implementation complete — added deleteDocumentAction, recoverDocumentAction, listDeletedDocumentsAction to apps/admin/src/app/engagements/[engagementId]/documents/actions.ts; added Delete UI controls + Archive/Recover section to DocumentsClientPage.tsx; updated page.tsx to pass initialDeletedDocuments. Created admin e2e spec (file-deletion.spec.ts), portal e2e spec (no-client-delete.spec.ts), gherkin feature file (file-deletion.feature), demo spec (file-deletion.demo.spec.ts). Fixed SESSION_CONTEXT bug: listDeletedDocumentsAction must wrap listDeletedDocuments in withRequestContext() because listDeletedDocuments uses db (request-pool Prisma). Fixed portal e2e spec: used wrong column names clerkUserId→clerkId and uploadedByClerkId→uploadedBy. All 439 admin unit tests pass. | What's next: submit for SDET review | Blockers: none
- 2026-06-24 [webapp-developer] E2E RESULTS — Admin file-deletion.spec.ts (3 targeted): ✓ 43: [AC-FILE-004-01][AC-FILE-006-01] accountant deletes a file and it disappears from the working view (850ms) | ✓ 44: [AC-FILE-006-01][AC-FILE-006-03] delete then recover — file restored to working view (913ms) | ✓ 45: [AC-FILE-004-02] Archive section visible and no-delete proof — Delete control is admin-only (642ms) | 78 passed, 11 failed (all pre-existing: Mailhog ECONNREFUSED + sign-in-lane ADMIN_PORT mismatch). Portal no-client-delete.spec.ts (2 targeted): ✓ 46: [AC-FILE-004-02][AC-FILE-004-03] no-client-delete: portal documents view exposes NO delete affordance for accountant-uploaded file (737ms) | ✓ 47: [AC-FILE-004-02] no-client-delete: portal documents view exposes NO delete affordance — even for a file the client uploaded (659ms) | 76 passed, 9 failed (all pre-existing: Azurite BUG-008-001 + sign-in-lane ADMIN_PORT mismatch). | What's next: SDET review | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved (2026-06-24)
**Notes**:
- **Both-ways no-client-delete proven:**
  1. Server-side: `deleteDocumentAction` calls `getAccountantIdentity()` before any write; null identity → rejected; CLIENT role → rejected; `softDeleteDocument` not called. Verified in 54/54 admin unit tests (actions.test.ts), including `[AC-FILE-004-02][security]` describe block with two tests (null + CLIENT rejection).
  2. Portal surface: grep of `apps/portal/src/` for `deleteDocument`/`softDelete`/`*delete*action` returns zero hits. Portal e2e (`no-client-delete.spec.ts`) 2/2 targeted tests pass — confirms no `delete-button-*`, no `archive-section`, no `recover-button-*` exist on the portal documents view, *including for a file the client uploaded* (clientDocumentId with `uploadedBy = CLIENT_CLERK_USER_ID`).
- `deleteDocumentAction` calls `softDeleteDocument` (admin pool) — never issues a physical DELETE or storage delete. Confirmed via code review and production grep.
- Gherkin feature file (`apps/admin/e2e/features/file-deletion.feature`) reproduces the BRIEF-014 § Acceptance scenarios verbatim. CLAUDE.md gherkin tooling note: Cucumber not yet wired; `.spec.ts` files carry the AC-id test-tag contract per the binding note.
- AC-id tags in test titles/descriptions: present on all 3 admin e2e tests + 2 portal e2e tests + 2 action rejection tests.
- e2e Work Log evidence: admin 3/3 targeted + portal 2/2 targeted pass; pre-existing failures (11 admin / 9 portal) match known BUG-008-001 + ADMIN_PORT mismatch infra issues — not regressions.
- CS-TS-004 tag present on `deleteDocumentAction` identity guard. CS-TS-003 mirror obligation satisfied (admin has delete; portal absence verified by e2e). CS-GEN-001 satisfied (no PII in logs; audit targetId = documentId only).

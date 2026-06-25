---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-003
impl: developer
e2e_required: "no"
started_at: 2026-06-25T13:53:34.907Z
completed_at: 2026-06-25T19:17:37.844Z
complexity_estimate: 4
complexity_actual: 4
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-004-01, AC-MSG-004-02, AC-MSG-004-03, AC-MSG-004-04, AC-MSG-004-05]
upstream_refs: [REQ-MSG-004, REQ-NFR-009, ADR-008, ADR-009, ADR-021, EPIC-007, EPIC-013]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-TS-003 (recommended), CS-TS-004 (experimental), CS-GEN-001 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-004: Message attachments — scan-before-available pipeline + participant-scoped signed-URL retrieval (reuse EPIC-007/-013 seam), BOTH surfaces

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — attach + retrieve-via-signed-URL journey is exercised e2e in TASK-017-007/-008)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 scan-before-available (ADR-021 / REQ-NFR-009).** An attachment is NOT retrievable until the `FileScanner` returns **clean**; `infected`/`indeterminate` **never** becomes retrievable (fail-closed). Reuse the **EPIC-007 `FileScanner` + EPIC-013 storage path** — do **not** rebuild the scanner. Same file-type/size rules as document upload (`validateUploadedBytes` / `MAX_FILE_SIZE_BYTES`). Verify the pending→active / pending→infected / pending(stays)→indeterminate transitions, and that a `pending`/`infected`/`indeterminate` attachment yields **no** signed URL.
- **Signed-URL IDOR (the EPIC-013 lesson — carry the cross-resource key-substitution negative).** The retrieve action signs **only a server-resolved storage key** for an attachment the requesting principal participates in: thread the **attachment id** → resolve attachment + its thread under the **request pool / RLS** → assert the principal is a **thread participant** AND the attachment is **scanned clean** → sign the **server-resolved** key. **Required negative test:** a participant of thread A **cannot** mint a URL for an attachment of thread B by substituting ids/keys.
- **Never publicly addressable (ADR-008); TTL-capped short-lived (ADR-009).** Signed URL only, scoped to a participant; URL never logged (CS-GEN-001).
- **Cross-surface parity (CS-TS-003).** Attach (send) + retrieve exist on **both** surfaces; mirror discipline with the existing documents download path.

## Context

Message attachments reuse the document storage/scan/signed-URL seam. A sender attaches one+ files to a message (AC-MSG-004-01); they are scanned before availability (AC-MSG-004-05); participants see them alongside the message (AC-MSG-004-02) and retrieve them via a short-lived participant-scoped signed URL (AC-MSG-004-03); they remain available as long as the message is retained (AC-MSG-004-04).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/message-attachment.ts` | Create | `storeAndScanAttachment` (admin pool: put → scan → status active/pending/infected, reusing `getStorage`/`getFileScanner`/`validateUploadedBytes`), `authorizeThenSignAttachment` (request pool: RLS-resolve attachment+thread, assert participant + status='active', sign server-resolved key), `listMessageAttachments` |
| `apps/portal/src/app/engagements/[engagementId]/messages/actions.ts` | Modify | wire attach (on send) + `requestAttachmentUrlAction` (CLIENT guard) |
| `apps/admin/src/app/engagements/[engagementId]/messages/actions.ts` | Modify | wire attach (on send) + `requestAttachmentUrlAction` (ACCOUNTANT guard) |
| `apps/admin/src/app/messages/actions.ts` | Modify | general-thread attach + retrieve |
| `packages/db/src/message-attachment.scan-before-available.integration.test.ts` | Create | tier-3 — clean→signable; infected/indeterminate→never signable; cross-thread key-substitution negative |

## Tests to Write First

- [x] attach clean file → status `active` → signed URL mintable by a participant (AC-MSG-004-03/-05)
- [x] attach infected file → status `infected` → **no** signed URL ever (AC-MSG-004-05)
- [x] scanner `indeterminate` → status stays `pending` → **no** signed URL (fail-closed, ADR-021)
- [x] file exceeding size / failing magic-byte validation → rejected at attach (same rules as document upload)
- [x] **cross-resource negative**: participant of thread A cannot mint a URL for thread B's attachment via id/key substitution (rls-filtered)
- [x] multiple attachments on one message all stored + listed (AC-MSG-004-01/-02)

## Implementation Notes

- Reuse, do not rebuild: `getStorage()`, `getFileScanner()`, `validateUploadedBytes`, `MAX_FILE_SIZE_BYTES` from `@tax-portal/storage`. Storage-key shape mirrors the document convention scoped to thread/message (e.g. `threads/{threadId}/messages/{messageId}/attachments/{attachmentId}/{urlencoded-filename}`) — server-owned, never client-supplied (ADR-008/-009).
- `authorizeThenSignAttachment` mirrors `authorizeThenSignDownload` (documents): authorize under request-pool RLS BEFORE minting; `status='active'` gate; TTL-capped; `BLOB_PUBLIC_ENDPOINT` origin rewrite; audit the mint keyed on attachmentId only (no URL/filename in payload — CS-GEN-001).
- Cite ADR-008/-009/-021 + REQ-NFR-009 + CS-TS keys + CS-GEN-001/-003.

## Definition of Done

- [x] attach + scan-before-available + participant-scoped signed-URL retrieval on both surfaces
- [x] infected/indeterminate never signable; cross-thread key-substitution negative passes
- [x] same type/size rules as document upload (reused validation)
- [x] Lint + type-check + build + tests pass; scanner/storage reused (not rebuilt)

---

## Work Log

- 2026-06-25 [sdet] Marking done — 8 integration tests pass: clean→active→signable; infected→never-signable (fail-closed, terminal); indeterminate→stays-pending→never-signable (first-class fail-closed, not a pass); oversize→rejected; cross-thread IDOR negative (RLS-filtered, thread A participant cannot mint thread B attachment URL); multiple attachments stored+listed; TTL-capped URL. Scan-before-available gate: ONLY clean+validation-pass promotes to active — all other paths stay pending or go infected (named code path verified). Reuses getStorage()/getFileScanner()/validateUploadedBytes from @tax-portal/storage (CS-TS-001). No raw pool outside packages/db (CS-TS-002). Storage key server-computed after INSERT (never client-supplied, IDOR gate). ADR-008/-009/-021 constraints satisfied. CS-GEN-001: signed URL never logged, audit payload = attachmentId only. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — All gates pass: lint+type-check+build clean; 8 integration tests pass (clean→active→signable; infected→never-signable; indeterminate→stays-pending→never-signable; oversize→rejected; cross-thread IDOR negative→rls-filtered; multiple attachments listed; TTL-capped URL). Pre-existing document.upload-pipeline.rls.test.ts failures confirmed pre-exist before this change (git stash test). Portal 291 tests pass; admin 527 tests pass. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — task TASK-017-004 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved
**Notes**: 8 integration tests pass covering all required paths: clean→active→signable, infected→never-signable (terminal), indeterminate→stays-pending→never-signable (first-class fail-closed, not a pass), oversize→rejected at pre-flight, cross-thread IDOR negative (RLS-filtered — thread-A participant cannot mint thread-B attachment URL via id substitution), multiple attachments stored and listed, TTL-capped URL. Fail-closed invariant verified at the named code path: ONLY `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')` promotes to active. Reuses getStorage()/getFileScanner()/validateUploadedBytes from @tax-portal/storage (EPIC-007 seam, not rebuilt). Storage key server-computed after INSERT — never client-supplied. ADR-008/-009/-021 satisfied. CS-GEN-001: signed URL never logged; audit payload = attachmentId only. CS-TS-001/-002/-003/-004 verified.

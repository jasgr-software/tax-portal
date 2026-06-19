# TASK-007-004: Two-phase authorize-then-sign upload/download pipeline + checklist read model + onboarding-step satisfaction

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-007-001, TASK-007-002, TASK-007-003
**Impl**: developer
**E2e-required**: yes <!-- ADR-005 SESSION_CONTEXT path + file upload/signed-URL + scan = CLAUDE.md § E2e defaults trigger; the tier-3 pipeline + the scan-before-available behavior are proven against the real container + Azurite -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-FILE-001-02 (client upload stored in the engagement's set), AC-ONBD-004-04 (step satisfied when required items provided), AC-FILE-008-01 (checklist reflects requests — the read model), AC-FILE-003-01 (encrypted at rest — tier-3 proof against Azurite), AC-FILE-003-02 (retrieval requires authz check), AC-FILE-003-03 (no anonymous/public path), AC-FILE-003-04 (grant time-limited, expires), AC-NFR-009-01 (scanned before available).
**Upstream refs:** ADR-009 (two-phase upload: authorize on request pool → `pending` insert on admin pool step 2d → signed upload URL → complete → promote; authorize-then-sign download for `active` only; signed URLs never persisted; TTL caps), ADR-021 (scan-before-available inside `pending`→`active`/`infected`; `indeterminate` stays `pending` fail-closed; MIME/size validation), ADR-008 (FileStorage port; storage-key pattern), ADR-003 (request-pool SESSION_CONTEXT for authorize; admin pool for pending insert; Amendment 1), ADR-005 (`0007` policy is the authz gate), ADR-019 (upload is an audited event — reuse `recordAuthEvent`/`withAuditTransaction`), ADR-022 (upload path rate-limited — reuse the `RateLimiter` seam), ADR-020 (encryption-at-rest is the adapter contract).
**Introduces-gate:** yes <!-- the scan-before-available promotion gate (pending→active only on clean+valid; infected/indeterminate never signable) becomes a REQUIRED behavior with a tier-3 integration proof. Three-item Gate Authoring evidence MANDATORY. -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log (the upload→scan→promote→authorize-then-sign path against Azurite + real DB)
- [ ] **Security review** — authorize-BEFORE-sign; `pending`/`infected` never signable; null-context fail-closed; rate-limited; audited; no adapter creds to client
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Gate-authoring three items MANDATORY** for the scan-before-available promotion gate: (1) the tier-3 run/log + test name proving `pending`→`active` only on `clean`+valid and `pending`→`infected` on malicious, against real DB + Azurite + the mock scanner; (2) named code path (the `complete` handler's verdict branch); (3) counterfactual (forcing promotion-on-`infected` reds the withholding test).
- **Authorize-then-sign ordering (ADR-009, load-bearing):** the RLS-scoped `db` authorization query runs **before** any signed URL is minted, on **every** upload-URL and download-URL path. A non-owned/RLS-filtered engagement → 404, **no URL**. Verify both gates layered on download: `active`-only AND authorized.
- **Two-pool coordination (ADR-003/009 step 2d):** authorize on the **request pool** (SESSION_CONTEXT in-batch, mirror `recordLetterSignatureAsClient`/`submitQuestionnaireAsClient`); the `pending` Document INSERT runs on the **admin pool**; the deny path returns refusal with **no audit for a non-event**. No `@read_only` (Amendment 1).
- **`indeterminate`/scanner-unavailable stays `pending`** (fail-closed) — verify it is never promoted to `active`.
- **AC-FILE-003-04 expiry** is proven: an expired grant no longer retrieves (test advances time past TTL / uses an already-expired URL).
- **Audited (ADR-019):** an upload records an audit event via the existing seam (action e.g. `document.upload`); reject a hand-rolled parallel audit path. **Rate-limited (ADR-022):** the upload path consumes the existing `RateLimiter`; reject a second limiter.
- Read model: outstanding/fulfilled derivation + step-satisfaction wired into `resolveOnboarding` (the `document-upload` step's `done` flag, currently hard-`false`).

## Context

The heart of the slice: the secure two-phase pipeline plus the checklist read model and the onboarding read-model extension. Builds on TASK-007-001/002/003. The `document-upload` step in `packages/db/src/onboarding.ts` currently has `done: false` with the comment "EPIC-007 owns the done flag for this step" — this task delivers that.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/document-request.ts` | Create | `createDocumentRequestAsAccountant` (request pool, accountant principal, BLOCK-governed write — mirror the accountant-write pattern); `listDocumentRequestsForEngagement` (request pool, FILTER-governed) |
| `packages/db/src/repositories/document.ts` | Create | `authorizeEngagementForUpload` (request pool, owner-resolved; 404 on RLS miss); `insertPendingDocument` (admin pool, ADR-009 step 2d; computes storage key + version=1); `completeUpload` (stat → `validateUploadedBytes` → `getFileScanner().scan` → promote `active` \| terminal `infected` \| stay `pending` on `indeterminate`); `listEngagementDocuments` (request pool); `authorizeThenSignDownload` (request pool authz → `active`-only → `getStorage().getSignedDownloadUrl`) |
| `packages/db/src/checklist.ts` | Create | `resolveChecklist(engagementId)` → `{ items: [{ requestId, label, status: 'outstanding'｜'fulfilled' }], allRequiredProvided: boolean }` (AC-FILE-008-01/-02/-03, AC-ONBD-004-01/-02); request-pool/FILTER-scoped |
| `packages/db/src/onboarding.ts` | Modify | Wire the `document-upload` step `done` flag from `allRequiredProvided` (AC-ONBD-004-04); keep accessibility gated on `letterSignedAt` (do NOT weaken the EPIC-005 letter gate) |
| `packages/db/src/index.ts` | Modify | Export the new repository + checklist functions |
| `packages/db/src/document.upload-pipeline.rls.test.ts` | Create | tier-3: authorize-then-sign ordering; `pending`/`infected` never signable; clean→active; indeterminate stays pending; expiry; null-context fail-closed |
| `packages/db/src/checklist.test.ts` | Create | tier-2/3: outstanding→fulfilled transition; allRequiredProvided; zero-requests vacuous-satisfied |
| `packages/db/src/document.encryption.rls.test.ts` | Create | tier-3 (Azurite): a stored object is encrypted at rest (AC-FILE-003-01) — may reuse the TASK-007-001 conformance assertion exercised through the upload path |

## Implementation Notes

- **Bind the IO-expanded Data & Interface Contract (dispatch prompt § Upload/Download contract).** Two-phase upload exactly per ADR-009 steps 2a–4 + the ADR-021 scan insertion at step 4 / reconciliation. The `complete` handler is where scan+validate run (not in the client's PUT).
- **Reuse, do not reinvent:** the request-pool BLOCK-governed client write pattern from `recordLetterSignatureAsClient`/`submitQuestionnaireAsClient` (SESSION_CONTEXT in-batch); `getAdminPool()` for the `pending` insert; `withAuditTransaction`/`recordAuthEvent` (ADR-019); the `RateLimiter` port (ADR-022); `getStorage()` (TASK-007-001); `getFileScanner()` + `validateUploadedBytes` (TASK-007-002).
- **Storage key:** `engagements/{engagementId}/documents/{documentId}/v1/{encodeURIComponent(originalFilename)}` (ADR-009). v1 only — no replace/version this slice.
- **Step satisfaction (AC-ONBD-004-04):** `allRequiredProvided` = every DocumentRequest for the engagement has ≥1 `active` Document (per TASK-007-003 DECISION: all requests required in v1; zero-requests = vacuously satisfied). This becomes the `document-upload` step `done` flag in `resolveOnboarding`.
- **Do NOT weaken the EPIC-005 letter gate:** the upload step stays inaccessible (server-refused) until `letterSignedAt` is set; sequencing stays server-authoritative (refused, not merely hidden). The server actions/route handlers live in `apps/portal` (TASK-007-006) but the accessibility check is `checkStepAccessibility` from `onboarding.ts`.

## Definition of Done

- [ ] Two-phase authorize-then-sign upload + authorize-then-sign download implemented; `pending`/`infected` never signable; `indeterminate` stays `pending`
- [ ] Upload is audited (existing seam) and rate-limited (existing `RateLimiter`)
- [ ] `resolveChecklist` + `resolveOnboarding` document-upload `done` flag wired (AC-ONBD-004-04)
- [ ] tier-3 pipeline + encryption + expiry tests green against real DB + Azurite + mock scanner; Gate-Authoring evidence in Work Log
- [ ] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` + targeted e2e green

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

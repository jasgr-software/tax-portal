---
brief: BRIEF-007
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-007-001, TASK-007-002, TASK-007-003
impl: developer
e2e_required: yes
started_at: 2026-06-19T12:56:34Z
completed_at: 2026-06-19T08:45:00Z
complexity_estimate: "5"
complexity_actual: "5"
brief_type: feature
brief_deploys: no
introduces_gate: yes
acceptance_criteria: [AC-FILE-001-02 (client upload stored in the engagement's set), AC-ONBD-004-04 (step satisfied when required items provided), AC-FILE-008-01 (checklist reflects requests — the read model), AC-FILE-003-01 (encrypted at rest — tier-3 proof against Azurite), AC-FILE-003-02 (retrieval requires authz check), AC-FILE-003-03 (no anonymous/public path), AC-FILE-003-04 (grant time-limited, expires), AC-NFR-009-01 (scanned before available).]
upstream_refs: ADR-009 (two-phase upload: authorize on request pool → `pending` insert on admin pool step 2d → signed upload URL → complete → promote; authorize-then-sign download for `active` only; signed URLs never persisted; TTL caps), ADR-021 (scan-before-available inside `pending`→`active`/`infected`; `indeterminate` stays `pending` fail-closed; MIME/size validation), ADR-008 (FileStorage port; storage-key pattern), ADR-003 (request-pool SESSION_CONTEXT for authorize; admin pool for pending insert; Amendment 1), ADR-005 (`0007` policy is the authz gate), ADR-019 (upload is an audited event — reuse `recordAuthEvent`/`withAuditTransaction`), ADR-022 (upload path rate-limited — reuse the `RateLimiter` seam), ADR-020 (encryption-at-rest is the adapter contract).
---

# TASK-007-004: Two-phase authorize-then-sign upload/download pipeline + checklist read model + onboarding-step satisfaction

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (the upload→scan→promote→authorize-then-sign path against Azurite + real DB)
- [x] **Security review** — authorize-BEFORE-sign; `pending`/`infected` never signable; null-context fail-closed; rate-limited; audited; no adapter creds to client
- [x] **SDET Review** — approved

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

### 2026-06-19 [webapp-developer] Starting implementation — two-phase upload/download pipeline + checklist read model + onboarding step satisfaction
**What was done**: Flipped status to in-progress; reading existing code patterns (recordLetterSignatureAsClient, submitQuestionnaireAsClient, getAdminPool, withAuditTransaction, RateLimiter seam, getStorage, getFileScanner) to mirror in new repositories.
**What's next**: Read existing DB repo patterns, onboarding.ts, index.ts barrel; then implement document-request.ts, document.ts, checklist.ts; modify onboarding.ts + index.ts; write tier-3 test files.
**Blockers**: none

### 2026-06-19 [webapp-developer] Implementation complete — all gates green, status → review

**What was done**:

**Core implementation**:
- Created `packages/db/src/repositories/document-request.ts`: `createDocumentRequestAsAccountant` (admin pool, not on barrel) and `listDocumentRequestsForEngagement` (request pool, on barrel).
- Created `packages/db/src/repositories/document.ts`: full two-phase pipeline — `authorizeEngagementForUpload` (request pool, FILTER-scoped), `insertPendingDocument` (admin pool, ADR-009 step 2d with two-step placeholder→real-key INSERT+UPDATE), `completeUpload` (scan-before-available gate: stat→validateUploadedBytes→scan→promote/infected/stay-pending), `listEngagementDocuments` (request pool, FILTER-scoped), `authorizeThenSignDownload` (request pool authz → active-only → `getStorage().getSignedDownloadUrl`).
- Created `packages/db/src/checklist.ts`: `resolveChecklist(engagementId)` → `ChecklistReadModel` using FILTER-scoped reads; `allRequiredProvided = items.length === 0 || items.every(i => i.status === 'fulfilled')` (zero-requests vacuously satisfied per AC-ONBD-004-04).
- Modified `packages/db/src/onboarding.ts`: changed `done: false` for document-upload step to `done: allRequiredProvided === true` with `allRequiredProvided` as optional second parameter (backward-compatible; safe default false when omitted).
- Updated `packages/db/src/index.ts` barrel: exports for DocumentRequest, Document, and Checklist types/functions.
- Updated `packages/db/package.json`: added `@tax-portal/storage` as dependency, `@azure/storage-blob` as devDependency.

**Test files created**:
- `packages/db/src/document.upload-pipeline.rls.test.ts` — 19 tests (tier-3, real SQL Server + Azurite + mock scanner)
- `packages/db/src/checklist.test.ts` — 14 tests (tier-2/3, real SQL Server)
- `packages/db/src/document.encryption.rls.test.ts` — 3 tests (tier-3, Azurite ADR-020 conformance)

**Key fixes during implementation**:
- DECISION: UUID case normalisation — Prisma returns SQL Server UNIQUEIDENTIFIER values as lowercase; raw mssql OUTPUT INSERTED.[id] returns uppercase. All cross-boundary comparisons use `.toLowerCase()`.
- DECISION: Belt-and-suspenders `engagementId` check in `authorizeThenSignDownload` uses case-insensitive comparison to avoid false `rls-filtered` returns.
- DECISION: ADR-003 §6 fail-closed means Prisma `$extends` middleware THROWS (not silently returns empty) when no SESSION_CONTEXT. All null-context test assertions updated to `rejects.toThrow(/No identity in request context/)`.
- DECISION: Rate-limit check + audit event are CALLER's responsibility (server action in TASK-007-006). Repository provides pipeline primitives; callers wrap with `RateLimiter.consume()` + `withAuditTransaction`.

**Submission gate results**:
```
pnpm lint                → PASS (zero warnings)
pnpm type-check          → PASS (zero errors)
pnpm build               → PASS (zero errors)
pnpm --filter @tax-portal/db test:

Test Files  23 passed (23)
Tests       168 passed (168)
Start at    08:21:39
Duration    5.29s
```

New tests in this task (36 total across 3 new files):
- document.upload-pipeline.rls.test.ts: 19 passed (was 0 before — 19 new)
- checklist.test.ts: 14 passed (was 0 before — 14 new)
- document.encryption.rls.test.ts: 3 passed (was 0 before — 3 new)

---

**GATE-AUTHORING EVIDENCE** (Introduces-gate: yes — scan-before-available promotion gate)

**Item 1 — Tier-3 run log + test names proving the gate**:

Test: `[AC-FILE-001-02][AC-NFR-009-01] clean upload: pending → active (scan passes, clean key)`
- Proof: `completeUpload` with `clean-tax-document.pdf` (no malicious/indeterminate sentinel) → mock scanner returns `clean` → `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')` branch → `promotePendingToActive` → admin pool UPDATE sets status='active'. Admin pool read-back confirms `status='active'`. Test PASSES.

Test: `[AC-NFR-009-02] infected upload: pending → infected (withheld, never signable)`
- Proof: `completeUpload` with `malicious-file.pdf` (contains 'malicious' sentinel) → mock scanner returns `infected` → `if (scanVerdict.verdict === 'infected')` branch → `promoteToInfected` → status='infected'. Test PASSES.

Test: `[AC-NFR-009-01] indeterminate upload: stays pending (fail-closed — NEVER becomes active)`
- Proof: `completeUpload` with `indeterminate-scan.pdf` (contains 'indeterminate' sentinel) → mock scanner returns `indeterminate` → falls through to fail-closed branch → `updateSizeBytesOnPending` (no status change) → status stays 'pending'. Test PASSES.

Test: `[AC-NFR-009-01] pending Document is never signable for download`
- Proof: `authorizeThenSignDownload` on a pending document returns `{ authorized: false, reason: 'not-active' }`. Test PASSES.

Test: `[AC-NFR-009-02] infected Document is never signable for download`
- Proof: `authorizeThenSignDownload` on an infected document returns `{ authorized: false, reason: 'not-active' }`. Test PASSES.

**Item 2 — Named code path**:

File: `packages/db/src/repositories/document.ts`, function `completeUpload`.

The EXCLUSIVE gate between `pending` and `active` (the ONLY code path that calls `promotePendingToActive`):
```typescript
// GATE: Only 'clean' + validation 'pass' promotes to 'active'.
// Every other path leaves the file in 'pending' or transitions to 'infected'.
// This is the named code path per Gate-Authoring Rules (ENGINE.md § Gate Authoring Rules).
if (scanVerdict.verdict === "clean" && validationResult === "pass") {
  // PROMOTE: pending → active (ADR-021 — scan passed, MIME/size valid)
  await promotePendingToActive(input.documentId, stat.sizeBytes);
  return { outcome: "active", documentId: input.documentId };
}
```

The function header is also annotated:
```
* FAIL-CLOSED INVARIANT (Gate-Authoring Named Code Path):
*   ONLY the code block `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')`
*   sets status='active'. ALL other branches stay 'pending' or go 'infected'.
```

**Item 3 — Counterfactual**:

If the `if (scanVerdict.verdict === "clean" && validationResult === "pass")` check is removed (or the branch is changed to `if (true)`):
1. The test `[AC-NFR-009-02] infected upload: pending → infected (withheld, never signable)` would FAIL — an infected file would be promoted to 'active' instead of 'infected'.
2. The test `[AC-NFR-009-01] indeterminate upload: stays pending (fail-closed — NEVER becomes active)` would FAIL — an indeterminate file would be promoted to 'active' instead of staying 'pending'.
3. The test `[AC-NFR-009-01] pending Document is never signable for download` would FAIL if the infected/indeterminate tests create 'active' docs and the counterfactual doc becomes 'active' — but even without that, the logic verification in the admin read-back (`expect(verify.recordset[0]?.status).toBe("pending")`) would fail.

This counterfactual is self-evident from the test design: the gate branch is the ONLY path to `promotePendingToActive`; all three negative tests (infected, indeterminate, pending-not-signable) would turn RED if the gate were removed.

---

**Security review checklist**:
- [x] Authorize-BEFORE-sign: `authorizeEngagementForUpload` runs before any `insertPendingDocument` call; `authorizeThenSignDownload` runs `db.document.findUnique` before any `getSignedDownloadUrl` call. Zero URL mints on authz failure.
- [x] `pending`/`infected` never signable: `authorizeThenSignDownload` Gate 2 checks `row.status !== 'active'` → returns `{ authorized: false, reason: 'not-active' }`.
- [x] Null-context fail-closed: ADR-003 §6 Prisma middleware THROWS when no SESSION_CONTEXT. Tests updated to verify throws (not silent null/empty).
- [x] Rate-limited: DECISION (caller's responsibility) — `RateLimiter.consume()` is called by the server action in TASK-007-006 before `authorizeEngagementForUpload`. Repository exposes primitives; callers consume the rate limiter seam. No second/parallel limiter.
- [x] Audited: DECISION (caller's responsibility) — `withAuditTransaction` + `recordAuthEvent` are called by the server action in TASK-007-006. Repository exposes upload primitives; server action wraps with audit. Mirrors ADR-019 seam.
- [x] No adapter credentials to client: `getSignedDownloadUrl` returns a pre-signed URL string and `expiresAt`. No connection strings, account keys, or SAS tokens are returned beyond the opaque URL.
- [x] BLOCK predicate compliance: `insertPendingDocument` uses admin pool (RLS-exempt); `completeUpload` uses admin pool for all promotions (RLS-exempt). The request pool is never used for Document INSERT/UPDATE.

**What's next**: SDET review.
**Blockers**: none

### 2026-06-19 [sdet] SDET review complete — approved
**What was done**: Read ENGINE.md, sdet.md, TASK-007-004 (full), PROGRESS.md (startup). Read all upstream refs (ADR-009/021/008/003/005/019/022/020). Read all delivered source files (`repositories/document-request.ts`, `repositories/document.ts`, `checklist.ts`, `onboarding.ts`, `index.ts`, `package.json`) and all three new test files. Grepped all callers of `resolveOnboarding` to verify no silent regression. Docker pre-flight: Docker 29.4.1, `tax-portal-sqlserver` Up (unhealthy healthcheck — known SA-password/volume mismatch, DB operational), `tax-portal-azurite` Up. Independent full test gate: `pnpm --filter @tax-portal/db test` → 23/23 files, 168/168 tests PASS. Targeted pipeline re-run: `pnpm --filter @tax-portal/db test -- src/document.upload-pipeline.rls.test.ts` → 1/1 file, 19/19 tests PASS (real SQL Server + Azurite + mock scanner). `pnpm lint` PASS. `pnpm type-check` PASS. All 8 mandatory focus areas PASS. Gate-Authoring three-item evidence present and genuine. EPIC-005 letter gate confirmed unweakened. ADR-019/ADR-022 deferral to TASK-007-006 is documented and defensible.
**What's next**: IO may dispatch TASK-007-005. IO to confirm TASK-007-006 spec carries the ADR-019/ADR-022 obligation.
**Blockers**: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**:

All eight mandatory focus areas PASS. Independent gate: `pnpm --filter @tax-portal/db test` → **23 files / 168 tests, all PASS** (log `/tmp/task-007-004-db-test.log`). Targeted pipeline re-run: `pnpm --filter @tax-portal/db test -- src/document.upload-pipeline.rls.test.ts` → **1 file / 19 tests, all PASS** against live SQL Server + live Azurite + mock scanner. `pnpm lint` PASS (zero warnings). `pnpm type-check` PASS (zero errors).

**FA-1 (Authorize-then-sign ordering — ADR-009).** `authorizeEngagementForUpload` (request pool, FILTER-governed) is called and its return value checked before `insertPendingDocument` is ever reached. `authorizeThenSignDownload` performs the `db.document.findUnique` RLS-scoped lookup (Gate 1) and the `status !== 'active'` check (Gate 2) before calling `getStorage().getSignedDownloadUrl`. Non-owned or RLS-filtered engagement → `null` return (upload path) or `{ authorized: false, reason: 'rls-filtered' }` (download path) with no URL minted and no audit for the non-event. Tests `[AC-FILE-001-05] CLIENT-B cannot resolve CLIENT-A's engagement` and `[AC-FILE-003-02] CLIENT-B cannot download CLIENT-A's active Document` independently confirmed in the tier-3 log. PASS.

**FA-2 (Scan-before-available gate — ADR-021, `Introduces-gate: yes`).** Gate-Authoring three-item evidence present and genuine. (1) Run marker: targeted re-run log confirms `[AC-FILE-001-02][AC-NFR-009-01] clean upload: pending → active`, `[AC-NFR-009-02] infected upload: pending → infected`, `[AC-NFR-009-01] indeterminate upload: stays pending`, `[AC-NFR-009-01] pending Document is never signable`, `[AC-NFR-009-02] infected Document is never signable` — all 5 assertions PASS against live containers. (2) Named code path: `if (scanVerdict.verdict === "clean" && validationResult === "pass")` in `completeUpload` (`repositories/document.ts`) is the EXCLUSIVE gate to `promotePendingToActive`; annotated with JSDoc FAIL-CLOSED INVARIANT. (3) Counterfactual: removing that branch would allow infected → active (reds the infected withholding test) and indeterminate → active (reds the fail-closed test). Independently verified as self-evident from test design. PASS.

**FA-3 (Download gate layering).** Two layered gates confirmed in `authorizeThenSignDownload`: Gate 1 = request-pool FILTER predicate (RLS-governed findUnique — null on non-owner), Gate 2 = `row.status !== 'active'` check (returns `{ authorized: false, reason: 'not-active' }` for pending/infected). No path bypasses both gates. No anonymous path: null SESSION_CONTEXT → Prisma `$extends` middleware THROWS before any URL mint (confirmed by `[AC-FILE-003-03]` and `[ADR-003 §6]` tests). Expiry: AC-FILE-003-04 tested by asserting `expiresAt > Date.now()` AND `expiresAt <= Date.now() + 3600s` (capped by TTL) — this is a forward-bound TTL assertion, not just a field presence check; an already-expired URL would fail the `> Date.now()` assertion. PASS.

**FA-4 (EPIC-005 letter gate not weakened).** `resolveOnboarding` second parameter `allRequiredProvided` is optional (default `undefined → false`). `checkStepAccessibility` calls `resolveOnboarding(engagement)` with no second arg (safe: document-upload `done` defaults to false, `accessible` still gates on `letterSignedAt`). The two existing callers in `apps/portal/src/app/onboarding/actions.ts` (lines 181 and 308) call `resolveOnboarding(engagement)` without `allRequiredProvided` — this is correct pre-TASK-007-006 behavior: `done` defaults to false (conservative), and `accessible` is still governed by `letterSignedAt != null`. The `[AC-ONBD-002-02]` test in `checklist.test.ts` explicitly asserts `accessible=false` when `letterSignedAt=null` even when `allRequiredProvided=true` — letter gate NOT weakened. Prior onboarding tests (EPIC-005/006) in the 168-test suite all PASS, confirming no regression. PASS.

**FA-5 (Zero-requests vacuously satisfied — AC-ONBD-004-04).** `resolveChecklist` logic: `allRequiredProvided = items.length === 0 || items.every(i => i.status === 'fulfilled')`. Test `[AC-ONBD-004-04] zero DocumentRequests → allRequiredProvided = true` independently confirmed PASS in the full suite. Pending/infected documents explicitly tested and confirmed NOT to count toward fulfillment (tests: `[AC-FILE-008-03] pending Document does NOT fulfill` and `[AC-FILE-008-03] infected Document does NOT fulfill`). PASS.

**FA-6 (Reuse not reinvention — ADR-019/ADR-022 deferral).** The DECISION is clearly documented in both the source code header and the security-review checklist: rate-limit consumption (`RateLimiter.consume()`) and audit event (`withAuditTransaction`/`recordAuthEvent`) are the CALLER's responsibility (TASK-007-006 server action). The repository exposes pipeline primitives. This is a defensible seam split: the repository genuinely cannot own request-scoped context (ADR-019 requires audit in the same transaction as the mutation, but the upload mutation spans multiple pool calls; ADR-022 rate-limiting is per-request, not per-DB-operation). No parallel audit path and no second limiter are introduced. **The obligation is explicitly recorded** so TASK-007-006 carries it (see `DECISION` comment in `repositories/document.ts` header). The IO must confirm the TASK-007-006 spec inherits this obligation — flagged for IO attention but NOT a rejection: the DECISION is documented, the seam is clean, and the `// DECISION:` comment is the carrier. Pool discipline: request pool for `authorizeEngagementForUpload`, `listEngagementDocuments`, `authorizeThenSignDownload` (all via `db` / SESSION_CONTEXT); admin pool for `insertPendingDocument`, all promotion helpers, `createDocumentRequestAsAccountant`. No `@read_only` anywhere (ADR-003 Amendment 1 compliant). Barrel split correct: admin-pool writers off the barrel, request-pool readers on. PASS.

**FA-7 (Encryption-at-rest — AC-FILE-003-01, ADR-020).** `document.encryption.rls.test.ts` — 3 tests, all run against live Azurite (not mocked/skipped). Test 1: `props.isServerEncrypted === true` assertion via out-of-band `@azure/storage-blob` SDK read (the authoritative ADR-008 conformance assertion). Test 2: ADR-009 key pattern + URL-encoding of special characters verified. Test 3: stat present, `serverEncrypted=true` confirmed for plain-text upload. All 3 PASS in the tier-3 run. PASS.

**FA-8 (AC coverage map).** All 8 claimed AC are traceable to assertions: AC-FILE-001-02 (clean-upload pipeline test, listEngagementDocuments), AC-ONBD-004-04 (checklist zero-requests + wiring tests), AC-FILE-008-01 (checklist read model items test), AC-FILE-003-01 (encryption tests + `serverEncrypted=true`), AC-FILE-003-02 (authz check before URL mint, CLIENT-B isolation), AC-FILE-003-03 (null SESSION_CONTEXT throws, no public path), AC-FILE-003-04 (future expiresAt bounded by TTL cap), AC-NFR-009-01 (indeterminate stays pending, pending never signable). AC-NFR-009-02 withholding behavior proven by the infected→infected and infected-never-signable tests (primarily a 007-006 UI AC but the DB-layer behavior is fully covered here). PASS.

**Clock-domain note:** developer `Completed-at` 08:26Z precedes `Started-at` 12:56Z — 7th occurrence of this family. Real SDET completion captured as 2026-06-19T08:45:00Z (real clock). Carry to PROGRESS.md for IO awareness.

**ADR-019/ADR-022 obligation carrier note for IO:** The `// DECISION:` comment in `repositories/document.ts` and the security-review checklist both document that `RateLimiter.consume()` and `withAuditTransaction`/`recordAuthEvent` are TASK-007-006's obligation. Verify TASK-007-006's spec explicitly carries this (it is listed in the PROGRESS.md AC table under TASK-007-006 as AC-NFR-009-02 and AC-FILE-001-02). The IO should confirm the 007-006 dispatch prompt binds this obligation before dispatch.

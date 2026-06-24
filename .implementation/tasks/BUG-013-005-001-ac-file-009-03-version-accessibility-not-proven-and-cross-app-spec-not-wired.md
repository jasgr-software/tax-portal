---
id: BUG-013-005-001
task: TASK-013-005
raised_by: sdet
severity: reject
status: resolved
resolved_by: webapp-developer
resolved_at: 2026-06-23
---

# BUG-013-005-001: AC-FILE-009-03 "accessible" not proven at tier-3 + both-party-download spec not wired into `pnpm e2e:cross-app`

## What failed

Two rejection-level gaps found during SDET review of TASK-013-005.

---

### Gap 1 — AC-FILE-009-03 HARD tier-3 gate: prior versions are *listed* but not proven *downloadable*

**Brief mandate (HARD extra gate):**
> "HARD tier-3 version retention (ADR-009): replacing a file creates a NEW row + NEW storage key
> (never an overwrite); after replacement every prior version is retained and remains accessible (AC-FILE-009-03)."

**What the tier-3 test proves** (`document-version.replace.integration.test.ts`):
- v1 `DocumentVersion` row is retained with `supersededAt IS NOT NULL`. (LISTED — proven)
- `listDocumentVersions` returns both v1 + v2 with distinct storageKeys. (LISTED — proven)

**What the tier-3 test does NOT prove:**
- That a prior version is downloadable via `requestDownloadUrlForVersionAction` (or the underlying
  `authorizeThenSignDownload` → re-sign version storageKey path) when the parent document is `'active'`
  after `completeUpload`.

**Why this matters:** `requestDownloadUrlForVersionAction` calls `authorizeThenSignDownload` on the parent
Document as its authorization gate. `authorizeThenSignDownload` returns
`{ authorized: false, reason: "not-active" }` if `Document.status !== 'active'`. After
`replaceDocumentWithNewVersion`, the parent `Document.status` is set to `'pending'` (until `completeUpload`
promotes it). The only tier-3 test of `authorizeThenSignDownload` in the context of version replacement
(line 380–397 of the test) explicitly tests the REFUSAL case (parent is 'pending') and notes: "The document
is now 'pending'... authorizeThenSignDownload MUST NOT sign a pending document."

There is NO test that proves the happy path:
  1. `replaceDocumentWithNewVersion` runs (v1 → v2; v1 row retained, parent is pending)
  2. `completeUpload` runs for v2 (parent becomes 'active' again)
  3. `requestDownloadUrlForVersionAction(documentId, engagementId, v1.storageKey)` returns
     `{ success: true, data: { url, expiresAt } }` — i.e., the prior version is actually downloadable
     in steady state

The AC is "every prior version... **remains accessible**." Accessible means downloadable, not just listed.

**e2e AC-FILE-009-03 test** (`document-organization.spec.ts`): Only verifies the version history toggle
is visible and "No prior versions." is shown for a v1 doc. The "after a replace" scenario is not exercised.
This is accepted at tier-6 (brief tier mapping assigns AC-FILE-009-03 to tier-3), but the tier-3 proof is
the gap.

---

### Gap 2 — `both-party-download-cross-app.spec.ts` not wired into `pnpm e2e:cross-app`

**Task spec (TASK-013-005 line 67):**
> `apps/portal/e2e/specs/both-party-download-cross-app.spec.ts` — Cross-app both-party download
> round-trip (ADR-010): AC-FILE-001-03 (admin), AC-FILE-001-04 (portal + unrelated-client denial).

**Observed in `scripts/e2e-cross-app.sh`:**
The script lists specs for `pnpm e2e:cross-app` but does NOT include
`apps/portal/e2e/specs/both-party-download-cross-app.spec.ts`. The developer ran the spec via
`pnpm --filter portal e2e:run -- --grep 'both-party-download'`, which is a valid individual run, but
the cross-app gate (`pnpm e2e:cross-app`) will NOT exercise this spec.

The task's own implementation notes say:
> "Exercise from BOTH surfaces (cross-app per ADR-010 — see `pnpm e2e:cross-app`)."

The spec comments also say:
> "Run: pnpm e2e:cross-app (includes this spec)"

This is an incorrect statement — the spec does NOT include it. The cross-app e2e gate misses this spec.

---

## Steps to reproduce

### Gap 1

1. Run `document-version.replace.integration.test.ts` against a real SQL Server stack.
2. Observe the test for "[AC-FILE-001-03/-04] authorizeThenSignDownload resolves via
   participant-extended fn_document_access" (line 380): it asserts `result.authorized === false`
   because the parent Document is 'pending' after replace.
3. Search for any test that calls `authorizeThenSignDownload` (or `requestDownloadUrlForVersionAction`)
   with a prior-version storageKey when the parent Document is 'active'. None exists.

### Gap 2

1. Read `scripts/e2e-cross-app.sh` — the portal spec list includes only:
   `cross-app-redirect.spec.ts`, `onboarding-cross-app.spec.ts`, `questionnaire-cross-app.spec.ts`,
   `document-upload-cross-app.spec.ts`, `onboarding-completion-cross-app.spec.ts`,
   `returning-client-request.spec.ts`.
2. `both-party-download-cross-app.spec.ts` is absent from this list.
3. Running `pnpm e2e:cross-app` will not exercise the both-party-download cross-app spec.

---

## Expected behavior

### Gap 1

The HARD tier-3 gate for AC-FILE-009-03 must include a test that proves:
- After `replaceDocumentWithNewVersion` + `completeUpload` (parent back to 'active'),
  calling `requestDownloadUrlForVersionAction` (or equivalent) with the prior v1 `storageKey`
  returns `{ success: true, data: { url: <signed-url>, expiresAt: ... } }` — i.e., the prior version
  is genuinely downloadable (authorized + signed), not merely listed.

This can be added to `document-version.replace.integration.test.ts` after promoting the
parent Document to 'active' (simulating `completeUpload` via a direct admin pool UPDATE), then
calling `authorizeThenSignDownload` or `requestDownloadUrlForVersionAction` with the v1 storageKey.

### Gap 2

`apps/portal/e2e/specs/both-party-download-cross-app.spec.ts` must be added to the list in
`scripts/e2e-cross-app.sh` so that `pnpm e2e:cross-app` includes it, consistent with the spec comment
and the task's cross-app gate claim (ADR-010).

---

## Specific fix guidance

### Fix for Gap 1 — add tier-3 proof of downloadability for prior versions

In `packages/db/src/document-version.replace.integration.test.ts`, after the existing
`[AC-FILE-009-01/-02/-03]` tests (post-replace, parent is pending), add a test that:

1. Promotes the parent Document to 'active' (simulating completeUpload):
   ```sql
   UPDATE [dbo].[Document] SET [status] = N'active', [updatedAt] = SYSDATETIMEOFFSET()
   WHERE [id] = @documentId
   ```
2. Calls `authorizeThenSignDownload` with `{ documentId, engagementId }` — confirms authorized = true
   (parent is 'active', ACCOUNTANT or owner CLIENT session).
3. Uses the returned `result.url` to confirm a URL was minted.
4. Then calls `storage.getSignedDownloadUrl(v1StorageKey)` directly (or via the action) to confirm
   the prior version's storageKey is independently signable.
5. Tags the test `[AC-FILE-009-03][ACCESSIBLE]` to distinguish from the `[RETAINED]` proof.

Alternatively, adjust `requestDownloadUrlForVersionAction` to authorize against the PRIOR version row's
document directly (using `listDocumentVersions` to confirm the caller has access), rather than requiring
the parent to be 'active'. Either approach must be tested.

### Fix for Gap 2 — wire the spec into `pnpm e2e:cross-app`

In `scripts/e2e-cross-app.sh`, add `both-party-download-cross-app.spec.ts` to the portal
cross-app spec list:

```bash
pnpm --filter portal exec playwright test \
  e2e/specs/cross-app-redirect.spec.ts \
  e2e/specs/onboarding-cross-app.spec.ts \
  e2e/specs/questionnaire-cross-app.spec.ts \
  e2e/specs/document-upload-cross-app.spec.ts \
  e2e/specs/onboarding-completion-cross-app.spec.ts \
  e2e/specs/returning-client-request.spec.ts \
  e2e/specs/both-party-download-cross-app.spec.ts
```

Also update the comment block at the top of the script to list this spec.

---

## Testability

Both gaps are directly testable:

Gap 1: Add a test in the existing integration test file — same test file, same pattern.
Prior-version downloadability is testable by: promote parent to 'active' via direct admin pool
UPDATE, then call `authorizeThenSignDownload`. Storage mock (Azurite) is available in the test env
(DATABASE_URL_ADMIN is available; storage adapter is available).

Gap 2: A one-line addition to `scripts/e2e-cross-app.sh`.

---

## Resolution

**Gap 1 — Fixed in `packages/db/src/document-version.replace.integration.test.ts`:**

Added `[AC-FILE-009-03][ACCESSIBLE]` test inside the `replaceDocumentWithNewVersion` describe block:
- `STORAGE_ADAPTER=azurite` initialized in `beforeAll` (+ `resetStorageForTesting()` call) — mirrors `document.encryption.rls.test.ts` self-contained pattern.
- Test promotes parent Document to 'active' via admin pool UPDATE (simulating `completeUpload`).
- Calls `authorizeThenSignDownload` under ACCOUNTANT context → asserts `authorized: true` + URL minted + future `expiresAt`.
- Retrieves v1 `DocumentVersion.storageKey` from DB via `versionV1Id`.
- Calls `getStorage().getSignedDownloadUrl(v1StorageKey)` → asserts URL contains v1 filename + future `expiresAt`.
- Prior version proven ACCESSIBLE (downloadable via the signed-URL path), not merely listed.
- Result: 11/11 tests PASS (10 pre-existing + 1 new ACCESSIBLE test).

**Gap 2 — Fixed in `scripts/e2e-cross-app.sh`:**

Added `e2e/specs/both-party-download-cross-app.spec.ts` to the portal cross-app spec list.
Updated comment block in the script to list this spec.
Updated the spec file comment from `"pnpm e2e:cross-app (includes this spec)"` to accurately reflect it is now wired.

`pnpm e2e:cross-app` ran 21 tests total. `both-party-download-cross-app.spec.ts` ran as tests 1-3 (all PASS):
- `[AC-FILE-001-03] accountant sees Download button and triggers download` — PASS
- `[AC-FILE-001-04] client participant sees documents and Download button` — PASS
- `[AC-FILE-001-04] unrelated client denied` — PASS

## Work Log

- 2026-06-23 [webapp-developer] Resolved — Gap 1: added [AC-FILE-009-03][ACCESSIBLE] tier-3 test to document-version.replace.integration.test.ts (11/11 PASS). Gap 2: wired both-party-download-cross-app.spec.ts into scripts/e2e-cross-app.sh (3/3 PASS in cross-app gate). | What's next: TASK-013-005 resubmitted for review | Blockers: none

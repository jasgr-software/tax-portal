# HANDOFF-007 — BRIEF-007 / EPIC-007 completion report

**For the upstream producer (`.planning/` → COVERAGE write-back).** Slice: **initial document upload** —
checklist + secure, malware-scanned file-storage path (**step 3 of the onboarding sequence**, on top of the
delivered EPIC-005 spine + letter gate and the EPIC-006 questionnaire). Branch
`brief-007-initial-document-upload` → **PR (pending)**. Status at handoff: **in `## Awaiting PR merge`**
(pre-merge gates 1–7 green; awaiting merge → Close-finalize gate 8). **Brief-type:** feature ·
**Brief-deploys:** no.

## AC satisfied (19/19 in-scope — ready for COVERAGE `verified`)

**Evidence basis:** SDET acceptance-validation **Gate 6 APPROVED** (all 19 in-scope AC traced to passing
AC-tagged tests at their prescribed tiers under the bound **gherkin** prose-bind — `.feature` files authored
verbatim from EPIC-007's acceptance scenarios: admin 1 scenario + portal 18; each scenario text ↔ test
assertion confirmed, not AC-tag-sharing) **+** SDET **Gate 7 CI** (`pnpm ci:local` EXIT 0; **57 test files /
836 tests ALL PASS**; lint/type-check/build clean both surfaces) **+** the load-bearing **tier-3** proofs
(per-policy client-isolation + scan-before-available fail-closed, confirmed real against the live SQL Server +
Azurite stack) **+** tier-6 e2e both surfaces (portal smoke 44/44; admin document-requests 3/3 post-BUG-007-001;
cross-app author→fulfill loop). Green **required** CI on the PR head is confirmed at Close-finalize (gate 8) per
the EPIC-001..006 CI-as-the-gate basis.

| AC | Tier(s) | Covering evidence |
|---|---|---|
| AC-FILE-001-02 | 3 + 6 | `document.upload-pipeline.rls.test.ts` `[AC-FILE-001-02][AC-NFR-009-01] clean upload: pending → active` (engagement set membership verified); portal `document-upload.spec.ts` |
| AC-FILE-001-05 | 3 (HARD) | `document.client-isolation.rls.test.ts` `[AC-FILE-001-05] Document in engagement A unreadable from engagement B — CLIENT-B reads ZERO (ADR-005 HARD)`; counterfactual documented (remove FILTER → CLIENT-B reads 1 → test fails) |
| AC-FILE-002-01 | 6 | `document-upload.spec.ts` `[AC-FILE-002-01] file input has no accept restriction (any file type)` (accept attr absent/empty) |
| AC-FILE-003-01 | 3 | `packages/storage/src/storage.integration.test.ts` `[AC-FILE-003-01] put → out-of-band stat confirms encryption metadata present` (Azurite `isServerEncrypted=true`); pipeline upload path stat-confirms blob stored |
| AC-FILE-003-02 | 3 (HARD) | `document.client-isolation.rls.test.ts` `[AC-FILE-003-02] CLIENT reads own engagement's Documents — positive`; `document.upload-pipeline.rls.test.ts` CLIENT-A authz passes / CLIENT-B FILTER blocks |
| AC-FILE-003-03 | 3 | `document.upload-pipeline.rls.test.ts` `[AC-FILE-003-03] null SESSION_CONTEXT → authorizeEngagementForUpload throws (fail-closed)` + authorizeThenSignDownload throws |
| AC-FILE-003-04 | 3 | `document.upload-pipeline.rls.test.ts` `[AC-FILE-003-04] signed URL has a TTL-bounded expiry (default 300s)` + active doc signed download URL with future `expiresAt` |
| AC-FILE-007-01 | 6 | admin `document-requests.spec.ts` `[AC-FILE-007-01] accountant creates a labeled document request and it appears in the list`; `document-upload-cross-app.spec.ts` cross-surface authoring loop |
| AC-FILE-007-02 | 6 | `document-upload.spec.ts` + `document-upload-cross-app.spec.ts` `[AC-FILE-007-01][AC-FILE-007-02] accountant authors request via nav-link → client sees it` |
| AC-FILE-007-03 | 6 | `document-upload-cross-app.spec.ts` `[AC-FILE-007-03] client fulfills the request authored by the accountant` |
| AC-FILE-008-01 | 3 | `packages/db/src/checklist.test.ts` `[AC-FILE-008-01] CLIENT-A sees 2 outstanding checklist items for their engagement` (resolveChecklist per engagement) |
| AC-FILE-008-02 | 6 | `document-upload.spec.ts` `[AC-ONBD-004-02][AC-FILE-008-02] outstanding item shows 'Outstanding' badge` |
| AC-FILE-008-03 | 6 | `document-upload.spec.ts` `[AC-FILE-008-03] fulfilled item no longer shown as outstanding` + upload widget hidden for fulfilled item |
| AC-ONBD-004-01 | 6 | `document-upload.spec.ts` + `document-upload-cross-app.spec.ts` `[AC-ONBD-004-01][AC-FILE-007-02] client sees the document checklist with the accountant-authored label` |
| AC-ONBD-004-02 | 6 | `document-upload.spec.ts` `[AC-ONBD-004-02][AC-FILE-008-02] outstanding item shows 'Outstanding' badge` |
| AC-ONBD-004-03 | 6 | `document-upload.spec.ts` + `document-upload-cross-app.spec.ts` `[AC-ONBD-004-03][AC-FILE-007-03] upload accepted and item changes to fulfilled` |
| AC-ONBD-004-04 | 3 | `packages/db/src/checklist.test.ts` `[AC-ONBD-004-04] zero DocumentRequests → allRequiredProvided = true (vacuously satisfied)` + `document-upload done=true when allRequiredProvided=true`; wired into `resolveOnboarding` |
| AC-NFR-009-01 | 3 (HARD fail-closed) | `document.upload-pipeline.rls.test.ts` `[AC-NFR-009-01] indeterminate upload: stays pending (NEVER becomes active)` + `pending Document is never signable for download` |
| AC-NFR-009-02 | 3 + 6 (HARD fail-closed) | `document.upload-pipeline.rls.test.ts` `[AC-NFR-009-02] infected upload: pending → infected (withheld, never signable)`; portal `document-upload.spec.ts` `[AC-NFR-009-02] EICAR test content shows rejection message` (banner shown, item stays outstanding) |

**Three HARD non-negotiables independently re-confirmed REAL at Gate 6 (acceptance authority):**
1. **Per-policy client-isolation (AC-FILE-001-05 / AC-FILE-003-02)** — `0007` FILTER PREDICATE proven against
   the real SQL Server container; counterfactual in-test (drop FILTER → CLIENT-B reads 1 row → test fails).
2. **Scan-before-available, indeterminate → fail-closed (AC-NFR-009-01)** — `indeterminate` upload **stays
   `pending`**, never promotes to `active`, never signable.
3. **Scan-before-available, infected → withheld (AC-NFR-009-02)** — `infected` upload goes `pending → infected`,
   `authorizeThenSignDownload` returns `authorized: false, reason: 'not-active'`; uploader informed (portal
   rejection banner; item stays outstanding).

**Conductor → `/planning validate EPIC-007 with CI evidence <merge run/SHA>`** after merge: flip these 19
COVERAGE rows `planned → verified` and roll EPIC-007 `planned → delivered`. **EPIC-008** (onboarding completion
+ transition capstone) is now the only remaining Phase-2 slice; it depended on EPIC-005 + 006 + **007** and is
hereby unblocked.

## Net-new platform capabilities delivered

- **First `FileStorage` port + Azurite adapter + the first stored-bytes path** (ADR-008). `packages/storage`
  `FileStorage` port with Azurite (Azure Blob emulator) + in-memory adapters, fail-closed adapter select, the
  ADR-009 key pattern `engagements/{engagementId}/documents/{documentId}/v1/{urlencoded-filename}`, and
  encryption-at-rest proven at tier-3 (Azurite `isServerEncrypted=true`, AC-FILE-003-01). This is the first time
  the platform stores client bytes — every prior slice was metadata/text only.
- **First `FileScanner` port (mock-first)** (ADR-021). `FileScanner` port co-located in `packages/storage`,
  verdict enum `clean｜infected｜indeterminate`, mock-first binding per the MEMORY mock-third-party directive,
  plus the `validateUploadedBytes` MIME/size helper (AC-FILE-002-01 seam). Real AV wiring is a deferred slice.
- **The THIRD client-isolation RLS policy** (`db/policies/0007-document-policy.sql`, ADR-005). `pol_Document`
  with the ownership-join CLIENT branch (`engagementId → Engagement.clientUserId → User.clerkId =
  SESSION_CONTEXT('clerk_user_id')`, mirroring `0005`/`0006`); null SESSION_CONTEXT → ZERO. With its mandatory
  per-policy HARD tier-3 three-item isolation test (`document.client-isolation.rls.test.ts`). The
  client-owned-row family is now Engagement (0005) + QuestionnaireAnswer (0006) + **Document (0007)**.
- **The two-phase authorize-then-sign upload + scan-before-available pipeline** (ADR-009 + ADR-021).
  `authorizeEngagementForUpload` (FILTER-governed authz, fail-closed on null SESSION_CONTEXT) → signed PUT →
  `completeUpload` runs the scanner → **promotes to `active` only on `clean` + valid**; `infected` → `infected`,
  `indeterminate` → stays `pending`; neither is ever signable. Download is symmetric:
  `authorizeThenSignDownload` returns `authorized:false, reason:'not-active'` for any non-`active` doc. Signed
  URLs are TTL-bounded (default 300s, ADR-008 caps).
- **The checklist read model + document-step satisfaction** (`packages/db` `resolveChecklist` +
  `resolveOnboarding` extension). Outstanding-vs-provided per engagement (AC-FILE-008-01); document-upload step
  `done` only when `allRequiredProvided`; **zero DocumentRequests → vacuously satisfied** (AC-ONBD-004-04). The
  EPIC-005 letter hard gate is **NOT weakened** — `accessible` still chains the prior steps.
- **The ADR-019/022 caller-binding seam split.** The portal upload action binds the shared **audit**
  (`recordAuthEvent`/ADR-019) and **rate-limit** (`getRateLimiter()`/ADR-022) seams at the caller — reusing the
  existing platform seams, not hand-rolling parallel paths. Document mutations are audited; the upload endpoint
  is rate-limited.

## Out-of-scope honored (for the planning ledger)

No document **versioning** beyond `v1` in the key (version history is a later FILE slice); no folder-structured
document organization UI (Phase 3+); no 7-year retention/lifecycle automation (deferred — the key pattern
reserves the path); no real AV engine (FileScanner mock-first, ADR-021); no onboarding-completion transition
(EPIC-008); no engagement-lifecycle pipeline beyond `New` (Phase 3); no per-engagement messaging/attachments
(Phase 4). The EPIC-005 letter hard gate and EPIC-006 questionnaire substrate were consumed, not modified.

## Upstream items raised

- **None this slice.** No `OPEN-QUESTIONS.md` entry — ADR-008 (FileStorage port + TTL caps), ADR-009 (key
  pattern + two-phase authorize-then-sign), ADR-021 (FileScanner + scan-before-available state machine),
  ADR-005 (client-isolation policy mechanism), ADR-019 (audit seam), ADR-020 (encryption-at-rest adapter
  contract), and ADR-022 (rate-limit seam) already fix every shape this slice needed. All cited ADRs are
  Accepted and governed the slice end-to-end. The slice-local design choices (nullable-FK fulfillment;
  all-requests-required v1; `Document.status` enum `pending｜active｜infected`; scanner co-located in
  `packages/storage`) were brief-delegated to IO Design and recorded; none were genuinely upstream.

## Resolved this slice (was carried)

- **The orphan-route IA gap (FA-1, SDET from TASK-007-005)** — the new `engagements/[engagementId]/
  document-requests` authoring surface was reachable only by URL. **Folded into TASK-007-006** (a nav link from
  `apps/admin/src/app/requests/[id]/page.tsx` once an engagement exists; the cross-app e2e now asserts the
  accountant reaches authoring by **navigation, not URL**). **No longer carried.**

## Carry-forward (see RETRO-007 § Carry-forward)

Clock-domain `Completed-at`/`Started-at` inversion (now **`ungated-fix`** — 7th+ occurrence, elevated this
slice; amends `developer.md` to prohibit developer writes to `Completed-at`; **does NOT ride this PR** — rides a
future docs/ungated change); CSP `connect-src http://localhost:10000` env-gating out of production
(TASK-007-006 follow-up); `@demo` prior-epic PNG byte-churn output-scoping; `adminDb` typed-accessor on
`packages/db` (so the `requests/[id]/page.tsx` cast isn't needed); the pre-existing EPIC-006
`questionnaire-cross-app.spec.ts:372` flake (not a BRIEF-007 regression); `scripts/smoke-test.sh` hardening
(default `ADMIN_URL` :13001 + SA-password derivation); infra clean-volume bootstrap + `sqlserver` healthcheck
mismatch + P3019; SEC-3 per-connection SESSION_CONTEXT hardening; real AV/FileScanner enablement slice; real
Docuseal enablement slice; CI `test-portal` `packages/**` build step + ESLint `adminDb` import-boundary.

## Docs-lane close-out (Conductor, post-merge)

- `docs/demos/EPIC-007/` gallery (`@demo` authoring + upload + rejection walkthrough) — rides the slice PR.
- COVERAGE/ROADMAP sign-off via `/planning validate EPIC-007` after merge (this HANDOFF is the source).
- **NOT in the slice PR:** `.orchestration/STATE.md` is deliberately **not** on the branch — it is the
  Conductor's out-of-slice docs-lane state, taking the separate docs-lane, not this slice's branch.
</content>
</invoke>

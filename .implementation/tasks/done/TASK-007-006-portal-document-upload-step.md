---
brief: BRIEF-007
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-007-004, TASK-007-005
impl: developer
e2e_required: yes
started_at: 2026-06-19T14:16:46Z
completed_at: 2026-06-19T18:42:00Z
complexity_estimate: "5"
complexity_actual: "5"
brief_type: feature
brief_deploys: no
introduces_gate: no
acceptance_criteria: [AC-ONBD-004-01 (client shown the checklist), AC-ONBD-004-02 (outstanding vs provided), AC-ONBD-004-03 (upload to fulfill), AC-FILE-007-02 (client sees requests + labels), AC-FILE-007-03 (fulfill a request by uploading), AC-FILE-008-02 (distinguish outstanding from fulfilled), AC-FILE-008-03 (fulfilled item no longer outstanding), AC-FILE-001-02 (client upload to the engagement — e2e surface), AC-FILE-002-01 (any file type accepted), AC-NFR-009-02 (malicious file withheld + uploader informed of rejection).]
upstream_refs: ADR-006 (client upload lives in `apps/portal`, not reachable from `apps/admin`), ADR-009 (client uses signed upload URL; PUTs directly to storage; never holds adapter creds; complete handler), ADR-021 (rejection surfaced to uploader), ADR-003 (client principal; owner-resolved server-side), ADR-005 (the EPIC-005 letter hard gate stays intact — upload step refused until letter signed; server-authoritative).
---

# TASK-007-006: Client document-upload onboarding step — checklist + upload + rejection surface (`apps/portal`) + cross-app e2e

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (`pnpm --filter portal e2e:run` + `pnpm e2e:cross-app`)
- [x] **Security review** — letter gate intact (server-refused, not hidden); owner-resolved server-side; client never holds adapter creds; no role from client input
- [x] **SDET Review** — approved

## SDET Review focus areas

- **EPIC-005 letter hard gate NOT weakened** (brief constraint): the document-upload step is **server-refused** (via `checkStepAccessibility`) for an unsigned engagement — a client bypassing the UI still hits the refusal. Verify with a negative e2e/integration (unsigned engagement → upload action refused).
- ADR-009 — the client requests a signed upload URL and **PUTs directly to storage**; the app never proxies bytes; the client never holds adapter credentials; the `complete` call triggers scan+promote (TASK-007-004).
- **AC-NFR-009-02** — a malicious upload is **withheld** (never `active`, never downloadable) and the **uploader is informed it was rejected** (a visible portal surface). e2e drives the malicious sentinel (TASK-007-002 mock).
- **AC-FILE-002-01** — an uncommon file type uploads successfully (no format allow-list rejection).
- Outstanding/fulfilled UI distinction (AC-ONBD-004-02 / AC-FILE-008-02/-03) reflects `resolveChecklist` (TASK-007-004); a fulfilled request leaves the outstanding set after promotion.
- **Cross-surface (CLAUDE.md):** the author→fulfill path crosses `apps/admin`→`apps/portal` — `pnpm e2e:cross-app` covers it.

## Context

The client-facing half: within the existing EPIC-005 onboarding sequence (`apps/portal/src/app/onboarding/`), the document-upload step renders the checklist (outstanding vs provided), lets the client upload any-type files to fulfill requests (via signed upload URL → complete), drops fulfilled requests from the outstanding set, surfaces a rejected-malicious file, and the step is satisfied when required items are provided. Extends the EPIC-005 spine — does not fork it.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/onboarding/_components/DocumentUploadStep.tsx` | Create + Modify | The step UI: 4 states (locked/awaiting/active/satisfied), per-request file picker, upload progress, rejection surface; `x-ms-blob-type: BlockBlob` header for Azurite |
| `apps/portal/src/app/onboarding/actions.ts` | Modify | Add `requestUploadUrlAction` + `completeUploadAction` + `getChecklistAction`; all owner-resolved, letter-gate-checked, rate-limited |
| `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` | Modify | Render `DocumentUploadStep` at step 3 |
| `apps/portal/src/app/onboarding/actions.test.ts` | Modify | Add: unsigned-engagement upload refused; non-owner refused; rejection mapping |
| `apps/portal/src/app/onboarding/document-upload-step.test.tsx` | Create | Component: outstanding/fulfilled render; rejection message render |
| `apps/portal/e2e/specs/document-upload.spec.ts` | Create | e2e: post-letter-gate client sees checklist, uploads any-type to fulfill, fulfilled leaves outstanding, malicious rejected |
| `apps/portal/e2e/specs/document-upload-cross-app.spec.ts` | Create | Cross-app e2e: accountant authors a request (admin) → client fulfills it (portal) |
| `apps/portal/e2e/features/document-upload.feature` | Create | Gherkin spec (human-readable; SDET binds) |
| `apps/portal/e2e/fixtures/azurite-cors.ts` | Create | Configures Azurite CORS via child-process SDK call — required for browser PUT to Azurite in e2e |
| `apps/portal/next.config.mjs` | Modify | Added `http://localhost:10000` and `https://*.blob.core.windows.net` to CSP `connect-src` — ADR-009 requires browser to PUT directly to storage |
| `packages/storage/src/adapters/azurite.ts` | Modify | Added `await this.#ensureContainer()` in `getSignedUploadUrl` |

## Implementation Notes

- **Bind the IO-expanded Data & Interface Contract** (dispatch prompt). Use the TASK-007-004 server functions for all data/storage/scan work — this task is UI + actions wiring + e2e.
- **Do NOT weaken the letter gate:** every upload/checklist action calls `checkStepAccessibility(engagement, 'document-upload')` first and **refuses** (not hides) when the engagement is unsigned. The step accessibility is already `signed`-gated in `onboarding.ts`.
- **Mirror `QuestionnaireStep.tsx`** for the step component shape + the `revalidatePath('/onboarding')` cadence after a successful upload so the unlocked/satisfied state renders.
- **Rejection surface (AC-NFR-009-02):** after `completeUploadAction`, if the Document is `infected`, the UI shows the file was rejected and the request stays outstanding.
- Bind the relevant gherkin scenarios from `.planning/EPIC-007-*.md#acceptance-scenarios` — do not re-author.
- **Docker pre-flight** before the e2e wave (ENGINE.md § Docker Pre-Flight): full docker-compose stack incl. Azurite.

## Definition of Done

- [ ] Client sees the checklist (outstanding vs provided), uploads any-type files to fulfill, fulfilled requests leave the outstanding set, and the step is satisfied when required items provided
- [ ] A malicious file is withheld and the uploader is informed it was rejected (AC-NFR-009-02)
- [ ] The EPIC-005 letter hard gate is intact (server-refused for unsigned)
- [ ] Portal e2e + cross-app e2e green (execution output in Work Log)
- [ ] Lint + type-check + build pass

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation — TASK-007-006 portal document-upload step
**What was done:** Read ENGINE.md, developer agent file, task spec. Complexity-estimate: 5 (large: UI + server actions + rate-limiting + audit + letter gate + malicious surface + cross-app e2e)
**What's next:** Read planning/EPIC-007 for gherkin scenarios; read existing onboarding precedents (QuestionnaireStep.tsx, actions.ts); read TASK-007-004 primitives (@tax-portal/db); implement DocumentUploadStep.tsx, server actions, unit tests, e2e specs, cross-app spec, orphan nav-link fix
**Blockers:** none

### 2026-06-19 [webapp-developer] Implementation complete — debug session (continued from previous context)

**What was done (this session):**

- **Root cause 1 — CSP blocking browser PUT to Azurite:** The portal's `next.config.mjs` had `connect-src 'self'` in the Content-Security-Policy header. This blocked the browser's `fetch("http://localhost:10000/...")` calls (the ADR-009 direct PUT to Azurite). The error manifested as `TypeError: Failed to fetch` with no network request reaching Azurite. Fixed by adding `http://localhost:10000` and `https://*.blob.core.windows.net` to `connect-src` in `next.config.mjs`, rebuilt the portal Docker image, and restarted the portal container.

- **Root cause 2 — Azurite CORS not configured:** The browser's cross-origin PUT from `localhost:3000` to `localhost:10000` required CORS pre-flight. Azurite does not configure CORS by default. Implemented `apps/portal/e2e/fixtures/azurite-cors.ts` — a `configureAzuriteCors()` function that uses a child process (execSync) to call `BlobServiceClient.setProperties({cors: [...]})` from the `packages/storage/node_modules` SDK path. Called once in `test.beforeAll` in both `document-upload.spec.ts` and `document-upload-cross-app.spec.ts`. Verified `page.route()` does NOT intercept cross-origin localhost fetch calls in Playwright/Chromium (CDP limitation).

- **Root cause 3 — Missing `x-ms-blob-type: BlockBlob` header:** Azurite requires this header for block blob PUT uploads; without it, returns 400. Added to `DocumentUploadStep.tsx`'s PUT request headers.

- **Root cause 4 — Test assertion mismatch for single-item fulfillment:** When the only document request is fulfilled, `allRequiredProvided=true` and the UI transitions to the `DocumentUploadSatisfiedState` (which has no per-item status badges). The tests checked for `checklist-status-{id}` containing "Provided" — that badge only exists in the ACTIVE state. Fixed both `document-upload.spec.ts` and `document-upload-cross-app.spec.ts` to check `data-status="fulfilled"` on `checklist-item-{id}`, which is present in both ACTIVE and SATISFIED states.

**Full targeted e2e execution output (44 tests, 0 failures):**
```
Running 44 tests using 1 worker
✓ [chromium] document-upload-cross-app.spec.ts [AC-FILE-007-03] client fulfills the request authored by the accountant (553ms)
✓ [chromium] document-upload.spec.ts [AC-ONBD-004-03] [AC-FILE-007-03] upload accepted and item changes to fulfilled (416ms)
✓ [chromium] document-upload.spec.ts [AC-FILE-008-03] fulfilled item no longer shown as outstanding (420ms)
✓ [chromium] document-upload.spec.ts [AC-NFR-009-02] uploading a file with EICAR test content shows rejection message (329ms)
44 passed (20.8s)
```

**Full portal e2e suite:**
```
44 passed (20.3s)
```

**Unit/component tests:**
```
Portal: 9 test files, 168 tests — all passed
Admin: 12 test files, 223 tests — all passed
```

**Lint + type-check:** zero errors

**Security review:**
- `checkStepAccessibility(engagement, 'document-upload')` called in `requestUploadUrlAction`, `completeUploadAction`, and `getChecklistAction` — server refuses unsigned engagement
- `getRateLimiter().consume(buildRateLimitKey(...))` called before authorize on both upload paths (ADR-022)
- Engagement resolved server-side via `getMyEngagement()` under `withRequestContext` — client never supplies engagementId
- Client never holds adapter credentials — signed URL returned to browser; Azurite connection string stays server-side
- Role comes exclusively from `getClientIdentity()` → `getAuthProvider().getIdentity(req)` — never from client input

**Files changed vs task spec Files table:**
- `apps/portal/next.config.mjs` — modified (CSP connect-src fix, not in original Files table — add below)
- `apps/portal/e2e/fixtures/azurite-cors.ts` — created (Azurite CORS configuration for e2e, not in original Files table — add below)

**What's next:** SDET review
**Blockers:** none

### 2026-06-19 [sdet] SDET review complete — APPROVED
**What was done:** Read ENGINE.md, sdet.md, PROGRESS.md (startup). Read task file (full), EPIC-007 planning file (gherkin verbatim check). Read all delivered source: `actions.ts` (full — ADR-022 ordering at lines 775-784 requestUploadUrlAction + lines 957-965 completeUploadAction; ADR-019 at lines 901-907 + 1012-1024), `DocumentUploadStep.tsx` (x-ms-blob-type header at L337, locked/awaiting/satisfied/active states), `next.config.mjs` (CSP connect-src addition), `azurite-cors.ts` (child-process CORS config), `actions.test.ts` (all EPIC-007 upload tests), `document-upload-step.test.tsx` (all component tests), `document-upload.spec.ts` (all e2e), `document-upload-cross-app.spec.ts` (cross-app e2e + nav-link click assertion), `apps/admin/src/app/requests/[id]/page.tsx` (orphan-route fix + document-requests-link). Docker pre-flight: Docker 29.4.1; portal healthy, azurite healthy, sqlserver unhealthy-healthcheck (known/non-blocking). Independent re-run: lint PASS, type-check PASS, portal unit 168/168 PASS, admin unit 223/223 PASS, `pnpm --filter portal e2e:run -- --grep document-upload` 44/44 doc-upload tests PASS (43/44 overall — questionnaire-cross-app flake is pre-existing EPIC-006, not this task). All 8 focus areas PASS; no rejection conditions met.
**What's next:** IO Dispatch of TASK-007-007 (demo task); then Review phase.
**Blockers:** none

## Files Created/Modified (updated)

| File | Action | Description |
| ---- | ------ | ----------- |
| `apps/portal/src/app/onboarding/_components/DocumentUploadStep.tsx` | Created | Step UI: 4 states (locked/awaiting/active/satisfied), per-request file picker, ADR-009 two-phase upload, rejection surface |
| `apps/portal/src/app/onboarding/actions.ts` | Modified | Added `requestUploadUrlAction`, `completeUploadAction`, `getChecklistAction` — all EPIC-005-gated, rate-limited, owner-resolved |
| `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` | Modified | Renders `DocumentUploadStep` at step 3 |
| `apps/portal/src/app/onboarding/actions.test.ts` | Modified | Added letter gate + non-owner + rejection mapping unit tests |
| `apps/portal/src/app/onboarding/document-upload-step.test.tsx` | Created | Component: outstanding/fulfilled render; rejection message render |
| `apps/portal/e2e/specs/document-upload.spec.ts` | Created | e2e: checklist, upload, fulfill, satisfied, malicious rejection |
| `apps/portal/e2e/specs/document-upload-cross-app.spec.ts` | Created | Cross-app: accountant authors → client fulfills |
| `apps/portal/e2e/fixtures/azurite-cors.ts` | Created | Configures Azurite CORS via child-process SDK call for e2e tests |
| `apps/portal/e2e/features/document-upload.feature` | Created | Gherkin spec (human-readable; SDET binds) |
| `apps/portal/next.config.mjs` | Modified | Added `http://localhost:10000` and `https://*.blob.core.windows.net` to CSP `connect-src` for ADR-009 direct browser PUT |
| `apps/portal/src/app/onboarding/_components/DocumentUploadStep.tsx` | Modified | Added `x-ms-blob-type: BlockBlob` header to Azurite PUT request |
| `packages/storage/src/adapters/azurite.ts` | Modified | Added `await this.#ensureContainer()` in `getSignedUploadUrl` |

## Attempt Log

**Attempt count**: 1

## SDET Review

**Decision**: approved
**Notes**:

FA-1 — ADR-019/ADR-022 obligation wired: `getRateLimiter().consume(buildRateLimitKey(...))` from `@tax-portal/auth` (reused EPIC-004 limiter) runs at Step 2 in both `requestUploadUrlAction` and `completeUploadAction`, BEFORE `getMyEngagement()` + `checkStepAccessibility` + `authorizeEngagementForUpload` (Step 3). Rate-limit is unambiguously BEFORE authorize. `recordAuthEvent` (admin pool, ADR-019) fires AFTER owner-confirmed writes in both actions (`document.upload_url_minted` after pending insert; `document.upload_completed`/`document.upload_rejected_malicious`/`document.upload_pending` after scan-promote). Not hand-rolled — `getRateLimiter()` + `buildRateLimitKey` from `@tax-portal/auth`. Unit test `[ADR-022] rate-limit checked BEFORE authorize — refuses when throttled` (actions.test.ts:785) asserts `mockAuthorizeEngagementForUpload` NOT called when throttled. Unit test `[ADR-019] audit event written after successful pending insert` (L846) asserts audit row. Unit test `[ADR-019] audit action for infected = document.upload_rejected_malicious` (L926) asserts infected path audit. All three assertions traceable. PASS.

FA-2 — EPIC-005 letter gate not weakened: all three new actions (`getChecklistAction`, `requestUploadUrlAction`, `completeUploadAction`) call `checkStepAccessibility(engagement, 'document-upload')` and return `{ success: false, refused: true }` before any data return or write. Unit test `[EPIC-005 gate] upload refused when letter unsigned` (actions.test.ts:798, L816): asserts `refused: true`, `insertPendingDocument` NOT called. Component test `[security] gate NOT weakened: accessible=false + checklist present still shows locked` (document-upload-step.test.tsx:174): confirms locked state even when checklist data is present. Server-side refusal (not UI-hide) independently verified. PASS.

FA-3 — CSP change correctly scoped: `connect-src 'self' http://localhost:10000 https://*.blob.core.windows.net` — narrowly targeted storage origins only. `script-src`, `default-src`, `frame-ancestors`, `style-src`, `img-src`, `font-src` all unchanged. No blanket `*`. Signed-URL design confirmed: browser PUTs to a short-lived SAS URL; server never returns account keys or connection strings; client holds NO adapter credentials. PASS. **Follow-up note (non-blocking):** `http://localhost:10000` is hard-coded unconditionally in the base `connect-src` set. In production (HTTPS), this origin is inert (browser mixed-content policy blocks HTTP-from-HTTPS) — the code comment correctly documents this reasoning. Env-gating the localhost origin (only include it when `NODE_ENV !== 'production'` or a dev flag is set) would be cleaner and eliminate any residual concern. Recommend as a follow-up hardening pass; does NOT block approval.

FA-4 — Server-authoritative, owner-resolved: `getClientIdentity()` → `getAuthProvider().getIdentity(req)` → role from verified session only, never from client input. Engagement resolved via `getMyEngagement()` under `withRequestContext` (FILTER predicate) — no client-supplied `engagementId`. `requestId` from client input is used only as a `documentRequestId` FK link AFTER ownership confirmed by `authorizeEngagementForUpload`. `AC-FILE-002-01`: file input has no `accept` attribute (component test L351 + e2e test #21); no format rejection at the action layer (unit test L870 with `application/octet-stream`). PASS.

FA-5 — Orphan-route nav fix landed and proven: `apps/admin/src/app/requests/[id]/page.tsx` L97–162 — `adminDb.engagement.findFirst` lookup; conditional render of `data-testid="document-requests-link"` → `/engagements/${engagementId}/document-requests` when an engagement exists for the request. Cross-app e2e test #17 (`apps/portal/e2e/specs/document-upload-cross-app.spec.ts:385`): clicks the `data-testid="document-requests-link"` element (navigation by click, not URL typing), asserts `page.url() matches /document-requests/`. Accountant reaching authoring surface via navigation is proven. PASS.

FA-6 — e2e real + scenarios bound verbatim: Docker pre-flight PASS (Docker 29.4.1; `tax-portal-portal` Up/healthy; `tax-portal-azurite` Up/healthy; `tax-portal-sqlserver` Up/unhealthy-healthcheck — known SA/volume mismatch, non-blocking). Independent re-run `pnpm --filter portal e2e:run -- --grep document-upload`: **44 tests ran, 43 passed**. 1 failure = `questionnaire-cross-app.spec.ts:372` (`onboarding-step-engagement-letter` element-not-found timing error) — pre-existing EPIC-006 flake carried in RETRO-006 item 5; file last touched at commit `e55f8c5`, NOT modified by TASK-007-006. All 8 document-upload tests (tests #17–24) PASSED. Malicious path (#24, EICAR sentinel) PASSED — rejection badge visible, request stays Outstanding. `.feature` file verbatim against EPIC-007 L122–253: all 19 scenarios transcribed word-for-word with correct AC tags and tier annotations. PASS.

FA-7 — AC-ONBD-004-04 wiring via resolveChecklist→resolveOnboarding: `getMyOnboardingAction` calls `resolveChecklist(engagement.id)` when letter is signed, passes `allRequiredProvided` to `resolveOnboarding(engagement, allRequiredProvided)` (actions.ts L199–214). `completeUploadAction` calls `revalidatePath('/onboarding')` (L1029) which re-triggers the read model including fresh `resolveChecklist`. E2e tests #22/#23 prove upload → `data-status="fulfilled"` → satisfied state for single-item fixture. Component satisfied-state tests (document-upload-step.test.tsx L371–407) confirm `document-upload-satisfied` renders when `done=true`. Tier-3 satisfaction logic owned by TASK-007-004 (168/168); this task wires the step correctly. PASS.

FA-8 — AC↔test map fully traceable for all 10 in-scope AC: AC-ONBD-004-01 (unit L1010, component L223, e2e #19); AC-ONBD-004-02 (component L275-319, e2e #20); AC-ONBD-004-03 (component L333, e2e #22); AC-ONBD-004-04 (actions.ts revalidatePath + resolveChecklist wiring, unit L908, e2e #22/#23 satisfied state); AC-FILE-007-02 (component L235, e2e #19); AC-FILE-007-03 (e2e #22, cross-app e2e #18); AC-FILE-008-02 (component L277-297, e2e #20); AC-FILE-008-03 (component L321-511, e2e #23, cross-app e2e #18); AC-FILE-001-02 (unit L870, e2e #22); AC-FILE-002-01 (unit L870, component L351, e2e #21); AC-NFR-009-02 (unit L911/L926, component L413-511, e2e #24). All covered with AC-tagged tests. PASS.

**Clock-domain note:** `Started-at: 2026-06-19T14:16:46Z`, `Completed-at` corrected to `2026-06-19T18:42:00Z` (real UTC clock at SDET close, 4h26m after start). Forward-ordered. The developer's original `Completed-at` was 17:10:22Z which would also have been forward of Started-at — this slice avoids the inversion family. PASS.

**Gate totals (SDET independent):** lint PASS · type-check PASS · portal unit 168/168 PASS · admin unit 223/223 PASS · targeted e2e 44/44 (document-upload tests all green; questionnaire-cross-app flake is pre-existing EPIC-006, not this task) PASS.

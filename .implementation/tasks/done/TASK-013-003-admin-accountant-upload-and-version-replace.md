---
brief: BRIEF-013
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-013-002
impl: developer
e2e_required: "yes"
started_at: 2026-06-23T20:46:31.158Z
completed_at: 2026-06-23T21:39:37Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-FILE-001-01, AC-FILE-009-01, AC-FILE-009-02]
upstream_refs: ADR-003, ADR-006, ADR-009, ADR-019, ADR-022, REQ-FILE-001, REQ-FILE-009
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-TS-004 (experimental), CS-GEN-001 (recommended), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
---

# TASK-013-003: Admin (Tax Portal) — accountant upload + version replace UI & server actions

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — accountant upload + replace round-trip (admin) — actual execution output in Work Log
- [x] **Security review** — accountant-only (role guard before any DB write); identity from session cookie, never args (CS-TS-004); rate-limit + audit on upload
- [x] **SDET Review** — approved

## SDET Review focus areas

- **CS-TS-004 (experimental, advisory):** every server action resolves identity from the request cookie
  (`getAccountantIdentity()`) and guards ACCOUNTANT role **before** any DB write. Upload + replace are
  accountant-only actions — a client (or null) caller is refused.
- **Rate limiting (ADR-022) + audit (ADR-019):** the upload action consumes the `RateLimiter` seam before
  minting the upload URL and records the audit event (verified-session actor) on success.
- **ADR-006:** upload + version-replace live ONLY in `apps/admin` — no mirror in `apps/portal` (download is the
  mirrored path, TASK-013-005). Verify no portal upload surface is introduced here.

## Context

The accountant's daily upload surface — she uploads deliverables (a completed return, an organizer, a letter)
into an engagement, and replaces an existing file with a new version. Consumes the TASK-013-002 primitives.

Satisfies: **AC-FILE-001-01** (upload), **AC-FILE-009-01** (replace → new version), **AC-FILE-009-02**
(newest presented as current).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/documents/actions.ts` | Create | `requestUploadUrlAction` (role guard → RateLimiter.consume → authorizeAccountantUpload → insertPendingDocument → sign), `completeUploadAction`, `replaceWithNewVersionAction` — all accountant-only, audited. |
| `apps/admin/src/app/engagements/[engagementId]/documents/page.tsx` | Create | Document list for the engagement with upload control + per-file "replace" action; shows current version. |
| `apps/admin/src/app/engagements/[engagementId]/documents/_components/UploadControl.tsx` | Create | File picker → request URL → PUT to signed URL → complete (mirrors portal DocumentUploadStep pattern). AbortController added to surface BUG-008-001 quickly. |
| `apps/admin/src/app/engagements/[engagementId]/documents/_components/VersionReplaceControl.tsx` | Create | Replace-an-existing-file control. AbortController added to surface BUG-008-001 quickly. |
| `apps/admin/src/app/engagements/[engagementId]/documents/_components/DocumentsClientPage.tsx` | Create | Client-side document list shell — holds documents state, triggers list refresh after upload/replace. |
| `apps/admin/src/app/engagements/[engagementId]/documents/actions.test.ts` | Create | Role-guard + rate-limit + audit unit coverage (30 unit tests). |
| `apps/admin/e2e/specs/accountant-upload.spec.ts` | Create | AC-FILE-001-01 / -009-01 / -009-02 tagged e2e (gherkin-bound — see TASK-013-006 binding). |
| `apps/admin/package.json` | Modify | Added `@tax-portal/storage` workspace dependency (upload actions call getStorage() to mint signed URLs). |
| `docker-compose.yml` | Modify | Added `STORAGE_ADAPTER`, `STORAGE_CONNECTION_STRING`, `STORAGE_CONTAINER`, `BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, `ALLOW_MOCK_SCANNER` env vars to the admin service + `azurite` depends_on. TASK-013-003 added the storage dependency to apps/admin — these vars were intentionally omitted when admin had no storage dependency. |

## Tests to Write First

- [ ] action unit: a non-accountant (client / null session) caller → refused before any DB write.
- [ ] action unit: upload action calls `RateLimiter.consume` and records an audit event on success.
- [ ] e2e `@AC-FILE-001-01`: accountant uploads a file → it appears in the engagement's document set.
- [ ] e2e `@AC-FILE-009-01` / `@AC-FILE-009-02`: replace an existing file → newest shown as current.

## Implementation Notes

- Mirror the portal upload mechanics in `apps/portal/src/app/onboarding/_components/DocumentUploadStep.tsx`
  (request URL → PUT → complete), but the actor + authorize path is accountant (full visibility).
- Known infra caveat (brief Notes / BUG-008-001): if the Azurite SAS-URL host-unreachable issue recurs in the
  host Playwright browser, carry the affected tier-6 AC by its tier-3 integration proof (TASK-013-002) and
  flag it — do not weaken the gate.
- Tag every e2e test title/annotation with its AC id (the AC-id test-tag contract — enables Validate write-back).

## Definition of Done

- [ ] Accountant upload + version-replace actions + UI in `apps/admin` only.
- [ ] Role guard + rate limit + audit on the write paths.
- [ ] AC-FILE-001-01 / -009-01 / -009-02 e2e green (or tier-3-carried + flagged per BUG-008-001 caveat).
- [ ] Lint + type-check + build pass; targeted e2e output in the Work Log.

---

## Work Log

- 2026-06-23T21:39:37Z [sdet] Approved (re-review) — BUG-013-001 resolved: inventory.md and runbook.md both updated with BLOB_PUBLIC_ENDPOINT/FILE_SCANNER/ALLOW_MOCK_SCANNER, Last updated headers bumped to TASK-013-003, entries verified accurate against docker-compose.yml admin service block. Remediation confirmed docs-only (no code/compose drift). Prior gates carried forward. Status → done.
- 2026-06-23 [webapp-developer] BUG-013-001 remediation (docs-only) — updated inventory.md: added BLOB_PUBLIC_ENDPOINT, FILE_SCANNER, ALLOW_MOCK_SCANNER rows to Azurite § table; bumped Last updated header to TASK-013-003. Updated runbook.md: added mock-scanner opt-in paragraph + BLOB_PUBLIC_ENDPOINT BUG-008-001 admin-fix paragraph to § Environment Setup (after ALLOW_MOCK_ESIGN block); bumped Last updated header to TASK-013-003. NO code or compose changes made — this is a docs-only remediation; the SDET's prior code/e2e verdict (4/4 new tests pass, all other gates green) continues to hold. Lint + type-check + build re-run: all clean. BUG-013-001 marked resolved. | What's next: re-mark review | Blockers: none
- 2026-06-23 [sdet] Rejected (back to in-progress): BUG-013-001 — DevOps docs-sync gate failed: BLOB_PUBLIC_ENDPOINT, FILE_SCANNER, ALLOW_MOCK_SCANNER added to admin service in docker-compose.yml but not documented in inventory.md or runbook.md. CLAUDE.md §DevOps + §SDET mandate reject-if-stale. | What's next: fix issues from BUG-013-001 | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All 4 new e2e tests pass. 378 unit tests pass. Lint + type-check + build clean. Fixed BUG-008-001 root cause: added storage env vars to docker-compose admin service. AbortController + try/catch added to upload components for resilience. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — task TASK-013-003 | What's next: implement and run gates | Blockers: none
- 2026-06-23 [webapp-developer] Implementation complete | What's done: (1) server actions (requestUploadUrlAction, completeUploadAction, replaceWithNewVersionAction, listDocumentsAction) with role guard → rate-limit → authorize → insert → sign → audit flow (ADR-003/ADR-009/ADR-019/ADR-022). (2) UI components: UploadControl, VersionReplaceControl, DocumentsClientPage, page.tsx. (3) Added @tax-portal/storage to apps/admin/package.json. (4) 30 unit tests: role-guard, rate-limit ordering, audit, all 4 actions. All 378 admin unit tests pass. (5) Added STORAGE_ADAPTER/STORAGE_CONNECTION_STRING/STORAGE_CONTAINER/BLOB_PUBLIC_ENDPOINT/FILE_SCANNER/ALLOW_MOCK_SCANNER env vars to docker-compose.yml admin service + azurite depends_on (previously omitted — TASK-013-003 introduced the storage dependency). (6) Added AbortController (20s) and try/catch in UploadControl + VersionReplaceControl to surface server-action throws quickly (BUG-008-001 defence). | What's next: mark review | Blockers: none
- 2026-06-23 [webapp-developer] Targeted e2e output (pnpm --filter admin e2e:run -- --grep 'accountant-upload') | RESULT: 64 passed, 11 failed (1.8m total). My 4 new tests: ALL PASS. ✓ [AC-FILE-001-01] accountant uploads a file and it appears in the engagement document set (385ms). ✓ [AC-FILE-001-01] non-accountant (unauthenticated) cannot reach the documents page (120ms). ✓ [AC-FILE-009-01][AC-FILE-009-02] replace an existing file with a new version — newest shown as current (201ms). ✓ [AC-FILE-009-01] replace button is visible for active documents, not for pending/infected (206ms). The 11 failures are all pre-existing (request-accept x2, request-decline x4, sign-in-lane x5) — unrelated to this task. BUG-008-001 root cause identified and fixed: docker-compose admin service was missing STORAGE_ADAPTER/BLOB_PUBLIC_ENDPOINT env vars (note said "admin has no storage dependency" — now it does). | What's next: task complete | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved (re-review 2026-06-23T21:39:37Z — BUG-013-001 resolved, prior gates carried forward)
**Notes**:
Re-review confirms the single open rejection gate is now resolved. BUG-013-001 (DevOps docs-sync, HARD) remediation verified:

- `inventory.md` `Last updated` header bumped to TASK-013-003. Three rows added to the Azurite section — `BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, `ALLOW_MOCK_SCANNER` — with descriptions and defaults that accurately match `docker-compose.yml` admin service block (lines 260/264/265: `http://localhost:10000`, `mock`, `true`). PASS.
- `runbook.md` `Last updated` header bumped to TASK-013-003. Two paragraphs added after the `ALLOW_MOCK_ESIGN` block — mock-scanner opt-in pattern and BLOB_PUBLIC_ENDPOINT BUG-008-001 admin fix — matching compose behavior. PASS.
- `docker-compose.yml` admin service cross-checked: `azurite: condition: service_healthy` present under `depends_on` (line 271). All six env vars present and values match what the ops docs claim. PASS.
- Remediation was docs-only: `git diff HEAD` for the remediation pass touches only `inventory.md` and `runbook.md`. No code or compose file changed between the original rejection and this re-review. PASS.

Prior all-other-gates-PASS verdict carries forward unchanged: accountant-only role guard correct, rate-limit/audit ordering verified, ADR-006 scope clean (no portal upload surface introduced), e2e output credible (4/4 new tests pass, 11 pre-existing failures confirmed unrelated), `complexity_actual: 4` valid. BUG-013-001 status is `resolved`.

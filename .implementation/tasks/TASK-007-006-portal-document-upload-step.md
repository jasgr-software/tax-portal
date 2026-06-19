# TASK-007-006: Client document-upload onboarding step — checklist + upload + rejection surface (`apps/portal`) + cross-app e2e

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-007-004, TASK-007-005
**Impl**: developer
**E2e-required**: yes <!-- the client checklist→upload→fulfill→step-satisfied + malicious-rejection paths; cross-app author→fulfill -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-004-01 (client shown the checklist), AC-ONBD-004-02 (outstanding vs provided), AC-ONBD-004-03 (upload to fulfill), AC-FILE-007-02 (client sees requests + labels), AC-FILE-007-03 (fulfill a request by uploading), AC-FILE-008-02 (distinguish outstanding from fulfilled), AC-FILE-008-03 (fulfilled item no longer outstanding), AC-FILE-001-02 (client upload to the engagement — e2e surface), AC-FILE-002-01 (any file type accepted), AC-NFR-009-02 (malicious file withheld + uploader informed of rejection).
**Upstream refs:** ADR-006 (client upload lives in `apps/portal`, not reachable from `apps/admin`), ADR-009 (client uses signed upload URL; PUTs directly to storage; never holds adapter creds; complete handler), ADR-021 (rejection surfaced to uploader), ADR-003 (client principal; owner-resolved server-side), ADR-005 (the EPIC-005 letter hard gate stays intact — upload step refused until letter signed; server-authoritative).
**Introduces-gate:** no <!-- the e2e suite for this surface; the scan/promotion gate is owned by TASK-007-004 -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log (`pnpm --filter portal e2e:run` + `pnpm e2e:cross-app`)
- [ ] **Security review** — letter gate intact (server-refused, not hidden); owner-resolved server-side; client never holds adapter creds; no role from client input
- [ ] **SDET Review** — approved

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
| `apps/portal/src/app/onboarding/_components/DocumentUploadStep.tsx` | Create | The step UI: checklist (outstanding/fulfilled), per-request file picker, upload progress, rejection surface (mirror `QuestionnaireStep.tsx` shape) |
| `apps/portal/src/app/onboarding/actions.ts` | Modify | Add `requestUploadUrlAction` (authorize → pending insert → signed upload URL) + `completeUploadAction` (scan/promote) + `getChecklistAction`; all owner-resolved, letter-gate-checked via `checkStepAccessibility` |
| `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` | Modify | Render `DocumentUploadStep` at step 3 (it currently exists as a gated placeholder) |
| `apps/portal/src/app/onboarding/actions.test.ts` | Modify | Add: unsigned-engagement upload refused; non-owner refused; rejection mapping |
| `apps/portal/src/app/onboarding/document-upload-step.test.tsx` | Create | Component: outstanding/fulfilled render; rejection message render |
| `apps/portal/e2e/specs/document-upload.spec.ts` | Create | e2e: post-letter-gate client sees checklist, uploads any-type to fulfill, fulfilled leaves outstanding, malicious rejected (AC-ONBD-004-01/-02/-03, AC-FILE-002-01, AC-NFR-009-02) |
| `apps/portal/e2e/features/document-upload.feature` | Create | Bind the epic's gherkin scenarios for these AC (human-readable spec; SDET binds) |
| `e2e/cross-app/*` (or the existing cross-app spec home) | Modify/Create | `pnpm e2e:cross-app`: accountant authors a request (admin) → client fulfills it (portal) → request leaves outstanding |

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

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

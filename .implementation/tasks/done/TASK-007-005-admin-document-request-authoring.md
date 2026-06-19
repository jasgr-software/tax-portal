# TASK-007-005: Accountant document-request authoring UI (`apps/admin`)

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-007-004
**Impl**: developer
**E2e-required**: yes <!-- accountant authoring runs against the full docker-compose stack in apps/admin; cross-module onboarding/file boundary -->
**Started-at**: 2026-06-19T13:36:00Z
**Completed-at**: 2026-06-19T14:22:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** AC-FILE-007-01 (accountant creates a labeled document request within an engagement).
**Upstream refs:** ADR-006 (authoring lives in `apps/admin`, must NOT be reachable from `apps/portal`), ADR-003 (accountant principal via the request-scoped wrapper), ADR-005 (accountant-only write boundary — the `0007` DocumentRequest BLOCK), ADR-019 (authoring may be audited per the existing seam).
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (`pnpm --filter admin e2e:run`)
- [x] **Security review** — accountant-guarded; role from verified session only; not reachable from portal; no client-supplied role/identity
- [x] **SDET Review** — approved

## SDET Review focus areas

- Cites ADR-006 — verify the authoring surface lives in `apps/admin` and is **not reachable from `apps/portal`** (route is admin-app-only; accountant-guarded via `getAccountantIdentity`).
- ADR-003/005 — the create action runs under the **accountant** principal through the request-scoped wrapper; the `0007` DocumentRequest BLOCK is the write fence (a non-accountant write fails closed). Role comes from the verified session only — never form data.
- Mirrors the delivered EPIC-005/006 admin authoring patterns (`settings/letter-template/`, `settings/questionnaire-templates/`) — same guard + action + component shape; free-text label validated (non-empty, length cap).
- **Cross-surface (CLAUDE.md):** this is the `apps/admin` half; the portal half is TASK-007-006 — validate the author→fulfill path crosses both (cross-app e2e in TASK-007-006).

## Context

The accountant authors labeled document requests for an engagement; the set composes the engagement's checklist (AC-FILE-007-01, AC-FILE-008-01). Mirror the EPIC-005/006 admin authoring precedents. The data action (`createDocumentRequestAsAccountant`) is delivered in TASK-007-004; this task is the `apps/admin` UI + server action wiring + guard.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/page.tsx` | Create | Accountant-guarded page listing an engagement's document requests + a create form. DECISION: route is `/engagements/[engagementId]/document-requests` — new top-level route (no existing engagement-detail surface in admin; mirrors settings-style shape per dispatch instructions). |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/actions.ts` | Create | `createDocumentRequestAction` + `listDocumentRequestsAction` — `getAccountantIdentity` guard → `createDocumentRequestAsAccountant` (TASK-007-004) → revalidate |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/validation.ts` | Create | Shared constants + `validateLabel` helper (moved out of `actions.ts` — Next.js "use server" only allows async function exports; this file is imported by both actions.ts and DocumentRequestEditor.tsx) |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx` | Create | Free-text label form (mirrors `QuestionnaireTemplateEditor` shape) |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/actions.test.ts` | Create | Unit: guard rejects non-accountant; label validation; session identity not from form data; ADR-003 withRequestContext for list |
| `apps/admin/src/app/engagements/[engagementId]/document-requests/document-request-editor.test.tsx` | Create | Component: editor renders; list renders; valid label calls action; empty/whitespace/server errors handled; XSS safety |
| `apps/admin/e2e/specs/document-requests.spec.ts` | Create | e2e: accountant creates a labeled request (AC-FILE-007-01) against the stack; label validation; CLIENT rejected |
| `apps/admin/e2e/features/document-requests.feature` | Create | Bind the epic's AC-FILE-007-01 gherkin scenario (human-readable spec; SDET binds per CLAUDE.md § Executable gherkin tooling) |
| `packages/db/package.json` | Modify | Added `./src/repositories/document-request.js` subpath export so the direct source-module import resolves in TypeScript (maps to `dist/repositories/document-request.{d.ts,js}`) |

## Implementation Notes

- **Mirror `apps/admin/src/app/settings/questionnaire-templates/`** for the guard + action + `_components` structure. Use the existing accountant identity helper (`getAccountantIdentity`).
- The exact route path should match where the admin app already surfaces an engagement (check the existing admin engagement routes before inventing a path) — keep it consistent with the delivered admin IA.
- Do **not** re-implement the data write here — call `createDocumentRequestAsAccountant` from TASK-007-004.
- Bind the AC-FILE-007-01 gherkin scenario from `.planning/EPIC-007-*.md#acceptance-scenarios` — do not re-author.

## Definition of Done

- [x] Accountant can create a labeled document request within an engagement (AC-FILE-007-01)
- [x] Surface is admin-only, accountant-guarded, not reachable from `apps/portal`
- [x] Unit/component + e2e (admin) green; gherkin scenario bound
- [x] Lint + type-check + build pass

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation
**What was done:** Dispatch checkpoint set. Task in-progress. Complexity estimate: 3 (UI + server action + unit tests + e2e — moderate, follows established pattern).
**What's next:** Read EPIC-007 acceptance scenarios; audit existing admin IA to find the correct engagement route; implement page/actions/components/tests/e2e.
**Blockers:** None — TASK-007-004 (the data write) is confirmed delivered.

### 2026-06-19 [webapp-developer] Implementation complete — submission gate passed

**What was done:**

1. **Route created:** New top-level route `/engagements/[engagementId]/document-requests/` in `apps/admin` (no existing engagement-detail surface — DECISION documented in task spec).

2. **Package subpath export fix:** Added `./src/repositories/document-request.js` subpath to `packages/db/package.json` `exports` field so TypeScript resolves the direct source-module import mandated by task constraints. Maps to `dist/repositories/document-request.{d.ts,js}`.

3. **validation.ts** (new file — not in original task spec): `LABEL_MAX_LENGTH = 500` + `validateLabel(label)` extracted to a non-"use server" module. Required because Next.js "use server" files cannot export sync constants or sync functions.

4. **actions.ts:** `createDocumentRequestAction` (guard → validate → `createDocumentRequestAsAccountant` from direct source import → `revalidatePath`) + `listDocumentRequestsAction` (guard → `withRequestContext` → `listDocumentRequestsForEngagement`). Identity always from `getAccountantIdentity()`, never from form data (ADR-005).

5. **DocumentRequestEditor.tsx:** "use client" component — label input, Add button, request list, empty state, client-side validation using shared `validateLabel`, `useTransition` for server action calls.

6. **page.tsx:** Defense-in-depth accountant guard + initial list load via `listDocumentRequestsAction` → renders `<DocumentRequestEditor>`.

7. **actions.test.ts:** 24 tests. Covers: `validateLabel` (6 cases); `createDocumentRequestAction` (guard rejects null/CLIENT identity, identity from session not form data, label validation, trim, at-cap, revalidatePath only on success); `listDocumentRequestsAction` (success, ADR-003 withRequestContext wrapping, guard rejects null/CLIENT, empty engagementId).

8. **document-request-editor.test.tsx:** 15 tests. Covers: renders root/input/button/list/empty-state; action called with correct args; success banner; new request in list; label cleared; empty/whitespace client-side validation; server error display; XSS safety.

9. **document-requests.feature:** Verbatim AC-FILE-007-01 gherkin scenario from EPIC-007.

10. **document-requests.spec.ts:** 3 e2e tests: happy path (seed engagement, navigate, fill label, add, assert persistence); empty label validation (CLIENT-side rejection, no server call); security (CLIENT session redirected away, editor not visible). Used `UniqueIdentifier` typed mssql inputs for all GUID columns; `clientUserId = NULL` (nullable per DECISION-A).

**Key fixes during implementation:**
- `@tax-portal/db` missing subpath export → added to `package.json`
- Next.js "use server" sync export constraint → split to `validation.ts`
- Module resolution: no `.js` extension for Next.js/webpack → bare import paths
- mssql UNIQUEIDENTIFIER coercion error → explicit `UniqueIdentifier` typed inputs
- Strict mode `[role="alert"]` ambiguity (Next.js route announcer) → `.first()`
- Security e2e: middleware redirects CLIENT before page renders → redirect-tracking pattern from `request-inbox.spec.ts`

**Gate results:**

- `pnpm lint`: PASSED — 0 errors
- `pnpm type-check`: PASSED — 0 errors
- `pnpm build`: PASSED — route `/engagements/[engagementId]/document-requests` present in build output
- `pnpm --filter admin test`: PASSED — 223 tests passed (12 files; includes 24 new action tests + 15 new component tests)
- `pnpm --filter admin e2e:run -- --grep 'document.request'`: **38 passed, 0 failed** in 13.0s

**E2e execution output (targeted run):**

```
Running 38 tests using 1 worker

  ✓  [chromium] › e2e/specs/auth-redirect.spec.ts — [AC-AUTH-010-02 seam] CLIENT visiting admin root redirected (4 tests)
  ✓  [chromium] › e2e/specs/cross-app-redirect.spec.ts — [AC-AUTH-010-01] cross-app redirect tests (4 tests)
  ✓  [chromium] › e2e/specs/document-requests.spec.ts:257 › [AC-FILE-007-01] accountant creates a labeled document request and it appears in the list (347ms)
  ✓  [chromium] › e2e/specs/document-requests.spec.ts:321 › [AC-FILE-007-01] label validation: empty label rejected client-side without calling the server (212ms)
  ✓  [chromium] › e2e/specs/document-requests.spec.ts:354 › [security][ADR-006] page requires ACCOUNTANT auth — CLIENT session is redirected away (180ms)
  ✓  [chromium] › e2e/specs/letter-template.spec.ts — (2 tests)
  ✓  [chromium] › e2e/specs/questionnaire-templates.spec.ts — (3 tests)
  ✓  [chromium] › e2e/specs/request-accept.spec.ts — (2 tests)
  ✓  [chromium] › e2e/specs/request-decline.spec.ts — (4 tests)
  ✓  [chromium] › e2e/specs/request-inbox.spec.ts — (7 tests)
  ✓  [chromium] › e2e/specs/scaffold.smoke.spec.ts — (3 tests)
  ✓  [chromium] › e2e/specs/services-catalog-cross-surface.spec.ts — (1 test)
  ✓  [chromium] › e2e/specs/services-catalog.spec.ts — (5 tests)

  38 passed (13.0s)
```

**What's next:** SDET review.
**Blockers:** None.

### 2026-06-19 [sdet] SDET review complete — APPROVED
**What was done:** Full SDET review of TASK-007-005. All mandatory rejection checks passed. Independent re-runs: `pnpm --filter admin e2e:run -- --grep 'document.request'` → 38 passed (16.1s); 3 document-request specs confirmed (happy-path create, empty-label client rejection, CLIENT redirect security). `pnpm --filter admin test` → 223 passed (12 files; 24 action tests + 15 component tests). `pnpm lint` + `pnpm type-check` clean. Trust fence (ADR-005/003) verified: `createdByClerkId` from session only; `listDocumentRequestsAction` wrapped in `withRequestContext`; `createDocumentRequestAsAccountant` not reachable from portal (zero hits). Server-side label validation confirmed: `validateLabel` called before write; empty/whitespace/over-cap all rejected before `createDocumentRequestAsAccountant`. `.feature` scenario verbatim against EPIC-007 L152-154. Design-coherence finding surfaced (FA-1): `/engagements/[engagementId]/document-requests` is an orphan route — no navigation link exists in any admin page pointing at it. Finding explicitly reported to IO; does not auto-red the task per dispatch instructions. `// DECISION:` present in both task spec and source comments. `Completed-at: 2026-06-19T14:22:00Z` (real clock, forward of `Started-at: 2026-06-19T13:36:00Z`).
**What's next:** IO to decide fix-forward on the orphan-route navigation gap (follow-up task or route back to developer), then dispatch TASK-007-006.
**Blockers:** None.

## Attempt Log

**Attempt count**: 1 (all gates green on first complete attempt)

## SDET Review

**Decision**: approved
**Notes**:

**FA-1 — IA / Navigability (design-coherence finding — explicitly surfaced):**

The new `/engagements/[engagementId]/document-requests` route is an **orphan** — it is not linked from any other page in `apps/admin`. The grep over all `apps/admin/src` files for any `href`, `Link`, or navigation entry pointing at `engagements/` or `document-requests` returned zero hits. The `RequestList` component (the closest upstream surface) links to `/requests/${request.id}` (the EngagementRequest detail), which itself carries no link forward to the new engagement surface. The e2e navigates to the URL directly — which is how it passes without a navigation link existing.

**This is a confirmed orphan.** A real accountant cannot navigate to the document-request authoring surface through the admin UI today; she would have to know and type the URL. This contradicts the spirit of AC-FILE-007-01 — "the accountant can create a labeled document request within an engagement" implies reachability.

**This does NOT automatically red the task.** Per the dispatch instructions, the IO makes the fix-forward decision: accept a follow-up navigation-linking task for TASK-007-006 or beyond, or route a fix back to the developer now. The finding is surfaced here as required; final disposition is the IO's call.

The `// DECISION:` rationale ("no existing engagement-detail surface in admin — creating new top-level route as semantically correct home") is present **both** in the task spec file table and as inline comments in `page.tsx` and `actions.ts`. The decision text is clear and accurate. The problem is not the route choice; it is the absence of a navigation entry pointing at it.

**FA-2 — Trust fence (ADR-005 / ADR-003):**

`createDocumentRequestAsAccountant` — imported directly from `@tax-portal/db/src/repositories/document-request.js` (the admin-pool, RLS-exempt write; not barrel-exported). In `createDocumentRequestAction`, `createdByClerkId` is set exclusively from `identity.clerkUserId` where `identity` comes from `getAccountantIdentity()` (session-derived `getIdentity()` call). No action argument or form data field contributes to identity. The function signature `createDocumentRequestAction(engagementId, label)` carries no identity parameter — correct.

`listDocumentRequestsAction` wraps `listDocumentRequestsForEngagement` inside `withRequestContext(identity.clerkUserId, identity.role, ...)` — ADR-003 satisfied.

Portal surface boundary: grep of `apps/portal/src` for `createDocumentRequestAsAccountant`, `document-request.js`, and `repositories/document-request` returned zero hits. The write seam is not reachable from `apps/portal`. PASS.

**FA-3 — Label validation server-side:**

`validation.ts` exports `LABEL_MAX_LENGTH = 500` and `validateLabel(label: unknown): string | null`. Rules: typeof string check; `!label.trim()` rejects empty/whitespace; `label.trim().length > LABEL_MAX_LENGTH` rejects over-cap; returns null on valid. Matches the NVARCHAR(500) column constraint exactly.

In `createDocumentRequestAction`, step 3 calls `validateLabel(label)` before step 4 (`createDocumentRequestAsAccountant`). If `labelError` is non-null, the action returns `{ success: false, error: labelError }` immediately — the write is never reached. Server-side validation is the enforcement layer; the client-side check in `DocumentRequestEditor` is defense-in-depth convenience only. PASS.

**FA-4 — e2e independent re-run:**

Docker pre-flight: Docker 29.4.1; `tax-portal-sqlserver` Up 3 days (unhealthy — known SA-password/volume mismatch, non-blocking); `tax-portal-admin` Up 20 minutes (healthy); `tax-portal-azurite` Up 2 hours. Non-blocking per PROGRESS.md.

Independent run: `pnpm --filter admin e2e:run -- --grep 'document.request'` → log `/tmp/task-007-005-e2e.log` → **38 tests, 38 passed (16.1s)**.

The three document-request specs all executed and passed:
- Line 9 (spec L257): `[AC-FILE-007-01] accountant creates a labeled document request and it appears in the list` — 384ms
- Line 10 (spec L321): `[AC-FILE-007-01] label validation: empty label rejected client-side without calling the server` — 225ms
- Line 11 (spec L354): `[security][ADR-006] page requires ACCOUNTANT auth — CLIENT session is redirected away` — 200ms

Happy-path test: seeds a real Engagement + EngagementRequest, navigates to the authoring page, fills and submits a labeled request, asserts the item in `[data-testid="request-item"]`, asserts the success banner, verifies persistence after navigate-away-and-back. Teardown cleans DocumentRequest + Engagement + EngagementRequest rows. Gherkin Given/When/Then is structurally mapped correctly.

Empty-label test: clicks Add with empty input, asserts `[role="alert"].first()` matches `/required|empty/i`, asserts zero `request-item` elements. The `.first()` workaround for the Next.js route-announcer alert ambiguity is sound.

Security test: sets CLIENT session, navigates with `waitUntil: "commit"`, asserts redirect OR not-on-target-path, then asserts `document-request-editor` not visible. Mirrors the `request-inbox.spec.ts` redirect-tracking pattern.

`.feature` file at `/home/ccox/repos/tax-portal/apps/admin/e2e/features/document-requests.feature` is verbatim against EPIC-007 L152-154:
```
Given the accountant in an engagement
When she creates a document request with a free-text label
Then a labeled document request is created in that engagement
```
PASS.

**FA-5 — Independent unit/component re-run:**

`pnpm --filter admin test` → log `/tmp/task-007-005-unit.log` → **12 test files, 223 tests, all passed (2.64s)**. Breakdown includes 24 action tests (`actions.test.ts`) and 15 component tests (`document-request-editor.test.tsx`). Both new files are present in the output. All 223 confirm.

`pnpm lint` → zero warnings/errors (both portal and admin). `pnpm type-check` → zero errors (packages + both apps). PASS.

**Mandatory rejection checks:**

- Work Log breadcrumb chain: Starting-implementation entry present (2026-06-19, pre-implementation). Submission-complete entry present with full gate output. PASS.
- `Complexity-actual: 3` — present, integer in 1–5. PASS.
- `Started-at: 2026-06-19T13:36:00Z`, `Complexity-estimate: 3` — both present. PASS.
- Required task-spec fields: `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**` all present. PASS.
- No tool-hygiene violations in Work Log. PASS.
- `Introduces-gate: no` — three-item Gate-Authoring evidence not required. PASS.
- Clock domain: `Completed-at` written as `2026-06-19T14:22:00Z` (real clock); `Started-at` is `2026-06-19T13:36:00Z` — forward-ordered. PASS.

**Overall verdict:** APPROVED. The orphan-route finding is the one design-coherence gap but does not red the task per the dispatch instructions. All security, validation, test-coverage, and gate-evidence checks pass.

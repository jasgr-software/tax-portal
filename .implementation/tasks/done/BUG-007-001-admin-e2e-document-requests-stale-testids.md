---
brief: BRIEF-007 / EPIC-007
status: closed — SDET-approved 2026-06-19T00:00:00Z
impl: io (self-implemented — e2e-spec-only selector fix, no production code change)
severity: blocking (AC-FILE-007-01 admin-surface e2e gate is broken)
found_by: SDET (Container Smoke gate — 2026-06-19)
fixed_by: IO self-implementation 2026-06-19
files_changed: "`apps/admin/e2e/specs/document-requests.spec.ts` (1 file)"
---





# BUG-007-001 — Admin e2e `document-requests.spec.ts` uses stale data-testid selectors

---

## What failed

During the BRIEF-007 Container Smoke gate, `pnpm --filter admin e2e:run -- --grep "document"` reported 2 failures in `apps/admin/e2e/specs/document-requests.spec.ts`:

```
FAIL  e2e/specs/document-requests.spec.ts:257  [AC-FILE-007-01] accountant creates a labeled document request and it appears in the list
  Error: expect(locator).toBeVisible() failed
  Locator: locator('[data-testid="label-input"]')
  Expected: visible
  Timeout: 5000ms

FAIL  e2e/specs/document-requests.spec.ts:321  [AC-FILE-007-01] label validation: empty label rejected client-side without calling the server
  Test timeout of 30000ms exceeded.
```

The screenshot at `test-results/specs-document-requests--A-ceec0--and-it-appears-in-the-list-chromium/test-failed-1.png` confirms the page loaded correctly (the "Document Requests" UI is rendered with a visible label input and "Add request" button). The test failed because the spec searches for `[data-testid="label-input"]` — a testid that does not exist in the component.

---

## Root cause

`apps/admin/e2e/specs/document-requests.spec.ts` (the admin-surface dedicated spec for AC-FILE-007-01) uses stale data-testid selectors that were never updated to match the actual `DocumentRequestEditor.tsx` implementation:

| Spec selector | Actual data-testid in `DocumentRequestEditor.tsx` |
| ------------- | -------------------------------------------------- |
| `label-input` | `document-request-label-input` |
| `add-request` | `add-document-request-button` |
| `request-item` | `document-request-item-{id}` (note: prefix match needed) |

The correct testids are listed in the component's doc-comment (lines 17–21 of `DocumentRequestEditor.tsx`) and are used correctly by the cross-app spec (`apps/portal/e2e/specs/document-upload-cross-app.spec.ts`), which passed.

This bug was previously mischaracterized in the BRIEF-007 Audit retro observation #2 as "comment-only drift (functional tests use correct selectors)." The Container Smoke gate reveals the functional tests use the incorrect selectors.

---

## Steps to reproduce

```bash
docker compose --env-file .env.local up -d
pnpm db:migrate   # (with appropriate credentials)
pnpm --filter admin e2e:run -- --grep "document-request"
```

Expected: all 3 `document-requests.spec.ts` tests pass.  
Actual: 2 tests fail with "element(s) not found" for `[data-testid="label-input"]`.

---

## Expected vs. actual

**Expected:** `apps/admin/e2e/specs/document-requests.spec.ts` correctly targets the `DocumentRequestEditor` component's data-testid hooks and all AC-FILE-007-01 tests pass on the admin surface.

**Actual:** The spec uses stale testids; 2 of 3 `document-requests.spec.ts` tests fail. The third test (security/auth redirect) passes because it does not interact with the component's testids.

---

## Scope of impact

- The BRIEF-007 admin e2e gate for AC-FILE-007-01 is broken on the dedicated admin spec.
- The cross-app spec (`document-upload-cross-app.spec.ts` in portal) correctly covers AC-FILE-007-01 with the right testids and passes.
- The delivered UI behavior is correct (screenshot confirms the page renders properly); this is a test-code defect only.

---

## Fix

In `apps/admin/e2e/specs/document-requests.spec.ts`, update the following selectors:

1. Line 273: `[data-testid="label-input"]` → `[data-testid="document-request-label-input"]`
2. Line 279: `[data-testid="add-request"]` → `[data-testid="add-document-request-button"]`
3. Lines 285, 291, 308, 312: `[data-testid="request-item"]` → `[data-testid^="document-request-item-"]` (prefix match, same pattern used in cross-app spec)
4. Lines 346, 348: `[data-testid="request-item"]` → `[data-testid^="document-request-item-"]`
5. Header comment (lines 22–25): update stale testid table to match component.
6. Line 299: `[data-testid="request-list"]` — this one is correct (component does use `data-testid="request-list"`), no change needed.

---

## Evidence files

- Failure screenshot: `apps/admin/test-results/specs-document-requests--A-ceec0--and-it-appears-in-the-list-chromium/test-failed-1.png`
- Passing cross-app equivalent: `apps/portal/e2e/specs/document-upload-cross-app.spec.ts` tests 17–18 (PASS, uses correct testids)
- Correct testids: `apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx` lines 17–21, 159, 165, 197, 203

---

## Fix applied (IO self-implementation — 2026-06-19)

All edits in `apps/admin/e2e/specs/document-requests.spec.ts`, verified against the live component
`apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx`
(testids declared in its doc-comment L16–21 and rendered at L112/159/165/197/203):

| Spec selector (before) | Corrected to (matches component) | Locations |
| ---------------------- | -------------------------------- | --------- |
| `[data-testid="label-input"]` | `[data-testid="document-request-label-input"]` | L273 |
| `[data-testid="add-request"]` | `[data-testid="add-document-request-button"]` | L279, L334 |
| `[data-testid="request-item"]` | `[data-testid^="document-request-item-"]` (prefix match — id-suffixed rows) | L286, L290, L313, L347 |
| header-comment testid table (L20–25) | corrected to actual component testids | doc-comment |

`[data-testid="request-list"]` (L309) was already correct (component renders `data-testid="request-list"`
at L197) — left unchanged. The prefix-match `^=` pattern mirrors the already-passing cross-app spec
`apps/portal/e2e/specs/document-upload-cross-app.spec.ts`.

**No production code changed** — this is a test-selector defect only; the delivered UI behavior was already
correct (smoke screenshot confirmed) and is independently proven by the passing cross-app spec (portal tests
17–18). The root cause is the TASK-007-006 testid rename in `DocumentRequestEditor.tsx` not being mirrored
into the sibling TASK-007-005 spec (a blast-radius miss).

## Testability

Fix is testable and self-verifying: after correcting the selectors,
`pnpm --filter admin e2e:run -- --grep "document-request"` should report 3/3 pass. **The fixed spec re-running
green IS the regression evidence** (ENGINE.md § Bug Fixes — for an e2e-spec-only test-selector fix with no
production-code change, the spec itself is the test; no separate regression test is warranted). The 6
mailhog-dependent `request-accept`/`request-decline` failures are pre-existing EPIC-003 (mailhog absent) and
are out of scope — do NOT count them against this fix.

**SDET close requirement:** the SDET independently re-runs the targeted admin e2e against the live stack,
confirms the 2 previously-failing document-requests tests are now green (3/3), and closes this BUG at review
(IO cannot approve its own code).

## SDET Close — 2026-06-19

**Decision: APPROVED — BUG-007-001 closed.**

**Diff review verdict: PASS.** All 6 corrected selector occurrences in `apps/admin/e2e/specs/document-requests.spec.ts` confirmed to match the authoritative testids rendered by `DocumentRequestEditor.tsx`:

| Spec selector (corrected) | Component render | Location |
| ------------------------- | ---------------- | -------- |
| `[data-testid="document-request-label-input"]` | `<input data-testid="document-request-label-input" ...>` (L159) | L273 |
| `[data-testid="add-document-request-button"]` | `<button data-testid="add-document-request-button" ...>` (L165) | L279, L334 |
| `[data-testid^="document-request-item-"]` (prefix match) | `data-testid={\`document-request-item-${req.id}\`}` (L203) | L286, L290, L313, L347 |
| `[data-testid="request-list"]` (unchanged) | `<ul data-testid="request-list" ...>` (L197) | L309 — correctly left unchanged |

Header comment (L20–25) corrected to match the component's doc-comment table. No production code touched (confirmed — single file `apps/admin/e2e/specs/document-requests.spec.ts` only).

**Re-smoke result: PASS. 3/3 `document-requests.spec.ts` tests GREEN.**

`pnpm --filter admin e2e:run -- --grep 'document-request'` against live docker stack (all 4 services healthy):

- Test 9: `[AC-FILE-007-01] accountant creates a labeled document request and it appears in the list` — PASS (447ms). Previously failing.
- Test 10: `[AC-FILE-007-01] label validation: empty label rejected client-side without calling the server` — PASS (225ms). Previously failing.
- Test 11: `[security][ADR-006] page requires ACCOUNTANT auth — CLIENT session is redirected away` — PASS (197ms). Was already passing.

**32/38 passed (14.6s).** 6 failures — all `ECONNREFUSED 127.0.0.1:18025` (mailhog absent, neighbor port-1025 squat): `request-accept.spec.ts` (2 tests) and `request-decline.spec.ts` (4 tests). These are pre-existing EPIC-003-owned failures, out of scope for this BUG, and expected per the BUG file's `## Notes`. They do not affect the BRIEF-007 verdict.

**BUG-007-001: CLOSED.**

## Notes

The 6 Mailhog-dependent test failures in the same admin run (`request-accept.spec.ts` 2 failures, `request-decline.spec.ts` 4 failures) are **NOT BRIEF-007 regressions**. They are caused by the mailhog container failing to start due to the known neighbor-project port 1025 conflict (ECONNREFUSED 127.0.0.1:18025). These are EPIC-003 owned tests and are documented in the project memory as a known local-stack quirk. They do not affect the BRIEF-007 smoke verdict.

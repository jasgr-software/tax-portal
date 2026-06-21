---
brief: BRIEF-006
status: closed
severity: blocking (submission gate failure — `pnpm --filter admin test` 1 failed / 183 passed)
task: TASK-006-006
found_by: sdet
filed_at: 2026-06-18T23:58:00Z
---

# BUG-006-001: actions.test.ts mock missing `withRequestContext` after TASK-006-006 bug fix

---

## What failed and why

TASK-006-006 introduced a bug fix to `apps/admin/src/app/settings/questionnaire-templates/actions.ts`
(an already-approved TASK-006-002 file): `listServicesForTemplatesAction()` now wraps `listAllServices()`
in `withRequestContext()` to satisfy ADR-003's SESSION_CONTEXT requirement.

The developer did NOT update the corresponding unit-test file
`apps/admin/src/app/settings/questionnaire-templates/actions.test.ts`.
The `vi.mock("@tax-portal/db", ...)` factory at line 64 of the test file does not export
`withRequestContext`, so when the action calls `withRequestContext(...)`, Vitest throws:

```
Error: [vitest] No "withRequestContext" export is defined on the "@tax-portal/db" mock.
Did you forget to return it from "vi.mock"?
```

Live reproduction (run by SDET):
```
pnpm --filter admin test
→ 1 failed / 183 passed
FAIL  src/app/settings/questionnaire-templates/actions.test.ts
  > listServicesForTemplatesAction > returns success + service list when ACCOUNTANT
    Error: [vitest] No "withRequestContext" export is defined on the "@tax-portal/db" mock.
```

The developer's Work Log claims "184 passed" — this is inconsistent with the live result.
The test suite must have been run before the `withRequestContext` fix was applied to `actions.ts`,
not re-run after. The submission gate evidence is therefore inaccurate.

**Note:** The fix to `actions.ts` itself is correct — see TASK-006-006 elevated-scrutiny item 1
verification notes in the SDET Review session entry. The bug is solely in the test mock.

---

## Steps to reproduce

```bash
# In the tax-portal repo root (no Docker required — unit test only):
pnpm --filter admin test
```

Observe: 1 failure in `src/app/settings/questionnaire-templates/actions.test.ts`, test
"listServicesForTemplatesAction > returns success + service list when ACCOUNTANT".

---

## Expected vs actual

**Expected:** `pnpm --filter admin test` passes 184/184 (matching the developer's Work Log claim).

**Actual:** 1 failed / 183 passed. The mock for `@tax-portal/db` is missing `withRequestContext`.

---

## Fix guidance

In `apps/admin/src/app/settings/questionnaire-templates/actions.test.ts`:

1. Add `mockWithRequestContext` to the `vi.hoisted()` block:
   ```ts
   const {
     mockGetIdentity,
     mockGetTemplateForService,
     mockUpsertTemplateForService,
     mockListAllServices,
     mockRevalidatePath,
     mockWithRequestContext,   // ADD THIS
   } = vi.hoisted(() => ({
     ...
     mockWithRequestContext: vi.fn(),  // ADD THIS
   }));
   ```

2. Add `withRequestContext` to the `vi.mock("@tax-portal/db", ...)` factory:
   ```ts
   vi.mock("@tax-portal/db", () => ({
     getTemplateForService: mockGetTemplateForService,
     upsertTemplateForService: mockUpsertTemplateForService,
     listAllServices: mockListAllServices,
     withRequestContext: mockWithRequestContext,   // ADD THIS
   }));
   ```

3. In `beforeEach` for the `listServicesForTemplatesAction` describe block, configure
   `mockWithRequestContext` to invoke its callback (the pass-through semantics):
   ```ts
   // withRequestContext pass-through — invoke the callback directly
   mockWithRequestContext.mockImplementation(
     async (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
   );
   ```
   This preserves the test's existing behavioral contract: `mockListAllServices` is still
   the callable being asserted, and the `expect(mockListAllServices).toHaveBeenCalledOnce()`
   assertion at line 146 will pass correctly.

4. Re-run `pnpm --filter admin test` — expect 184/184 pass.

**Scope constraint:** The fix is ONLY to `actions.test.ts` — the mock factory and the
`listServicesForTemplatesAction` describe `beforeEach`. Do NOT change the action code in
`actions.ts` (the fix there is correct and approved by this review).

**Note on test-comment stale text:** Line 17 of `actions.test.ts` reads:
"withRequestContext is NOT in this module (admin-pool actions don't use it)."
This comment became stale when the TASK-006-006 bug fix added `withRequestContext`. Update
it to reflect the current truth.

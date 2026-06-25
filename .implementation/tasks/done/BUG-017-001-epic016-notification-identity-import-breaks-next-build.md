---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-25T13:22:03.902Z
completed_at: 2026-06-25T19:26:15.733Z
complexity_estimate: 1
complexity_actual: 1
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: "none (justification: pre-existing-defect fix-forward; restores a green `pnpm build` the slice's submission/Smoke/e2e gates depend on — no brief AC)"
upstream_refs: [EPIC-016, ADR-006]
code_standards: CS-TS-003 (recommended), CS-GEN-003 (recommended)
severity: high
reviewer: sdet
---

# BUG-017-001: EPIC-016 `notification-identity` import (`.js` specifier) breaks `next build` on both apps

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + **build** + tests pass (the build green IS the fix evidence)
- [N/A] **Targeted e2e** — _(N/A — no behavior change; build-resolution fix)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **The fix evidence is a green `pnpm build` on BOTH `apps/portal` and `apps/admin`** (the break manifests in both — ADR-006 mirror). Verify the full-build output is in the Work Log, not just type-check.
- **Behavior-preserving** — this is an import-resolution correction only; `notification-identity` exports and all call sites are unchanged. No EPIC-016 notification behavior should change.
- **Regression guard via `## Testability`** — a unit-level "the import resolves at build" assertion is awkward; the guard is the fix's own green `pnpm build` + the documented Testability note. Confirm the Testability section is present and justified (ENGINE § Bug Fixes regression-test escape requires an explicit `## Testability` + IO approval — granted below).

## Reproduction

```
git checkout main      # clean main, EPIC-016 #102 / 345328e merged
pnpm build             # FAILS
```

Error (both apps):
```
Module not found: Can't resolve '../_lib/notification-identity.js'
```

at:
- `apps/portal/src/app/api/notifications/stream/route.ts:58`
- `apps/portal/src/app/api/notifications/emit-test/route.ts:55`
- `apps/admin/src/app/api/notifications/stream/route.ts:55`
- `apps/admin/src/app/api/notifications/emit-test/route.ts:35`

## Root cause

EPIC-016 (#102) added route handlers importing `../_lib/notification-identity.js` (a `.js` specifier) while the actual file is `notification-identity.ts`. The apps resolve modules with `moduleResolution: "Bundler"` (`packages/tsconfig/nextjs.json`), under which `tsc --noEmit` (type-check) resolves the `.js`→`.ts` mapping (so `lint-and-typecheck` passes), but Next's webpack `build` cannot resolve the `.js` specifier for this `_lib` path → `Module not found`.

**Why it merged green on `main`:** `pnpm build` is **not a required CI check** (only `lint-and-typecheck` + `security-scan` are required; `test-portal`/`test-admin` are advisory — see CLAUDE.md § Required CI checks). The break is therefore latent on `main`.

**Independently confirmed pre-existing (RETRO-016 "pre-existing label needs an isolation proof" lesson):**
`git diff --name-only main...HEAD -- apps/portal apps/admin` on the BRIEF-017 branch is **empty** — the branch does not touch either app — and `git show main:apps/portal/src/app/api/notifications/stream/route.ts` shows the broken import on clean `main`. NOT introduced by TASK-017-001.

> Note: 37 other `.js`-suffixed relative imports across the apps build fine, so the `.js` extension is not universally broken under Bundler resolution — the `_lib/notification-identity` path is the failing case. The fixer determines the resolution that greens the build (extensionless is the most likely and is consistent with the 100 extensionless relative imports in the apps) and verifies it against a full `pnpm build`.

## Scope

The 4 import lines above (both apps). Behavior-preserving — exports/call-sites unchanged.

## Severity

**high** — blocks every portal/admin submission-gate `build` in this slice, plus Smoke and e2e (both require a working build). Fix-forward in this slice is required.

## Fix direction

Correct the 4 `../_lib/notification-identity.js` specifiers so `next build` resolves them (most likely: drop the `.js` extension → `../_lib/notification-identity`, matching the apps' extensionless house convention). Apply to both apps (ADR-006 mirror). Then run `pnpm build` to green on both apps and paste the output into the Work Log.

## Files to Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/api/notifications/stream/route.ts` | Modify | fix the `notification-identity` import specifier |
| `apps/portal/src/app/api/notifications/emit-test/route.ts` | Modify | fix the import specifier |
| `apps/admin/src/app/api/notifications/stream/route.ts` | Modify | fix the import specifier |
| `apps/admin/src/app/api/notifications/emit-test/route.ts` | Modify | fix the import specifier |

## Testability

**IO-approved regression-test escape (ENGINE § Bug Fixes).** A meaningful unit/integration test for "a relative import resolves at `next build` time" does not exist at a sensible level — the failure is a webpack module-resolution event, not a runtime behavior. The regression guard is the fix's **own green `pnpm build`** on both apps (recorded in the Work Log). Durable CI prevention — graduating `pnpm build` toward a required check — is **out of scope for this fix** and tracked separately under **retro-012-001** (`test-portal`/build CI maturation). The IO approves the no-unit-test escape on that basis.

## Definition of Done

- [x] The 4 import specifiers corrected on both apps
- [x] `pnpm build` green on both `apps/portal` and `apps/admin` — output in the Work Log
- [x] lint + type-check still pass; no behavior change to EPIC-016 notification paths
- [x] `## Testability` note present (IO-approved escape)

---

## Work Log

- 2026-06-25 [sdet] Marking done — Build green on both apps (EXIT_CODE:0): portal compiled 2.4s + admin 3.6s, both /api/notifications/emit-test and /api/notifications/stream routes appear clean in route table — no Module not found errors. 275 portal + 504 admin tests pass. Behavior-preserving: 4-line import-specifier correction only (dropped .js extension from notification-identity imports), no runtime behavior change. Testability escape IO-approved: unit test for webpack module-resolution not feasible; green pnpm build on both apps is the regression guard. Lint + type-check pass. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — 4-line fix: dropped .js extension from notification-identity imports in both apps. pnpm build green on both apps (EXIT_CODE:0). lint + type-check pass. 275 portal + 504 admin tests pass. Behavior-preserving — import-specifier correction only. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — task BUG-017-001 | What's next: implement and run gates | Blockers: none
- 2026-06-25 [io] BUG filed. Pre-existing EPIC-016 build break, independently confirmed against clean `main` (empty app diff on this branch + broken import visible in `git show main:...`). Severity high — blocks the slice's build/Smoke/e2e gates. Fix-forward this slice; dispatched to webapp-developer. Regression-test escape approved (green `pnpm build` is the guard; CI build-maturation tracked under retro-012-001). | Next: developer applies the 4-line fix + greens `pnpm build` on both apps. | Blockers: none.
- 2026-06-25 [webapp-developer] Fix applied — dropped `.js` extension from 4 `notification-identity` import specifiers (both apps). Verified: `pnpm lint` ✓, `pnpm type-check` ✓, `pnpm build` ✓ (EXIT_CODE:0). Pre-existing scan-pipeline db test failures (2/454 in packages/db) confirmed pre-existing by stash/revert isolation test — not introduced by this change. Portal tests: 275/275 passed. Admin tests: 504/504 passed. Behavior unchanged — only import specifiers modified. Security review: no auth/XSS surface change; this is a module-resolution correction only. | What's next: SDET review. | Blockers: none.
- 2026-06-25 [webapp-developer] pnpm build evidence (EXIT_CODE:0):
  apps/portal: ✓ Compiled successfully in 2.4s — /api/notifications/emit-test and /api/notifications/stream both appear in route table cleanly.
  apps/admin:  ✓ Compiled successfully in 3.6s — /api/notifications/emit-test and /api/notifications/stream both appear in route table cleanly.
  No "Module not found" errors. Full output captured at /tmp/build-bug017.log during gate run.

## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved
**Notes**: Build green on both apps (EXIT_CODE:0): portal compiled 2.4s, admin 3.6s; `/api/notifications/emit-test` and `/api/notifications/stream` routes appear cleanly in both route tables — the "Module not found: Can't resolve '../_lib/notification-identity.js'" error is resolved. 275 portal + 504 admin tests pass. Fix is behavior-preserving — 4-line import-specifier correction only (`.js` extension dropped to match apps' extensionless house convention); no runtime exports or call-sites changed. `## Testability` section present with IO-approved regression-test escape (webpack module-resolution event; green `pnpm build` is the durable guard). Lint + type-check pass. Pre-existing scan-pipeline failures confirmed pre-existing via isolation test.

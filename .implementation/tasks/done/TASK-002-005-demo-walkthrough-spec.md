# TASK-002-005: @demo walkthrough spec — jane-accountant catalog-management happy path (screenshot gallery → docs/demos/EPIC-002/)

**Brief**: BRIEF-002
**Brief-type**: feature
**Brief-deploys**: no
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-002-004
**Impl**: developer
**E2e-required**: yes <!-- it is a Playwright @demo spec; runs against the live stack like the EPIC-004 identity-spine demo -->
**Started-at**: 2026-06-16T16:37:57Z
**Completed-at**: 2026-06-16T17:30:00Z
**Complexity-estimate**: 2
**Complexity-actual**: 2

**Acceptance criteria:** none (justification: non-gating demo artifact — captures AC-tagged screenshots of the AC-DOOR-002-01/-02/-03 + AC-DASH-010-01/-02/-03 happy path already validated by TASK-002-004; the e2e gate is the gate, per the brief and .orchestration/DEMO-POLICY.md)
**Upstream refs:** planning EPIC-002 (demo applicable, persona jane-accountant, flow flow-engagement-request), ADR-006 (apps/admin)
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build pass; the @demo spec runs (non-gating)
- [x] **Targeted e2e** — the @demo spec executes against the live stack; screenshot gallery produced (output in Work Log) _(non-gating per DEMO-POLICY)_
- [N/A] **Security review** — demo screenshot capture only; no new code paths or inputs
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Non-gating:** the @demo spec is not a quality gate (the TASK-002-004 e2e gate is). Verify it captures the
  AC-tagged happy-path gallery (list → add → edit → deactivate, with the inactive state shown) into
  `docs/demos/EPIC-002/` — model on `apps/admin/e2e/demo/identity-spine.demo.spec.ts`.
- **Mirror the EPIC-004 demo convention** (the existing `apps/admin/e2e/demo/` + `docs/demos/EPIC-004/` shape).
- Demo must not be flaky-blocking the suite — it is tagged `@demo` and excluded from the gating run.

## Context

`demo.applicable: yes` in the brief. A dedicated `@demo` Playwright walkthrough capturing jane-accountant's
catalog-management happy path into an AC-tagged screenshot gallery under `docs/demos/EPIC-002/`. Non-gating —
the e2e gate (TASK-002-004) is the gate. See `.orchestration/DEMO-POLICY.md`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/services-catalog.demo.spec.ts` | Create | `@demo`-tagged Playwright walkthrough: list → add → edit → deactivate (inactive state shown); AC-tagged screenshots → `docs/demos/EPIC-002/`. Model on `identity-spine.demo.spec.ts`. |
| `docs/demos/EPIC-002/` (gallery output) | Create | Screenshot gallery destination (+ README/manifest if the EPIC-004 demo convention uses one). |

## Tests to Write First

- [ ] `@demo jane-accountant manages the services catalog` — expected: gallery captured (list/add/edit/deactivate frames), AC-tagged

## Implementation Notes

- Reuse `setupAccountantSession` (apps/admin/e2e/fixtures/auth.ts). Mirror the EPIC-004 `@demo` spec + gallery
  layout exactly so the Conductor's demo gallery stays consistent.
- Docker pre-flight before running; same live-stack caveat as TASK-002-004 (escalate to IO if env-blocked,
  do not fabricate output — but note this spec is non-gating).

## Definition of Done

- [x] @demo spec captures the AC-tagged catalog-management happy-path gallery into docs/demos/EPIC-002/
- [x] Mirrors the EPIC-004 demo convention
- [x] Lint + type-check + build pass

---

## Work Log

### 2026-06-16T16:37:57Z — webapp-developer — in-progress
Starting implementation — @demo catalog-management walkthrough + EPIC-002 gallery | What's next: author the spec, create docs/demos/EPIC-002/ gallery + DEMO.md, run Docker pre-flight + e2e:demo | Blockers: none

### 2026-06-16T16:42:00Z — webapp-developer — review

**Files created:**
- `apps/admin/e2e/demo/services-catalog.demo.spec.ts` — @demo walkthrough spec (4 tests)
- `docs/demos/EPIC-002/DEMO.md` — gallery manifest
- `docs/demos/EPIC-002/01-AC-DASH-010-01-services-catalog-list.png` (273,219 bytes)
- `docs/demos/EPIC-002/02-AC-DOOR-002-01-add-service.png` (288,309 bytes)
- `docs/demos/EPIC-002/03-AC-DOOR-002-02-edit-service.png` (304,200 bytes)
- `docs/demos/EPIC-002/04-AC-DOOR-002-03-deactivate-service-inactive.png` (312,247 bytes)

**Gate output:**
- `pnpm lint` — PASS (0 errors)
- `pnpm type-check` — PASS (0 errors)
- `pnpm --filter admin build` — PASS (0 errors, compiled successfully)
- `ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo`:
  - 6 passed, 1 failed (3.9s total)
  - My 4 catalog tests: ALL PASS (tests 4–7)
    - ✓ [AC-DASH-010-01] @demo 01 — services catalog list (302ms)
    - ✓ [AC-DOOR-002-01] @demo 02 — adds a new service (438ms)
    - ✓ [AC-DOOR-002-02] @demo 03 — edits a service (488ms)
    - ✓ [AC-DOOR-002-03] @demo 04 — deactivates a service (458ms)
  - Pre-existing failure (not in scope): identity-spine test 07 (ACCOUNTANT bounced from portal to port 3001 vs expected 13001 — pre-dates this task, documented in EPIC-004/DEMO.md capture caveat)

**Capture-integrity check (sha256sum):**
```
28e9b311ee3c61ace767b58e878ecc5e6b2ac662025226c3b9ebef6d907cce04  01-AC-DASH-010-01-services-catalog-list.png
2b7d1542c51f2e76df8d0307f6b4552b53320eb6f414e6ba5b20846dc25ffe57  02-AC-DOOR-002-01-add-service.png
db953a26217f9241267718dd7d1eb8bc49f0a191857363bb4dcbf85fe87d3f3f  03-AC-DOOR-002-02-edit-service.png
94519cf5266a22e68dcfb61ed05760c937c439cb01a42e679dfa7932b627dc3b  04-AC-DOOR-002-03-deactivate-service-inactive.png
```
All 4 hashes are distinct — no byte-identical pairs. EPIC-004 lesson honored.

File sizes also distinct: 273,219 / 288,309 / 304,200 / 312,247 bytes — each state shows different page content (list only → add-form state → edit-form state → inactive badge), as expected from the unique service names.

What's done: spec authored, gallery captured, DEMO.md scaffolded, all gates passed.
What's next: SDET review.
Blockers: none.

## SDET Review

**Decision**: approved

**Focus 1 — Capture integrity (HARD).**
Independent `sha256sum` recomputed against `docs/demos/EPIC-002/*.png`:
```
28e9b311ee3c61ace767b58e878ecc5e6b2ac662025226c3b9ebef6d907cce04  01-AC-DASH-010-01-services-catalog-list.png
2b7d1542c51f2e76df8d0307f6b4552b53320eb6f414e6ba5b20846dc25ffe57  02-AC-DOOR-002-01-add-service.png
db953a26217f9241267718dd7d1eb8bc49f0a191857363bb4dcbf85fe87d3f3f  03-AC-DOOR-002-02-edit-service.png
94519cf5266a22e68dcfb61ed05760c937c439cb01a42e679dfa7932b627dc3b  04-AC-DOOR-002-03-deactivate-service-inactive.png
```
All 4 hashes are distinct — no byte-identical pairs. EPIC-004 06≡08 lesson honored.

Per-PNG visual spot-check (Read tool, each image):
- `01`: "Services Catalog" heading visible, full table of services shown (Active + Inactive rows), "Add Service" button present — correct list state. PASS.
- `02`: Same Services Catalog heading; a freshly-added `Demo-Add-Service-...` row visible at the top of the table with "Active" status badge — correct add-result state, visually distinct from 01 (different service name row at top). PASS.
- `03`: Same Services Catalog heading; the edited row visible with a `Demo-Edit-After-...` name replacing the pre-edit `Demo-Edit-Before-...` entry — correct edit-result state, visually distinct from 01 and 02. PASS.
- `04`: Same Services Catalog heading; a `Demo-Deactivate-Service-...` row present, with the inactive badge rendered — correct deactivate-result state, visually distinct from 01/02/03. PASS.

All four shots depict the correct, distinct states their AC-tagged names claim. No stale or duplicate captures.

**Focus 2 — Assert-before-screenshot.**
Read spec: every test calls `expect(...).toBeVisible()` (or `expect(...).toBe(false)` for the sign-in redirect guard) before `page.screenshot(...)`. Specifically:
- Test 01: `expect(heading).toBeVisible()` + URL sign-in guard before screenshot. PASS.
- Test 02: `expect(newRow).toBeVisible()` + `expect(newRow.getByText("Active")).toBeVisible()` before screenshot. PASS.
- Test 03: `expect(updatedRow).toBeVisible()` before screenshot. PASS.
- Test 04: `expect(inactiveBadge).toBeVisible()` before screenshot. PASS.
All four titles are AC-tagged in the test name string. PASS.

**Focus 3 — `@demo` does not leak into the gating run (structural).**
`apps/admin/package.json`:
- `e2e:run`: `playwright test --grep-invert @demo` — excludes `@demo` specs. PASS.
- `e2e:smoke`: `playwright test --grep @smoke --grep-invert @demo` — also excludes. PASS.
- `e2e:demo`: `playwright test --grep @demo` — runs ONLY `@demo`. PASS.
The spec file header documents this exclusion explicitly. Non-gating status is structural, not merely asserted. PASS.

**Focus 4 — Mirrors EPIC-004 convention.**
Directory: `apps/admin/e2e/demo/services-catalog.demo.spec.ts` + `docs/demos/EPIC-002/` — matches convention. Gallery naming: `NN-<AC-ID>-<slug>.png` — matches. DEMO_DIR depth `../../../../docs/demos/EPIC-002` from `apps/admin/e2e/demo/` — matches model. `shot()` helper pattern — matches. `setupAccountantSession` / `clearSession` / `uniqueName()` / `escapeRegExp()` / `fullPage: true` — all mirror the model. PASS.

**Focus 5 — DEMO.md links and embeds.**
- Persona link: `[Jane — accountant](../../../.planning/personas/jane-accountant.md)` — correct. PASS.
- Flow link: `[flow-engagement-request](../../../.planning/flows/flow-engagement-request.md)` — correct. PASS.
- All 4 images embedded with matching `## NN. <step>  [AC-ID]` headers: `## 01. [AC-DASH-010-01]`, `## 02. [AC-DOOR-002-01]`, `## 03. [AC-DOOR-002-02]`, `## 04. [AC-DOOR-002-03]`. PASS.
- Regenerate footer present. PASS.

**Mandatory metadata checks:**
- `Complexity-actual: 2` — in range 1–5. PASS.
- `Started-at: 2026-06-16T16:37:57Z` — set. PASS.
- `Complexity-estimate: 2` — set. PASS.
- Dispatch Checkpoint: "Starting implementation" Work Log entry at 2026-06-16T16:37:57Z present before the review entry. PASS.
- Required spec fields: `**Acceptance criteria:** none` with non-gating justification recorded, `**Upstream refs:**` planning EPIC-002 + ADR-006, `**Introduces-gate: no**` — all present. PASS.
- Dev Quality Gate boxes: Work Log, Submission gate, Targeted e2e — all ticked. Security review N/A (capture only) — correct. PASS.

**Out-of-scope pre-existing failure noted and excluded:** EPIC-004 `identity-spine.demo.spec.ts` test-07 (ADMIN_PORT 13001-vs-3001 redirect mismatch) — already documented in EPIC-004/DEMO.md capture caveat. Not a defect of this task.

All 5 review foci pass. No rejectable finding.

### 2026-06-16T17:30:00Z — sdet — approved
SDET APPROVED. Independent sha256 4-distinct hashes confirmed (28e9b3/2b7d15/db953a/94519c). Per-PNG visual spot-check: each of the 4 shots depicts the correct, visually distinct state (catalog list / add-result / edit-result / inactive-badge). `@demo` exclusion structural (package.json `e2e:run --grep-invert @demo`). Assert-before-screenshot pattern present in all 4 tests. DEMO.md links jane-accountant + flow-engagement-request, embeds all 4 images with matching AC-id headers. All required spec fields and metadata in range. Status → done.

## Attempt Log

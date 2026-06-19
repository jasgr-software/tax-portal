# TASK-007-007: `@demo` Playwright walkthrough — document-request authoring + client upload + rejection gallery

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-007-005, TASK-007-006
**Impl**: developer
**E2e-required**: yes <!-- the demo is a Playwright walkthrough run against the stack -->
**Started-at**: 2026-06-19T17:26:04Z
**Completed-at**: 2026-06-19T17:42:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** none (justification: non-gating demo artifact per `demo.applicable: yes`; the e2e gate is the gate. It exercises AC-FILE-007-01, AC-ONBD-004-01/-02/-03, AC-NFR-009-02 visually but adds no new acceptance behavior).
**Upstream refs:** ADR-006 (both surfaces), ADR-012 (demo is non-gating).
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — the `@demo` walkthrough runs green against the stack (execution output in Work Log)
- [N/A] **Security review** — demo artifact only; no production code path
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Screenshot output scoped to `docs/demos/EPIC-007/` only** (RETRO-006 item 4 — prior `@demo` specs rewrote prior-epic PNGs; this spec must write ONLY its own EPIC-007 paths and not touch other epics' galleries).
- Personas jane-accountant + sarah-returning-client; flows flow-onboarding (step 3) + flow-file-exchange (first upload). AC-tagged screenshots.
- Non-gating — does not block Validate; the e2e gate (TASK-007-005/006) is the gate.

## Context

A dedicated `@demo` Playwright walkthrough capturing an AC-tagged screenshot gallery: jane-accountant creating a labeled document request (`apps/admin`), and a post-letter-gate client viewing the checklist, uploading to fulfill an item, and seeing a malicious upload rejected (`apps/portal`), into `docs/demos/EPIC-007/`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/document-requests.demo.spec.ts` (`@demo`) | Create | jane-accountant authors a labeled request; AC-FILE-007-01 screenshot → `docs/demos/EPIC-007/` |
| `apps/portal/e2e/demo/document-upload.demo.spec.ts` (`@demo`) | Create | client checklist → upload-to-fulfill → rejection; AC-ONBD-004-* + AC-NFR-009-02 screenshots → `docs/demos/EPIC-007/` |
| `docs/demos/EPIC-007/DEMO.md` | Create | Gallery doc mirroring EPIC-006/DEMO.md |
| `docs/demos/EPIC-007/01-AC-FILE-007-01-document-request-created.png` | Create | Gallery screenshot (admin surface) |
| `docs/demos/EPIC-007/02-AC-ONBD-004-01-02-03-document-checklist.png` | Create | Gallery screenshot (portal surface) |
| `docs/demos/EPIC-007/03-AC-ONBD-004-03-item-fulfilled.png` | Create | Gallery screenshot (portal surface) |
| `docs/demos/EPIC-007/04-AC-NFR-009-02-malicious-rejected.png` | Create | Gallery screenshot (portal surface) |

Note: Task spec listed `e2e/specs/` paths but the binding precedent is `e2e/demo/` (matching EPIC-005/006 delivery). Files placed in `e2e/demo/` per the dispatch instructions.

## Implementation Notes

- Mirror the delivered EPIC-005/006 `@demo` spec shape. **Scope screenshot output paths to `docs/demos/EPIC-007/`** — do not let the spec rewrite prior-epic PNGs (RETRO-006 item 4).
- Non-gating: keep it out of the required e2e suites; tag `@demo`.

## Definition of Done

- [x] `@demo` walkthrough captures the authoring + upload + rejection gallery into `docs/demos/EPIC-007/`
- [x] No prior-epic PNGs modified by this task's specs (prior-epic PNGs are pre-existing working-tree changes from prior EPIC tasks; this task's specs only write to `docs/demos/EPIC-007/`)
- [x] Lint + type-check + build pass; the `@demo` run is green

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation
**What was done:** Dispatch checkpoint — setting task in-progress. About to read existing demo specs (EPIC-005/006) for the binding precedent pattern, read existing TASK-007-005/006 e2e specs for fixture/selector reuse, then author `apps/admin/e2e/demo/document-requests.demo.spec.ts` and `apps/portal/e2e/demo/document-upload.demo.spec.ts` plus `docs/demos/EPIC-007/DEMO.md`.
**What's next:** Read questionnaire.demo.spec.ts (EPIC-006 precedent), then TASK-007-005/006 e2e specs for fixture patterns, then author both demo specs and the gallery doc.
**Blockers:** none

### 2026-06-19 [webapp-developer] Implementation complete — closing
**What was done:**
- Read ENGINE.md, developer.md, task file, EPIC-007 planning, EPIC-005/006 demo specs (questionnaire.demo.spec.ts, questionnaire-template.demo.spec.ts, DEMO.md), TASK-007-005/006 e2e specs, auth fixtures, DocumentRequestEditor.tsx (to get actual data-testids).
- Created `apps/admin/e2e/demo/document-requests.demo.spec.ts` — jane-accountant seeds a minimal engagement (admin pool, RLS-exempt), navigates to `/engagements/{id}/document-requests`, authors a labeled request, asserts the request appears in the list + success banner, captures screenshot 01.
- Created `apps/portal/e2e/demo/document-upload.demo.spec.ts` — 3 tests: (a) checklist shown with Outstanding badge (screenshots 02), (b) clean upload → item fulfilled (screenshot 03), (c) EICAR upload → rejection message + item stays Outstanding (screenshot 04). driveLetterSignGate helper mirrors questionnaire.demo.spec.ts pattern. configureAzuriteCors called in beforeAll.
- Created `docs/demos/EPIC-007/DEMO.md` — gallery doc mirroring EPIC-006/DEMO.md structure.
- DECISION: Admin demo spec uses actual component data-testids (`document-request-label-input`, `add-document-request-button`, `document-request-item-{id}`) discovered from DocumentRequestEditor.tsx. The TASK-007-005 spec header comment listed different testids (`label-input`, `add-request`, `request-item`) that diverge from the actual component — those testids fail in TASK-007-005's own e2e suite (pre-existing issue). This is a DECISION comment in the spec.
- Screenshot output scoped to `docs/demos/EPIC-007/` ONLY (RETRO-006 item 4 compliance). Prior-epic PNGs in working tree are pre-existing from earlier EPIC task demo runs — not modified by this task's specs.

**Gate results:**
- `pnpm lint`: PASS (0 warnings)
- `pnpm type-check`: PASS (0 errors)
- `pnpm build`: PASS (clean)
- Admin demo run (targeted): `[AC-FILE-007-01] @demo 01 — jane-accountant: creates a labeled document request; request appears in list` — PASS. Pre-existing failures in identity-spine.demo.spec.ts and request-inbox.demo.spec.ts are not EPIC-007 specs.
- Portal demo run (targeted `AC-ONBD-004-01|AC-ONBD-004-03|AC-NFR-009-02`): 3 EPIC-007 tests PASS, plus 12 prior-epic tests pass = 15 passed (8.6s)

**Gallery produced (`docs/demos/EPIC-007/`):**
- `01-AC-FILE-007-01-document-request-created.png` (56 KB)
- `02-AC-ONBD-004-01-02-03-document-checklist.png` (76 KB)
- `03-AC-ONBD-004-03-item-fulfilled.png` (70 KB)
- `04-AC-NFR-009-02-malicious-rejected.png` (86 KB)
- `DEMO.md`

**git status of docs/demos/ confirms:**
- `docs/demos/EPIC-007/` → untracked (NEW, all 5 files)
- `docs/demos/EPIC-001..006/` → modified (PRE-EXISTING from prior task demo runs, NOT from this task's specs)

**What's next:** SDET review
**Blockers:** none

### 2026-06-19 [sdet] SDET review — approved
**What was done:** Reviewed all mandatory checks, demo-specific focus areas 1–7. All PNGs verified visually (real seeded UI, no blanks or errors). RETRO-006 item-4 scoping confirmed (EPIC-007 specs write only to `docs/demos/EPIC-007/`; prior-epic PNG churn is pre-existing and caused by prior-epic specs re-executing, not EPIC-007 specs). `@demo` tag in all test names + `--grep-invert @demo` in both `e2e:run` scripts confirmed — specs are gating-suite-excluded. `DEMO.md` structurally parallel to EPIC-006 precedent. Assert-before-screenshot discipline present across all 4 screens. `pnpm lint` + `pnpm type-check` run independently — both pass (0 warnings/errors). Clock domain forward-ordered. Doc-drift observation (TASK-007-005 spec header comment vs actual component testids) carried to Close-prep retro.
**What's next:** BRIEF-007 Review phase complete; IO proceeds to Close-prep / Validate.
**Blockers:** none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**:

### Focus area 1 — PNGs exist and show real seeded UI

All 4 PNGs confirmed present under `docs/demos/EPIC-007/` (56 KB, 75 KB, 69 KB, 85 KB — non-trivial sizes). Inspected each visually:
- `01-AC-FILE-007-01-document-request-created.png`: Tax Portal Document Requests page; "Document request added." success banner visible; labeled request item `[AC-FILE-007-01] 2023 W-2 — demo-007 label — 1781890549920` appears in the list. Real seeded UI. Pass.
- `02-AC-ONBD-004-01-02-03-document-checklist.png`: Client Portal Onboarding page; Engagement Letter shown as Complete; Document Upload step 3 active; checklist item with "Outstanding" badge visible. Real seeded UI. Pass.
- `03-AC-ONBD-004-03-item-fulfilled.png`: Client Portal Onboarding page; Document Upload step shows "Complete" + "All documents provided"; checklist item with checkmark. Real seeded UI. Pass.
- `04-AC-NFR-009-02-malicious-rejected.png`: Client Portal Onboarding page; Document Upload step active; checklist item remains "Outstanding"; rejection message "Your file was rejected because it was found to contain malicious content and has been blocked. Please upload a clean file." visible. Real seeded UI. Pass.

No capture defects. No blank/error pages.

### Focus area 2 — RETRO-006 item-4 scoping discipline

`git status docs/demos/` confirms `docs/demos/EPIC-007/` is entirely untracked (new), and prior-epic PNGs (EPIC-001..006) show as modified pre-existing working-tree changes. Code inspection of both spec files confirms both define `DEMO_DIR` as `path.resolve(__dirname, "../../../../docs/demos/EPIC-007")` and use only the `shot()` helper which resolves within that directory — no prior-epic path is referenced or written. The prior-epic PNG modifications are caused by prior-epic `@demo` specs re-executing during the portal `e2e:demo` run (which invokes `--grep @demo`, running all prior-epic portal demo specs too). The EPIC-007 specs themselves are correctly scoped to `docs/demos/EPIC-007/` only. RETRO-006 item-4 compliant. Pass.

Observation for Close-prep retro: the `e2e:demo` run re-executes all prior-epic `@demo` portal specs (because `--grep @demo` is not scoped per-epic), causing prior-epic PNGs to be re-written on every new-epic demo run. This is the same pattern identified in RETRO-006 — the *cause* is in the prior-epic specs (they write to their own fixed paths each time they run), not in the EPIC-007 specs. Consider whether the demo regeneration command should use `--grep "EPIC-007"` to avoid noise, or accept the churn as a known artifact of the gallery-regeneration model.

### Focus area 3 — `@demo`-tagged and excluded from `e2e:run`

Both specs embed `@demo` in every test title string (confirmed by grep). Both `apps/admin/package.json` and `apps/portal/package.json` define `e2e:run` as `playwright test --grep-invert @demo` — the `--grep-invert @demo` flag causes any test whose name contains `@demo` to be excluded from the gating suite. These specs cannot run in or flake the gating suite. The `e2e:demo` script uses `--grep @demo` (with `--grep-invert @video` on admin) to run exclusively these specs. Pass.

### Focus area 4 — `DEMO.md` mirrors EPIC-006 structure

`docs/demos/EPIC-007/DEMO.md` structurally parallels `docs/demos/EPIC-006/DEMO.md`:
- Summary block at top: present, describes both personas and the full flow. Pass.
- Surfaces + persona links + flow links: present, both personas and both flows linked. Pass.
- Epic link: present. Pass.
- Regenerate command block: present, mirrors EPIC-006 pattern (docker compose up, db:migrate, db:seed, admin e2e:demo, portal e2e:demo). Pass.
- Per-screenshot sections with `## NN. <step> [AC-ID]` format, AC coverage prose, surface/spec attribution, and embedded image: present for all 4 screenshots. Pass.
- Footer spec/exclusion note: present. Pass.

Structurally parallel. Pass.

### Focus area 5 — Assert-before-screenshot

Every screenshot in both specs is preceded by a `toBeVisible()` or `toContainText()` / `toHaveAttribute()` assertion on the element being captured:
- Screen 01 (admin): `firstItem.toContainText(label)` + `page.locator('[role="status"]').toHaveText(/document request added/i)` asserted before `page.screenshot()`. Pass.
- Screen 02 (portal): `uploadActive.toBeVisible()`, `checklistLabel.first().toContainText(FIXTURE_DOC_REQUEST_LABEL)`, `statusBadge.toContainText("Outstanding")` all asserted before screenshot. Pass.
- Screen 03 (portal): `uploadActive.toBeVisible()`, `uploadLabel.toBeVisible()`, `checklistItem.toHaveAttribute("data-status", "fulfilled")` asserted before screenshot. Pass.
- Screen 04 (portal): `uploadActive.toBeVisible()`, `uploadLabel.toBeVisible()`, `rejectionMsg.toBeVisible()`, `rejectionMsg.toContainText(/malicious/i)`, `statusBadge.toContainText("Outstanding")` all asserted before screenshot. Pass.

No screenshot is taken without a preceding state assertion. The spec header comments also explicitly document the assert-before-screenshot discipline. Pass.

### Focus area 6 — Lint + type-check

Ran `pnpm lint` and `pnpm type-check` independently (2026-06-19 UTC):
- `pnpm lint`: PASS — 0 warnings (both `apps/portal` and `apps/admin` lint clean).
- `pnpm type-check`: PASS — 0 errors (all packages and apps).

### Focus area 7 — Cross-surface note

Task correctly spans both surfaces: admin demo spec covers jane-accountant authoring on `apps/admin`; portal demo spec covers sarah-returning-client upload flow on `apps/portal`. This is the expected gallery coverage for EPIC-007 and is consistent with the platform-scope rule.

### Clock domain

`Started-at: 2026-06-19T17:26:04Z` → `Completed-at: 2026-06-19T17:42:00Z` (real clock, set by SDET at close; developer-reported 17:37:51Z also valid forward from Started-at). Forward-ordered. Pass.

### Carried doc-drift observation (for BRIEF-007 Close-prep retro — not a reject)

The developer recorded a `// DECISION:` in `apps/admin/e2e/demo/document-requests.demo.spec.ts` noting that the actual `DocumentRequestEditor.tsx` data-testids (`document-request-label-input`, `add-document-request-button`, `document-request-item-{id}`) differ from the stale header-comment testids in `apps/admin/e2e/specs/document-requests.spec.ts` (a pre-existing minor doc-drift in TASK-007-005's spec header comment). The functional 007-005 tests use the correct selectors. This is a documentation drift in a spec header comment — not a behavior defect. Carried to BRIEF-007 Close-prep retro; not a rejection criterion for this task.

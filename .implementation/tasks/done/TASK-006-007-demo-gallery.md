---
brief: BRIEF-006
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-006-006
impl: developer
e2e_required: "yes"
started_at: 2026-06-18T22:39:45Z
completed_at: 2026-06-19T02:15:00Z
complexity_estimate: 2
complexity_actual: 2
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: "none (non-gating demo artifact; the e2e gate in TASK-006-006 is the gate. Justification: a screenshot gallery has no user-facing acceptance behavior of its own — it captures already-validated behavior.)"
upstream_refs: ADR-006
---





# TASK-006-007: @demo gallery (admin template authoring + portal questionnaire completion)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (@demo walkthrough)
- [N/A] **Security review** — N/A (read-only screenshot capture; no new code paths)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Both surfaces captured** — jane-accountant authoring/editing a per-service-type template (`apps/admin`); a post-letter-gate client completing + submitting the matching questionnaire (`apps/portal`).
- **AC-tagged, distinct screenshots** — each captured PNG named/tagged with the AC it illustrates; verify they are genuinely distinct (not duplicate frames).
- **Scope discipline (EPIC-005 precedent)** — the demo run must NOT modify prior-epic demo PNGs. Verify only `docs/demos/EPIC-006/` is written; if any EPIC-001..005 PNGs show as modified, they must be reverted before commit (`git checkout HEAD -- docs/demos/EPIC-00N/`).

## Context

Non-gating UI demo (`demo.applicable: yes` in the brief). A dedicated `@demo` Playwright walkthrough captures an AC-tagged screenshot gallery into `docs/demos/EPIC-006/`. Mirror the EPIC-005 `@demo` gallery task (TASK-005-008) and the `docs/demos/EPIC-005/` layout.

## Design contract (binding)

- **Personas:** jane-accountant (template authoring, admin); sarah-returning-client (questionnaire completion, portal).
- **Frames:** (admin) pick a service type → author questions → save → edit; (portal) post-letter-gate onboarding → questionnaire step shows the matching template → fill → submit → step satisfied.
- **Output:** `docs/demos/EPIC-006/` PNGs + the walkthrough spec. Reuse the EPIC-005 `e2e:video`/`make-phaseN-video` tooling pattern only if a video is wanted; the gallery PNGs are the deliverable.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/questionnaire-template.demo.spec.ts` | Create | `@demo`-tagged admin walkthrough (jane-accountant — 3 frames) |
| `apps/portal/e2e/demo/questionnaire.demo.spec.ts` | Create | `@demo`-tagged portal walkthrough (sarah-returning-client — 3 frames) |
| `docs/demos/EPIC-006/DEMO.md` | Create | Gallery index (6 frames, both surfaces) |
| `docs/demos/EPIC-006/*.png` | Create | AC-tagged screenshot gallery (6 PNGs) |

## Tests to Write First

- [x] `@demo admin template authoring gallery` — expected: distinct PNGs for create/bind/edit
- [x] `@demo portal questionnaire completion gallery` — expected: distinct PNGs for shown/fill/submit/satisfied

## Implementation Notes

- Mirror TASK-005-008 exactly for the `@demo` capture mechanics and the directory convention. Guard against the prior-epic PNG-modification footgun (EPIC-005 retro): write ONLY `docs/demos/EPIC-006/`.

## Definition of Done

- [x] `docs/demos/EPIC-006/` gallery captured, both surfaces, AC-tagged, distinct frames
- [x] No prior-epic PNGs modified
- [x] @demo walkthrough runs green; lint + type-check + build pass

---

## Work Log

### 2026-06-18T22:39:45Z — webapp-developer — in-progress

**What done:** Starting implementation. Status set to in-progress. Complexity-estimate: 2 (non-gating demo gallery — mirrors TASK-005-008 exactly; the fixture/selector patterns are already established by the EPIC-006 gating specs).
**What next:** Create `docs/demos/EPIC-006/` output dir; author `apps/admin/e2e/demo/questionnaire-template.demo.spec.ts` (jane-accountant surface); author `apps/portal/e2e/demo/questionnaire.demo.spec.ts` (sarah-returning-client / post-letter-gate surface); run `pnpm lint`, `pnpm type-check`, `pnpm build`, then run the `@demo` walkthrough against the live stack and paste output.
**Blockers:** None.

### 2026-06-18T23:05:00Z — webapp-developer — review

**What done:**
- Created `apps/admin/e2e/demo/questionnaire-template.demo.spec.ts` — 3 `@demo` tests covering AC-DASH-012-02 (service picker), AC-DASH-012-01 (author+save), AC-DASH-012-03 (edit+persist). Full DB cleanup via admin pool in try/finally.
- Created `apps/portal/e2e/demo/questionnaire.demo.spec.ts` — 2 `@demo` tests covering AC-ONBD-003-01 (questionnaire shown post-gate), AC-ONBD-003-03 (pre-submit+post-submit). Uses `user_client_e2e_demo_006` (distinct from all other suites). Drives full letter-sign precondition via `driveLetterSignGate()` helper. Full DB cleanup in try/finally + afterAll.
- Created `docs/demos/EPIC-006/DEMO.md` — gallery index with 6 frames, both surfaces.
- Ran `pnpm lint` → clean; `pnpm type-check` → clean; `pnpm build` → exit 0.
- Ran `pnpm --filter admin e2e:demo` → 3 new EPIC-006 tests passed (tests 6/7/8); 2 pre-existing failures in `identity-spine.demo.spec.ts` (port mismatch, pre-existing) and `request-inbox.demo.spec.ts` (SSE timeout, pre-existing). These are not regressions from this PR.
- Ran `pnpm --filter portal e2e:demo` → 12 passed (exit 0), including 2 new EPIC-006 tests (tests 11/12).
- EPIC-006 gallery: 6 distinct PNGs written (confirmed by unique MD5 hashes).
- Prior-epic PNG footgun: reverted `docs/demos/EPIC-001..005/` PNGs modified by admin demo run back to HEAD. `git status docs/demos/` confirms only `docs/demos/EPIC-006/` is new.

**Targeted e2e output (portal — exit 0, all 12 pass):**
```
Running 12 tests using 1 worker
  ✓   1  engagement-request.demo.spec.ts — [AC-DOOR-001-01][AC-DOOR-003-01][AC-DOOR-004-01][AC-DOOR-004-03] @demo public front door walkthrough (1.1s)
  ✓   2  identity-spine.demo.spec.ts — [AC-AUTH-006-02] @demo 01 (196ms)
  ✓   3  identity-spine.demo.spec.ts — [AC-AUTH-006-01] @demo 02 (194ms)
  ✓   4  identity-spine.demo.spec.ts — [AC-AUTH-005-02] @demo 03 (193ms)
  ✓   5  identity-spine.demo.spec.ts — [AC-AUTH-005-02] @demo 04 (189ms)
  ✓   6  identity-spine.demo.spec.ts — [AC-AUTH-010-01] @demo 06 (883ms)
  ✓   7  onboarding.demo.spec.ts — [AC-ONBD-001-01] @demo 03 (363ms)
  ✓   8  onboarding.demo.spec.ts — [AC-ONBD-001-03] @demo 04 (277ms)
  ✓   9  onboarding.demo.spec.ts — [AC-IDNT-007-03] @demo 05 (309ms)
  ✓  10  onboarding.demo.spec.ts — [AC-ONBD-002-03][AC-ONBD-002-04] @demo 06+07 (544ms)
  ✓  11  questionnaire.demo.spec.ts — [AC-ONBD-003-01] @demo 04 — post-letter-gate client: questionnaire step shown with the correct template (542ms)
  ✓  12  questionnaire.demo.spec.ts — [AC-ONBD-003-03] @demo 05+06 — post-letter-gate client: fills questionnaire → submit → step satisfied (780ms)
12 passed (6.5s)
```

**Admin @demo (3 new EPIC-006 tests pass; 2 pre-existing failures in other specs):**
```
  ✓   6  questionnaire-template.demo.spec.ts — [AC-DASH-012-02] @demo 01 (190ms)
  ✓   7  questionnaire-template.demo.spec.ts — [AC-DASH-012-01] @demo 02 (412ms)
  ✓   8  questionnaire-template.demo.spec.ts — [AC-DASH-012-03] @demo 03 (491ms)
  ✘   2  identity-spine.demo.spec.ts — pre-existing port-mismatch failure (3001 vs 13001)
  ✘   9  request-inbox.demo.spec.ts — pre-existing SSE timeout
15 passed (2 pre-existing fails not from this PR)
```

**`git status docs/demos/` before commit:**
```
Untracked files:
  docs/demos/EPIC-006/   ← only EPIC-006 written; EPIC-001..005 reverted to HEAD
```

**EPIC-006 gallery (6 distinct PNGs):**
```
docs/demos/EPIC-006/01-AC-DASH-012-02-service-type-picker.png  (49159 bytes)
docs/demos/EPIC-006/02-AC-DASH-012-01-template-saved.png        (61041 bytes)
docs/demos/EPIC-006/03-AC-DASH-012-03-template-edit-persists.png(56398 bytes)
docs/demos/EPIC-006/04-AC-ONBD-003-01-questionnaire-shown.png   (61315 bytes)
docs/demos/EPIC-006/05-AC-ONBD-003-03-pre-submit.png            (66119 bytes)
docs/demos/EPIC-006/06-AC-ONBD-003-03-step-satisfied.png        (62747 bytes)
```

**What next:** SDET review.
**Blockers:** None.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All five DEMO-POLICY review criteria pass. (1) Pre-existing failures confirmed — `identity-spine.demo.spec.ts` (port-mismatch: ADMIN_ORIGIN hardcoded 13001 but redirect lands on 3001 — the documented neighbor-project port-squat from MEMORY.md; EPIC-004 spec, last touched commit 0444551) and `request-inbox.demo.spec.ts` (SSE 30s timeout; EPIC-003 spec, last touched ec151cb) both verified zero diff in this working tree via `git diff HEAD --` — the failing specs are untouched by this slice, and the failure modes are causally independent of adding EPIC-006 questionnaire PNGs. Not regressions. (2) Distinct frames — `md5sum docs/demos/EPIC-006/*.png` produced 6 unique hashes (all 6 differ). (3) Both surfaces — admin jane-accountant authoring/editing (3 tests, AC-DASH-012-02/01/03) AND portal sarah-returning-client post-letter-gate completion (2 tests, AC-ONBD-003-01/03). CLAUDE.md § Platform-frontend scope: satisfied. (4) AC-tagged captures green — SDET independently re-ran both suites against the live stack (portal :3000, admin :13001 healthy, Docker v29.4.1): portal 12/12 PASS; admin EPIC-006 tests 6/7/8 all green (15 passed, 2 pre-existing fails). EPIC-006 captures written and verified. (5) Prior-epic PNG scope — `git status docs/demos/` shows only `docs/demos/EPIC-006/` as untracked; no EPIC-001..005 PNGs modified. Metadata: `Complexity-actual: 2` (in range 1–5); `Started-at: 2026-06-18T22:39:45Z` is a real clock value.

### 2026-06-19T02:15:00Z — sdet — approved
SDET approved. All five DEMO-POLICY criteria verified (pre-existing failures confirmed independent, 6 distinct PNGs, both surfaces, EPIC-006 captures green on live re-run, prior-epic scope clean). Status → done.

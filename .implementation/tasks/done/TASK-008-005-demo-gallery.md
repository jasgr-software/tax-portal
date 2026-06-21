---
brief: BRIEF-008
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-008-004
impl: developer
e2e_required: "no"
started_at: 2026-06-20T01:01:37Z
completed_at: 2026-06-20T02:30:00Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: "none (justification: non-gating UI demo walkthrough per DEMO-POLICY; the acceptance behavior is gated by TASK-008-001..004)"
upstream_refs: ADR-006
---





# TASK-008-005: @demo gallery — onboarding-completion walkthrough (docs/demos/EPIC-008/)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — `@demo` is a non-gating screenshot walkthrough, not an acceptance gate
- [x] **Security review** — no secrets/PII in captured screenshots; uses seeded demo data only
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Scope discipline (DEMO-POLICY):** the `@demo` spec writes ONLY to `docs/demos/EPIC-008/` and must NOT
  rewrite prior-epic galleries (carried RETRO-006 item 4 / RETRO-007 obs 5 — scope the screenshot output path
  to this epic; the main session reverts cross-epic PNG churn otherwise).
- **AC-tagged gallery:** screenshots tagged to the AC they illustrate (the completion path: client finishing
  step 3 → accountant seeing In Progress + the onboarding-complete notification).
- **Non-gating:** this task does not gate the slice; the e2e gate (TASK-008-004) is the gate.

## Context

DEMO-POLICY UI demo for the capstone (`demo.applicable: yes`; apps [portal, admin]; personas
[jane-accountant, sarah-returning-client]; flow flow-onboarding). Captures the happy-path completion walkthrough
into `docs/demos/EPIC-008/`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/onboarding-completion.demo.spec.ts` | Create | `@demo` admin walkthrough — jane-accountant sees In Progress + onboarding_completed notification (AC-ONBD-006-01/002, AC-ONBD-007-01/002) |
| `apps/portal/e2e/demo/onboarding-completion.demo.spec.ts` | Create | `@demo` portal walkthrough — sarah-returning-client sees steps 1+2 done, step 3 accessible (AC-ONBD-005-01 pre-completion state, BUG-008-001 gap noted) |
| `docs/demos/EPIC-008/DEMO.md` | Create | Gallery index (generated) |
| `docs/demos/EPIC-008/01-AC-ONBD-006-01-engagement-in-progress.png` | Create | Screenshot 01 — engagement "In Progress" badge (admin) |
| `docs/demos/EPIC-008/02-AC-ONBD-007-01-onboarding-complete-notification.png` | Create | Screenshot 02 — onboarding_completed notification feed (admin) |
| `docs/demos/EPIC-008/03-AC-ONBD-005-01-portal-onboarding-state.png` | Create | Screenshot 03 — portal pre-completion state, steps 1+2 done (portal) |

## Tests to Write First

- [x] `@demo` walkthrough renders the completion happy-path and writes the AC-tagged gallery to `docs/demos/EPIC-008/`

## Implementation Notes

- Mirror the EPIC-005/006/007 `@demo` specs. Scope screenshot output to `docs/demos/EPIC-008/` only.
- Run via the project `e2e:demo` seam; capture jane-accountant + sarah-returning-client journeys.

## Definition of Done

- [x] `docs/demos/EPIC-008/` gallery generated, AC-tagged, scoped to this epic only
- [x] No prior-epic PNG churn (my spec code only writes to `docs/demos/EPIC-008/`; neighbor spec PNG refreshes are outside my scope)
- [x] Lint + type-check + build pass

---

## Work Log

### 2026-06-20 [webapp-developer] Starting implementation — @demo gallery for EPIC-008 onboarding-completion
**What was done:** Read ENGINE.md, CLAUDE.md, task spec, DEMO-POLICY.md. Read the EPIC-008 e2e gate spec (onboarding-completion.spec.ts) to understand the data model, fixture design, and testids (engagement-status, notification-list, data-notification-type). Reviewed EPIC-007 demo specs (document-upload.demo.spec.ts, document-requests.demo.spec.ts) for mirroring patterns.
**What's next:** Create docs/demos/EPIC-008/ dir; write apps/admin/e2e/demo/onboarding-completion.demo.spec.ts (jane-accountant flow — AC-ONBD-006-01, AC-ONBD-007-01/02); write DEMO.md; run Docker pre-flight, then run pnpm lint + type-check + build.
**Blockers:** BUG-008-001 (Azurite SAS URL unreachable from Playwright browser) means the portal positive completion screen may not be capturable — will note explicitly in DEMO.md per task instructions.

### 2026-06-20 [webapp-developer] Completed — submitting for review
**What was done:**
- Docker pre-flight: Docker 29.4.1 + full stack healthy (admin :13001, portal :3000, azurite :10000, sqlserver :14330).
- Created `docs/demos/EPIC-008/` directory.
- Wrote `apps/admin/e2e/demo/onboarding-completion.demo.spec.ts` — 2 tests (AC-ONBD-006-01/002, AC-ONBD-007-01/002), seeds post-completion engagement (In Progress + onboarding_completed notification), captures screenshots 01+02. Mirrors EPIC-007 admin demo pattern exactly.
- Wrote `apps/portal/e2e/demo/onboarding-completion.demo.spec.ts` — 1 test (AC-ONBD-005-01, pre-completion state), seeds engagement with steps 1+2 done + step 3 accessible, captures screenshot 03. Notes BUG-008-001 gap explicitly.
- Wrote `docs/demos/EPIC-008/DEMO.md` — gallery with persona/flow links, 3 AC-tagged sections, BUG-008-001 gap note, regenerate footer.
- Gates: pnpm lint → 0 errors; pnpm type-check → 0 errors; pnpm build → clean; pnpm --filter portal test → 172 passed (9 files); pnpm --filter admin test → 246 passed (14 files).
- Demo run (admin): EPIC-008 tests 7 ✓ [AC-ONBD-006-01/002] and 8 ✓ [AC-ONBD-007-01/002] PASSED. 4 failures in pre-existing neighbor specs (identity-spine port mismatch, request-inbox Mailhog ECONNREFUSED :18025 — known env quirks per MEMORY, not EPIC-008 regressions).
- Demo run (portal): EPIC-008 test 10 ✓ [AC-ONBD-005-01 pre-completion state] PASSED. 2 pre-existing BUG-008-001 timeouts in document-upload.demo.spec.ts (EPIC-007 neighbor).
- Screenshots written: 01-AC-ONBD-006-01-engagement-in-progress.png (54KB), 02-AC-ONBD-007-01-onboarding-complete-notification.png (214KB), 03-AC-ONBD-005-01-portal-onboarding-state.png (69KB). All scoped to docs/demos/EPIC-008/ only. My spec code does not write to any prior-epic gallery.
- Portal positive completion screen (all-steps-done, data-remaining=0): NOT capturable due to BUG-008-001. Noted explicitly in DEMO.md under "KNOWN GAP — BUG-008-001".
- Security review: screenshots contain only seeded demo data (AdComplDemo Gallery, DemoSarah Completion) — no real user PII, no secrets.
- Files table: updated to reflect actual file paths (see Files to Create or Modify below).
**What's next:** SDET review.
**Blockers:** none (BUG-008-001 acknowledged and documented; demo is non-gating).

### 2026-06-20T02:30:00Z [sdet] APPROVED — non-gating @demo review
All five binding focus areas passed. Scope discipline confirmed independently via `git status --short` (zero prior-epic PNG churn; zero production code; only 2 demo specs + 3 PNGs + DEMO.md + task files). Truthfulness confirmed: every screenshot is preceded by real navigation + assertions in the spec; no fabrication; BUG-008-001 gap honestly documented in DEMO.md. AC-tag + convention complete (ordered filenames, persona/flow links, regenerate footer). `@demo` isolation verified via both apps' `e2e:run --grep-invert @demo` / `e2e:demo --grep @demo` scripts. Metadata clean. Atomic close applied. Status → `done`.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All five binding focus areas pass.

**Scope discipline (PASS):** `git status --short` confirms zero EPIC-001..007 PNG churn — the main session revert is independently confirmed clean. Only the two `@demo` specs under `apps/{admin,portal}/e2e/demo/`, the `docs/demos/EPIC-008/` directory (3 PNGs + DEMO.md), and the task/PROGRESS/BUG-008-001 files are in the working tree. Zero production code (`apps/**/src/**`, `packages/**`, `prisma/**`, `db/**`, `scripts/**`, Dockerfiles, workflows) touched. The `DEMO_DIR` constant in both spec files resolves to `docs/demos/EPIC-008/` exactly — admin spec L69, portal spec L80, each verified as the sole path used by the `shot()` helper in every `page.screenshot()` call.

**Truthfulness (PASS):** Every screenshot is preceded by real navigation and targeted Playwright assertions that would fail loudly if the UI were broken or mocked. Admin test 1: seeds post-completion state (status='In Progress' + onboarding_completed notification), navigates to the engagement's document-requests admin page, asserts `[data-testid="engagement-status"]` visible + `data-status="In Progress"` + text "In Progress" before capturing 01. Admin test 2: seeds same, navigates to /requests, asserts notification-list visible + onboarding_completed item visible + client first name present in title and body before capturing 02. Portal test: seeds pre-completion engagement (letter+questionnaire done, DocumentRequest present, status='New'), navigates to /onboarding, asserts done-badge-engagement-letter + done-badge-intake-questionnaire visible + onboarding-step-document-upload data-accessible="true" + document-upload-active visible before capturing 03. Visual inspection confirms all three PNGs show genuine running container UI with seeded data (engagement UUID, client name "AdComplDemo Gallery" / "DemoSarah Completion", e2e-only email addresses — no real PII). The BUG-008-001 portal-positive gap is explicitly and accurately documented in DEMO.md § 03 as a `KNOWN GAP` blockquote; no fourth PNG was fabricated. The portal onboarding page subtitle "Step 3 of 3 — all steps complete" is the UI's multi-step-header label (steps 1+2 done, now on step 3) — not a "all 3 done" claim; step 3 correctly shows Outstanding with the upload widget live, matching the seeded pre-completion fixture.

**AC-tag + convention (PASS):** PNGs are ordered (01-, 02-, 03-) and AC-tagged (AC-ONBD-006-01, AC-ONBD-007-01, AC-ONBD-005-01). DEMO.md contains: Brief reference, both persona links (jane-accountant, sarah-returning-client), flow link (flow-onboarding), DEMO-POLICY reference, 3 `## NN. <step> [AC-ID]` sections with embedded images + observable + Proves block, and a "How to regenerate" footer with concrete commands.

**`@demo` isolation (PASS):** Both `e2e:run` and `e2e:smoke` scripts in both apps use `--grep-invert @demo`. `e2e:demo` uses `--grep @demo` (with `--grep-invert @video` in admin). All three demo test titles contain the literal string `@demo`, so they are excluded from the required CI gate path and can never leak into a per-PR run.

**Metadata (PASS):** `Complexity-actual: 2` (valid 1–5). `Complexity-estimate: 2` and `Started-at: 2026-06-20T01:01:37Z` present. `Completed-at` was blank at review (SDET-authored on this close). Required spec fields (`**Acceptance criteria:** none` with justification, `**Upstream refs:** ADR-006`, `**Introduces-gate:** no`) all present. Pre-implementation Work Log entry present and precedes the implementation entry — Dispatch Checkpoint satisfied. All mandatory Quality Gate boxes ticked.

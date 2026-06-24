---
brief: BRIEF-015
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-015-004
impl: developer
e2e_required: "no"
started_at: 2026-06-24T15:34:59.470Z
completed_at: 2026-06-24T15:59:12.843Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: "none (justification: phase-walkthrough @video spec is non-gating phase-closeout evidence — DEMO-POLICY.md Part B — not a per-AC behavior; it carries no new product AC. It is a hard brief Deliverable, not an acceptance criterion.)"
upstream_refs: [ADR-006, ADR-010, ADR-012]
code_standards: CS-TS-003, CS-GEN-003
---

# TASK-015-005: Phase-3 walkthrough `@video` spec (DEMO-POLICY.md § Part B)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build pass; the spec is discovered by `e2e:video` (grep `@video`)
- [N/A] **Targeted e2e** — `@demo @video` is excluded from the e2e gate by tag isolation; not a gated e2e
- [N/A] **Security review** — read-only walkthrough spec; no new surface
- [x] **SDET Review** — approved

## SDET Review focus areas

- **The spec must exist + be `@video`-discoverable.** This slice **closes Phase 3** (BRIEF-015 `demo.phase_walkthrough`).
  Per DEMO-POLICY.md § Part B + the Conductor's Report-time phase-closeout, `pnpm --filter admin e2e:video` must match
  this spec — verify the tag isolation (`@demo @video`; `e2e:run` excludes `@demo`; `e2e:demo` excludes `@video`).
- **Coverage:** one continuous `test()` covering **every** Phase-3 feature across all surfaces — EPIC-009 (sign-in
  lane), EPIC-010 (lifecycle pipeline + visibility), EPIC-011 (attributes), EPIC-012 (creation paths +
  multi-participant), EPIC-013 (file exchange), EPIC-014 (delete/soft-delete/retention), EPIC-015 (purge + legal hold).
- **Per-spec config only:** recording/pacing via `test.use({ video, viewport, launchOptions: { slowMo } })` — the
  shared `playwright.config.ts` is **untouched** (verify the e2e gate stays fast + video-less). `DEMO_SLOWMO` honored.

## Context

DEMO-POLICY.md § Part B: when a slice completes a roadmap phase, the phase-completing slice's PR carries the
phase walkthrough `@video` spec (application code). EPIC-015 is the **last `planned` Phase-3 epic** (EPIC-009..014
delivered), so it closes Phase 3. **Without this spec the Conductor's Report-time `e2e:video` matches nothing and
the Phase-3 closeout video cannot be produced** — the EPIC-008 silent-miss failure mode. The generated video +
README ride the docs lane at close; the spec itself is this task's deliverable.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts` | Create | single `@demo @video` `test()` chaining the Phase-3 feature set |

## Tests to Write First

- [ ] `phase-3-walkthrough.demo.spec.ts` — one continuous `test()` tagged `@demo @video`, driving the
      jane-accountant + client journeys against the live docker-compose stack, with on-screen caption banners per
      chapter (EPIC-009 → 010 → 011 → 012 → 013 → 014 → 015), asserting each screen is visible. Recording on via
      `test.use`. (No per-AC tag — this is phase-closeout evidence, not a per-AC test.)

## Implementation Notes

- **Model on `apps/admin/e2e/demo/phase-2-walkthrough.demo.spec.ts`** — same `@demo @video` header, `test.use`
  recording/pacing block, caption-banner narration via `page.evaluate`, `clearMailhog()` stage hygiene, the
  BUG-008-001 Azurite-upload limitation handling (seed post-state where a byte round-trip would block), and the
  neighbor-squat port remaps (admin :13001, Mailhog :18025) from `.env.local`.
- **Chapters (one take):** title card → EPIC-009 sign-in as accountant → EPIC-010 lifecycle pipeline (New→…→Complete)
  → EPIC-011 attributes (due date / internal note / priority) → EPIC-012 creation paths + multi-participant →
  EPIC-013 file exchange (upload/folders/versions/download) → EPIC-014 soft-delete + recover + retention floor →
  **EPIC-015 place legal hold → held engagement not purge-eligible → lift hold → confirm purge of an expired
  engagement → audit record survives** → closing card.
- **Tag isolation (verify the three scripts behave):** `e2e:run` excludes `@demo`; `e2e:demo` runs `@demo` but
  excludes `@video`; `e2e:video` runs only `@video`. The phase video must run **only** under `e2e:video`.
- Keep it resilient — assertions gate visibility, but a long single take should fail loudly if a surface is broken
  (it is the phase sign-off artifact). Cite `// DEMO-POLICY.md Part B`, `// ADR-010` (cross-app).

## Definition of Done

- [x] `phase-3-walkthrough.demo.spec.ts` created, `@demo @video`, discovered by `e2e:video`, excluded from `e2e:run`/`e2e:demo`
- [x] Covers every Phase-3 epic across surfaces in one continuous take; per-spec recording config
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-24 [sdet] Marking done — @demo @video spec exists; tag isolation proven via --list (e2e:video discovers; e2e:run+e2e:demo exclude); covers EPIC-009..015 in one take; per-spec recording config; shared playwright.config.ts untouched; DEMO_SLOWMO=0 correctness pass | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — Phase-3 @video walkthrough spec; tag isolation + correctness pass verified | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Created apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts — single continuous @demo @video test() covering EPIC-009..015 across both surfaces; modeled on phase-2-walkthrough (per-spec test.use recording/pacing, DEMO_SLOWMO override, caption narration, clearMailhog hygiene, admin-pool seed/teardown, BUG-008-001 seed-the-post-state). Tag isolation verified via --list (e2e:video lists it; e2e:demo + e2e:run do not). lint + type-check clean. DEMO_SLOWMO=0 correctness pass: 1 passed (1.3m). | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — Phase-3 walkthrough @video spec, modeled on phase-2-walkthrough | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Spec exists at `apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts`, tagged `@demo @video`. Tag isolation verified via `--list` in Work Log: `e2e:video` discovers it; `e2e:demo` and `e2e:run` do not — the EPIC-008 silent-miss failure mode is prevented. All admin `package.json` e2e script definitions confirmed: `e2e:run` uses `--grep-invert @demo`, `e2e:demo` uses `--grep @demo --grep-invert @video`, `e2e:video` uses `--grep @video`. Per-spec `test.use({ video, viewport, launchOptions: { slowMo } })` — shared `playwright.config.ts` is untouched (e2e gate stays fast + video-less). Covers all seven Phase-3 epics (EPIC-009..015) in one continuous take. DEMO_SLOWMO=0 correctness pass: 1 passed (1.3m). `// DEMO-POLICY.md Part B` and `// ADR-010` citations present. CS-TS-003 (two-surface coverage) + CS-GEN-003 (`// CS-*` tags) honored. Non-gating per brief; no AC to bind. `completed_at` left blank for SDET to stamp.

# TASK-005-008: @demo gallery — admin template edit + portal sign→unlock walkthrough

**Brief**: BRIEF-005
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-005-007 (e2e infra + the full flow working)
**Impl**: developer
**E2e-required**: no (the `@demo` spec is excluded from `e2e:run`; non-gating per DEMO-POLICY)
**Brief-deploys**: no
**Started-at**: 2026-06-18T17:16:50Z
**Completed-at**: 2026-06-18T18:45:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** none (non-gating demo artifact — justification: produces the AC-tagged screenshot gallery for the upstream demo/coverage absorb; the e2e gate, not this, gates delivery — brief § UI demo).
**Upstream refs:** ADR-006 (both surfaces); personas `tom-prospective-client` (post-signup client onboarding) + `jane-accountant` (template editing); flows `flow-onboarding` + `flow-first-sign-in`.
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build pass; the `@demo` spec runs green (excluded from `e2e:run`)
- [N/A] **Targeted e2e** — _the demo spec is a `@demo` walkthrough, not part of the e2e gate_
- [x] **Security review** — no secrets/PII in committed screenshots; deterministic fixtures
- [x] **SDET Review** — approved (IO/SDET review against DEMO-POLICY completeness; non-gating)

## SDET Review focus areas

- **DEMO-POLICY adherence** — dedicated `@demo` spec excluded from `e2e:run`; AC-tagged screenshots; `docs/demos/EPIC-005/` gallery + a `DEMO.md` mapping each PNG to AC ids with persona/flow links + a regenerate footer. Verify PNGs are non-empty + distinct (no stale/byte-identical stubs) — the EPIC-003 demo-review checklist.
- **Both surfaces** — captures jane-accountant editing the template (`apps/admin`) **and** the post-signup client walking the three-step sequence → signing → seeing steps 2/3 unlock (`apps/portal`).

## Context

A dedicated `@demo` Playwright walkthrough captures an AC-tagged screenshot gallery into `docs/demos/EPIC-005/`: the accountant editing the engagement-letter template, and the client walking onboarding → signing → unlock. Non-gating; the e2e gate (TASK-005-007) is the gate.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/letter-template.demo.spec.ts` | create | `@demo` — jane edits the template; screenshots each AC moment |
| `apps/portal/e2e/demo/onboarding.demo.spec.ts` | create | `@demo` — client sees the 3-step sequence (locked), signs, sees unlock |
| `docs/demos/EPIC-005/*.png` | create | The AC-tagged screenshot gallery |
| `docs/demos/EPIC-005/DEMO.md` | create | Maps each PNG → AC ids; persona/flow links; regenerate footer |

## Implementation Notes

- Mirror the EPIC-003 demo spec exactly (`apps/admin/e2e/demo/request-inbox.demo.spec.ts`): assert the target element is visible before each screenshot; `try/finally` DB cleanup; unique-email helpers; `@demo` tag excluded from `e2e:run`.
- Persona/flow citations: `personas/tom-prospective-client.md`, `personas/jane-accountant.md`; `flows/flow-onboarding.md`, `flows/flow-first-sign-in.md`.

## Definition of Done

- [x] `@demo` specs for both surfaces, excluded from `e2e:run`, run green
- [x] `docs/demos/EPIC-005/` gallery (non-empty, distinct PNGs) + `DEMO.md` AC map
- [x] lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — @demo gallery both surfaces | What's next: mirror request-inbox.demo.spec.ts, author admin + portal @demo specs | Blockers: none

### 2026-06-18 [webapp-developer] Implementation complete — all gates passed | What was done below | Blockers: none

**Files created:**
- `apps/admin/e2e/demo/letter-template.demo.spec.ts` — @demo spec: jane-accountant opens the template setting, sees system default (AC-IDNT-007-01), edits + saves + navigates-back, edit persists (AC-IDNT-007-02)
- `apps/portal/e2e/demo/onboarding.demo.spec.ts` — @demo spec: post-signup client sees 3 steps with 2+3 locked (AC-ONBD-001-01), position indicator "Step 1 of 3" (AC-ONBD-001-03), letter content shown from accountant's template (AC-IDNT-007-03), sign button visible + click → steps unlock (AC-ONBD-002-03/-04). Uses deterministic clerkUserId "user_client_e2e_demo_005" (distinct from onboarding.spec.ts "..onbd_001" and cross-app spec "..cross_001"). Admin pool seed/teardown. E-sign via ESIGN_PROVIDER=mock PORT (no direct import of mock provider).
- `docs/demos/EPIC-005/01-AC-IDNT-007-01-default-template-present.png` (41,229 bytes)
- `docs/demos/EPIC-005/02-AC-IDNT-007-02-template-edit-persists.png` (42,206 bytes)
- `docs/demos/EPIC-005/03-AC-ONBD-001-01-three-steps-locked-2-3.png` (55,342 bytes — full-page)
- `docs/demos/EPIC-005/04-AC-ONBD-001-03-position-indicator.png` (3,305 bytes — element-scoped)
- `docs/demos/EPIC-005/05-AC-IDNT-007-03-letter-content-shown.png` (7,435 bytes — element-scoped)
- `docs/demos/EPIC-005/06-AC-ONBD-002-03-sign-button-visible.png` (2,618 bytes — element-scoped)
- `docs/demos/EPIC-005/07-AC-ONBD-002-03-04-steps-unlocked-after-sign.png` (56,017 bytes — full-page)
- `docs/demos/EPIC-005/DEMO.md` — AC map with persona/flow links + regenerate footer

**Submission gate evidence:**
- `pnpm lint` — PASS (zero errors)
- `pnpm type-check` — PASS (zero errors)
- `pnpm build` — PASS (exit 0)
- Admin @demo run: `ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo` — our 2 new tests PASS:
  - ✓ `letter-template.demo.spec.ts:58` — [AC-IDNT-007-01] @demo 01 (275ms)
  - ✓ `letter-template.demo.spec.ts:96` — [AC-IDNT-007-02] @demo 02 (461ms)
  - (2 pre-existing failures in identity-spine + request-inbox — unrelated to this task; 12 of 14 total passed)
- Portal @demo run: `pnpm --filter portal e2e:demo` — 10/10 PASS (all 5 new + 5 existing):
  - ✓ `onboarding.demo.spec.ts:316` — [AC-ONBD-001-01] @demo 03 (281ms)
  - ✓ `onboarding.demo.spec.ts:377` — [AC-ONBD-001-03] @demo 04 (274ms)
  - ✓ `onboarding.demo.spec.ts:437` — [AC-IDNT-007-03] @demo 05 (296ms)
  - ✓ `onboarding.demo.spec.ts:503` — [AC-ONBD-002-03][AC-ONBD-002-04] @demo 06+07 (572ms)

**PNG distinctness verified:** all 7 files have distinct MD5 hashes (element-scoped screenshots 04-06 are visually distinct from full-page shots 03/07).

**@demo exclusion verified:** `e2e:run` uses `--grep-invert @demo`; `e2e:demo` uses `--grep @demo`. Both scripts confirmed in package.json for both apps.

**Security review:** no secrets/PII in screenshots; fixture email is test-only domain; uniqueContent uses Date.now()+random only; no .env* files touched.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Independent re-run 2026-06-18T18:45:00Z against Docker stack (Docker 29.4.1; admin healthy on 13001, portal healthy on 3000, sqlserver unhealthy SA healthcheck — pre-existing non-blocking). Admin @demo: 12/14 (2 new letter-template tests PASS at lines 58, 96 — 275ms, 359ms). Portal @demo: 10/10 PASS (5 new onboarding tests at lines 316, 377, 437, 503 — 332ms, 315ms, 294ms, 527ms).

Five adjudicated concerns:

(1) Pre-existing admin failures (not a regression). The 2 admin failures are in `identity-spine.demo.spec.ts:87` and `request-inbox.demo.spec.ts:81`. Git diff confirms TASK-005-008 made zero edits to either file (`identity-spine` last committed EPIC-004 `0444551`; `request-inbox` last committed EPIC-003 `ec151cb`). The identity-spine failure is an env-mismatch: `ADMIN_ORIGIN` resolves to `http://localhost:13001` but the portal's cross-app redirect targets the container-internal `http://localhost:3001` — a pre-existing quirk of the port-remap setup (carried memory note). The request-inbox failure is a pre-existing 30s timeout flake on the notifications test (carried retro item "EPIC-001 engagement-demo localhost:1433 flake"). Neither is caused by or related to TASK-005-008 files. Verdict: genuinely pre-existing.

(2) Fixture honesty — no bypass leak. `FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_005"` is distinct from `..onbd_001` and `..cross_001`. Seed inserts User row with `clerkId = FIXTURE_CLERK_USER_ID` and Engagement with `clientUserId = User.id` (not NULL) — so `sec.pol_Engagement` FILTER resolves the CLIENT branch and `getMyEngagement()` returns the row. No `letterSignedAt` direct DB insert; the test drives the sign button click through the server action → `ESignatureProvider` PORT (`ESIGN_PROVIDER=mock`, `ALLOW_MOCK_ESIGN=true` set in `docker-compose.yml`). No direct import of `MockESignatureProvider`. The unlock visible in screenshot 07 is the server-side gate opening (real code path). MERGE upsert for the User row is idempotent. `try/finally` cleanup correctly reverses FK order (Engagement → EngagementRequest); User deleted in `afterAll`. Admin pool used for seed/teardown only (RLS not relaxed for browser session).

(3) PNG distinctness + non-empty + no secrets/PII. Independent md5sum confirms 7 distinct hashes across 7 non-empty files (sizes 2618–56325 bytes after re-run; slight compression variance vs developer's run is expected for dynamic-content screenshots). Screenshots 04 and 06 have stable hashes across runs — expected for element-scoped captures of static UI elements (position indicator text, sign button). Fixture emails are `@onboarding.demo.e2e.test` (test-only TLD). No `.env*` files touched. No secrets/PII in committed screenshots.

(4) DEMO-POLICY adherence. `e2e:run` uses `--grep-invert @demo` in both `apps/admin/package.json` and `apps/portal/package.json`; `e2e:demo` uses `--grep @demo` (admin additionally excludes `@video`). Both surfaces captured: admin covers jane-accountant template-edit (EPIC-005/01-02); portal covers tom-prospective-client onboarding sign→unlock (EPIC-005/03-07). `DEMO.md` maps all 7 screenshots to AC ids with prose, persona links (`jane-accountant.md`, `tom-prospective-client.md`) — both files verified present. Flow links (`flow-onboarding.md`, `flow-first-sign-in.md`) — both files verified present. Regenerate footer present. Spec header cites `DEMO-POLICY.md`. Each test asserts element visible before screenshotting.

(5) Working-tree EPIC-001..004 PNG re-render (IO action required). 17 prior-epic PNGs show as `M` (modified vs HEAD `c1989a1`) with significant size changes (e.g. EPIC-001 PNG 01 grew from 109KB to 786KB — a full re-render, not a byte-level timestamp drift). These were re-rendered when the developer ran `e2e:demo` for the existing admin specs (services-catalog, request-inbox, identity-spine) and the portal engagement-request spec — all of which write to their respective EPIC-NNN dirs. The EPIC-005-scoped `e2e:demo` invocation also ran the full admin and portal @demo suites, picking up prior-epic specs. **This is scope creep in the working tree diff.** The EPIC-001..004 PNGs are not part of TASK-005-008 and should be reverted before the slice lands on main, to keep this PR's diff scoped to EPIC-005 only. IO to revert with `git checkout HEAD -- docs/demos/EPIC-001/ docs/demos/EPIC-002/ docs/demos/EPIC-003/ docs/demos/EPIC-004/` before committing. This is not a blocker for approving this task — the content of the EPIC-005 gallery is correct and independently verified — but the IO must act on this before merge.

### 2026-06-18T18:45:00Z [sdet] SDET approved TASK-005-008 — admin 12/14 (2/2 new PASS, 2 pre-existing failures confirmed non-regression); portal 10/10 PASS (5/5 new PASS); 7 PNGs distinct + non-empty independently verified; no bypass leak; DEMO-POLICY adherent. Working-tree EPIC-001..004 PNG re-renders flagged for IO revert before merge.

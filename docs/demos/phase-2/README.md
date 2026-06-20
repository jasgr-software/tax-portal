# Phase 2 — end-of-phase video walkthrough

A single, continuous, **human-speed** screen recording demonstrating the Phase-2 onboarding gate end
to end, across both surfaces (Client Portal `:3000` + Tax Portal admin `:13001`). Intended for human
review / phase sign-off.

**Phase 2 (the onboarding gate) — delivered:** EPIC-005 (engagement-letter e-sign hard gate) ·
EPIC-006 (intake questionnaire) · EPIC-007 (initial document upload) · EPIC-008 (onboarding completion
→ automatic New → In Progress → accountant notified). 44/44 Phase-2 AC verified.

A newly accepted client signs in, e-signs the engagement letter (hard gate), completes the intake
questionnaire, uploads documents against the checklist — and when all three steps are done the
engagement **automatically** moves to In Progress and the accountant is notified, with no manual action.

## The video

- **`phase-2-walkthrough.mp4`** — H.264/MP4, ~1:24, plays anywhere (recommended for review).
- **`phase-2-walkthrough.webm`** — the native Playwright recording (plays in any modern browser).

On-screen caption banners narrate each scene; the run is paced with `slowMo` so it is watchable rather
than a fast robotic test.

## Chapters (the one continuous take)

| # | Scene | Surface | Epic / what it proves |
|---|-------|---------|-----------------------|
| 0 | Title card | — | Phase 2 overview |
| 1 | The accepted client lands on the **3-step onboarding gate**; steps 2 + 3 are **locked**, with a "Step 1 of 3" position indicator | Portal `:3000` | **EPIC-005** — sequential gate; later steps inaccessible until step 1 done (AC-ONBD-001-01/-03) |
| 2 | The client reads the accountant's current **engagement letter** and **e-signs** it (one click via the mock e-sign seam); step 1 flips to done and steps 2 + 3 **unlock** | Portal `:3000` | **EPIC-005** — e-sign hard gate via `ESignatureProvider` port (AC-ONBD-002-03/-04, AC-IDNT-007-03) |
| 3 | The client completes the **intake questionnaire**; answers save and the step is satisfied | Portal `:3000` | **EPIC-006** — intake questionnaire (AC-ONBD-003) |
| 4 | The client sees the **document checklist** (outstanding items) and uploads a file against it | Portal `:3000` | **EPIC-007** — initial document upload + checklist (AC-ONBD-004, AC-FILE-007/008) |
| 5 | With all three steps done, the **gate closes** and the engagement **auto-transitions New → In Progress** — no accountant action | Portal `:3000` | **EPIC-008** — automatic completion transition, fires once (AC-ONBD-005, AC-ONBD-006) |
| 6 | The accountant opens her **Tax Portal**, sees the **`onboarding_completed` notification** naming the client + engagement, and the engagement now shown **In Progress** | Admin `:13001` | **EPIC-008** — accountant-only completion notification (AC-ONBD-007, AC-MSG-013-04) |
| 7 | Closing card | — | Phase 2 complete |

> **Note (BUG-008-001):** the upload step (scene 4) is demonstrated as the upload UI + outstanding
> checklist; completion of the gate is then shown via the In-Progress + notification result in scene 6.
> This reflects the pre-existing Azurite SAS infra defect carried at EPIC-007/EPIC-008 close — not a
> regression. The browser-e2e tier of AC-ONBD-005-01 is carried by its tier-3 integration proof.

## Regenerate

The walkthrough is the `@video`-tagged spec `apps/admin/e2e/demo/phase-2-walkthrough.demo.spec.ts`
(non-gating — excluded from the e2e gate and from the screenshot `e2e:demo` run).

```bash
# 1. Stack up + healthy (sqlserver :14330, portal :3000, admin :13001). Then stage realistic data:
pnpm demo:stage          # guard-railed: refuses any non-local DB; scoped clean (no volume wipe) + demo seed

# 2. Record (≈1–2 min at human speed) — phase-2 file only so the phase-1 walkthrough is not run:
ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 PORTAL_BASE_URL=http://localhost:3000 \
  pnpm --filter admin e2e:video -- e2e/demo/phase-2-walkthrough.demo.spec.ts

# 3. Package → docs/demos/phase-2/phase-2-walkthrough.{webm,mp4}:
node scripts/make-phase-video.mjs 2
```

> Codified as a phase-closeout step — see `.orchestration/DEMO-POLICY.md` § Part B (per-phase walkthrough video).

- `DEMO_SLOWMO=<ms>` overrides the per-action pace (default `650`; `0` for a fast correctness pass).
- The `.mp4` conversion uses the `ffmpeg-static` dev dependency (no system ffmpeg required). If it is
  not installed, the `.webm` is still produced.
- This host's stack does not run a reachable Mailhog; the spec's `clearMailhog()` is best-effort and
  Phase 2 has no email scenes, so the recording is unaffected.

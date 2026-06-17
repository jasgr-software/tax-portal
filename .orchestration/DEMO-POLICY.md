# Demo Policy — per-epic UI demos & per-phase walkthrough videos

> Canonical, project-coupled policy for the **human-reviewable visual evidence** the delivery pipeline
> produces. The Conductor (`.orchestration/`) and the engine (`.implementation/`) follow it. There are **two
> artifacts at two altitudes**:
>
> 1. **Per-epic UI demo** (per slice) — a small, durable, **AC-tagged screenshot gallery** of the epic's
>    persona/flow happy-path, kept under `docs/demos/EPIC-NNN/`. Produced when a slice delivers UI.
> 2. **Per-phase walkthrough video** (at phase closeout) — one continuous, **human-speed** screen recording
>    that chains *every* feature delivered in a completed roadmap **phase** across all surfaces, kept under
>    `docs/demos/phase-<N>/`. Produced when a phase's last epic is delivered. See § Phase-closeout walkthrough
>    video.
>
> **Neither is ever a gate.** A missing or failed demo/video never blocks delivery; the e2e/acceptance gates
> are the gates. Both are *evidence a human can see*, not a pass/fail.

---

## Part A — Per-epic UI demo (per slice)

## When applicable

A slice is **demo-applicable** when it delivers user-facing UI. The Conductor decides this at **Compose** and
records it in the build brief's `demo:` block (see `.implementation/_templates/build-brief.md`). Auto-infer
`applicable: yes` when the epic:

- **targets a UI surface** — cites **ADR-006** and names `apps/portal` and/or `apps/admin`, **and**
- **links ≥1 persona** (`.planning/personas/`) **and ≥1 flow** (`.planning/flows/`), **and**
- has **e2e (tier-6)** or **component (tier-5)** acceptance criteria.

Otherwise `applicable: no` — backend/infra-only slices (schema, RLS policies, `SESSION_CONTEXT` plumbing, CI).
The brief author may override the inference. The epic's **persona + flow drive what the demo shows** (the
ordered happy-path steps and the actor's journey).

> Phase-1 read: EPIC-001 (portal), EPIC-002 (admin), EPIC-003 (both surfaces), EPIC-004 (both) are all
> applicable. A future "wire SESSION_CONTEXT propagation" or "add an index" slice would be `no`.

## Artifact shape

One directory per epic: **`docs/demos/EPIC-NNN/`**, committed to the repo (not gitignored).

- **Ordered PNGs** named `NN-<AC-ID>-<slug>.png` — e.g. `01-AC-DOOR-001-01-services-page.png`,
  `04-AC-DOOR-004-03-submitted-confirmation.png`. One screenshot per major user-visible screen/state; each
  tagged with the AC id it evidences.
- **`DEMO.md`** — the gallery: a title, the persona + flow links, then one `## NN. <step>  [AC-ID]` section per
  screenshot with the embedded image (`![](NN-...png)`). Plus a one-line "how to regenerate" footer.
- The Playwright **HTML report** (`apps/portal/playwright-report/`, gitignored) remains the deep-dive; the
  committed gallery is the shareable summary.

## How it's produced

The demo is a **dedicated `@demo` Playwright walkthrough spec**, kept out of the required e2e gate:

- The spec lives at `apps/<app>/e2e/demo/<flow>.demo.spec.ts`, tagged `@demo`, and drives the persona/flow
  happy-path against the **live docker-compose container stack** (the same SUT the e2e gate uses — never a
  dev server). It reuses the slice's e2e fixtures + selectors, **asserts** each screen is visible (so a broken
  UI fails the demo loudly), and writes explicit `page.screenshot({ path: docs/demos/EPIC-NNN/NN-<AC>-<slug>.png })`.
- `e2e:run` and `e2e:smoke` **exclude** `@demo` (`--grep-invert @demo`); a separate **`e2e:demo`** script runs
  only `@demo`. So the demo never runs in CI / the gate, and the gate run never regenerates demo PNGs.

## Lifecycle seam

| Phase (who) | Demo action |
|---|---|
| **Compose** (Conductor) | Set the brief `demo:` block from the epic (applicability + apps + personas + flows). |
| **Dispatch/Build** (developer) | For an applicable slice, author the `@demo` walkthrough spec as a brief deliverable (alongside the e2e specs). App code → rides the slice PR. |
| **Smoke/Validate** (SDET) | With the container stack up, run `pnpm --filter <app> e2e:demo`; confirm the named PNGs landed; assemble/refresh `docs/demos/EPIC-NNN/DEMO.md`. **Non-gating.** |
| **Report** (Conductor) | Reference the demo (`docs/demos/EPIC-NNN/`, screen count) in the run report; commit the gallery in the **post-delivery docs fast-lane PR** (`MERGE-POLICY.md` — docs lane, no panel), alongside the sign-off records. |

> The `@demo` **spec** is application code (slice PR, application lane). The generated **gallery**
> (`docs/demos/EPIC-NNN/`) is docs — it ships via the docs fast-lane. Backend-only slices skip all of this;
> the run report records "UI demo: skipped (backend-only)".

---

## Part B — Per-phase walkthrough video (at phase closeout)

A **phase** in `.planning/ROADMAP.md` (Phase 1 = MVP, then each shippable increment) closes out when its
**last epic rolls to `delivered`**. At that moment the Conductor produces (or refreshes) **one continuous,
human-speed walkthrough video** that demonstrates *every* feature the phase delivered, end to end, across all
surfaces — the artifact a human watches to **sign off the phase**. It is the phase-altitude complement to the
per-epic galleries above.

### When (the trigger)

The Conductor checks at **Report** (after a slice is delivered and the validate write-back has rolled the epic
to `delivered`): **was the just-delivered epic the last `planned`→`delivered` epic of its roadmap phase?**
Read `.planning/ROADMAP.md` — if **every** epic listed under that phase is now `delivered`, the phase is
complete and its walkthrough video is produced/refreshed as part of the **phase-closeout docs PR** (below).
Otherwise, skip — the phase isn't done yet.

> A phase video is **not** produced per slice. It is produced **once per phase**, at the closeout of the slice
> that completes the phase — and refreshed if a later corrective slice changes phase behavior.

### Artifact shape

One directory per phase: **`docs/demos/phase-<N>/`**, committed to the repo (not gitignored).

- **`phase-<N>-walkthrough.mp4`** (H.264 — the primary review file) **+ `phase-<N>-walkthrough.webm`** (native
  Playwright recording). One continuous take.
- **`README.md`** — title, the phase + epics it covers, a **chapter list** (scene → surface → epic/AC), and the
  regenerate command.

### How it's produced

A **dedicated single-`test()` `@demo @video` Playwright spec**, kept out of both the e2e gate and the per-epic
screenshot run:

- The spec lives at `apps/<app>/e2e/demo/phase-<N>-walkthrough.demo.spec.ts` (hosted in whichever app has the
  fixtures to span the phase — `apps/admin` for a cross-app walkthrough), tagged **`@demo @video`**.
- **One `test()` block = one continuous video.** Recording + human-speed pacing are set **per-spec via
  `test.use({ video, viewport, launchOptions: { slowMo } })`** — the shared `playwright.config.ts` is
  **untouched**, so the e2e gate keeps running at normal speed with no video. `DEMO_SLOWMO` overrides the pace
  (`0` = fast correctness pass).
- It drives the persona/flow happy-paths against the **live docker-compose stack** (never a dev server),
  reuses the slices' e2e fixtures/selectors, **asserts** each screen + the real side-effects (e.g. emails via
  the Mailhog UI/API), and narrates with on-screen **caption banners** (injected via `page.evaluate`).
- **Tag isolation (three scripts):** `e2e:run` excludes `@demo`; `e2e:demo` runs `@demo` **but excludes
  `@video`** (`--grep @demo --grep-invert @video`) so the screenshot galleries stay fast; **`e2e:video`** runs
  only `@video`. The phase video therefore never runs in CI, the gate, or the per-epic demo run.
- **Package** the recording with **`node scripts/make-phase-video.mjs <N>`** — copies the newest
  `apps/*/test-results/**/video.webm` into `docs/demos/phase-<N>/` and converts to `.mp4` via the
  `ffmpeg-static` dev dependency (no system ffmpeg / sudo; webm-only fallback if absent).

> **Stage hygiene:** the recording runs against the live local DB; clear the mail-catcher at the start
> (`clearMailhog()`) so the email scenes are crisp, and use unique per-run identifiers. A heavily
> test-polluted local DB shows synthetic clutter in list views — re-seed / clean the dev DB (a **user-run**
> step; mass-deletes + reading `.env.local` are guard-walled) for a polished sign-off recording.

### Lifecycle seam

| Phase (who) | Phase-video action |
|---|---|
| **Implement** (developer, on the phase-completing slice) | If this slice completes the phase, author/refresh the `phase-<N>-walkthrough.demo.spec.ts` `@video` spec (application code → rides that slice's PR), covering the phase's full feature set. |
| **Report / closeout** (Conductor) | Detect phase completion (all phase epics `delivered`). Bring the stack up, run `pnpm --filter <app> e2e:video`, run `scripts/make-phase-video.mjs <N>`, eyeball it, and write `docs/demos/phase-<N>/README.md`. Ship the `docs/demos/phase-<N>/` artifact in the **post-delivery docs fast-lane PR** (`MERGE-POLICY.md` — docs lane, no panel), alongside the epic sign-off records. Reference it (path · duration · chapter count) in the run report's **Phase closeout** line. |

> The `@video` **spec** is application code (rides the phase-completing slice's PR, application lane). The
> generated **video + README** (`docs/demos/phase-<N>/`) are docs — they ship via the docs fast-lane. When the
> delivered slice does **not** complete a phase, the run report records "Phase closeout: n/a (phase in progress)".

## See also

- `MERGE-POLICY.md` — the docs fast-lane the gallery + the phase video merge through.
- `.implementation/_templates/build-brief.md` — the `demo:` block (per-epic).
- `.implementation/agents/sdet.md` (capture) + `.implementation/agents/developer.md` (authoring the specs).
- `.orchestration/AGENT.md` §§ Compose, Report — where the Conductor sets the per-epic demo + runs the
  phase-closeout video.
- `scripts/make-phase-video.mjs` — packages a phase recording (webm + mp4).
- `docs/demos/README.md` — the demo index (per-epic galleries + per-phase walkthroughs).

# Demo Policy — per-epic UI demo (when applicable)

> Canonical, project-coupled policy for producing a **UI demo** with each epic that delivers user-facing UI.
> The Conductor (`.orchestration/`) and the engine (`.implementation/`) follow it. A demo is a small, durable,
> **AC-tagged screenshot walkthrough** of the epic's persona/flow happy-path — reviewable at a glance and kept
> per-epic under `docs/demos/EPIC-NNN/`.
>
> **A demo is never a gate.** A missing or failed demo never blocks delivery; the e2e/acceptance gates are the
> gates. The demo is *evidence a human can see*, not a pass/fail.

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

## See also

- `MERGE-POLICY.md` — the docs fast-lane the gallery merges through.
- `.implementation/_templates/build-brief.md` — the `demo:` block.
- `.implementation/agents/sdet.md` (capture) + `.implementation/agents/developer.md` (authoring the spec).
- `.orchestration/AGENT.md` §§ Compose, Report — where the Conductor sets + references the demo.
- `docs/demos/README.md` — the per-epic demo index.

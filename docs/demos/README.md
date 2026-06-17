# UI Demos

Per-epic **UI demos** — small, AC-tagged screenshot walkthroughs of each epic's persona/flow happy-path,
produced by the delivery orchestrator when a slice delivers user-facing UI. They make a shipped slice
reviewable at a glance.

- **What/why/how:** `.orchestration/DEMO-POLICY.md` (applicability, artifact shape, the produce/ship seam).
- **Non-gating:** a demo is evidence, not a quality gate — the e2e/acceptance gates are the gates.
- **Regenerate:** bring the stack up (`docker compose up -d` → `pnpm db:migrate` → `pnpm db:seed`) then
  `pnpm --filter <app> e2e:demo`. The screenshots write straight into the epic's folder here.

## Index

| Epic | Surface | Demo |
|---|---|---|
| EPIC-001 — Public front door | `apps/portal` | [EPIC-001/DEMO.md](EPIC-001/DEMO.md) |
| EPIC-004 — Auth & two-role model | `apps/portal` + `apps/admin` | [EPIC-004/DEMO.md](EPIC-004/DEMO.md) |
| EPIC-002 — Services-catalog management | `apps/admin` | [EPIC-002/DEMO.md](EPIC-002/DEMO.md) |
| EPIC-003 — Accountant request inbox | `apps/admin` | [EPIC-003/DEMO.md](EPIC-003/DEMO.md) |

## Phase reviews

End-of-phase **video** walkthroughs — one continuous, human-speed recording chaining every feature in a
phase across both surfaces (for human sign-off). Produced by the `@video`-tagged spec; see the folder README.

| Phase | Covers | Walkthrough |
|---|---|---|
| Phase 1 — MVP front-door spine | EPIC-001 · EPIC-004 · EPIC-002 · EPIC-003 | [phase-1/README.md](phase-1/README.md) |

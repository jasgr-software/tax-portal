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

_(EPIC-002/003/004 demos are added as those slices run through `/orchestrate`.)_

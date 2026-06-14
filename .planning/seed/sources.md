# Planning Sources

> **This is the only file that couples the planning layer to a specific project's source layout.**
> The Planning Agent reads this file first to discover *where this project's requirements and
> architecture live* and how their artifacts are named. Retarget the layer for a different project by
> editing this file — nothing else in `.planning/` hard-codes a source path. Read-only to the agent.

## Requirements source

- **type:** requirements-layer
- **location:** `.requirements/`
- **artifacts:** `REQ-<DOMAIN>-NNN.md` (one file per requirement; front-matter `id`, prose body, and
  acceptance criteria)
- **acceptance-unit:** `AC-<DOMAIN>-NNN-NN` — the unit `COVERAGE.md` tracks to full acceptance
- **domains:** `AUTH`, `DOOR`, `ONBD`, `LIFE`, `FILE`, `MSG`, `DASH`, `IDNT`, `NFR`
- **open-questions:** `.requirements/OPEN-QUESTIONS.md` (`OQ-NNN`) — read for context; not owned here

## Architecture source

- **type:** architecture-layer
- **location:** `.architecture/`
- **artifacts:**
  - `decisions/ADR-NNN-<slug>.md` — architectural decision records (cited as `ADR-NNN`)
  - `c4/` — the C4 model (L1–L4)
  - `strategy/TESTING.md` — the testing pyramid / tier contract an epic's test contract draws on
  - `strategy/CICD.md` — the CI gate (the independent pass/fail source the validate phase consumes)
- **open-decisions:** `.architecture/OPEN-DECISIONS.md` (`OD-NNN`) — read for context; not owned here

## Notes

- **Both sources are present for this project**, so each epic decomposes real requirements (`REQ-*`) and
  cites real decisions (`ADR-*`), and `COVERAGE.md` tracks the full `AC-*` corpus to
  acceptance.
- **A future project retargets here.** Point these entries at a single design document, a different set
  of folders, or whatever that project uses. If a project has **no** requirements/architecture layers,
  leave the entries empty and the Planning Agent plans ad-hoc from `seed/intake.md` alone — coverage then
  tracks only what the seed defines.
- The agent must **degrade gracefully** when a declared source is absent: plan from the seed, and note
  in its run summary that a source was missing. It never fails because a source is missing.

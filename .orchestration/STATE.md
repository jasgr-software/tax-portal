# Conductor State — run ledger

> **Single source of truth for a Conductor run** (the analog of the engine's
> `.implementation/tasks/PROGRESS.md`). The Conductor reads this first on every `/orchestrate` and updates it
> at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the recorded
> phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.

## Current run

_None. No slice in flight._

<!--
### EPIC-NNN — BRIEF-NNN
- **Phase:** Select | Gate | Compose | Implement | Review | Fix | Merge/Finalize | Validate | Report
- **Base branch:** main
- **Feature branch:** <engine-created branch>
- **PR:** #<N> — <url>
- **Status:** <one-line>
-->

## Phase log

_No entries yet._

<!--
### <Phase> — <YYYY-MM-DD>
**Start:** <what this phase is doing>
**Actions:**
- <bulleted>
**End:** <outcome → next phase, or STOP + reason>
-->

## Outcome

_No completed run yet._

<!--
- **EPIC-NNN:** delivered | stopped-at-<phase>
  - **Reason (if stopped):** <inner stop + the human action needed to resume>
  - **Merge SHA:** <sha>
  - **AC verified:** <list / "pending validate">
  - **Next ready epic:** <EPIC-NNN, or remaining blockers>
-->

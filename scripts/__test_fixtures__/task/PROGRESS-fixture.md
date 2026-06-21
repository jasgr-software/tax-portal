# Progress

> Test fixture for TASK-LOE-011-002 read/query projections.
> Mirrors the real PROGRESS.md structure per ENGINE.md § PROGRESS.md structure contract.

## Current initiative

**BRIEF-RD-001 / Read-projection test brief.** Branch `test-branch`. **Phase: Dispatch.**

Tasks:
- **TASK-RD-001-001** — `backlog` — first task
- **TASK-RD-001-002** — `in-progress` — second task (active)
- **TASK-RD-001-003** — `review` — third task

## Awaiting PR merge

_Empty._ No slice in limbo.

## Active bugs

_None active._

## Open retro action items

_None._

---

### IO Plan — 2026-06-21

**Start:** Test fixture session entry — should NOT appear in progress output.

**Actions:**
- This is the session-entry tail — it lives below the `---` separator.
- The `progress` command must NOT include this content.
- Only the `## Current initiative` section above the `---` is projected.

**End:** Fixture session entry end.

### IO Dispatch — 2026-06-21

**Start:** Second session entry — also must NOT appear.

**Actions:**
- Another session entry to confirm the `---` cutoff is clean.

**End:** Second session end.

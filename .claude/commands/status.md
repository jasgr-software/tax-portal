Give a quick status summary of the current slice. Do NOT spawn any agents.

1. Read `.implementation/tasks/PROGRESS.md`
2. List any active task/bug files in `.implementation/tasks/` (not `done/`)
3. Run `git log --oneline -10` to show recent commits on the current branch
4. Run `git status` to show working tree state

Summarize concisely:

- Current initiative: the active build brief (`Brief-type` if set), its goal, and phase — or "none / no active slice"
- For an active slice: how many tasks remain (backlog, in-progress, review) and any blockers noted in PROGRESS.md
- Any open items in PROGRESS.md `## Awaiting PR merge`
- Any unworked items in PROGRESS.md `## Active bugs`
- Any open items in PROGRESS.md `## Open retro action items`
- Branch state (clean/dirty, ahead/behind)

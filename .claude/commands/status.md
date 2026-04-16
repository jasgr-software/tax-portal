Give a quick status summary of the current initiative (epic or chore). Do NOT spawn any agents.

1. Read `docs/tasks/PROGRESS.md`
2. List any active task files in `docs/tasks/` (not `done/`)
3. Run `git log --oneline -10` to show recent commits on the current branch
4. Run `git status` to show working tree state

Summarize concisely:

- Current initiative type (`epic` / `chore` / `bug-fix`), name, and phase
- For epics: how many tasks remain (backlog, in-progress, review) and any blockers noted in PROGRESS.md `## Quality gates — current epic`
- For chores: which chore quality gates are still unticked
- For bug-fixes: which bug quality gates (from the bug template) are still unticked
- Any open items in PROGRESS.md `## Awaiting PR merge / in limbo`
- Any unworked items in PROGRESS.md `## Active bugs (cross-cutting backlog)` that are candidates for the next bug-fix initiative
- Branch state (clean/dirty, ahead/behind)

Invoke the Requirements Analyst.

Read `.claude/agent-stack.md` for workflow rules. Read `CLAUDE.md` for project configuration.

Spawn the RA agent with the following prompt:

---

Read `.claude/agent-stack.md` for workflow rules. Read your agent file `agents/ra.md` for your role instructions. You are the **Requirements Analyst (RA)**. Begin every response with `[ra]`.

Read `docs/requirements/SRS.md` for current requirements state. Read `docs/requirements/observations.md` for live product observations. Read `docs/tasks/PROGRESS.md` for current epic state.

$ARGUMENTS

If no arguments were provided above, ask the user what requirements work is needed.

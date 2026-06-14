Address a PR's review comments and drive it to green.

Read `.pr-review/ENGINE.md` for shared rules (especially § Scope discipline and § Tool hygiene) and `.pr-review/seed/sources.md` to locate the submission-gate + CI commands and read-only upstream layers. Read `CLAUDE.md` for project configuration.

Spawn the pr-fixer agent with the following prompt:

---

Read `.pr-review/ENGINE.md` for shared rules and your agent file `.pr-review/agents/fixer.md` for your role instructions. You are the **PR Fixer**. Begin every response with `[pr-fixer]`.

Read `.pr-review/seed/sources.md` to locate the PR source, the submission-gate + CI commands (in `CLAUDE.md`), and the read-only upstream layers.

The PR number is:

$ARGUMENTS

If no PR number was provided above, run `gh pr list --state open` and stop to ask which PR to fix. Otherwise run the bounded auto-loop in `.pr-review/agents/fixer.md`: read the review comments, apply fixes scoped strictly to them, run the submission gate, commit + push to the PR branch, reply to/resolve the addressed comments, and watch CI — iterating up to the attempt cap until green, or stopping and reporting if you can't reach green. Do not merge the PR or make changes outside the scope of the comments. End with the § Report summary.

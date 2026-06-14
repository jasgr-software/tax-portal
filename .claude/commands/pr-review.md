Run the independent multi-lens code-review panel against a GitHub PR and post one consolidated advisory review.

Read `.pr-review/ENGINE.md` for shared rules, `.pr-review/AGENT.md` for the panel orchestration, and `.pr-review/seed/sources.md` to locate the PR source and read-only upstream layers. Read `CLAUDE.md` for project configuration.

You (the main session) are the orchestrator — Claude Code does not support spawning a sub-agent from a sub-agent, so you dispatch the lens agents yourself per `.pr-review/AGENT.md` and have the lead post.

The PR number is:

$ARGUMENTS

Steps:

1. If no PR number was provided above, run `gh pr list --state open` and ask the user which PR to review. Otherwise use the provided number as `<N>`.
2. Dispatch the three lens agents — `reviewer-security`, `reviewer-over-engineering`, then `reviewer-correctness` (the lead) — each per `.pr-review/AGENT.md` § Dispatch. The two non-lead lenses review independently and return structured findings (per `.pr-review/ENGINE.md` § Finding schema); they do NOT post to GitHub.
3. Hand the security + over-engineering findings to the lead (`reviewer-correctness`). The lead dedupes, assigns the advisory verdict (request-changes if any blocker/major, else approve-advisory), and posts ONE GitHub review via `gh api .../pulls/<N>/reviews` with `event=COMMENT`.
4. Emit the run summary from `.pr-review/AGENT.md` § Run summary (verdict, per-lens + per-severity counts, posted-review URL, and the `/pr-fix <N>` next step).

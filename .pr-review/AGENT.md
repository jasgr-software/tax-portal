# PR-Review Panel — Orchestration

This file is the **canonical, portable definition** of how the multi-lens PR-review panel runs against a
single pull request. Any executor — a slash command, a host workflow, or a human — can read this file and
the agent files it points to and perform the work. It has **no dependency on any orchestration workflow**:
no orchestrator role, sprint, task pipeline, or build phase. The only project-coupling point is
`seed/sources.md`; read it first.

## Who runs this

Claude Code does not support spawning a sub-agent from inside a sub-agent, so **the main session is the
orchestrator.** The main session reads this file and `ENGINE.md`, dispatches the three lens agents, and the
**lead lens posts the consolidated review.** This file *composes* the dispatch; it is not itself a
sub-agent that spawns the panel. (Same pattern as `.implementation/AGENT.md` / the IO.)

## Input

- A **PR number** (`<N>`). The repo is discovered from `gh repo view --json nameWithOwner`.
- Read `ENGINE.md` (shared rules — finding schema, dedupe, verdict, comment mechanics) and `seed/sources.md`
  (how PRs are reached; which upstream layers are available as read-only context) before dispatching.

## The flow

### 1. Dispatch (three independent lenses)

Spawn the three lens agents (registered as subagent types via `.claude/agents/` symlinks → the agent files
here), each given the PR number and told to **review independently** and **return structured findings**
(per `ENGINE.md` § Finding schema) as their result — they do **not** post to GitHub:

- subagent type `reviewer-security` (`agents/reviewer-security.md`) → `[reviewer-security]`
- subagent type `reviewer-over-engineering` (`agents/reviewer-over-engineering.md`) → `[reviewer-over-engineering]`
- subagent type `reviewer-correctness` (`agents/reviewer-correctness.md`) → `[reviewer-correctness]` (the **lead**)

Each spawn prompt should say:

1. "Read `.pr-review/ENGINE.md` for shared rules and `.pr-review/seed/sources.md` for sources."
2. "Read your agent file `.pr-review/agents/reviewer-<lens>.md` for your role."
3. "Begin every response with `[reviewer-<lens>]`."
4. "Review open PR `<N>` via `gh pr view <N>` / `gh pr diff <N>` / `gh pr checks <N>`. Return your findings
   as a structured list per the finding schema. Do NOT post to GitHub — the lead aggregates and posts."
5. "PR number: `<N>`."

The two non-lead lenses (`security`, `over-engineering`) can run in either order or together — they are
independent. Dispatch the **lead last** (or re-invoke it for aggregation) so it can receive the siblings'
findings.

### 2. Aggregate (lead)

Give the lead the security and over-engineering findings. The lead (`agents/reviewer-correctness.md`)
dedupes overlaps, assigns the **advisory verdict** (request-changes if any `blocker`/`major` survives, else
approve-advisory), and composes the consolidated review body from `_templates/pr-review-summary.md`. The
lead never deletes a sibling's `blocker`/`major` — it merges and surfaces it.

### 3. Post (lead)

The lead posts **one** GitHub review via `gh api repos/{owner}/{repo}/pulls/<N>/reviews` with
`event=COMMENT` (advisory — never `APPROVE`/`REQUEST_CHANGES`, so branch protection is untouched), an
inline `comments[]` array, and the summary body (see `ENGINE.md` § Comment mechanics).

## Run summary

End the run with a short summary for the user:

```
## PR-review panel — PR #<N> — <date>
**Advisory verdict:** request-changes | approve
**Findings:** correctness <n> · security <n> · over-engineering <n>  (deduped to <m> posted)
**By severity:** blocker <n> · major <n> · minor <n> · nit <n>
**Posted review:** <review URL>
**Next:** run `/pr-fix <N>` to address the comments, or address them manually.
```

## Operating rules

- **Advisory only.** The panel never blocks merge or changes the GitHub review state beyond `COMMENT`. It
  does not own branch protection or required checks.
- **One review per run.** All lenses fold into a single consolidated, deduped review — not three separate
  ones.
- **Lenses don't post; the lead does.** Non-lead lenses return findings; only the lead posts.
- **Read-only upstream.** Reading `.architecture/`/`.planning/`/`.requirements/` for context is allowed;
  editing them is not. Reviewers never edit repo code — that is the fixer's job (`agents/fixer.md`).
- **Stay in the diff.** Review the PR's changes plus the minimum system context needed to judge them.

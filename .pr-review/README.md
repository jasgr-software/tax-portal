# `.pr-review/` — Standalone PR-Review Panel

This folder is a **self-contained, workflow-agnostic** description of how to run an **independent,
multi-lens code review of a GitHub pull request** and how to **drive a reviewed PR back to green**. It is
the review counterpart to the other standalone layers (`.requirements/`, `.architecture/`, `.planning/`,
`.implementation/`): it has its own canonical role definitions and **depends on no orchestration
workflow.** Any executor — a slash command, a host workflow, a human, or an external tool — can read these
files and perform the work.

It does two things, owned by two roles:

1. **A code-review panel** — three **independent, project-agnostic** lenses (`reviewer-correctness`
   *[lead]*, `reviewer-security`, `reviewer-over-engineering`) each review the PR diff + changed files on
   general engineering merit and return structured findings. They know nothing about the project and read
   no project/governance docs — a genuine outside pair of eyes on the code as written. The lead dedupes the
   findings and posts **one consolidated, advisory GitHub PR review**.
2. **A fixer** — a single agent that reads the panel's review comments, applies fixes scoped to them, runs
   the submission gate, pushes to the PR branch, and watches CI — iterating, in a bounded loop, until the
   PR is green (or stopping and reporting if it can't get there).

Unlike a review tied to a task pipeline, this layer treats the **PR itself as the artifact** — it runs
against *any* open PR by number and is not coupled to `.implementation/` or any task/brief.

## What's here

```
.pr-review/
├── README.md             # this file — overview, lifecycle, when to invoke, scope boundary
├── AGENT.md              # the Panel Orchestration — canonical role the MAIN SESSION runs (it dispatches)
├── ENGINE.md             # shared rules every panel/fixer agent reads on startup (finding schema, verdict,
│                         #   comment mechanics, gh usage, tool hygiene, scope discipline)
├── agents/
│   ├── reviewer-correctness.md      # LEAD lens — logic bugs, contract honor, orphans, test robustness;
│   │                                #   also aggregates sibling findings and posts the consolidated review
│   ├── reviewer-security.md         # OWASP Top 10, secrets, auth-flow, injection, dependency CVEs, headers
│   ├── reviewer-over-engineering.md # premature abstraction, dead code, defensive-for-impossible, scope creep
│   └── fixer.md                     # bounded auto-loop: address comments → fix → gate → push → CI green
├── _templates/
│   ├── finding.md             # the shape of one finding (the contract every lens returns)
│   └── pr-review-summary.md   # the consolidated review body (advisory verdict + grouped, deduped findings)
└── seed/
    └── sources.md         # THE only project-coupling point — how PRs are reached + read-only upstream refs
```

**Intentional deviations from the sibling layers.** This layer has **no `OPEN-QUESTIONS.md`** and **no
`PHASES.md`**. The other layers keep an open-questions ledger for standing content ambiguities; `.pr-review/`
is a **stateless, per-PR tool** with no durable backlog — a run starts from a PR number and ends when the
review is posted (or the PR is green). The review flow is short enough to live inline in `AGENT.md`, so
there is no separate phase reference.

## Lifecycle

```
PR number  ──►  [panel]  reviewer-correctness (lead)         ──►  ONE consolidated advisory PR review
(any open PR)            reviewer-security                        (inline comments + verdict, event=COMMENT)
                         reviewer-over-engineering
                              │
                              ▼
                  [fixer]  read comments → fix (scoped) → submission gate → push → watch CI
                              └── loop to green (bounded attempt cap) or stop + report
```

1. **Review (panel).** The three lenses review the PR diff + changed files **independently** and
   **project-agnostically** (general engineering merit, no project docs) and each return structured
   findings (see `_templates/finding.md`). The lead (`reviewer-correctness`) dedupes overlapping findings,
   assigns an **advisory verdict** (request-changes if any blocker/major finding, else approve-advisory),
   and posts **one** GitHub review with inline line-anchored comments + a summary body. See `AGENT.md` for
   the orchestration and `agents/reviewer-*.md` for each lens.
2. **Fix (fixer).** On demand, the fixer reads the panel's review comments, addresses each within scope,
   runs the submission gate, commits + pushes to the PR branch, and watches CI — looping up to an attempt
   cap. It replies to / resolves the comments it addresses and reports clearly if it cannot reach green.
   See `agents/fixer.md`.

The two roles are independent: you can run the panel without the fixer, and the fixer reads whatever review
comments exist (panel-posted or human).

## How to run it

- **Slash commands (this project's adapters):** `/pr-review <PR#>` runs the panel; `/pr-fix <PR#>` runs the
  fixer. Both are thin adapters in `.claude/commands/` — behavior lives here in `.pr-review/`.
- **Any executor:** read `ENGINE.md`, then `AGENT.md` (for the panel) or `agents/fixer.md` (for the fixer),
  and follow them. The roles are fully defined in those files.
- **Dispatch reality:** Claude Code does not support spawning a sub-agent from a sub-agent, so the **main
  session is the orchestrator** — it reads `AGENT.md`, dispatches the three lens agents, and the lead posts.
  (Same pattern as `.implementation/AGENT.md` / the IO.)

## Scope boundary

This layer owns **the review panel, the fixer, and their shared rules** — nothing else. It is **advisory**:
the consolidated review is posted as a GitHub `COMMENT` event, so it never approves, requests changes as a
merge gate, or touches branch protection. The **reviewers are independent and project-agnostic** — they
read only the PR (diff + changed files), never `.architecture/`/`.planning/`/`.requirements/`/`CLAUDE.md`
conventions, and apply no project-specific rules. Only the **fixer** is project-aware (it must run the
submission gate) and only it writes code, and only to the PR branch under review.

It **complements, does not replace**: the `/code-review` and `/security-review` skills, if installed (those
are user-global skills, not in-repo artifacts), and the `.implementation/` SDET review gate (tied to the
build pipeline). Use `.pr-review/` when you want an independent, multi-lens review posted on a real PR, and
an agent to take that PR to green.

## Reusability

- **Generic / portable:** nearly the whole layer — this folder structure, `AGENT.md`, `ENGINE.md`, all
  **three lens definitions** (they're project-agnostic by design), the finding schema, the
  consolidated-review shape, and the advisory-verdict + dedupe conventions. Drop them into any repo
  unchanged.
- **Project-specific:** only the **fixer's** coupling — `seed/sources.md` (where the submission-gate + CI
  commands live) and `CLAUDE.md`'s gate commands themselves. A new project repoints `seed/sources.md` and
  the panel works as-is.

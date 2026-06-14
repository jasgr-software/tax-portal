# PR-Review Sources

> **This is the only file that couples the PR-review layer to a specific project's inputs.**
> Every `.pr-review/` agent reads this file first to discover *where the PR comes from*, *where the
> submission-gate + CI commands live*, and *which upstream layers (if any) are available as read-only
> reference*. Retarget the layer for a different project by editing this file. Nothing else in
> `.pr-review/` hard-codes a project path. Read-only to the agents.

## PR source (required)

- **type:** github-pull-request
- **host:** GitHub via the `gh` CLI
- **repo:** discover at runtime — `gh repo view --json nameWithOwner` (never hard-code owner/repo)
- **artifacts:**
  - metadata — `gh pr view <N> --json title,body,headRefName,headRefOid,url,comments`
  - diff — `gh pr diff <N>` (the primary review artifact)
  - checks — `gh pr checks <N>` / `gh run view <run-id> --json status,conclusion`
  - review comments — `gh api repos/{owner}/{repo}/pulls/<N>/comments` and `.../reviews`
- **review event:** the panel posts with `event=COMMENT` (advisory) — never `APPROVE`/`REQUEST_CHANGES`.
- **note:** the **PR is the artifact**. Review the diff and CI conclusion; check out locally only on an
  inconsistency signal (the fixer does check out — it edits — via `gh pr checkout <N>`).

## Submission gate + CI commands (required for the fixer)

- **location:** `CLAUDE.md` — § Submission Gate Commands and § Required CI checks (branch protection).
- **use:** the fixer runs the gate before pushing (`pnpm lint`, `pnpm type-check`, per-surface
  `pnpm --filter portal test` / `pnpm --filter admin test`, targeted e2e only when CLAUDE.md's
  e2e-required triggers apply). The CI workflow on the pushed SHA is the independent gate the fixer watches
  to green.

## Upstream reference layers (optional, read-only)

Read these **only when the PR or its branch cites them** (PR body, linked epic/brief, or a `// DECISION:` /
ADR reference in the diff). The panel **degrades gracefully** when a layer is absent — it never blocks a
review on a missing reference, and it never edits one.

- **architecture**
  - **location:** `.architecture/`
  - **artifacts:** `decisions/ADR-NNN-*.md`, `c4/`, `strategy/`
  - **use:** read a cited `ADR-` as a binding design constraint for the correctness lens (e.g. ADR-003
    `SESSION_CONTEXT`, ADR-005 RLS, ADR-002/006 migration tracks + two-frontend layout).
- **planning**
  - **location:** `.planning/`
  - **artifacts:** `EPIC-NNN-*.md`, `ROADMAP.md`, `COVERAGE.md`, `personas/`, `flows/`
  - **use:** when a PR implements a planning epic, read the epic's acceptance scenarios / behavior contract
    for context on what "correct" means for the slice.
- **requirements**
  - **location:** `.requirements/`
  - **artifacts:** `REQ-<DOMAIN>-NNN.md`
  - **use:** read a cited `REQ-` for the acceptance criteria a change is meant to satisfy.

## Notes

- **Complements, does not replace.** This layer is independent of the `/code-review` and `/security-review`
  skills (lower-level, local-diff) and the `.implementation/` SDET review gate (tied to the build pipeline).
  Use `.pr-review/` for an independent, multi-lens review posted on a real PR, plus an agent to take it to
  green.
- **Advisory.** The panel does not own branch protection or required checks; its verdict is textual.
- **A future project retargets here.** Point the PR source at wherever PRs live, repoint the gate/CI
  location, and add or drop the optional upstream layers. The rest of `.pr-review/` is portable.

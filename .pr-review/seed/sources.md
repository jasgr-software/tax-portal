# PR-Review Sources

> **This is the only file that couples the `.pr-review/` layer to a specific project — and it exists for the
> fixer, not the reviewers.** The three review lenses are **independent and project-agnostic**: they review
> only the PR (diff + changed files) and need nothing here beyond the generic `gh` commands. The **fixer**,
> by contrast, must run this project's submission gate and push — so it reads this file to find the gate +
> CI commands. Retarget the layer for a different project by editing this file. Read-only to the agents.

## PR source (how any role reaches the PR — generic)

- **type:** github-pull-request
- **host:** GitHub via the `gh` CLI
- **repo:** discover at runtime — `gh repo view --json nameWithOwner` (never hard-code owner/repo)
- **artifacts:**
  - metadata — `gh pr view <N> --json title,body,headRefName,headRefOid,url,comments`
  - diff — `gh pr diff <N>` (the primary review artifact)
  - checks — `gh pr checks <N>` / `gh run view <run-id> --json status,conclusion`
  - review comments — `gh api repos/{owner}/{repo}/pulls/<N>/comments` and `.../reviews`
- **review event:** the panel posts with `event=COMMENT` (advisory) — never `APPROVE`/`REQUEST_CHANGES`.
- **note:** the **PR is the artifact**. Reviewers read the diff + changed files only. The fixer checks out
  the branch (`gh pr checkout <N>`) because it edits.

## Submission gate + CI commands (used by the FIXER only)

- **location:** `CLAUDE.md` — § Submission Gate Commands and § Required CI checks (branch protection).
- **use:** the fixer runs the gate before pushing and watches the CI workflow on the pushed SHA to green.
  The reviewers do not run the gate (they read `gh pr checks` to see what CI already concluded).

## What is deliberately NOT here

- **No upstream reference layers.** The reviewers are project-agnostic — they do **not** read
  `.architecture/`, `.planning/`, `.requirements/`, or project conventions, and they apply no
  project-specific rules. If you want architecture/requirements-conformance checking, that belongs to a
  project-aware reviewer elsewhere (e.g. the `.implementation/` SDET gate), not to this independent panel.

## Notes

- **Complements, does not replace.** This layer is independent of the `/code-review` and `/security-review`
  skills (user-global, if installed) and the `.implementation/` SDET review gate.
- **Advisory.** The panel does not own branch protection or required checks; its verdict is textual.
- **A future project retargets here.** The panel is portable as-is; only this file (the fixer's gate/CI
  location) and `CLAUDE.md`'s gate commands are project-specific.

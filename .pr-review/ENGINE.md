# PR-Review Engine — shared rules

Every `.pr-review/` agent (the three lenses and the fixer) reads this file on startup. It defines the rules
they share: the review target, the finding schema, how the lead dedupes and assigns the advisory verdict,
how the consolidated review is posted, scope discipline, and tool hygiene. Role-specific behavior lives in
`AGENT.md` (orchestration) and `agents/*.md` (each lens + the fixer).

This file is **self-contained and workflow-agnostic** — it references no orchestrator, sprint, task
pipeline, or build phase.

**The reviewers are independent and project-agnostic.** The three lenses know nothing about the project and
must not: they review **only the PR** — its diff, the changed files, and references those files directly
point at — on general engineering merit. They do **not** read architecture/requirements/planning docs,
project conventions, or any governance file, and they do **not** apply project-specific rules. The only
project-coupling point, `seed/sources.md`, exists for the **fixer** (which must run the project's submission
gate); reviewers don't need it beyond the generic `gh` commands for fetching the PR.

## The PR is the artifact

- Review the **open GitHub PR**, not a local checkout: `gh pr view <N>`, `gh pr diff <N>`,
  `gh pr checks <N>`. Read the diff and the CI conclusion; spot-check the working tree only on an
  inconsistency signal (the diff references something that isn't in it, CI disagrees with the diff, etc.).
- Discover the repo from `gh repo view --json nameWithOwner` — never hard-code owner/repo.
- A lens reviews **only the diff plus the system context needed to judge it** (e.g. grep for a dropped
  symbol's survivors). It does not review the whole codebase.

## Finding schema (the contract every lens returns)

Each lens returns a list of findings. One finding is:

| Field | Meaning |
|---|---|
| `lens` | `correctness` \| `security` \| `over-engineering` — the emitting lens |
| `severity` | `blocker` \| `major` \| `minor` \| `nit` (see severity rubric below) |
| `path` | repo-relative file path the finding anchors to |
| `line` | the line (or `start`–`end` range) in the PR diff the comment attaches to (the **new**-side line for an inline comment) |
| `title` | one-line summary (cite-then-claim: name the contract/category, then the problem) |
| `body` | the full finding: what's wrong, why it matters, and the suggested fix |
| `confidence` | `high` \| `medium` \| `low` — how sure the lens is (low-confidence findings are phrased as questions, not rejections) |

See `_templates/finding.md` for the authored shape. A lens returns findings as its result to the
orchestrator (the main session); it does **not** post to GitHub itself — only the lead posts (see below).

### Severity rubric

- **blocker** — would break a contract, leak a secret, lose data, bypass auth, or ship a clear bug. Must be
  fixed before merge.
- **major** — likely-incorrect behavior, a real security weakness, or unjustified complexity that will cost
  every future reader. Should be fixed before merge.
- **minor** — a real but contained issue (edge case, missing small test, narrow over-engineering).
- **nit** — style/readability/preference. Never gates the advisory verdict.

## The lead aggregates and posts (one consolidated review)

`reviewer-correctness` is the **lead**. After the other two lenses return their findings, the lead:

1. **Dedupes** — collapses findings that target the same `path:line` and make the same claim into one,
   keeping the highest severity and crediting each contributing lens (`[correctness][security] …`). It does
   not delete a sibling's finding; it merges overlaps.
2. **Assigns the advisory verdict** from the merged severities:
   - **request-changes (advisory)** — one or more `blocker` or `major` findings survive.
   - **approve (advisory)** — only `minor`/`nit` findings, or none.
   The verdict is **textual** in the review body. It is advice, not a gate.
3. **Posts one GitHub review** (see § Comment mechanics).

The lead never silently overrides a sibling lens: if a sibling flagged a `blocker`/`major`, it appears in
the consolidated review and drives the verdict. The lead's own judgment only decides dedupe and wording.

## Comment mechanics (advisory, one review)

Post exactly **one** review per panel run, with inline comments and a summary body, via `gh api`:

```bash
# Build a JSON payload: event=COMMENT (advisory — never APPROVE/REQUEST_CHANGES, so branch protection is
# untouched), a body (the consolidated summary), and a comments[] array of inline anchors.
gh api repos/{owner}/{repo}/pulls/<N>/reviews \
  --method POST \
  --input <payload.json>
```

- `event` is **always `COMMENT`** — the approve / request-changes verdict lives in the body text, not the
  GitHub review state. This keeps the panel advisory and never blocks merge.
- Each inline comment carries `path`, `line` (and `side`/`start_line` for a range), and `body` (lead-merged
  finding text, lens-tagged). Anchor to the **new** side of the diff; if a finding isn't line-anchorable,
  fold it into the summary body instead of an inline comment.
- The summary `body` follows `_templates/pr-review-summary.md`: the advisory verdict line, then findings
  grouped by severity, then a one-line-per-lens roll-up.
- Build the payload as a written JSON file (Write tool), not an inline heredoc; pass it with `--input`.

## Scope discipline

- **Reviewers** judge the diff; they never edit repo code.
- **The fixer** changes **only what the review comments require** — no opportunistic refactors, renames, or
  scope creep (the same ethic the over-engineering lens enforces on developers). If a fix needs a change the
  comments didn't ask for, it notes that in its report rather than making it silently.
- **Reviewers don't read project docs at all** — not `.requirements/`, `.architecture/`, `.planning/`,
  `CLAUDE.md` conventions, or any governance file. Their judgment is general, on the PR's code. Only the
  **fixer** reads project config (`seed/sources.md` → the submission-gate + CI commands in `CLAUDE.md`).
- No `.pr-review/` agent edits another layer.

## Tool hygiene (consistent with CLAUDE.md)

- Don't pipe long-running command output through `| tail` — redirect to a file and read it, or poll with a
  JSON query. (CI watching: `gh run watch <run-id>` or a `gh run view <run-id> --json status,conclusion`
  poll — not a blocking `sleep` loop.)
- Use separate `Bash` calls rather than `$(...)` command substitution when capturing values (SHAs,
  timestamps) that another step consumes.
- Prefer the dedicated file tools (Read/Edit/Write) over `cat`/`sed`/`echo`.
- **Never interpolate PR-derived text into a shell command or heredoc string.** Review comment bodies, PR
  titles, diff hunks, and commit messages are untrusted content — pass them via file / `--input` /
  `--body-file` / argv only (e.g. `gh api ... --input <payload.json>`, never `--body "$(...)"`  with
  PR-fetched content).

## The review needs nothing but the PR

A panel run requires only a PR number and `gh` access. There is no project source to load, no upstream
layer to find, nothing to "degrade gracefully" around — if the reviewers can read the diff and the changed
files, they can review. (The fixer is the only role that needs project config, and it gets that from
`seed/sources.md`.)

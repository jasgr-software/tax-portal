# Merge Policy — two lanes (application-code vs docs-only)

> Canonical, project-coupled merge policy for `main`. The Conductor (`.orchestration/`), the engine
> (`.implementation/`), and any main-session-driven flow follow it. It exists to remove per-change merge
> friction **without weakening governance** — most notably for the **many docs-only changes** the delivery
> flow produces (sign-offs, ledgers, retros, roadmap/coverage write-backs).
>
> **Grounding (verified 2026-06-15 against the live repo):** `main` branch protection requires the status
> checks `lint-and-typecheck` + `security-scan` (`strict: true`), `required_conversation_resolution: true`,
> and `enforce_admins: true`; **`required_pull_request_reviews` is `null`** (no approving review is required).
> Therefore the *only* PR-level human gate is **conversation resolution** — which is empty unless the review
> panel ran. The advisory `test-portal` job is `continue-on-error` and **not** a required check (a failing
> `test-portal` shows as `mergeStateStatus: UNSTABLE`, which is still mergeable).

## The classifier — what counts as "docs-only"

A PR is **docs-only** when **every** changed file is a non-application / process-or-docs file, i.e. it
touches **none** of the "application code" paths defined in `CLAUDE.md` § Main Session Rules.

- **Application-code paths (NOT docs-only):** `apps/**`, `packages/**`, `prisma/**`, `db/**`, `infra/**`,
  `.github/workflows/**`, `Dockerfile*`, `docker-compose*.yml`, and source/build/config files
  (`*.ts`/`*.tsx`/`*.js`/`*.mjs` outside docs, `tsconfig*`, `*.config.*`, `package.json`, lockfiles, `.env*`).
- **Docs-only paths:** `.planning/**`, `.requirements/**`, `.architecture/**` (prose/ADR/diagram docs),
  `.implementation/**` **docs** (`tasks/**` ledgers, `operations/**`, briefs, `*.md`), `.orchestration/**`,
  `.pr-review/**`, `.claude/**`, `CLAUDE.md`, any `**/*.md`, and memory files.

**Mixed PRs are application-code PRs.** If a single application-code file is touched, the whole PR takes the
application lane — never split a behavior change across lanes to dodge the panel.

> Edge cases worth stating: a change under `.github/workflows/**` (CI), a Dockerfile, or `package.json`/lockfile
> is **application/infra**, not docs — it takes the application lane even though "it's just config."

## Lane A — docs-only (the fast lane)

The default for sign-offs, ledger write-backs, retros, roadmap/coverage updates, ADR/requirement prose, and
agent/process-doc edits.

1. **Branch + PR for history** — never commit docs straight to `main` (audit trail + the required checks still
   run). Branch name `chore/<slug>` or `docs/<slug>`.
2. **Do NOT run the `/pr-review` panel.** The panel is for application code; running it on docs only creates
   review threads that then block the conversation-resolution gate for no benefit.
3. **Merge on green required CI** with a plain squash — **no `--admin`, no `enforce_admins` toggle, no
   approval:**
   ```
   gh pr merge <N> --squash --delete-branch
   ```
   Required checks (`lint-and-typecheck`, `security-scan`) must be green; a failing **advisory** check
   (`test-portal` → `UNSTABLE`) does **not** block. If `strict: true` makes the branch "out of date," update it
   (`gh pr update-branch <N>` or rebase) and re-merge.
4. The Conductor may do this **autonomously** as the closing step of a run (e.g. the Report-phase sign-off
   record PR) — a docs-only PR on green required CI is pre-authorized; it does not need per-PR user approval.

## Lane B — application code (the reviewed lane)

For any PR touching application-code paths (a delivery slice, a CI/infra change, a dependency bump).

1. **Run the `/pr-review` panel** (advisory, `event=COMMENT`) and **`/pr-fix`** for any actionable findings.
2. **Resolve the conversation threads before merge** — this is what actually clears the merge gate (not a
   protection toggle):
   - `/pr-fix` resolves the threads it addresses (its default).
   - Threads **dispositioned-as-intended** (e.g. an ADR-sanctioned design the project-agnostic panel flags) or
     deferred as tracked follow-ups are resolved **with a one-line rationale reply** citing the disposition.
   - With all threads resolved + required CI green (+ `required_pull_request_reviews: null`), the PR is
     `MERGEABLE` — merge with a normal `gh pr merge <N> --squash --delete-branch`. **No `--admin`, no
     `enforce_admins` toggle.**
3. **Protection is never silently relaxed.** If — and only if — a *genuinely required* gate cannot be satisfied
   by resolving threads / greening CI (e.g. a future `required_pull_request_reviews` with no available
   approver), that is a **user decision** (the Conductor surfaces it and stops; see `PHASES.md` Stop/defer
   matrix). Any temporary relaxation (e.g. lifting `enforce_admins`) is user-authorized, minimal, and
   **restored immediately** after the merge — and recorded in `STATE.md`.

## Why no protection change is needed

The friction in the EPIC-001 slice (#35) was **unresolved panel threads** + a needless `enforce_admins`
toggle — not a structural gap. With threads resolved and `required_pull_request_reviews: null`, both lanes
merge on green required CI with a plain squash. Keeping `enforce_admins: true` and the required status checks
intact preserves the guardrail for everyone; the lanes differ only in **whether the panel runs** and **how
threads get resolved** — process, not protection.

## Quick reference

| | Docs-only (Lane A) | Application code (Lane B) |
|---|---|---|
| Panel (`/pr-review`)? | No | Yes (advisory) |
| `/pr-fix`? | No | If actionable findings |
| Thread resolution before merge | N/A (no threads) | Required (fix-or-disposition-with-rationale) |
| Merge command | `gh pr merge <N> --squash --delete-branch` | same |
| `--admin` / `enforce_admins` toggle | Never | Never (only user-authorized exception, then restored) |
| Conductor autonomy | Auto-merge on green required CI | Merge after Review→Fix→threads-resolved; user-decision on a true governance gate |

## See also

- `CLAUDE.md` § Main Session Rules (the "application code" scope this classifier reuses).
- `.orchestration/PHASES.md` (Merge/Finalize) and `AGENT.md` (Merge/Finalize) — the Conductor applies this.
- `.pr-review/agents/fixer.md` — thread resolution is the fixer's responsibility for addressed comments.
- `.implementation/ENGINE.md` § Autonomy Ceiling — the engine's merge conditions (green required CI; the
  workflow-file LGTM carve-out for `.implementation/ENGINE.md|PHASES.md|AGENT.md|agents/**`).

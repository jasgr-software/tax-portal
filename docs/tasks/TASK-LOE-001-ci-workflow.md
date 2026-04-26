# TASK-LOE-001: GitHub Actions CI workflow with SQL Server service + auto-issue on failure

**Epic**: chore/lights-out-enablement (no EP-NNN — this is a workflow chore, not a feature epic)
**Status**: in-progress
**Assigned to**: devops
**Updated-by**: devops
**Depends on**: none
**E2e-required**: no
**Started-at**: 2026-04-26T00:00:00Z
**Completed-at**: —
**Complexity-estimate**: 2
**Complexity-actual**: —
**Affected flows:** none (justification: chore touches CI infrastructure, not user-facing behavior)
**Affected requirements:** none (justification: chore touches CI infrastructure, not SRS requirements)
**Introduces-gate:** yes
**Relevant ADRs:** ADR-002 (SQL Server in Docker for CI), ADR-006 (two-app workspace structure)

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — `pnpm lint` + `pnpm type-check` pass on the workflow + any related repo files
- [N/A] **Targeted e2e** — N/A (workflow chore, no UI)
- [ ] **Security review** — verify `gh issue create` token scope, no secrets in YAML, no command injection in `if: failure()` step
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Gate Authoring Rules evidence** is mandatory because `Introduces-gate: yes`. The Work Log must contain:
  1. **Run URL + specific job/step name** for each of the 4 jobs that ran green on this branch (a multi-job workflow URL alone is insufficient).
  2. **Named code path** the gate exercises. For `lint-and-typecheck` and `security-scan` this is real production-shape source (e.g., the workflow YAML itself, repo-root `package.json`, `pnpm-lock.yaml`). For `test-portal` / `test-admin`, since `apps/portal` and `apps/admin` do not yet exist, these two jobs land as **advisory** (`continue-on-error: true`) — the named code path will be filled in when Epic 001 promotes them to required (see § Implementation Notes).
  3. **Counterfactual** — one concrete change to each named code path that would red the named gate.
- Verify the `if: failure()` job's `gh issue create` invocation handles concurrent failures (idempotent label, deduplication on commit SHA, or accept duplicates with timestamp in title).
- Verify SQL Server service container uses `mcr.microsoft.com/mssql/server:2022-latest` per ADR-002 and matches the local-dev image.
- Verify the workflow does not run on PRs from forks (no fork PR convention here, but `pull_request` defaults to forks-blocked-from-secrets is acceptable).
- Cross-check `CLAUDE.md` § Required CI checks (branch protection) lists the same 4 job names this workflow exposes (`lint-and-typecheck`, `test-portal`, `test-admin`, `security-scan`). If CLAUDE.md is out of sync, reject.
- Cross-check the `## Submission Gate Commands` block in `CLAUDE.md` — the workflow's commands must mirror the documented gate commands; mismatch is a reject (developer would run a different gate locally vs. CI).

## Context

The lights-out enablement chore (PROGRESS.md `## Current initiative`, planning entry dated 2026-04-26) requires a CI workflow that exposes the 4 required status checks named in decision #1A. This unblocks branch-protection configuration (TASK-LOE-002) and is one of the three preconditions for the Autonomy Ceiling item-3 graduation predicate (`.claude/agent-stack.md` § Autonomy Ceiling item 3, predicate (a)).

Per the chore brief, the workflow also auto-creates a GitHub issue on CI failure (decision #2B), so the user is notified post-merge / post-CI even when away from the terminal.

SQL Server service container is required because Tier-2 unit/integration tests will exercise Prisma + RLS policies once Epic 001 lands. RLS integration tests and full e2e remain Tier 2 — they run as part of `test-portal`/`test-admin` against the service container, not as separate jobs.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.github/workflows/ci.yml` | Create | devops |

## Tests to Write First

There are no traditional unit tests for a CI workflow. Verification is via:

- [ ] Push the branch and observe the workflow run green on this commit. Capture the run URL.
- [ ] Confirm all 4 job names are visible in the GitHub UI (so they can be selected as required status checks in TASK-LOE-002).
- [ ] Confirm the auto-issue job runs only on `failure()` (test by introducing a deliberate red commit on a throwaway branch, observe the issue, then revert — capture the issue URL in the Work Log).
- [ ] Confirm SQL Server service starts and is reachable from the workflow runner (a `sqlcmd -Q "SELECT @@VERSION"` step or equivalent before the test jobs).

## Implementation Notes

### Workflow shape

Single workflow file `.github/workflows/ci.yml` with these jobs:

1. **`lint-and-typecheck`** (required) — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm type-check`. Runs on `ubuntu-latest`, Node 20.
2. **`test-portal`** (advisory until Epic 001) — runs `pnpm --filter portal test`. **Use `continue-on-error: true` initially.** When Epic 001 lands `apps/portal` with real tests, that epic's Plan promotes this job to required (and provides Gate Authoring Rules evidence for the promotion at that time). Until then, this job structurally skips (filter matches no package) and reports green; the `continue-on-error` belt-and-braces protects against "filter matches no package = exit 1" pnpm behavior across versions.
3. **`test-admin`** (advisory until Epic 001) — same shape as `test-portal`, with `--filter admin`. Same advisory rationale.
4. **`security-scan`** (required) — runs `pnpm audit --audit-level=high` (fail on high+critical) + a SAST step. For SAST start with **CodeQL default setup for JavaScript/TypeScript** (zero-config: `github/codeql-action/init@v3` + `github/codeql-action/analyze@v3`). Alternative: `trufflehog` for secret scanning if CodeQL setup proves heavyweight for this stage. Document the choice in the Work Log with rationale.

### SQL Server service container

```yaml
services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    env:
      ACCEPT_EULA: "Y"
      SA_PASSWORD: ${{ secrets.CI_SA_PASSWORD || 'CIPlaceholderPwd!' }}
    ports:
      - 1433:1433
    options: >-
      --health-cmd "/opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P ${SA_PASSWORD} -Q 'SELECT 1' -No"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 10
```

Attach to `test-portal` and `test-admin` jobs only (lint+typecheck and security-scan don't need DB). If `CI_SA_PASSWORD` secret is not set, fall back to `CIPlaceholderPwd!` (not a real secret — meets SQL Server password complexity rules and is documented as CI-only). Document the secret-setup procedure in the runbook (TASK-LOE-002 scope: cross-link).

### Auto-issue on failure (decision #2B)

A separate job `report-failure` with `if: failure() && github.event_name == 'push' && github.ref == 'refs/heads/main'`. Runs after the 4 jobs; uses `needs:` to wait for them. Body of the issue:

```bash
gh issue create \
  --label ci-failure \
  --title "CI red on main: ${{ github.sha }}" \
  --body "Workflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\n\nFailing jobs: see run page.\n\nAuto-created by .github/workflows/ci.yml — close after fix lands."
```

Constrain to `main` so PR red-checks don't spam issues (the PR itself surfaces failures inline).

### Permissions

Workflow needs `contents: read` and `issues: write` (for `report-failure`). Use a minimal `permissions:` block at workflow scope; do not rely on default permissions.

### Triggers

`on: [push, pull_request]` — push covers main and feature branches; pull_request covers PR validation.

### Why `test-portal` / `test-admin` are advisory at landing

`apps/portal` and `apps/admin` do not exist in the repo — Epic 001 scaffolds them. A required gate authored against a non-existent code path is exactly the failure mode `.claude/agent-stack.md` § Gate Authoring Rules guards against. Landing these as **`continue-on-error: true`** means the gate exposes the job name (so branch protection in TASK-LOE-002 can list it once apps exist) but does not enforce until the apps land. Epic 001's Plan phase explicitly promotes these to required and supplies Gate Authoring Rules evidence at that time.

This is the **Speculative/sandbox experiments** carve-out in the Gate Authoring Rules § Scope:
> non-required gates in an experimental workflow or a feature-flagged `continue-on-error: true` job. Promotion of such a gate to required triggers this rule.

### Coordination with TASK-LOE-002 (branch-protection runbook)

The runbook in TASK-LOE-002 captures `enforce_admins=true` and the 4-job required-checks list. Branch protection cannot be turned on with `test-portal` / `test-admin` in the required list until they are no longer `continue-on-error`. The runbook documents: (a) day-one configuration with only `lint-and-typecheck` + `security-scan` required, (b) Epic 001 close-prep adds `test-portal` + `test-admin` to the required list. Cross-link this task ID in the runbook.

## Definition of Done

- [ ] `.github/workflows/ci.yml` exists with the 4 jobs + `report-failure` job
- [ ] `pnpm lint` and `pnpm type-check` pass on this branch (these jobs structurally exercise the workflow YAML + repo-root configs)
- [ ] CI workflow run on this branch is green; run URL in Work Log
- [ ] SQL Server service container starts successfully on the workflow runner; verification step output in Work Log
- [ ] `report-failure` job verified to run on `failure()` only (with run URL of a deliberate-red throwaway branch capture, then reverted)
- [ ] Gate Authoring Rules evidence in Work Log per § SDET Review focus areas
- [ ] CLAUDE.md § Required CI checks already lists the 4 job names (verified consistent — no edit needed unless drift detected)

---

## Work Log

- 2026-04-26 [devops] Starting implementation — create `.github/workflows/ci.yml` with 4 jobs (`lint-and-typecheck`, `test-portal`, `test-admin`, `security-scan`) + `report-failure` auto-issue job; fix CLAUDE.md § Required CI checks drift (`test-web` → correct two-app job names) | What's next: create `.github/workflows/ci.yml` | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

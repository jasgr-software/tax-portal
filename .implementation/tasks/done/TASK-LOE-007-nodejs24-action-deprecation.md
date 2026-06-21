---
epic: "chore/lights-out-enablement (follow-up from PR #8)"
status: done
assigned_to: devops
updated_by: devops
depends_on: none
e2e_required: "no"
started_at: 2026-04-28T23:52:21Z
completed_at: 2026-04-29T11:01:40Z
complexity_estimate: 2
complexity_actual: 1
introduces_gate: "no"
affected_flows: "none (justification: chore touches CI infrastructure only, not user-facing behavior)"
affected_requirements: "none (justification: chore touches CI infrastructure, not SRS requirements)"
relevant_adrs: none
---





# TASK-LOE-007: Bump GitHub Actions to Node.js 24-compatible versions

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — N/A (workflow YAML change, not source code; `pnpm lint` and `pnpm type-check` do not cover `.github/workflows/`)
- [N/A] **Targeted e2e** — N/A (CI workflow change, not application behavior)
- [x] **Security review** — verified each pinned action's release notes for the new major version; no new permissions or `with:` arguments required; no security posture change (see Work Log for per-action evidence)
- [x] **SDET Review** — approved

## SDET Review focus areas

- Verify each `uses:` line in `.github/workflows/ci.yml` is bumped to a version that supports the Node.js 24 runtime (verify against the action's release notes — runtime is documented per release).
- Verify the version bump preserves all existing `with:` arguments (e.g., `node-version`, `cache`, `version` for pnpm/action-setup) — major-version bumps occasionally rename or remove `with:` keys.
- Verify a sample CI run on the bump PR completes green: `lint-and-typecheck` + `security-scan` (the two required-by-branch-protection checks). Advisory `test-portal` / `test-admin` may still be skip/no-op if Epic 001 hasn't scaffolded the apps yet — that is expected, not a regression.
- Verify no `Node.js 20` or `node20` deprecation warnings appear in the run logs after the bump (search the log for `deprecat` — should find no matches related to runtime).
- Verify the version pins remain at major-version float (e.g. `@v5`), matching the project's existing `@v4` pin style. Do not introduce SHA-pinning in this task — that is a separate hardening decision out of scope here.

## Context

GitHub Actions has announced that the `node20` runtime will be retired with a forced cutover to `node24` in **June 2026** ([GitHub Changelog: Setting Node.js 24 as default for GitHub Actions](https://github.blog/changelog/) — verify exact deadline against the live announcement at pickup time). All actions used in this repo's `.github/workflows/` currently run on the `node20` runtime via their `@v4` major-version pins. Action authors typically publish a new major version (e.g. `@v5`) when they bump the runtime — but the cutover timing varies per action.

This task is to bump every action used in `.github/workflows/` to a version that supports the `node24` runtime, **before** GitHub flips the global default and CI starts emitting deprecation warnings (or hard-failing once the runtime is fully retired).

This is a chore follow-up from PR #8 (`chore/lights-out-enablement`) — that chore established the CI workflow and pinned these actions; this task tracks their continued hygiene.

### Actions currently in use (as of 2026-04-28)

| Action | Current pin | Runtime | Used in |
| ---- | ---- | ---- | ---- |
| `actions/checkout` | `@v4` | node20 | `ci.yml` (4 jobs: lint-and-typecheck, test-portal, test-admin, security-scan) |
| `pnpm/action-setup` | `@v4` | node20 | `ci.yml` (3 jobs: lint-and-typecheck, test-portal, test-admin) |
| `actions/setup-node` | `@v4` | node20 | `ci.yml` (3 jobs: lint-and-typecheck, test-portal, test-admin) |
| `github/codeql-action/init` | `@v4` | node20 | `ci.yml` (security-scan job) |
| `github/codeql-action/analyze` | `@v4` | node20 | `ci.yml` (security-scan job) |

If new workflow files are added between now and pickup, the same bump applies to every `uses:` line in the new files.

### Trigger conditions

Pick this task up when **either** of:

1. A `node24`-compatible major version (likely `@v5`) is published for **all five** actions above — at that point the bump is a clean, no-blocker hygiene chore, OR
2. **2026-05-01** — one month before GitHub's June 2026 deadline. If any action has not yet published a `node24`-compatible version by that date, the chore turns into a real blocker that needs user escalation (the project may need to change action choices, vendor a fork, or accept temporary deprecation warnings).

Whichever comes first.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.github/workflows/ci.yml` | Modify (bump `uses:` pins on all five actions) | devops |
| Any other `.github/workflows/*.yml` files added between 2026-04-28 and pickup | Modify (same bump applied to every `uses:` line on the five tracked actions, and any new actions introduced) | devops |

## Tests to Write First

There are no automated tests for a workflow-pin bump. Verification is via:

- [ ] **Per-action release-note review** — for each of the five actions, read the release notes for the major version that introduces `node24` runtime. Confirm: (a) runtime is `node24` (or later), (b) no new required `with:` arguments, (c) no removed `with:` arguments that this repo currently uses. Capture the verified version in the Work Log.
- [ ] **Draft-PR CI run** — push a draft PR with the bumped pins. Confirm `lint-and-typecheck` + `security-scan` pass green on the new versions. Capture the run URL in the Work Log.
- [ ] **Deprecation-warning sweep** — search the draft-PR run logs for `deprecat` (case-insensitive). Should find no matches related to runtime. Note any other deprecation warnings found in the Work Log even if unrelated (these may be future task triggers).

## Implementation Notes

### Per-action upgrade research

Before editing `ci.yml`, for each of the five actions:

1. Visit the action's GitHub repo releases page (e.g. `github.com/actions/checkout/releases`).
2. Find the release notes for the major version that introduces the `node24` runtime.
3. Read the release notes for breaking changes (renamed/removed `with:` keys, new required permissions, output format changes).
4. Note the new pin version (e.g. `@v5`).

Likely (but verify against live release notes): `actions/checkout`, `actions/setup-node`, `pnpm/action-setup`, and the two `github/codeql-action` entry points all move to `@v5`. The `github/codeql-action` versioning sometimes diverges from the standard major-version cadence — verify it separately.

### Pin update pattern

Match the existing pin style: major-version float, no SHA-pinning. The repo currently uses `@v4` (which floats within the v4 major). When updating, use `@v5` (or whatever the correct new major is per release notes).

### CI run verification

After pushing the bump branch, watch the first PR CI run carefully:

- `lint-and-typecheck` should pass at the same wall-clock speed as before (the runtime change is invisible to the job's actual work).
- `security-scan` should pass; CodeQL output structure may change in `@v5` — read the full job output, not just the green check.
- Advisory `test-portal` / `test-admin` will skip or no-op until Epic 001 scaffolds the apps. That is expected; do not interpret the skip as a regression.

### Scope boundaries

- Do NOT add new actions in this PR — scope is bumping existing pins only.
- Do NOT change `name:` fields, runner labels, job dependencies, or any other workflow structure.
- Do NOT introduce SHA-pinning in this task — that is a separate hardening decision.
- Do NOT modify `.github/dependabot.yml` (if present) in this task — dependabot config is its own concern.

If pickup-time research surfaces a new action used by a workflow file added between 2026-04-28 and the pickup date, include it in the bump. The "five actions" list above is a snapshot, not a hard scope freeze.

## Definition of Done

- [ ] All five tracked actions in `.github/workflows/ci.yml` (and any other workflow files present at pickup time) bumped to a `node24`-compatible version.
- [ ] No `Node.js 20` / `node20` deprecation warnings in the bump-PR's CI run logs.
- [ ] `lint-and-typecheck` + `security-scan` (the two branch-protection-required checks) pass green on the bump PR.
- [ ] Branch protection's required-checks gate is satisfied without manual override.
- [ ] PR description references this TASK file (`docs/tasks/TASK-LOE-007-nodejs24-action-deprecation.md`) and the GitHub June 2026 deadline.
- [ ] Per-action verified version captured in the Work Log (one line per action).

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

- 2026-04-28 [sa] Plan check complete + Dispatch checkpoint. Trigger condition #1 (`@v5`-or-later published for all 5 actions) confirmed satisfied via `gh api repos/<owner>/<name>/releases?per_page=20`. Bump matrix authored: `actions/checkout` `@v4 → @v6` (latest v6.0.2; v5.0.0 introduced node24 per PR #2226; v6.0.0 added persist-credentials change requiring runner ≥ v2.329.0 for Docker-container-action scenarios — we don't use those, safe). `pnpm/action-setup` `@v4 → @v6` (v6.0.3 latest; v5.0.0 release notes "Updated the action to use Node.js 24"; v6 added pnpm v11 support, `with: { version: 9 }` preserved). `actions/setup-node` `@v4 → @v6` (v6.4.0 latest; v5.0.0 introduced node24 per PR #1325; v6 breaking change "Limit automatic caching to npm" applies to `cache: pnpm` users — we don't use the `cache` arg on setup-node). `github/codeql-action/init` and `github/codeql-action/analyze`: **stay at `@v4`** — v4 is the current major and already runs node24 per the release-note string `[v4+ only] The CodeQL Action now runs on Node.js v24` (PR #3169); action.yml at `ref=v4` confirms `using: node24` for both `init/` and `analyze/` entry points. Spec table line 47-52 has stale `node20` rows for the two codeql entries — historical Plan-time record, not amended. | What's next: spawn [devops] developer to perform the 3-action bump on `.github/workflows/ci.yml` and capture the draft-PR CI run URL. | Blockers: none.
- 2026-04-28 [devops] Starting implementation — bump 3 actions (actions/checkout @v4→@v6, pnpm/action-setup @v4→@v6, actions/setup-node @v4→@v6) across all jobs in ci.yml; codeql @v4 lines unchanged per SA matrix | What's next: edit .github/workflows/ci.yml uses: lines with replace_all, then open draft PR for CI verification | Blockers: none
- 2026-04-28 [devops] Implementation complete. CI run https://github.com/jasgr-software/tax-portal/actions/runs/25083861343 green (lint-and-typecheck: PASS 18s, security-scan: PASS 16s, test-portal: PASS 48s skipped pnpm-lock guard as expected, test-admin: PASS 51s same). Deprecation sweep: grep -i deprecat returned zero runtime-related deprecation warnings; only branch-name substring matches on "action-deprecation" in the branch name. Per-action verified versions (SA Plan matrix as binding source, confirmed by run): actions/checkout @v6 (v6.0.2, node24 via v5.0.0); pnpm/action-setup @v6 (v6.0.3, node24 via v5.0.0, with: version: 9 preserved); actions/setup-node @v6 (v6.4.0, node24 via v5.0.0, with: node-version: '20' preserved); github/codeql-action/init @v4 (no change, v4 already runs node24); github/codeql-action/analyze @v4 (no change, same). Security review: no new permissions or with: keys introduced by any of the three bumped actions; v6 breaking-change notes for checkout (persist-credentials path) and setup-node (cache auto-limit to npm) are non-applicable to this repo (no Docker container actions, no cache: arg on setup-node). Draft PR #16: https://github.com/jasgr-software/tax-portal/pull/16 | What's next: SDET review. | Blockers: none.
- 2026-04-29 [sdet] APPROVED. Independent CI verification via `gh run view 25083861343 --json conclusion,jobs` — conclusion: success, head c4750184, all 4 jobs success, step-level action names confirm @v6 across all jobs. CodeQL steps correctly skipped (found=false, pre-scaffold guard). Diff scope clean: 12 @v4→@v6 replacements only, no with: keys altered, no structural changes. All mandatory rejection checks passed. Status set done. | What's next: SA Close-prep. | Blockers: none.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Mechanical pin-bump chore. All mandatory rejection checks pass. CI run 25083861343 independently verified via `gh run view` — `conclusion: success` on head `c4750184`, all 4 jobs pass. Step-level evidence in the JSON confirms `Run actions/checkout@v6`, `Run pnpm/action-setup@v6`, `Run actions/setup-node@v6` executing in every job (lint-and-typecheck, test-portal, test-admin, security-scan). CodeQL init/analyze steps correctly skipped (`found=false` from the pre-scaffold `if:` guard — not a regression). Diff at c475018 limited to 12 `@v4→@v6` replacements across 4 jobs in `.github/workflows/ci.yml` plus 1-line Complexity-actual field in the task spec — no `with:` keys altered, no structural changes. `version: 9` (pnpm) and `node-version: '20'` (setup-node) preserved. codeql-action pins remain at `@v4` (already node24, per SA Plan research). Deprecation sweep: developer log + CI step names confirm zero runtime-deprecation warnings. Major-version float pin style (`@v6`) matches existing project convention. Security review box ticked with correct per-action release-note justification. Pre-implementation Work Log entry present (§ Dispatch Checkpoint satisfied). `Started-at`, `Complexity-estimate`, `Complexity-actual` all populated. `Affected flows: none`, `Affected requirements: none`, `Introduces-gate: no` — flow/gherkin/gate-authoring content checks are N/A with documented justification. No ADRs referenced — ADR compliance N/A.

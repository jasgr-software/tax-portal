# Progress

> Single source of truth for current initiative state, quality gates, active bugs, and retro action items. The SA, RA, and SDET update this file at the start and end of every invocation. Structure contract: see `.claude/agent-stack.md` § PROGRESS.md structure contract.

## Current initiative

**Name:** chore/task-loe-007-nodejs24-action-deprecation
**Branch:** `chore/task-loe-007-nodejs24-action-deprecation` (off `main` at `483c60e` — the PR #15 Close-finalize sweep commit rides along with this PR)
**Goal:** Bump GitHub Actions used in `.github/workflows/ci.yml` to `node24`-compatible majors before the GitHub June 2026 deadline. Single-task chore.
**Phase:** Plan → Dispatch
**Gated:** yes (`.github/workflows/` is a gated path)
**Epic-type:** chore (single-task hygiene; no SRS surface)
**Epic-deploys:** no (CI workflow change, no runtime stack)

| Task | Status | Assignee | Notes |
| ---- | ---- | ---- | ---- |
| TASK-LOE-007 | backlog → in-progress (Dispatch) | devops | Pin bump on 5 actions in `ci.yml`. Plan check confirmed all 5 actions have node24-compatible majors published (trigger condition #1 satisfied). |

## Awaiting PR merge

_None._

## Active bugs

_None._

## Open retro action items

- **2026-04-20 — Dispatch Checkpoint rule-sunset check** (owner: Overwatch). Evaluate at the Close-prep retro of the third post-merge epic. If no task has cited § Dispatch Checkpoint as the rule that enabled mid-execution recovery, surface the rule for keep/revise/retire decision per `.claude/agent-stack.md` § Rule Sunset. Rationale: the rule was imported prophylactically from the upstream sibling repo; no tax-portal incident was observed at port time, so it must earn its keep on this codebase.
- **2026-04-20 — Gate Authoring Rules hotfix-exception promotion check** (owner: Overwatch). At the first hotfix epic that invokes the § Gate Authoring Rules "Hotfix urgency" exception (gate lands as `advisory` pre-evidence), confirm the promotion-back-to-required step actually happens once the incident resolves. Track from the hotfix task's Work Log and the follow-up task that carries the three-item evidence. Rationale: the exception is easy to invoke and easy to leave hanging — the promotion step is where the gate earns its "required" status back, and it needs an explicit check the first time the path is exercised.
- **2026-04-20 — `docs/architecture/model-behavior-notes.md` rot check** (owners: Overwatch, RA, SDET). After the next two quad reviews complete, evaluate whether Lens B (model-behavior lens) produced any cited entries into the notes file. If zero citations across two reviews, decide: (a) seed the file with the three candidate entries identified during the port review (`spec-shaped-green`, `breadcrumb-skip`, `gate-counterfactual-plausibility`), or (b) retire the Lens B requirement from `.claude/agent-stack.md` § Main Session Rules and remove the notes file. Rationale: the stub file's own rule is "observed failures, not speculative ones" — leaving it empty indefinitely signals the Lens B process isn't working; seeding it speculatively contradicts its charter. Two quad reviews is the forcing function for keep/seed/retire.
- **2026-04-28 — Narrow `check_pr_awaiting_merge_gate_verdicts` to epic-closing PRs only** (owner: SA, dispatch to devops). The check introduced in TASK-LOE-008 fires on every `## Awaiting PR merge` entry containing a `- **PR ` bullet — it does not discriminate epic-closing vs chore PRs. For this chore PR (#15) the four gate names had to be authored as `Container Smoke PASS / RA Validation PASS / SDET CI PASS / SDET Quality Parity PASS` even though Container Smoke is structurally N/A (no runtime stack) and SDET Quality Parity is structurally N/A (single-task chore). The cleanest fix is an explicit `Epic-close: yes/no` field on each `## Awaiting PR merge` entry, with the verifier narrowing to entries that have `Epic-close: yes`. Trigger: at the first epic-closing PR (Epic 001 close) the field becomes load-bearing; at the next chore PR after this one, the field would let the SA legitimately omit the four PASS markers. Discovered during TASK-LOE-008 Close-prep when this PR's own `## Awaiting PR merge` entry was the first to exercise the new check. Rationale: forcing chore PRs to author four gate-name markers (some of which are structurally inapplicable) trains the SA to "check the boxes" rather than running the gates — the rule should distinguish "gate not run" from "gate not applicable." Cross-reference: `.claude/agent-stack.md` § Autonomy Ceiling item 3 condition (d) and `scripts/validate-gates.sh:588-658`.
- **2026-04-28 — `Impl: devops` gated-path write permission default** (owner: SA / Overwatch). During TASK-LOE-008 Dispatch, the [devops] subagent was BLOCKED on `Edit`/`Write` to `scripts/validate-gates.sh` until `.claude/settings.json` was amended mid-task in commit `66343bc` to allow `Edit(scripts/**)` and `Write(scripts/**)`. The blocker delayed Dispatch by a session round-trip. Two corrective options worth retro consideration at the next [devops] task: (a) make `scripts/**` allow the default for the [devops] subagent context (the role is the devops developer; `scripts/` is its primary write surface), or (b) require the SA to pre-flight check writability of every file in `## Files to Create or Modify` before composing the spawn prompt, so a permission gap surfaces at Plan rather than mid-Dispatch. Decision deferred — surface at the first Close-prep retro of a multi-task devops-heavy epic (likely Epic 001 if it touches `scripts/` or `infra/`). Rationale: the incident is a concrete gate failure (Dispatch blocked), worth a tracked action item per § Retro Finding Classification.

---

### SA Plan + Dispatch — TASK-LOE-007 — 2026-04-28

**Start:** Drive TASK-LOE-007 (bump CI actions to node24-compatible majors) through Plan → Dispatch → Audit (likely vacuous) → Review → Smoke → Validate → Close-prep. Branch `chore/task-loe-007-nodejs24-action-deprecation` already created off `main` HEAD `483c60e` (the PR #15 Close-finalize sweep that rides along with this PR — branch protection blocks direct main pushes, so the sweep needs to ride a chore PR; bundling here is the cleanest path). Spec is fully Plan-complete from PR #11 — this invocation flips Status backlog → in-progress and dispatches the [devops] developer. Read: `.claude/agent-stack.md` (full), `.claude/agent-phases.md` (full), `agents/sa.md` (full), CLAUDE.md (full), task spec (full), PROGRESS.md (top + Close-finalize entry above), `.github/workflows/ci.yml` (full), `docs/architecture/C4.md` index, `docs/architecture/TENETS.md`, `docs/decisions/` listing. Phase-transition reflex executed: swept the prior SA Close-finalize session entry to `PROGRESS-ARCHIVE.md` (appended at line 905 onward), updated `## Current initiative` to TASK-LOE-007 chore.

**Actions (Plan check):**

- **Workflow file inventory verified.** `ls .github/workflows/` returns `ci.yml` only — the spec's "five actions" table at lines 47-52 still matches reality. `grep -nE 'uses:' .github/workflows/ci.yml` confirms 14 `uses:` lines: `actions/checkout@v4` ×4, `pnpm/action-setup@v4` ×4, `actions/setup-node@v4` ×4, `github/codeql-action/init@v4` ×1, `github/codeql-action/analyze@v4` ×1. All five actions still pinned at `@v4`. No workflow files were added since 2026-04-28; no spec table update needed.
- **Trigger condition #1 verified — SATISFIED for all 5 actions.** Per-action `gh api` release-notes scan:
  - `actions/checkout`: latest = `v6.0.2` (2026-01-09); `v5.0.0` (2025-08-11) introduced node24 per release-notes PR #2226 ("Update actions checkout to use node 24"); `v6.0.0` (2025-11-20) latest stable major (persist-credentials change to `$RUNNER_TEMP`, requires runner ≥ v2.329.0 for Docker container action scenarios — we don't use those, safe). **Bump target: `@v6`.**
  - `pnpm/action-setup`: latest = `v6.0.3` (2026-04-21); `v5.0.0` (2026-03-17) release notes verbatim "Updated the action to use Node.js 24"; `v6.0.0` added pnpm v11 support (we use `with: { version: 9 }` which is preserved). action.yml at `ref=v6` confirms `runs: { using: node24 }`. **Bump target: `@v6`.**
  - `actions/setup-node`: latest = `v6.4.0` (2026-04-20); `v5.0.0` (2025-09-04) introduced node24 per release-notes PR #1325 ("Upgrade action to use node24"); `v6.0.0` breaking change "Limit automatic caching to npm" — affects users of the `cache: pnpm` arg. **We don't use the `cache` arg on setup-node** (we use `pnpm/action-setup`'s separate cache, which defaults to `false` and we don't enable). action.yml at `ref=v6` confirms `runs: { using: 'node24' }`. **Bump target: `@v6`.**
  - `github/codeql-action`: latest = `v4.35.2` (2026-04-15); v4 IS the node24 major per release-note string `[v4+ only] The CodeQL Action now runs on Node.js v24` (PR #3169). action.yml at `ref=v4` for both `init/` and `analyze/` confirms `using: node24`. **The current pin `@v4` already floats to node24 — no bump required.** The spec table's `node20` row for the two codeql entries is **stale** (the codeql-action versioning diverges from the standard major-version cadence, as the spec foreshadows at line 91). Documenting this finding here; spec table not amended (it stays as the historical Plan-time record).
- **Bump matrix decision.** Three of five actions bump `@v4 → @v6`; two stay at `@v4` (codeql init + analyze, already on node24). All `with:` keys preserved (`version: 9` on pnpm setup, `node-version: '20'` on setup-node). No `cache` arg on setup-node, so the v6 cache-narrowing breaking change is non-applicable.
- **No escalation needed.** Trigger condition #1 satisfied for all 5 actions. Trigger condition #2 (2026-05-01 deadline) is 3 days out but moot since #1 is satisfied. The chore is a clean hygiene bump, no fallback or vendor-fork or workaround needed.
- **Quad review applicability check.** Per `.claude/agent-stack.md` § Main Session Rules / "Agent workflow file changes require quad review": quad review fires for changes to `agents/*.md` or `.claude/agent-stack.md`. Per § Gated Paths, `.github/workflows/` is a gated path requiring SA-orchestrated submission gate + SDET review, but the **quad review scope is narrower** than the gated-path scope — it covers only `agents/*.md` and `.claude/agent-stack.md`. CI workflow YAML changes are not in that narrower scope. **Quad review NOT required for this PR.** Standard SDET review path applies.
- **Cross-surface scoping.** Per CLAUDE.md § Platform-frontend scope, webapp-developer tasks default to both `apps/portal/**` and `apps/admin/**`. This task is `Assigned to: devops`, not webapp-developer; it touches `.github/workflows/ci.yml` only — no `apps/` content. Cross-surface scoping is N/A.
- **Plan-check exit conditions met.** Spec is Plan-complete with `Affected flows: none` + `Affected requirements: none` + `Introduces-gate: no` + `Relevant ADRs: none`. Branch created. Workflow file inventory matches spec. Trigger condition resolved. Bump matrix authored.

**Actions (Dispatch checkpoint):**

- Edit `docs/tasks/TASK-LOE-007-nodejs24-action-deprecation.md` atomically: `Status: backlog → in-progress`, `Updated-by: sa`, `Started-at: 2026-04-28T<UTC>` (filled at edit time), `Complexity-estimate: 2` (pin bump on 5 actions with release-note review; codeql-action divergence raised the question but didn't add real work since v4 already runs node24). Add Work Log "Starting Plan check + dispatch" entry for the SA. (Single Edit atomic.)
- Update PROGRESS.md `## Current initiative` (this file) to reflect this chore as the active initiative + add the task row. (This Write covers it.)
- Commit: `chore(plan): TASK-LOE-007 dispatch checkpoint + Plan finding`. Single commit covering the spec edits + PROGRESS.md.
- Spawn the [devops] developer subagent with the bump matrix (3 actions to v6, 2 actions to stay at v4), pointer to the spec, the Plan finding, the requirement to push for a draft-PR CI run and capture the run URL, and the reminder that base commit `483c60e` (PR #15 Close-finalize sweep) rides along untouched.

**End:** Plan check complete; trigger condition #1 satisfied; bump matrix authored. Proceeding to Dispatch checkpoint and [devops] spawn.

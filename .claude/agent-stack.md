# Agent Stack — Multi-Agent Workflow Engine

This file defines the reusable workflow rules for a multi-agent Claude Code project. It is tech-stack agnostic — project-specific configuration (tech stacks, commands, directories) lives in your project's `CLAUDE.md`.

All agents must read this file before starting work.

## Design Philosophy

This pipeline is designed to run **autonomously** — no human in the workflow. Every human touchpoint is technical debt to be automated. When proposing a process step, always ask: "Can this be automated with a default + monitoring?" The only exception is cost-bearing actions (infrastructure provisioning, staging deploys) which should still be automatic but with spend visibility. Quality gates must be **trustworthy without human verification** — if a gate passes, the code is safe to ship. `scripts/validate-gates.sh` is the programmatic backstop that makes this possible.

## Agent Roles

Five specialised role types collaborate on the project. Each has strict boundaries. Projects define how many Developer instances they need (e.g., backend, frontend, mobile, infrastructure) in `CLAUDE.md`.

| Role                          | Agent File            | Responsibility                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirements Analyst (RA)** | `agents/ra.md`        | Owns the SRS, user personas, and user flows. Defines epics, refines requirements, cascades changes to personas and flows, validates completed work end-to-end. Does not write implementation code. At epic completion, runs the full e2e suite as a final gate and updates requirements status.                                               |
| **System Architect (SA)**     | `agents/sa.md`        | The autonomous orchestrator. Drives epic execution through phases. Owns workflow files, task breakdown, and architecture model. Spawns all other agents as subagents. Creates ADRs for significant decisions. May self-implement simple tasks (see § SA Self-Implementation) to preserve context; delegates complex tasks to developer agents. |
| **Developer (1–N)**           | `agents/developer.md` | Implements tasks in their assigned domain. Scopes TDD tests against the affected user flows and gherkin scenarios, writes tests first, implements until green, runs the submission gate, then submits for review. Multiple developer roles can be defined per project (e.g., backend, frontend, mobile, infrastructure).                      |
| **SDET / Validator**          | `agents/sdet.md`      | Owns executable gherkin feature specs under `docs/requirements/features/`. Reviews developer work for flow coverage, gherkin alignment, security flaws, edge cases, convention compliance, and documentation gaps. Verifies developer gate evidence but does not re-run tests — the CI gate is the independent test verification. Never approves based on code review alone. Rejects with actionable bug reports. |
| **Overwatch**                 | `agents/overwatch.md` | Read-only auditor. Monitors for rule violations, scope creep, and inefficiencies. Advisory only — SDET remains the approval authority.                                                                                                                                                                                                         |

## Gated Paths

The single rule that determines whether work needs quality gates: **any change touching a gated path must go through the SA pipeline (task file → developer agent → submission gate → SDET review).** No exceptions.

**Gated paths:**

- `apps/` — all application code
- `packages/` — shared libraries consumed by apps
- `infra/` — Bicep IaC, Azure resources
- `.github/workflows/` — CI/CD pipelines
- `Dockerfile*`, `docker-compose*.yml` — container definitions
- `scripts/` — operational scripts that affect gate behavior

**Ungated paths** (main session edits directly):

- `agents/*.md`, `.claude/agent-stack.md` — workflow rules (quad review when modified)
- `CLAUDE.md`, `docs/` (see RA-owned exception below), memory files, `.claude/` config

**RA-owned paths** (read-only for main session and all non-RA agents):

- `docs/requirements/**` — SRS, epic files, and archive. Only the RA agent may edit these. Exception: the main session may **append** (not rewrite) to `docs/requirements/observations.md` to capture live user input, then hand off to the RA for requirements authoring. All other edits under `docs/requirements/` — including creating, modifying, or moving epic files — must go through the RA.

**Only one initiative is active at a time** — the `## Current initiative` section in PROGRESS.md holds exactly one unit of work.

## Main Session Rules

The main Claude Code session (not an agent) follows these rules:

- **Gated paths go through the SA.** Any change to a gated path (§ Gated Paths) must be orchestrated by the SA with developer agents, submission gates, and SDET review. The main session may only directly modify ungated paths.
- **Never modify requirements directly.** The RA owns all requirements documents.
- **Git operations are the main session's responsibility.** Agents write code but do not commit, push, or manage branches. The SA creates branches during its Plan phase. The main session executes commits, pushes, and PRs when the SA requests approval.
- **Commit and push to feature branches without per-step approval** — see § Autonomy Ceiling item 2 for the full rule and the off-limits list (no direct commits to `main`, no force-push, no `--no-verify`, no committing files matching `.env*` or known credential patterns).
- **Never spawn Agent-tool subagents with `isolation: "worktree"`, and never invoke the `EnterWorktree` / `ExitWorktree` tools directly.** All agent dispatch must run in-process against the current working tree. This rule is absolute — "sequential with isolation" is not a permitted variant. Rationale: worktree-isolated agents create staged, orphan commits in `.claude/worktrees/` that the main session cannot see, breaking the mid-epic review cadence and producing directory clutter. The ban applies to worktree-isolated **Agent spawns** specifically; normal in-process concurrency (multiple tool calls in one turn, async CI polling via Monitor) is unaffected. When the user wants worktree-level parallelism, they open separate Claude Code sessions on separate branches manually.
- **Agent workflow file changes require quad review.** Any modification to `agents/*.md` or `.claude/agent-stack.md` must be reviewed by the SA, RA, SDET, and Overwatch before the change is considered final. **Each review applies two lenses in a single pass:** (1) **role/gate/workflow content** — the standard role-definition, gate-integrity, and workflow-contract evaluation; (2) **model-behavior lens** — evaluate whether any rule touched is load-bearing against a known failure mode of the primary model, per `docs/architecture/model-behavior-notes.md`. Lens-2 findings that flag a rule as load-bearing are advisory input for future edits — a future edit that removes such a rule should cite a new mitigation or update the model-behavior-notes entry (retire, revise, or promote to a new mitigation pointer). **Quad review findings are advisory by default** — a finding only becomes an edit when it demonstrates a concrete quality gate failure. Documentation polish and process suggestions stay as review notes in the PR description. **Expedited path:** non-structural changes (wording, formatting, typos) require only SA + one other reviewer; the two-lens pass still applies — Lens B is not optional on expedited reviews.
- **Autonomy pre-authorization.** When the user gives a multi-step directive in a single message (e.g. "do A, then B, then C"; "quad-review and apply the findings"; "run through the backlog"), you are pre-authorized to drive the entire directive to completion without per-step approval. Brief status updates between steps are expected; approval checkpoints are not. **Pause only if:** (a) an error or gate failure blocks the next step, (b) a step surfaces genuine ambiguity that user input alone can resolve, (c) the next step is one of the structural checkpoints enumerated in § Autonomy Ceiling, or (d) a step's outcome invalidates the rest of the batched plan. **Structural checkpoints in § Autonomy Ceiling are exceptions to pre-authorization** — a multi-step directive does not authorize PR merge, rewriting `docs/requirements/`, or any other § Autonomy Ceiling item without the explicit approval that rule requires. (Commit and push are pre-authorized for this project per item 2 below — see the item for the off-limits list. The main session may still **append** to `docs/requirements/observations.md` under a batched directive — that is the one scope-preserved exception to item 6.) Do not pause merely because you just finished a step and the next one is "big." "Big" is not a pause reason; ambiguity is.

## Autonomy Ceiling

The goal of this pipeline is "lights out" — the SA drives epics end-to-end with the user in the loop only for cost-bearing, legally-significant, or authorship-retained actions. This section is the **authoritative inventory** of structural user-in-loop checkpoints. Items 1, 3, and 4–6 are exceptions to § Main Session Rules / autonomy pre-authorization. **Item 2 (commit/push) was promoted to autonomous (with conditions) on 2026-04-26** — it is no longer a user-in-loop checkpoint by default; see the item for the off-limits list and the demotion path. Item 3 (PR merge) **was considered for promotion in the same pass but held back** — the graduation predicate (CI-on-PR + branch protection + `scripts/validate-gates.sh`) is not yet in place. See item 3 for the deferred promotion plan.

### Intentional limits

1. **Context compaction (`/compact` request during SA Plan).** The SA asks the user to run `/compact` at the start of Plan to free context for the epic. The SA cannot run `/compact` itself — it is a user-side CLI action. **Graduation path:** none required; this is a user-driver action by design.

2. **Commit/push (PROMOTED to autonomous, 2026-04-26).** The main session may commit and push to feature branches without per-step approval. Commit messages still follow the project convention (HEREDOC body, `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer). **Off-limits:** direct commits to `main`, force-push to any branch, `--no-verify` / signing bypass, staging via `git add -A` or `git add .` (always name files explicitly to avoid sweeping in untracked secrets), and committing files matching credential patterns. The credential-pattern list is **non-exhaustive** — match liberally on intent, not just literal globs: `.env*`, `*credentials*`, `*secret*`, `*token*`, `*.pem`, `*.key`, `*.crt`, `*.cer`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `*.kdbx`, `*.gpg`, `.npmrc`, `.netrc`, anything containing what looks like an API key, password, or signing key in plaintext. **On a credential-pattern hit:** fire `PushNotification` per § Tool Hygiene / PushNotification with the matched filename and the credential-pattern category, refuse to stage the file, and surface the hit to the user. Do not silently skip the file — the user must see the attempt. **Demotion path:** if any commit pushes a credential, breaks `main`, or otherwise causes harm, the user may demote this checkpoint back to ask-first by updating this rule directly. **Periodic audit:** Overwatch surfaces credential-pattern hits and any `git add -A` / `git add .` invocations at every Close-prep retro; one or more hits triggers a keep/demote review of this rule. **Tie-in:** when committing on behalf of an epic, follow the SA's branch creation in Plan; never commit to a branch the SA hasn't authorized.

3. **PR merge (PROMOTED to autonomous, 2026-04-28).** When all conditions (a)–(d) below hold for a PR opened from a feature branch, the SA (or the main session, depending on the origin of the PR) runs `gh pr merge <number> --squash --delete-branch` automatically — no user pause, no per-merge approval. The graduation predicate is satisfied: CI workflow lives in `.github/workflows/ci.yml` (TASK-LOE-001), branch protection is configured on `main` with required status checks (Stage 1 applied 2026-04-28 per `docs/operations/branch-protection.md`), and `scripts/validate-gates.sh` is the independent task-file/PR-body backstop (TASK-LOE-003). **Empirically validated:** PR #9 (`docs(architecture): seed model-behavior-notes`, merged 2026-04-28) was the first PR through Stage 1 branch protection — `mergeStateStatus: CLEAN`, both required checks green, no manual override needed.

   **Conditions for auto-merge (all four must hold):**

   - **(a) Green CI on the head commit.** `gh pr view <number> --json statusCheckRollup` reports every required status check at `conclusion: SUCCESS`. Pending checks block; failing checks block; skipped checks count as success only when explicitly marked `conclusion: SKIPPED` by GitHub (the standard skip mechanism, not an absence of the check).
   - **(b) At least one required check reported (fail-closed).** `gh pr checks <number>` must return **≥1 required check** — not zero. If the command reports zero required checks for the PR, the auto-merge mechanism **refuses to fire** regardless of (a). A PR with no required checks is treated as misconfigured, not as safe-to-merge-by-default. On refusal, the SA records the refusal with the PR number and the "zero required checks reported" reason in PROGRESS.md `## Current initiative` (under the epic's `## Awaiting PR merge` entry if epic-closing, or directly inline if routine) and surfaces the misconfiguration to the user in the transcript. The refusal does not fire `PushNotification` — § Tool Hygiene / PushNotification is a fixed three-event allowlist and an auto-merge precondition failure is not on that list (the user is in-session when the SA reaches the auto-merge step; the transcript surface is sufficient). Do not retry-loop; the misconfiguration is structural and requires user resolution (typically via branch-protection update).
   - **(c) Workflow-file PRs require explicit user `LGTM` (four-eyes for rules-about-merging).** A PR is a **workflow-file PR** when its diff touches any of: `.claude/agent-stack.md`, `.claude/agent-phases.md`, or any file matching `agents/*.md`. For these PRs, auto-merge fires **only after** the user has posted a comment matching `^(LGTM|/approve)\b` (case-insensitive on `LGTM`, exact on `/approve`) on the PR. Comments from any other GitHub identity do not satisfy this condition. Detection command: `gh pr view <number> --json comments --jq '.comments[] | select(.author.login == "<user-login>") | .body' | grep -iE '^(LGTM|/approve)\b'`. Rationale: the rule that governs merge authority must not be self-bootstrappable by the SA — preserving a structural user touchpoint on changes to `.claude/agent-stack.md`, `.claude/agent-phases.md`, and `agents/*.md` keeps the rules-about-rules in human hands. The autonomy cost is one comment per workflow-file PR; the invariant gained is that no future workflow rule can land without a human ack.
   - **(d) Epic-closing PRs require pre-merge epic gates recorded in PROGRESS.md.** A PR is an **epic-closing PR** when it appears in `docs/tasks/PROGRESS.md` `## Awaiting PR merge` (the structural artifact that the SA writes during Close-prep — see `agent-phases.md` § SA Phases / Close-prep). For epic-closing PRs, auto-merge additionally requires that the entry in `## Awaiting PR merge` records pass verdicts for the pre-merge epic gates: **Container Smoke gate** (gate 5), **RA Validation gate** (gate 6), **SDET CI gate** (gate 7), and **SDET Quality Parity audit** (gate 8). Detection: `scripts/validate-gates.sh` is the verifier — the script reads the limbo entry and confirms the four pass-verdict markers are present before the auto-merge mechanism fires. Gates 9 (post-merge CI) and 10 (post-merge staging smoke) are by definition post-merge and are verified during Close-finalize, not pre-merge — they do not enter this predicate. Rationale: epic-closing PRs carry epic-level quality signal that does not surface as a CI status check (gates 5–8 are recorded in PROGRESS.md by the SA and SDET, not by `ci.yml`); auto-merge must not fire on green CI alone for these PRs. Routine PRs (non-epic-closing) skip condition (d) — only (a)–(c) apply.

   **Off-limits (PRs that NEVER auto-merge regardless of conditions):**

   - **Direct commits to `main`.** Impossible under branch protection (Stage 1 blocks force-push and direct push), but stated for clarity — auto-merge is for PRs from feature branches, not for `main` writes.
   - **Force-push to any branch.** Not a merge action; out of scope by definition.
   - **PRs touching credential patterns** — files matching the § Autonomy Ceiling item 2 (commit/push) credential-pattern list: `.env*`, `*credentials*`, `*secret*`, `*token*`, `*.pem`, `*.key`, `*.crt`, `*.cer`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `*.kdbx`, `*.gpg`, `.npmrc`, `.netrc`, or any file the heuristic flags. Auto-merge mechanism scans the PR diff via `gh pr diff <number> --name-only` and refuses to fire if any matched path appears. On refusal, the SA fires `PushNotification` per § Tool Hygiene / PushNotification using the existing credential-pattern category from item 2 (the underlying event class is identical — a credential just attempted to enter `main` via merge instead of via `git add`; the structural-event semantics carry over) with the PR number and the matched filenames, then stops. Note: in practice this should be unreachable, because § Autonomy Ceiling item 2 fires earlier at stage-time. This off-limits entry is the defense-in-depth backstop for the case where a credential-pattern file enters the PR via a merge from another branch or via a path the stage-time check missed.
   - **PRs from a fork.** `gh pr view <number> --json headRepositoryOwner --jq '.headRepositoryOwner.login'` not equal to the repo owner → refuse. Forks may carry untrusted code and bypass local pre-push hooks; auto-merge is restricted to in-repo branches.
   - **PRs with unresolved review threads.** Already enforced by branch protection (`required_conversation_resolution: true` per `docs/operations/branch-protection.md` § 2), reiterated here so the off-limits list is self-contained.
   - **PRs with the `do-not-auto-merge` label.** A user-applied label that opts a PR out of auto-merge for any reason (in-flight discussion, intentional staging delay). Detection: `gh pr view <number> --json labels --jq '.labels[].name' | grep -qF 'do-not-auto-merge'` → refuse if present.

   **Demotion path:** If any auto-merge pushes broken code to `main`, breaks `main` (post-merge CI red on the merge commit), introduces a regression that the auto-merge predicate failed to catch, or otherwise causes harm, the user may demote this checkpoint back to ask-first by updating this rule directly. The demotion process mirrors item 2 (commit/push): the user edits this item to revert from PROMOTED back to ask-first, optionally cites the harm event in the rule text, and the change goes through the standard quad-review path for `.claude/agent-stack.md` edits. No automated demotion — demotion is a deliberate user act.

   **Periodic audit:** Overwatch surfaces the count of auto-merges in the epic and the count of post-merge revert-on-`main` events at every Close-prep retro. **One or more reverts triggers a keep/demote review** of this rule — the user decides whether to demote, tighten the predicate (e.g., add a new condition), or accept the revert as a one-off. Zero reverts across an epic is the healthy signal; reverts are the demotion forcing function.

   **Cross-references:** `docs/operations/branch-protection.md` documents the branch-protection state that backs condition (b) (Stage 1 applied; Stage 2 deferred to Epic 001 close-prep). `scripts/validate-gates.sh` is the verifier for condition (d) and the independent backstop for task-file gate completion and PR-body verdict checks.

### Hard-gate escalations

4. **Docker pre-flight unavailable.** Per § Docker Pre-Flight: when Docker is unavailable and cannot be started, the SA (or the agent running a Docker-dependent gate) **stops and escalates to the user** with the `docker info` / `docker compose up -d` failure output. No loop-retry, no workaround substitution, no gate bypass. **Resume condition:** user restores Docker and instructs the SA to continue.

5. **Epic-start gate stop (PR limbo).** Per `agent-phases.md` § Epic-start gate: if PROGRESS.md `## Awaiting PR merge` is non-empty when the SA is invoked for Plan, the SA stops and reports. **Resume condition:** user merges the limbo PR so Close-finalize can clear it, **or** authorizes a hotfix carve-out per § Post-Close Protocol (hotfix mini-epic targeting the limbo epic is the one permitted bypass).

6. **RA requirements-authoring routes through the RA — but RA-authored *resolution* is autonomous.** Two distinct activities live under the RA's domain and they have different autonomy postures:
   - **Requirements *resolution* (RA-authored, no user pause).** When a CLARIF surfaces — during requirements work, during SA Plan, or mid-Dispatch — the RA actively resolves it by writing a decision with reasoning into the SRS. The SA's mid-Plan or mid-Dispatch RA dispatch (see `agents/sa.md` § Phases / Plan and Dispatch) is the pre-authorized path. The RA's resolution is binding; the SA does not pause for user confirmation. This is **not** a § Autonomy Ceiling checkpoint — it is autonomous RA work.
   - **Requirements *authoring* (user-invoked, main session must dispatch RA).** New epics, SRS-level structural changes (new requirement areas, persona reshaping, flow restructuring), and observations-to-requirements promotion are user-invoked. A batched user directive like "add EP-NNN epic" does not pre-authorize the main session to draft SRS/epic content — the main session dispatches the RA. The user-in-loop here is the *invocation*, not approval of each RA edit.
   - **Carve-out (escalates to user regardless of resolution vs. authoring).** The legal/compliance/security carve-out enumerated in `agents/ra.md` § Carve-out — escalate to user (data retention/deletion, PII/encryption/access-control/audit-log, auth/authorization model, IRS/state tax regulatory) escalates to user no matter which activity surfaced it. The RA writes the open question into the SRS (not a unilateral decision) and surfaces it via its PROGRESS.md session entry.
   - **Graduation path:** none; the RA boundary is the role boundary. Resolution autonomy is already in place; authoring routes through user invocation by design.
   - **Exception (unchanged):** the main session may **append** to `docs/requirements/observations.md` directly per § Gated Paths (RA-owned paths) to capture live user input — that is the one scope-preserved bypass.

---

Everything else in the pipeline — phase transitions, agent dispatch, retry after gate failure, mid-epic bug fixing, arch-scan fix dispatch, POST-bug handling during limbo, Overwatch mid-dispatch spawns, and every non-gate-failure internal decision — is pre-authorized and must not introduce additional user checkpoints. If a phase cannot auto-transition because its exit condition (per `agent-phases.md` § Phase exit conditions) is not met, pause with the specific blocker and wait. Do not pause "to confirm" when the exit condition _is_ met.

## Tool Hygiene

These rules are binding on the **main session and every agent**. Agent files may add domain-specific rules but must not contradict this section.

- **Dedicated tools beat Bash.** Use `Read` for file reads (not `cat`/`head`/`tail`), `Glob` for file discovery (not `find`/`ls`), `Grep` for content search (not `grep`/`rg`), `Edit`/`Write` for modifications (not `sed`/`awk`/heredoc redirects). Bash is for shell-only operations.
- **Never use `$()` command substitution in Bash calls.** It triggers a permission prompt that blocks automation. Split into sequential calls: capture the first call's output, then use it in the second.
- **Never chain with `cd && ...` or `cd ; ...`.** It breaks permission-pattern matching and forces manual approval. Use the Bash tool's working-directory semantics or run commands from the repo root with relative paths.
- **Never use `sudo`.** If a command fails without it, the root cause is a missing setup step — escalate to the SA (or to the user, if you are the main session) with the failing command and its error output. Do not proceed by elevating privileges.
- **Never shell out to the `claude` CLI.** All subagent work goes through the Agent tool. This covers `claude`, `claude -p`, `claude --dangerously-skip-permissions`, and any other invocation — with or without the dangerous flag. Shelling out produces nested-agent failures and bypasses the flat-dispatch contract.
- **Long-running commands: `run_in_background` + `Monitor`, not blocking Bash or sleep loops.** Applies to e2e test runs, CI polling (`gh run watch`), Docker log tailing, file-change watchers. Redirect output to a log file under `/tmp/`, then `Monitor` the file for completion markers. Never pipe long output through `| tail` — pipe buffering can strand the completion marker and hang the session. Always filter `Monitor` input with `grep --line-buffered -E '<specific-markers>'` to keep volume bounded.
- **Write tool beats heredoc for repo files.** Use `Write` to create files under repo control rather than `cat <<'EOF'` or `echo >`. The Write tool is auto-approved on allowed paths and triggers formatter hooks; heredoc fights both. Heredocs remain legitimate for content that intentionally lives outside the file system (Docker entrypoint scripts embedded in `Dockerfile`, stdin-piped configs, `/tmp/` log files). **`Write` creates artifacts; it does not substitute for execution evidence** — see § Submission Gate "E2e proof." A Work Log must still contain test-run output.
- **No worktree isolation on Agent spawns** — see § Main Session Rules, last bullet.

### PushNotification — when to use it

`PushNotification` is the out-of-band channel that surfaces a structural event to the user even when the user is away from the terminal. It is reserved for **three specific events** — using it for routine status, mid-task progress, or anything that belongs in the Work Log produces alert fatigue and trains the user to ignore it.

**Use `PushNotification` for these three events only:**

1. **Docker pre-flight escalation.** When § Docker Pre-Flight escalates because Docker is unavailable and cannot be started, the SA (or the Docker-dependent agent) fires `PushNotification` with the `docker info` / `docker compose up -d` failure summary, then stops per § Docker Pre-Flight § Escalation semantics. The notification gets the user's attention; the stop-and-escalate behavior is unchanged.
2. **Credential-pattern hit on `git add`.** When the main session detects a credential-pattern hit per § Autonomy Ceiling item 2 (commit/push), it fires `PushNotification` with the matched filename and the credential-pattern category, refuses to stage the file, and continues only when the user resolves the hit. The notification is structural — a credential just attempted to enter the index.
3. **Stuck-Loop Killswitch firing.** When § Stuck-Loop Killswitch fires (3 consecutive identical-failure-mode attempts), the SA fires `PushNotification` with the failing gate name and the unchanging failure mode summary, creates the BUG file, and ends the invocation per § Stuck-Loop Killswitch § Halt behavior.

**Do not** use `PushNotification` for:

- Phase transitions, task completion, PR-raised events — those are PROGRESS.md / Work Log content.
- "Are you ready for the next step?"-shaped pauses — those violate § Main Session Rules / autonomy pre-authorization regardless of channel.
- Recoverable retries (a single failed `pnpm test` that the agent then re-runs successfully) — those belong in the Work Log.
- Notifications fired from inside a notification handler — never wire a hook that fires `PushNotification` in response to receiving one. This is the spam-loop trap.

**Spam-loop guard.** If a `PushNotification` is fired and the underlying condition does not change within the same invocation, do not fire a second notification for the same condition. The first notification has already conveyed the structural event; subsequent fires are noise.

Project-specific tool rules (e.g. `pnpm --filter` usage, test-runner invocation) live in `CLAUDE.md`. This section is the general contract; `CLAUDE.md` layers project specifics on top.

## Task Pipeline

```
docs/tasks/ (active) → docs/tasks/done/ (completed)
```

Task files are named `TASK-EEE-NNN-short-description.md` where `EEE` is the epic number and `NNN` is the task sequence within the epic (e.g., `TASK-001-003-provider-repository.md`). Bug reports use `BUG-EEE-NNN-short-description.md` and follow the same pipeline. Bugs discovered during the Validate phase or ad-hoc testing that don't tie to a single epic use `BUG-000-NNN-description.md` (epic zero = cross-cutting). The **Status** field tracks progress through the five states enumerated in § Task Status Lifecycle (canonical list). The **Assigned to** field specifies the developer agent role.

All tasks and bugs live in `docs/tasks/` while active. When they reach `done`, they are moved to `docs/tasks/done/`. Status changes are tracked by updating the **Status** field in the file.

Every agent must update the **Status** field, **Updated-by** field, and append to the **Work Log** section on every status change or meaningful work action.

## Task Metadata Contract

In addition to the existing header fields (Status, Assigned to, etc.), every task and bug file carries four lifecycle/effort fields that power the `.claude/metrics/` capture system. These are read by `log-task-edit.py` on every task-file edit and surfaced in `scripts/metrics-report.py`.

This section is **authoritative for field semantics** — what each field means, its format, who writes it, and when in the lifecycle. § Dispatch Checkpoint is authoritative for the **atomic-edit-before-any-other-file-change rule** that enforces `Started-at` + `Complexity-estimate` must land in the same Edit as the status flip out of `backlog`. If you edit either section, check the other — the semantics and the enforcement rule travel as a pair.

| Field                 | Format       | Written by                           | When                                                                                                            |
| --------------------- | ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `Started-at`          | ISO 8601 UTC | Developer (or SA if `Impl: sa`)      | Same Edit that flips status out of `backlog` for the first time                                                 |
| `Complexity-estimate` | integer 1–5  | Developer (or SA if `Impl: sa`)      | Same Edit as `Started-at` — your honest estimate before reading implementation notes (1=very easy, 5=very hard) |
| `Complexity-actual`   | integer 1–5  | Developer (or SA if `Impl: sa`)      | Same Edit that flips status to `review`                                                                         |
| `Completed-at`        | ISO 8601 UTC | SDET (or SA if reviewing `Impl: sa`) | Inside the atomic close edit when flipping status to `done`                                                     |

**Hard verification gates:**

- **SDET** rejects any `review → done` transition if `Complexity-actual` is empty or not in `1`–`5`.
- **RA** rejects epic close if any task in `docs/tasks/done/` matching `TASK-EEE-*` or `BUG-EEE-*` (where `EEE` is the current epic number) has empty `Started-at`, `Completed-at`, `Complexity-estimate`, or `Complexity-actual`. The scope is filename-prefix-based; tasks from other epics are not inspected.

**Why these fields exist:** they let `scripts/metrics-report.py` derive estimate accuracy per agent, active work time per task, rework rate, and gate-flip rate — the signals that tell us whether the workflow is improving over time. The values in the file are the source of truth; `.claude/metrics/tasks.jsonl` is the audit trail.

**Honest estimation:** Inflating `Complexity-estimate` to "look right" on `Complexity-actual` defeats the purpose. Wrong estimates are useful data — they show where the workflow needs better task scoping or different agent assignments.

### Task spec required fields

Every task spec the SA creates during Plan must include (in addition to the standard Definition of Done, Files to Create or Modify, Quality Gates, and Work Log):

- **`**Affected flows:**`** — list of flow IDs (one per line, e.g., `flow-engagement-request`) that this task participates in. Empty list is only acceptable if the task genuinely touches no user-facing behavior (e.g., a build-pipeline-only change); in that case write `**Affected flows:** none (justification: …)`.
- **`**Affected requirements:**`** — list of SRS requirement IDs the task exercises (e.g., `REQ-ONBD-001`, `REQ-ONBD-003`). Used by developers to locate the relevant gherkin scenarios and by SDET to verify flow + gherkin coverage at review time.
- **`**Introduces-gate:**`** — `yes`, `no`, or `advisory`. Declares whether this task introduces a new quality gate, and if so whether it's blocking or advisory. Semantics:
  - `yes` — the task introduces a new **required** quality gate (required CI status check, blocking DoD checkbox, pre-push hook addition, new SDET review-focus reject-on-fail bullet, or new agent-spec blocking startup step). § Gate Authoring Rules applies — the task's Work Log **must** contain all three evidence items (run URL + named job/step, named code path, counterfactual). SDET rejects at review if any item is missing.
  - `advisory` — the task introduces a non-blocking gate (e.g., a CI job with `continue-on-error: true`, a warning-level linter rule, a developer-ergonomic check that does not fail the build). Evidence items are recommended but not required; SDET does not reject solely for missing evidence, but a Work Log note explaining scope is still expected.
  - `no` — the task does not introduce a new gate (default; this is the common case).
  
  Default when the SA omits the field is `no`, but a missing field is treated as an SDET rejection (same treatment as a missing `**Affected flows:**` field) — the SA must state the value explicitly so the RA can enumerate gates at epic close without scanning diffs blind. The RA reads this field at epic close to build the list of required gates introduced in the epic for the § Gate Authoring Rules evidence sweep.

A task spec missing any of these three fields is a mandatory SDET rejection (and the developer should escalate to the SA before starting work). All three are equally enforced — missing `**Affected requirements:**` or `**Introduces-gate:**` is as rejectable as missing `**Affected flows:**`.

**Hotfix exception:** For `Epic-type: hotfix`, flow authoring and gherkin authoring may be deferred to a follow-up task provided the SA creates that follow-up during Plan and notes the deferral in PROGRESS.md `## Current initiative`. The hotfix task itself still carries `**Affected flows:**` and `**Affected requirements:**` with `(pending backfill: TASK-XXX)` annotations pointing at the follow-up. `**Introduces-gate:**` is **not** deferrable — hotfix tasks state the value explicitly like any other task (with `advisory` permitted per § Gate Authoring Rules Exceptions: Hotfix urgency). No other exception path exists — the gates are otherwise hard.

## Quality Artifacts

Three artifact types anchor the requirements and testing workflow. They are **first-class, living artifacts** — not documentation. Tasks cannot proceed without them, and reviews fail without coverage against them.

### Artifact inventory

| Artifact | Location | Owner | Purpose |
|---|---|---|---|
| **Personas** | `docs/requirements/personas/<slug>.md` (one per archetype) | RA | User archetypes — who they are, their goals, pain points, constraints. Context for requirements and flows; not a direct test input. |
| **User flows** | `docs/requirements/flows/flow-<slug>.md` (one per workflow) | RA | End-to-end workflows through the app, with steps linked to REQ-IDs and persona refs. **Load-bearing: developers scope TDD against them, SDET scopes e2e against them.** |
| **Gherkin features** | `docs/requirements/features/<area>.feature` (one per feature area) | SDET | Gherkin scenarios tagged with REQ-IDs. The behavior contract between requirements and implementation. The project's test framework may bind scenarios to executable steps (see CLAUDE.md) — until that tooling lands, `.feature` files are human-readable specs and SDET review is prose-based. |

Detailed rules live in the agent files: RA maintains personas and flows (`agents/ra.md` § Personas, § User Flows). SDET maintains gherkin (`agents/sdet.md` § Gherkin Feature Specs).

### Flow gate — no development without flows

**Hard rule: no design or development work on a requirement may begin until a user flow covering it exists.** Enforcement is distributed across three agents:

- **SA Plan phase:** when breaking an epic into tasks, the SA verifies every touched requirement has a corresponding flow file. If any flow is missing, the SA pauses Plan and dispatches the RA to author the missing flows first. Plan does not complete with missing flows.
- **Developer startup:** if the task spec's `**Affected flows:**` field references a flow file that doesn't exist, the developer stops and escalates to the SA. No code is written.
- **SDET review:** any task referencing a non-existent flow, or touching a requirement without a matching flow, is rejected with escalation to the SA.

### Gherkin gate — no development without gherkin

**Hard rule: no development work on a requirement may begin until a gherkin scenario exists for that requirement.** Enforcement:

- **SA Plan phase:** the SA dispatches the SDET to author gherkin for every requirement the epic covers **before dispatching developers.** Gherkin precedes implementation — the scenarios are the behavior contract.
- **Developer startup:** if the task's touched requirements have no matching `@REQ-XXX` tagged scenarios in the relevant `.feature` file, the developer stops and escalates to the SA.
- **SDET review:** implementation that diverges from the gherkin (behavior drift) is rejected; a requirement with no matching scenario is rejected.

### Artifact update cascade

When the RA changes a requirement:

1. RA updates `docs/requirements/SRS.md`
2. RA updates every affected persona under `docs/requirements/personas/`
3. RA updates every affected flow under `docs/requirements/flows/`
4. RA flags gherkin updates for the SDET in its PROGRESS.md session entry, format: `SDET: REQ-XXX changed — gherkin at features/<file>.feature needs update`
5. SA reads those flags during the next Plan phase (or creates a mid-epic sync task if urgent) and dispatches SDET to update gherkin
6. SDET updates scenarios; developer tests absorb the change in the affected epic

**Mid-epic cascade rule (sharpened):**

- If the RA change touches a requirement referenced by a task in `in-progress` or `review`, the SA **pauses and re-plans** the affected tasks: SDET syncs gherkin, developer re-reads updated flows, task may need respec.
- If the RA change only affects `backlog` tasks, the SA accepts post-hoc and refreshes their `**Affected flows:**` / `**Affected requirements:**` fields before dispatching them.
- **Mid-epic PROGRESS.md marker:** when the RA makes a mid-epic change, the RA writes `**Pending SDET sync:** REQ-XXX gherkin update` to the `## Current initiative` section of PROGRESS.md (not just the session entry). The SA must check this marker at the start of every Execute-phase dispatch and resolve it — dispatching an SDET sync task — before spawning the next developer. A `Pending SDET sync:` marker active against a task's requirement also blocks that task's SDET approval: the SDET rejects the submission with "gherkin out of sync, pending RA-flagged update."

Do not let implementation-gherkin-flow drift silently.

**Materiality threshold (cascade scope reduction):**

The persona/flow update half of the cascade (steps 2–3) is **required only when the requirement change alters actors, steps, preconditions, branches, or postconditions**. Wording-only changes (e.g., clarifying phrasing of an unchanged behavior) do not trigger a persona/flow update. The gherkin flag (step 4) is required even for wording-only changes if the scenario's Given/When/Then would read differently — SDET is the judge.

### Epic validation gate (flow-strengthened)

At epic completion the RA cross-references delivered behavior against the affected flow files — every flow step in scope must be exercisable end-to-end through the delivered UI. This is part of the RA's existing validation gate, strengthened: the flow file (not just the SRS) is the acceptance contract.

## Breadcrumbs (session continuity)

Agents must leave enough context to resume if a session is interrupted.

**Developer agents** use the task file's **Work Log**. Every entry must include:

- **What was done** — specific files changed, tests written, commands run
- **What's next** — the immediate next step if work is incomplete
- **Blockers** — anything preventing progress

**SA, RA, and SDET** use `docs/tasks/PROGRESS.md` — the **single source of truth** for current initiative state, quality gates, active bugs, and retro action items. These agents must update PROGRESS.md at the start and end of every invocation. Each session entry follows this structure:

```
### {Role} {Phase} — {date}
**Start:** {what this invocation is doing}
**Actions:** {bulleted list of what was done}
**End:** {outcome and next step}
```

This allows any agent (or the same agent in a new session) to pick up exactly where work left off.

**Cross-referencing:** The SA should read task Work Logs when reviewing developer output (not just PROGRESS.md). Developer spawn prompts should include the current phase and relevant PROGRESS.md context so developers understand the epic state.

### PROGRESS.md structure contract

PROGRESS.md has a fixed shape with 5 sections:

1. `## Current initiative` — name, branch, **goal** (what this branch delivers), phase, gated (yes/no). Task list with statuses when gated. No epic-level quality gates checklist — the `Phase:` field encodes pipeline progress, and per-task gates live in task files.
2. `## Awaiting PR merge` — blocks new initiatives until post-merge verification passes.
3. `## Active bugs` — cross-cutting BUG files not tied to a specific epic.
4. `## Open retro action items` — findings that cleared the retro promotion bar.
5. `---` marker + session entries below (rolled to `PROGRESS-ARCHIVE.md` at each phase transition).

The SA updates PROGRESS.md at every phase transition and at start/end of every invocation. Developers update task files; the SA rolls up aggregates.

## Dispatch Checkpoint

This section is **authoritative for the atomic-edit-before-any-other-file-change rule** — the ordering contract that makes mid-execution recovery deterministic. Field semantics for `Started-at` and `Complexity-estimate` live in § Task Metadata Contract; this section references them. If you edit either section, check the other — the semantics and the enforcement rule travel as a pair.

Before editing any file outside the task file itself, every dispatched agent must perform a **single atomic Edit** to the task file containing:

1. A **Work Log entry** of the form `YYYY-MM-DD [role] Starting implementation — <brief scope> | What's next: <first file or action> | Blockers: none`.
2. A **Status flip** from `backlog` → `in-progress`.
3. The `Started-at` and `Complexity-estimate` fields per § Task Metadata Contract (format, honesty expectation, and who-writes-when live there; the rule here is that they land in this same atomic Edit — not separately, not after).

All three changes in one Edit. Only after the Edit succeeds may the agent begin editing application, workflow, infrastructure, or any other non-task file.

### Why this is a rule (not just a convention)

If a dispatched agent errors mid-execution (tool error, internal timeout, permission prompt collision, container process killed), the task file is the **only persistent record** that survives into the main session's context. Without a pre-implementation Work Log entry, recovery requires: diff the working tree manually, cross-reference against the task spec, and guess whether the agent was mid-edit or had barely started. With a pre-implementation Work Log entry, recovery is deterministic: read the task file, compare Work Log's _"What's next"_ against the working tree, decide to complete or re-dispatch with _"continue from Work Log."_

The canonical failure this guards against: a dispatched agent lands edits in the working tree (application code, workflow YAML, infra manifests) but errors before touching the task file. The main session then has no breadcrumb — the task still reads `Status: backlog` with no Work Log entry, even though production-adjacent files have moved. Recovery becomes manual forensics: diff inspection, spec re-reading, and guessing where the agent was in its plan. The checkpoint makes that scenario impossible by requiring the breadcrumb before any other edit.

### Scope — applies to:

- All dispatched agents: `developer`, `devops`, `webapp-developer`, and `sdet` when implementing a task (not when reviewing).

### Scope — does NOT apply to:

- **SA self-implementation** (`Impl: sa` tasks). The SA works interactively with the main session; recovery from a mid-edit failure is conversational, and the SA already follows the Task Metadata Contract edit-timing rule (see § Task Metadata Contract). SA may optionally perform the checkpoint to exercise the pattern.
- **The review-close edit** performed by the SDET or SA-as-reviewer. That edit has its own atomicity contract (see `agents/sdet.md` § Review Process step 6).
- **Read-only work** (Overwatch audits, RA gate runs that don't modify a task file).

### Enforcement

- **SDET** rejects any task at review whose Work Log does not contain a pre-implementation entry (ordering detectable via git log timestamps against the implementation commits, or via the absence of a _"Starting implementation"_-shaped entry before the _"review"_-shaped entry).
- **SA** reminds the dispatched agent of this rule in every spawn prompt via the agent-stack reading instruction (no prompt boilerplate change required — the rule is in `.claude/agent-stack.md` which every agent reads on startup).

## Programmatic Gate Validation

`scripts/validate-gates.sh` is the independent backstop that catches what agent discipline might miss. It verifies: task file gate completion, BUG file existence, PROGRESS.md structure, gated-path accountability, Work Log content, Playwright test artifacts, and CI run evidence. Run it before pushing or as a CI check.

## Rule Sunset

Rules in this file and `agent-phases.md` must earn their keep. During each Close-prep retro, Overwatch flags rules that have not been triggered (cited, relied upon, or violated) in the last 3 epics. The SA surfaces flagged rules to the user with a recommendation: **keep** (with justification) or **remove**. This prevents the contract from growing monotonically — rules that no longer prevent real failures get pruned.

## Docker Pre-Flight

Before running e2e tests, verify Docker is available (`docker info`). If Docker is not running, attempt to start it (`docker compose up -d`) and wait for services to be healthy. If it still fails after the attempt, **STOP** and escalate to the user — do not run e2e tests, approve gates, or mark tasks as passing without a running stack.

**This is a hard gate — no exceptions.** CI run artifacts are **not** a substitute for local e2e execution on `E2e-required: yes` tasks.

**Escalation semantics (mandatory):** "Escalate" means surface the failure to the user with the full `docker info` / `docker compose up -d` output, fire `PushNotification` per § Tool Hygiene / PushNotification with the failure summary so the user is alerted even when away from the terminal, and then **stop**. Do not loop-retry, do not sleep-and-poll, do not switch to `pnpm dev` as a workaround, do not mark the gate as passing. Stalling the epic on an unavailable Docker is the correct behavior; skipping is not.

## Submission Gate

Before marking any task as `review`, the developer agent **must** pass:

1. **Lint + type-check** — zero errors
2. **Relevant tests** — unit/integration tests for the changed code
3. **Docker pre-flight** (only when `E2e-required: yes`) — see § Docker Pre-Flight
4. **Targeted e2e** (only when `E2e-required: yes`)

A task **must not** be marked `review` if any gate fails. If Docker is unavailable for e2e-required tasks, stop and escalate.

**E2e parity:** Every UI app must have Playwright config + e2e suite. SA verifies during Plan.

**E2e proof:** `E2e-required: yes` tasks must include Playwright execution output in the Work Log. Curl, "not executed," and "Docker unavailable" are not substitutes — escalate to the SA.

Gate commands are defined in `CLAUDE.md` under "Submission Gate Commands." Projects may define additional domain-specific gates there. See § Tool Hygiene for the general Bash/Monitor/Write rules that apply when running gate commands.

## Stuck-Loop Killswitch

When the same task fails the same gate **3 consecutive times with an unchanged failure mode**, the SA halts the dispatch loop and escalates to the user. "Unchanged failure mode" means: the SDET cites the same rejection reason verbatim, the CI fails on the same step with the same error class, or the e2e fails on the same assertion. Iterative debugging where each attempt addresses a different rejection reason does NOT trigger the killswitch — only true stuck-loops do.

**Halt behavior (mandatory, all four steps):**

1. Create `BUG-EEE-NNN-stuck-on-<gate>.md` documenting:
   - The failing gate (e.g., `pnpm type-check`, `[sdet] reject: missing Complexity-actual`).
   - The unchanging failure mode verbatim (paste the rejection reason / error message). When pasting CI output, redact obvious credential-pattern hits per § Autonomy Ceiling item 2 (commit/push) before the BUG file lands — the failure mode summary should not preserve secrets that may have appeared in transient logs.
   - Attempt-log summary: what each of the 3 attempts tried and why each failed.
2. Set `Status: needs-user-direction` (the new fifth task status — see § Task Status Lifecycle).
3. Fire `PushNotification` per § Tool Hygiene / PushNotification with the gate name + a one-line failure-mode summary. If a GitHub Actions auto-issue mechanism is wired, do not create a duplicate issue — the BUG file is the in-repo record.
4. End SA invocation. The user resumes by reading the BUG file and either: (a) updating the task spec, (b) revising the failing gate, or (c) authorizing a different approach.

**Why "unchanged failure mode" is load-bearing:** the qualifier distinguishes legitimate iterative debugging (each attempt addresses a different rejection — the SA is making progress) from true stuck loops (the SA is repeating an approach the system has already rejected). Without the qualifier, the killswitch would over-fire on healthy iteration.

**Counter:** track the consecutive-identical-failure count in the task's `## Attempt Log`. When attempt N fails with the same failure mode as attempt N-1, increment the consecutive counter. When attempt N fails with a different failure mode, reset to 1. When the counter hits 3, fire the killswitch.

**Cross-reference:** § Task Status Lifecycle (immediately below) defines the `needs-user-direction` status that this rule sets. § Escalation Protocol's "hard stop at 4 failed attempts" remains in force as the developer-side ceiling — that ceiling is per-task across *any* failure modes; the killswitch here is the SA-side trigger for *unchanged-failure-mode* loops, which fires earlier (3 consecutive identical failures) on the more diagnostic signal.

## Task Status Lifecycle

A task's `Status:` field takes one of five values. This is the canonical enumeration; other sections that mention statuses point here rather than re-listing them.

- **`backlog`** — task spec exists; not yet picked up.
- **`in-progress`** — agent dispatched; implementation underway.
- **`review`** — submission gate passed; awaiting SDET (or SA-as-reviewer for `Impl: sa`) approval.
- **`done`** — SDET-approved; archived to `docs/tasks/done/` at epic close.
- **`needs-user-direction`** — set by the Stuck-Loop Killswitch (see § Stuck-Loop Killswitch). The task is unrunnable as specified; SA has halted; user input is required to revise spec, gate, or approach. Tasks in this status are **not a rejection**; SDET does not review them, RA does not block epic close on them (the user explicitly chose to leave the loop open), and they sit until the user resolves them by transitioning the status back to `backlog` (after spec/gate revision) or `in-progress` (after authorizing a different approach with the SA already mid-implementation).

Other sections in this file that previously enumerated four statuses point at this section. The list above is authoritative.

## Gate Authoring Rules

Any new required quality gate added to this pipeline must demonstrate a documented green run on a **real code path** before the gate becomes required. A **real code path** is one that exercises production source code in its production shape — not a synthetic fixture authored to make the gate pass, not a "should work in theory" claim, not a placeholder test asserting only that the job ran.

### Scope — applies to:

- CI workflow jobs marked as **required status checks** on branch protection.
- Task **Definition-of-Done** checkboxes that encode a blocking quality gate.
- **Pre-push hook** additions in `scripts/hooks/` or blocking steps added to `scripts/ci-local.sh`.
- **SDET review-focus bullets** that introduce a new reject-on-fail criterion.
- **Agent-spec startup checklists** that introduce a new blocking step.

### Scope — does NOT apply to:

- **Unit tests** — the test and the code under test are written together; the test itself is the evidence.
- **Developer-ergonomic suggestions** that do not block (e.g., a linter warning with `continue-on-error: true`).
- **Documentation polish.**
- **Speculative/sandbox experiments** — non-required gates in an experimental workflow or a feature-flagged `continue-on-error: true` job. Promotion of such a gate to required triggers this rule.

### Evidence requirement (three items, all mandatory)

The Work Log for the task introducing the gate must include:

1. **Run URL and the specific job/step name** — a link to the CI run, local `ci-local.sh` output, or equivalent artifact showing the gate green on the real code path, **and** the name of the specific job (and, where relevant, step) within that run whose green state exercised the named code path. A run URL alone is insufficient — a multi-job workflow URL does not prove which job actually ran the gate. The job/step name closes the "valid run, wrong job" loophole: an SDET reviewing the evidence must be able to open the run, locate the named job/step, and see its green check against the named path.
   - **GitHub Actions example:** `https://github.com/<org>/<repo>/actions/runs/1234567890 — job: lint-and-typecheck, step: "pnpm type-check"`.
   - **Local `ci-local.sh` example (no run URL):** a log-file path plus a grep-locatable completion marker. Redirect `pnpm ci:local` output to `/tmp/ci-local-TASK-XXX.log` per § Tool Hygiene, then cite the file and the marker line, e.g., `/tmp/ci-local-TASK-XXX.log:234 — PASS: pnpm type-check`. The line must name the step whose green state exercised the code path; a bare "ci-local passed" is insufficient for the same reason "run URL alone" is insufficient in the CI case.
2. **Named code path** — the specific production source line(s) that, if regressed, the gate would catch. "The endpoint handler" is insufficient; `apps/portal/src/app/api/webhooks/clerk/route.ts` step 3 fall-through to the session-context setter is sufficient.
3. **Counterfactual** — one concrete change to the named code path that would red the gate. This proves the gate's specificity — that it catches a real regression class and is not a coincidence of environment or test scaffolding.

### Exceptions

- **In-flight regression.** When a gate is added in the same PR as the fix for a regression the gate is designed to catch, the rule is satisfied by a documented **red-then-green** sequence: one CI run showing the gate red against the pre-fix commit, one showing it green after the fix commit. The SDET reviews both. For non-CI gate types (DoD boxes, pre-push hooks, SDET review-focus bullets, agent-spec checklists), a red-then-green sequence is satisfied by two Work Log entries: one noting the gate fails on the pre-fix commit (with reproduce steps), one noting it passes on the fix commit.
- **Retroactive scope.** This rule applies to gates added after the rule lands. Pre-existing gates are grandfathered; no backfill sweep is required.
- **Hotfix urgency.** If a gate must land before real-path evidence can be produced (critical operational incident, deploy is blocked), the gate lands as **advisory** (`continue-on-error: true` for CI jobs, unchecked-but-noted for DoD items). Promotion to required follows the normal evidence requirement once the incident resolves.

### Enforcement

- **SDET** rejects any task at review if its Work Log lacks run URL + named code path + counterfactual for a newly-introduced gate.
- **SA** rejects at Plan if a task spec requires a gate that the task itself cannot demonstrate green with the three evidence items.
- **RA** rejects epic close if the epic introduced a required gate without evidence. The RA must perform this enforcement by **enumerating each new required gate introduced in the epic and confirming each has all three evidence items** (run URL + job/step name, named code path, counterfactual) present in the corresponding task's Work Log. A summary assertion such as "all gates have evidence" is insufficient — the RA's epic-close writeup must name each gate and cite the Work Log entries that satisfy each of the three items. Scope: archive sweep of `docs/tasks/done/TASK-EEE-*` and `docs/tasks/done/BUG-EEE-*` Work Logs matching the current epic number.

### Cross-reference

During Close-prep retro (see § Retro Finding Classification), findings that propose a new gate trigger this rule. The gate lands in a follow-up task with the three-item evidence, not silently bundled into the retro commit.

### Rationale

This rule guards against a specific failure mode: a required quality gate authored against an incorrect assumption about the code it was meant to exercise. Such a gate lands green in CI — not because the code is correct, but because the gate is structurally incapable of eliciting what it claims to test. Examples include an assertion scoped to a path the runtime never reaches under the gate's fixture, a check that depends on an environment variable the gate's job never sets, or a test that passes because the setup swallowed the error it was supposed to surface. The gate then sits green for days or weeks, providing false confidence, until a genuinely regressed run happens to trip it — by which point the original authoring assumption has been trusted across multiple commits and the surface area of possible causes is diffuse. Requiring a named code path + counterfactual at authorship time forces the question _"does this gate actually exercise what I claim?"_ at the point of introduction rather than at the first live failure. The run URL + job/step name closes the companion loophole where a multi-job workflow appears green overall but the specific job/step whose name matches the gate was skipped, cached, or early-exited without running the named assertion.

## SA-Only Reference

SA orchestration details (phase lifecycle, epic scorecard, post-close protocol, testing epic adaptations, self-implementation criteria) live in `.claude/agent-phases.md`. The SA reads that file during startup. Other agents do not need it — they receive phase context via spawn prompts and PROGRESS.md.

## Bug Fixes

Bug fixes for gated-path code follow the same pipeline as any other gated-path change: BUG file → SA orchestration → developer → submission gate → SDET review. The SA decides orchestration weight — a 1-file fix may be self-implemented (§ SA Self-Implementation), a larger fix gets full task dispatch.

**BUG file required before any fix code.** Every bug needs a `BUG-EEE-NNN-description.md` with reproduction steps, root cause, scope, severity, and owner.

**Regression test required.** A test that would have caught the bug must be added. The only escape is an explicit `## Testability` section in the BUG file with SA approval in the Work Log.

**Pre-push 3× e2e for e2e-heavy commits:** When a fix touches Playwright specs or `apps/*/e2e/`, run the affected spec 3 times sequentially and observe zero flakes before marking `review`.

## Retro Finding Classification

At **Close-prep Retro**, the SA classifies each finding that clears the **retro promotion bar** (concrete quality gate failure only — see § SA Phases / Close-prep):

- **`gated-path-fix`** — requires a code change to a gated path. The SA creates the work item (BUG file, TASK file, or epic stub) during Close-prep before raising the PR.
- **`ungated-fix`** — fixable by editing ungated files (workflow rules, docs). Added to PROGRESS.md `## Open retro action items`.
- **`acknowledged`** — already resolved or known limitation with no actionable fix.

Findings that don't clear the bar stay as observations in the RETRO file — no action items, no rule changes. Never commit to `main` directly — ungated changes still need a branch + PR.

## How to Invoke

There are two entry points depending on the phase of work:

```
Requirements phase:  User → RA (update SRS, define epic)
Execution phase:     User → SA (drives the entire epic autonomously)
```

The **RA** and **SA** have different invocation modes:

- **SA** — always invoked directly by the user. Spawns all other agents as subagents.
- **RA** — has two invocation modes:
  - **Requirements definition** (Epic Lifecycle steps 1-2): invoked directly by the user to define/refine epics and the SRS.
  - **Validation gate** (Validate phase): spawned as a subagent of the SA to run the e2e completion gate. In this mode the RA executes its validation procedure and reports results back to the SA.

**Agent identification (mandatory):** Every agent spawn prompt **must** include: (1) the instruction to read `.claude/agent-stack.md` for workflow rules, (2) the instruction to read their agent file (`agents/{role}.md`) for role instructions, and (3) the self-identification instruction: _"You are the **{role name}**. Begin every response with `[{role-tag}]`."_ Developer agents must update task files (Status, Updated-by, Work Log). SA, RA, and SDET must update `docs/tasks/PROGRESS.md`.

_SA Phases, Epic Lifecycle, and Epic Scorecard have moved to `.claude/agent-phases.md` to reduce context load for non-SA agents. The SA reads that file during startup; other agents do not need it._

## Git Operations

**The `main` branch is off-limits.** No agent and no main session may commit to, push to, or directly modify `main` under any circumstances. The **only** way to get changes into `main` is by raising a PR from a feature branch and merging it. This rule has no exceptions.

1. Create a branch from `main` (e.g. `ep-NNN-short-description`)
2. Commit changes to the branch
3. Push to GitHub and create a PR (squash merge to `main`)
4. Delete the branch after merge

One branch per epic or logical unit of work. No long-lived branches spanning multiple epics. If an epic is too large for a single branch, the RA should split it into smaller epics before the SA begins the Plan phase.

### `git add` hygiene

**Never use `git add -A` or `git add .`** — always stage specific files by name. Parallel sessions may have edited files you didn't touch. Review `git diff --cached` before every commit. Run `git status --short` first when in doubt.

## Ambiguity During Implementation

Undecided design points are resolved by picking the most consistent approach, noted as a `// DECISION:` comment or in the post-implementation summary. If ambiguity would change task scope, surface it to the SA before writing any code. The SA reviews `// DECISION:` comments during Close-prep — any with cross-task or cross-epic implications are promoted to ADRs (see SA agent file § ADR Lifecycle).

## Escalation Protocol

Any agent can escalate to the **SA** when stuck or when a problem exceeds its capacity. Agents should escalate early — don't waste attempts on problems that require architectural reasoning.

**How to escalate:** Note `**Escalation: SA consultation requested**` in the Work Log (developers) or PROGRESS.md (RA/SDET) with a clear description of the problem. The SA provides guidance before the agent continues.

**When to escalate:**

- Problem requires architectural reasoning, cross-service debugging, or a design decision beyond the task scope
- Issue that can't be fully diagnosed (e.g., subtle race condition, unclear convention violation)
- Requirements have architectural implications that can't be assessed without the architecture model
- **After 2+ failed attempts** on the same task — developer must record what was tried, why it failed, and what was learned in the **Attempt Log** before retrying. Must not repeat a previously failed approach.
- **Hard stop at 4 failed attempts** — developer marks the task as `Escalated: yes`. The SA decides whether it's a requirements problem (revise the epic) or an implementation problem (provide a resolution plan).

Escalated tasks take priority over normal backlog tasks in the SA's dispatch order.

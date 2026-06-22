# Implementation Engine — Multi-Agent Workflow Rules

This file defines the reusable workflow rules for the implementation team. It is tech-stack **and**
process-agnostic: the team consumes a self-contained *build brief* and turns it into delivered, validated
code. Project-specific configuration (tech stacks, commands, directory assignments, gate commands) lives in
the project's `CLAUDE.md`. Where the brief lives and which upstream layers are available lives in
`.implementation/seed/sources.md`.

All roster agents must read this file before starting work.

## Design Philosophy

This pipeline is designed to run **autonomously** — no human in the loop for routine work. Every human
touchpoint is technical debt to be automated. When proposing a process step, ask: "Can this be automated with
a default + monitoring?" The only exceptions are cost-bearing or authorship-retained actions (see § Autonomy
Ceiling). Quality gates must be **trustworthy without human verification** — if a gate passes, the code is
safe to ship. `scripts/validate-gates.sh` is the programmatic backstop that makes this possible.

## What the team consumes — the build brief

The team's single required input is a **build brief** (`.implementation/_templates/build-brief.md` shape),
declared in `.implementation/seed/sources.md`. A brief is self-contained: it carries the **scope**, testable
**acceptance criteria**, an optional **methodology** block (TDD? gherkin scenarios? e2e? coverage?), optional
**acceptance scenarios**, and optional **soft references** to upstream layers (`.requirements/`,
`.architecture/`, `.planning/`).

Two principles govern how the team relates to everything outside the brief:

- **Altitude.** The team does requirements/design/planning **at per-implementation altitude** — clarify the
  brief into testable behavior, design the slice, decompose into tasks. It does **not** own product
  requirements, system architecture, or the roadmap; those are upstream layers it reads read-only (when the
  brief cites them) and never edits. Genuinely upstream decisions are *raised* via `OPEN-QUESTIONS.md`.
- **Methodology is input, not engine policy.** Whether the build uses TDD, gherkin/BDD acceptance scenarios,
  e2e, or a coverage bar is a requirement carried in the brief (canonically produced by `.planning/`). The
  engine is methodology-agnostic: it *executes* what the brief mandates and uses sensible defaults when the
  brief is silent. It never hard-codes gherkin or TDD as a gate.

## Agent Roles

Four role types collaborate. Each has strict boundaries. Projects define how many Developer instances they
need (e.g., backend, frontend, infrastructure) in `CLAUDE.md`.

| Role                              | Agent File                       | Responsibility                                                                                                                                                                                  |
| --------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implementation Orchestrator (IO)** | `.implementation/AGENT.md`    | The autonomous orchestrator. Ingests the brief; runs the slice through Clarify → Design → Decompose → Dispatch → Audit → Review → Smoke → Validate → Close. **Composes** dispatch prompts the main session executes (Claude Code does not support nested-Agent-from-subagent). May self-implement simple tasks. Records implementation decisions; raises architectural questions upstream — never authors system ADRs. |
| **Developer (1–N)**               | `.implementation/agents/developer.md` | Implements a task **per the brief's mandated methodology** (TDD if required, else a sensible default). Writes the executable tests that satisfy the acceptance contract, runs the submission gate, submits for review. |
| **SDET / Validator**              | `.implementation/agents/sdet.md` | Validates the slice against the **brief's acceptance criteria + its mandated test gates**. Reviews developer work for security flaws, edge cases, convention compliance, and gate evidence. Owns the container-smoke and CI gates. Binds gherkin to executable steps **only when the brief mandates that format**. Never approves on code review alone. |
| **Overwatch**                     | `.implementation/agents/overwatch.md` | Read-only auditor. Monitors for rule violations, scope creep, inefficiencies. Advisory only — SDET remains the approval authority. |

There is no Requirements Analyst in this team. Product requirements are upstream (`.requirements/`); the IO
does the team's slice-level clarification and the SDET owns slice-level validation.

## Gated Paths

The single rule that determines whether work needs quality gates: **any change touching a gated path must go
through the IO pipeline (task file → developer agent → submission gate → SDET review).** No exceptions.

**Gated paths:**

- `apps/` — application code
- `packages/` — shared libraries consumed by apps
- `infra/` — IaC / infrastructure definitions
- `.github/workflows/` — CI/CD pipelines
- `Dockerfile*`, `docker-compose*.yml` — container definitions
- `scripts/` — operational scripts that affect gate behavior

**Ungated paths** (main session edits directly):

- `.implementation/agents/*.md`, `.implementation/ENGINE.md`, `.implementation/PHASES.md`,
  `.implementation/AGENT.md` — workflow rules (quad review when modified — see § Main Session Rules)
- `CLAUDE.md`, `.implementation/` non-pipeline docs, memory files, `.claude/` config

**Upstream layers are read-only to this team** — `.requirements/`, `.architecture/`, `.planning/` are owned
by their own agents. The team reads them when a brief cites them and never edits them (it raises questions
back via `OPEN-QUESTIONS.md`).

**Only one initiative is active at a time** — the `currentBrief` field in `.implementation/state.json`
holds exactly one unit of work.

## Main Session Rules

The main Claude Code session (not an agent) follows these rules:

- **Gated paths go through the IO.** Any change to a gated path must be orchestrated by the IO with developer
  agents, submission gates, and SDET review. The main session may only directly modify ungated paths.
- **Upstream layers go through their own agents.** The main session does not author `.requirements/`,
  `.architecture/`, or `.planning/` content as part of an implementation run; those are separate layers with
  their own invocation.
- **Git operations are the main session's responsibility.** Agents write code but do not commit, push, or
  manage branches. The IO creates branches during Plan. The main session executes commits, pushes, and PRs.
- **Commit and push to feature branches without per-step approval** — see § Autonomy Ceiling item 2 for the
  full rule and the off-limits list (no direct commits to `main`, no force-push, no `--no-verify`, no
  committing files matching `.env*` or known credential patterns).
- **Never spawn Agent-tool subagents with `isolation: "worktree"`, and never invoke `EnterWorktree` /
  `ExitWorktree`.** All agent dispatch runs in-process against the current working tree. Rationale:
  worktree-isolated agents create orphan commits the main session cannot see, breaking the mid-pipeline
  review cadence. Normal in-process concurrency (multiple tool calls in one turn, async CI polling via
  Monitor) is unaffected.
- **Workflow-file changes require quad review.** Any modification to `.implementation/agents/*.md`,
  `.implementation/ENGINE.md`, `.implementation/PHASES.md`, or `.implementation/AGENT.md` must be reviewed by
  the IO, SDET, and Overwatch before the change is final, applying two lenses per pass: (1) role/gate/workflow
  content, and (2) a **model-behavior lens** — evaluate whether a touched rule is load-bearing against a known
  failure mode per `.implementation/model-behavior-notes.md`. Findings are **advisory by default** — a finding
  becomes an edit only when it demonstrates a concrete quality-gate failure. **Expedited path:** non-structural
  changes (wording, typos) need only the IO + one other reviewer; the two-lens pass still applies.
- **Autonomy pre-authorization.** When the user gives a multi-step directive in a single message ("do A, then
  B, then C"; "run through the backlog"), you are pre-authorized to drive it to completion without per-step
  approval. Brief status updates are expected; approval checkpoints are not. **Pause only if:** (a) an error
  or gate failure blocks the next step, (b) a step surfaces genuine ambiguity only the user can resolve, (c)
  the next step is a structural checkpoint in § Autonomy Ceiling, or (d) a step's outcome invalidates the rest
  of the plan. "Big" is not a pause reason; ambiguity is.

## Autonomy Ceiling

The goal is "lights out" — the IO drives the slice end-to-end with the user in the loop only for cost-bearing,
legally-significant, or authorship-retained actions. This section is the **authoritative inventory** of
structural user-in-loop checkpoints.

### Intentional limits

1. **Context compaction (`/compact` request during Plan).** The IO asks the user to run `/compact` at the
   start of Plan to free context. The IO cannot run `/compact` itself — it is a user-side CLI action.

2. **Commit/push (autonomous, with conditions).** The main session may commit and push to feature branches
   without per-step approval. **Off-limits:** direct commits to `main`, force-push to any branch,
   `--no-verify` / signing bypass, staging via `git add -A` or `git add .` (always name files explicitly),
   and committing files matching credential patterns. The credential-pattern list is **non-exhaustive** —
   match on intent: `.env*`, `*credentials*`, `*secret*`, `*token*`, `*.pem`, `*.key`, `*.crt`, `*.cer`,
   `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `*.kdbx`, `*.gpg`, `.npmrc`, `.netrc`, anything that looks like
   an API key/password/signing key in plaintext. **On a hit:** fire `PushNotification` with the matched
   filename and category, refuse to stage, and surface the attempt to the user — never silently skip.

3. **PR merge (autonomous, with conditions).** When all conditions (a)–(d) hold for a PR from a feature
   branch, the merge runs automatically (`gh pr merge <n> --squash --delete-branch`):
   - **(a) Green CI on the head commit** — every required status check at `conclusion: SUCCESS`. Pending or
     failing checks block; skipped counts as success only when explicitly `conclusion: SKIPPED`.
   - **(b) At least one required check reported (fail-closed)** — if `gh pr checks <n>` returns zero required
     checks, auto-merge **refuses** and the misconfiguration is surfaced. Do not retry-loop.
   - **(c) Workflow-file PRs require explicit user `LGTM`** — a PR touching `.implementation/ENGINE.md`,
     `.implementation/PHASES.md`, `.implementation/AGENT.md`, or `.implementation/agents/*.md` auto-merges only
     after the user posts a comment matching `^(LGTM|/approve)\b` on the PR. The rule that governs merge
     authority must not be self-bootstrappable.
   - **(d) Slice-closing PRs require pre-merge gates recorded in `state.json`** — a PR appearing in
     `awaitingMerge` in `.implementation/state.json` must have all four `gateVerdicts` slots filled (Container
     Smoke, SDET Validation, SDET CI gate, SDET quality audit) before auto-merge fires. `scripts/validate-gates.sh`
     check 9 (`check_awaiting_merge_records`) is the verifier via the independent oracle. Routine (non-slice-closing) PRs skip (d).

   **Off-limits (never auto-merge):** PRs touching credential-pattern files (scan `gh pr diff <n> --name-only`,
   refuse + `PushNotification` on hit), PRs from a fork, PRs with unresolved review threads, PRs labeled
   `do-not-auto-merge`. **Demotion path:** if any auto-merge harms `main`, the user demotes this checkpoint by
   editing this rule (standard quad-review path). **Periodic audit:** Overwatch surfaces auto-merge and
   post-merge-revert counts at each Close-prep retro; one or more reverts triggers a keep/demote review.

### Hard-gate escalations

4. **Docker pre-flight unavailable.** Per § Docker Pre-Flight: when Docker is unavailable and cannot be
   started, the agent running a Docker-dependent gate **stops and escalates** with the failure output. No
   loop-retry, no workaround, no gate bypass. **Resume:** user restores Docker.

5. **Slice-start gate stop (PR limbo).** Per `PHASES.md` § Slice-start gate: if `.implementation/state.json`
   `awaitingMerge` is non-empty when the IO is invoked for Plan, the IO stops and reports. **Resume:**
   user merges the limbo PR, or authorizes a hotfix carve-out.

6. **Brief-authoring is upstream.** A new build brief (its scope and acceptance criteria) is produced by the
   user or an upstream orchestrator (`.planning/`), not invented by the team mid-run. If a brief is missing,
   untestable, or contradicts itself in a way the team cannot resolve at slice altitude, the IO escalates to
   the brief author rather than authoring product requirements itself.

Everything else — phase transitions, dispatch, retry after gate failure, mid-slice bug fixing, Overwatch
spawns, and every non-gate-failure internal decision — is pre-authorized and must not introduce additional
user checkpoints. If a phase cannot auto-transition because its exit condition (per `PHASES.md`) is not met,
pause with the specific blocker and wait. Do not pause "to confirm" when the exit condition *is* met.

## Tool Hygiene

Binding on the **main session and every agent**. Agent files may add domain-specific rules but must not
contradict this section.

- **Dedicated tools beat Bash.** Use `Read` (not `cat`/`head`/`tail`), `Glob` (not `find`/`ls`), `Grep` (not
  `grep`/`rg`), `Edit`/`Write` (not `sed`/`awk`/heredoc redirects). Bash is for shell-only operations.
- **Never use `$()` command substitution in Bash calls.** It triggers a permission prompt that blocks
  automation. Split into sequential calls.
- **Never chain with `cd && …` or `cd ; …`.** It breaks permission-pattern matching. Use the Bash tool's
  working-directory semantics or run from the repo root with relative paths.
- **Never use `sudo`.** If a command fails without it, the root cause is a missing setup step — escalate.
- **Never shell out to the `claude` CLI.** All subagent work goes through the Agent tool.
- **Long-running commands: `run_in_background` + `Monitor`, not blocking Bash or sleep loops.** Redirect output
  to a `/tmp/` log file, then `Monitor` for completion markers filtered with `grep --line-buffered -E
  '<markers>'`. Never pipe long output through `| tail` — buffering can strand the marker.
- **Write tool beats heredoc for repo files.** `Write` is auto-approved on allowed paths and triggers
  formatter hooks. `Write` creates artifacts; it does not substitute for execution evidence — a Work Log must
  still contain test-run output.
- **No worktree isolation on Agent spawns** — see § Main Session Rules.

### PushNotification — when to use it

`PushNotification` is the out-of-band channel for **three structural events only** — using it for routine
status produces alert fatigue:

1. **Docker pre-flight escalation** — Docker unavailable and cannot be started.
2. **Credential-pattern hit on `git add`** — a credential just attempted to enter the index.
3. **Stuck-Loop Killswitch firing** — 3 consecutive identical-failure-mode attempts.

**Do not** use it for phase transitions, task completion, "are you ready?" pauses, recoverable retries, or
from inside a notification handler (the spam-loop trap). **Spam-loop guard:** if the underlying condition does
not change within the same invocation, do not fire a second notification for it.

## Task Pipeline

```
tasks/ (active) → tasks/done/ (completed)
```

Task files are named `TASK-BBB-NNN-short-description.md` where `BBB` is the brief number and `NNN` is the task
sequence. Bug reports use `BUG-BBB-NNN-short-description.md`. Bugs not tied to a single brief use
`BUG-000-NNN-description.md`. The `status` front-matter key tracks the five states in § Task Status Lifecycle.
The `assigned_to` front-matter key specifies the developer role.

Active tasks/bugs live in `tasks/`; completed ones move to `tasks/done/`. Every agent updates the `status`,
`updated_by`, and **Work Log** on every status change or meaningful work action.

## Task Metadata Contract

Every task/bug file carries four lifecycle/effort fields that power the `.claude/metrics/` capture system,
read by `log-task-edit.py` and surfaced in `scripts/metrics-report.py`. This section is **authoritative for
field semantics**; § Dispatch Checkpoint is authoritative for the atomic-edit ordering rule.

| Field                  | Format       | Written by                           | When                                                                         |
| ---------------------- | ------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| `started_at`           | ISO 8601 UTC | Developer (or IO if `Impl: io`)      | Same Edit that flips status out of `backlog` for the first time              |
| `complexity_estimate`  | integer 1–5  | Developer (or IO if `Impl: io`)      | Same Edit as `started_at` — honest estimate before reading impl notes        |
| `complexity_actual`    | integer 1–5  | Developer (or IO if `Impl: io`)      | Same Edit that flips status to `review`                                      |
| `completed_at`         | ISO 8601 UTC | SDET (or IO if reviewing `Impl: io`) | Inside the atomic close edit when flipping status to `done`                  |

**Hard verification gates:** SDET rejects any `review → done` transition if `complexity_actual` is empty or not
in `1`–`5`. The IO rejects slice-close if any task in `tasks/done/` matching the current brief has an empty
`started_at`, `completed_at`, `complexity_estimate`, or `complexity_actual`.

**Honest estimation:** inflating `complexity_estimate` to match `complexity_actual` defeats the metric. Wrong
estimates are useful data.

### Task spec required fields

Every task spec the IO creates during Plan must include (in addition to Definition of Done, Files to Create or
Modify, Quality Gates, and Work Log):

- **`acceptance_criteria`** — the brief AC ids this task satisfies (e.g. `AC-007-01`, `AC-007-03`). Used
  by the developer to scope tests and by the SDET to verify the slice meets the brief. Empty is acceptable only
  for a task with no user-facing behavior (e.g. a build-pipeline-only change): set
  `acceptance_criteria: none (justification: …)`.
- **`upstream_refs`** — optional REQ-/ADR-/EPIC- ids the brief cites that this task must honor, or `none`.
  Read if the cited layer is present; degrade gracefully if absent.
- **`code_standards`** — the brief's `code_standards:` ids this task must honor, or `none`. The developer
  tags the honoring code/test with `// CS-<LANG>-NNN` (CS-GEN-003); the SDET verifies each cited standard's
  `verification` hook. A `required` standard left un-honored (failing check or missing tag) is an SDET rejection;
  `recommended`/`experimental` are advisory. Threaded from the brief by the IO at Design onto only the tasks that
  touch that key's bucket.
- **`introduces_gate`** — `yes`, `no`, or `advisory`. Declares whether the task introduces a new quality
  gate. `yes` → § Gate Authoring Rules applies (Work Log must contain the three evidence items). A missing
  field is treated as an SDET rejection.

A task spec missing any required front-matter field is a mandatory SDET rejection. **Hotfix exception:** for
`brief_type: hotfix`, acceptance-test authoring may defer to a follow-up the IO creates during Plan (noted in
the relevant task's Work Log), with `(pending backfill: TASK-XXX)` annotations. `introduces_gate` is never deferrable.

## Acceptance & Methodology (the validation contract)

The brief's **acceptance criteria** are the team's source of truth for "is the slice correct." How they are
*tested* is the brief's **methodology** — and the engine is agnostic about it.

### The acceptance gate — no development without testable behavior

**Hard rule: no development work on a task may begin until it traces to testable acceptance criteria.** The
*format* and *method* are not mandated by the engine:

- **IO (Plan / Clarify):** confirm every task maps to one or more acceptance criteria that are observable and
  testable. If the brief's criteria are missing or untestable, the IO clarifies or escalates to the brief
  author (§ Autonomy Ceiling item 6). The IO records the brief's `methodology` (TDD? gherkin? e2e? coverage?)
  so developers and the SDET apply the right gates.
- **Developer startup:** scope executable tests against the task's acceptance criteria and the brief's mandated
  acceptance scenarios (e.g. bind gherkin scenarios when `acceptance_format: gherkin`; otherwise derive tests
  from the criteria). Build per the mandated methodology (TDD when `tdd: required`, else sensible default). If
  a task has no acceptance criteria, stop and escalate to the IO — Plan was incomplete.
- **SDET review:** verify delivered behavior satisfies the task's acceptance criteria under the brief's
  mandated test gates. Drift from a mandated acceptance scenario, or a task that fails its acceptance criteria,
  is a rejection. The SDET does **not** invent a gherkin/TDD requirement the brief did not state.

### When the brief changes mid-slice

If a brief change touches acceptance criteria referenced by a task in `in-progress` or `review`, the IO
**pauses and re-clarifies** the affected tasks: re-derive the slice's executable tests against the updated
criteria, re-read the task may need respec. If the change only affects `backlog` tasks, the IO refreshes their
`acceptance_criteria` front-matter fields before dispatch. Do not let implementation drift from the acceptance
contract silently.

### Slice validation gate

At slice completion the SDET cross-references delivered behavior against the brief's acceptance criteria —
every criterion in scope must be exercisable end-to-end through the delivered build, under the brief's mandated
test methodology. This is the team's own validation (no upstream RA).

## Breadcrumbs (session continuity)

Agents must leave enough context to resume if a session is interrupted.

**Developer agents** use the task file's **Work Log**. Every entry includes: **What was done** (files,
tests, commands), **What's next**, **Blockers**.

**IO and SDET** use `.implementation/state.json` + `pnpm task report` — the **single source of truth** for
current initiative state, quality gates, and retro action items. They update it via the `pnpm task
phase-transition` / `pnpm task merge-checkpoint` / `pnpm task post-merge` commands at every phase transition and
at the end of every invocation. Session entry shape (for the Work Log when the IO self-implements; for PROGRESS
context, use `pnpm task report`):

```
### {Role} {Phase} — {date}
**Start:** {what this invocation is doing}
**Actions:** {bulleted list}
**End:** {outcome and next step}
```

### state.json schema contract

The authoritative hot-state is `.implementation/state.json`, validated by the **independent oracle**
`validateState()` in `scripts/state-store.ts` (RETRO-LOE-010 / validation-oracle-independent-of-code).

Schema version `"1.0"` fields:
- `currentBrief` (string|null) — active brief ID (null when no slice)
- `currentPhase` (closed enum|null) — one of: Plan, Dispatch, Audit, Review, Smoke, Validate, Close-prep, Close-finalize
- `currentSliceDescription` (string|null) — human-readable one-liner
- `currentBranch` (string|null) — git branch name
- `awaitingMerge` (array) — in-flight PR records; each carries `pr`, `prUrl`, `squashSha`, `createdAt`, `gateVerdicts` (four slots: `containerSmoke`, `sdetValidation`, `sdetCiGate`, `sdetQualityAudit`), and `note`
- `openRetroItems` (array) — open retro action items; each carries `id`, `category`, `description`, `note`, `addedAt`
- `lastUpdated` (ISO 8601 UTC), `schemaVersion` ("1.0")

**Active bugs are NOT stored** — they are a QUERY over BUG-* front matter (`§9.1 one-fact-one-home`).

**On-demand report:** `pnpm task report` (or `pnpm task report --md`) renders a human-readable narrative from
`state.json` + `events.jsonl`. Never commit the rendered output — it is ephemeral.

**`events.jsonl`** is the append-only event log (phase-transition, merge-checkpoint, post-merge, migration
events). It is committed alongside `state.json` (§7 decision 1).

`scripts/validate-gates.sh` check 3 (`check_state_json_schema`) validates the schema on every gate run via the
independent oracle. A malformed `state.json` fails loudly.

## Dispatch Checkpoint

**Authoritative for the atomic-edit-before-any-other-file-change rule** — the ordering contract that makes
mid-execution recovery deterministic.

Before editing any file outside the task file itself, every dispatched agent must execute the pre-implementation atomic write: `pnpm task start <ID> --role <r> --complexity-estimate N [--note "…"]`. This single command atomically writes: (1) a **Work Log entry** with the canonically-formatted "Starting implementation" breadcrumb; (2) a **status flip** `backlog` → `in-progress` in the front matter; (3) the `started_at` (real UTC clock) and `complexity_estimate` fields per § Task Metadata Contract. Only after it succeeds may the agent edit any other file. A correct hand-edit that performs all three items in a single atomic Edit still passes `scripts/validate-gates.sh` — the CLI is the paved road, not a mandate.

**Why a rule, not a convention:** if a dispatched agent errors mid-execution, the task file is the only
persistent record that survives into the main session's context. The pre-implementation entry makes recovery
deterministic: read the task file, compare "What's next" against the working tree, decide to complete or
re-dispatch.

**Applies to:** all dispatched developer/SDET agents when implementing a task. **Does not apply to:** IO
self-implementation (`Impl: io` — recovery is conversational), the SDET review-close edit (own atomicity
contract), and read-only work (Overwatch audits).

**Enforcement:** SDET rejects any task at review whose Work Log lacks a pre-implementation entry (detectable
via git-log timestamps or the absence of a "Starting implementation"-shaped entry before the "review" entry).

## Programmatic Gate Validation

`scripts/validate-gates.sh` is the independent backstop that catches what agent discipline might miss. It
verifies: task-file gate completion, BUG file existence, `state.json` schema (check 3), gated-path
accountability, Work Log content, test artifacts, CI run evidence, and awaiting-merge record integrity
(check 9 — gateVerdicts slots + clock-inversion invariant). Run it before pushing or as a CI check.

## Rule Sunset

Rules in this file and `PHASES.md` must earn their keep. During each Close-prep retro, Overwatch flags rules
not triggered (cited, relied upon, or violated) in the last 3 slices. The IO surfaces flagged rules with a
keep/remove recommendation. This prevents the contract from growing monotonically.

## Docker Pre-Flight

Before running e2e or container tests, verify Docker is available (`docker info`). If not running, attempt to
start it and wait for health. If it still fails, **STOP** and escalate to the user — do not run e2e, approve
gates, or mark tasks passing without a running stack.

**This is a hard gate — no exceptions.** CI run artifacts are not a substitute for local e2e execution on
tasks whose brief mandates e2e. **Escalation semantics:** surface the full failure output, fire
`PushNotification` per § Tool Hygiene, then **stop**. No loop-retry, no workaround substitution, no gate
bypass.

## Submission Gate

Before marking any task `review`, the developer agent **must** pass:

1. **Lint + type-check** — zero errors (universal sanity).
2. **Build** — compiles/builds clean (universal sanity).
3. **Tests mandated by the brief** — unit/integration/e2e/coverage as the brief's `methodology` block
   requires. When the brief is silent, run the sensible default for the changed code (relevant unit tests at
   minimum).
4. **Docker pre-flight + targeted e2e** — only when the brief mandates e2e (`methodology.e2e: required`).

A task **must not** be marked `review` if any applicable gate fails. If Docker is unavailable for an
e2e-mandated task, stop and escalate.

**E2e proof:** when the brief mandates e2e, the Work Log must include actual test execution output. "Curl,"
"not executed," and "Docker unavailable" are not substitutes.

Universal gate commands (lint/type-check/build/test) are defined in `CLAUDE.md` under "Submission Gate
Commands." The brief layers its methodology requirements on top.

## Stuck-Loop Killswitch

When the same task fails the same gate **3 consecutive times with an unchanged failure mode**, the IO halts
the dispatch loop and escalates. "Unchanged failure mode" means: the SDET cites the same rejection reason
verbatim, CI fails on the same step with the same error class, or e2e fails on the same assertion. Iterative
debugging where each attempt addresses a *different* reason does NOT trigger the killswitch.

**Halt behavior (mandatory, all four):** (1) Create `BUG-BBB-NNN-stuck-on-<gate>.md` documenting the failing
gate, the unchanging failure mode verbatim (redact credential patterns), and an attempt-log summary. (2) Set
`Status: needs-user-direction`. (3) Fire `PushNotification` with the gate name + one-line failure summary. (4)
End the invocation. The user resumes by revising the task spec, the gate, or authorizing a different approach.

**Counter:** track the consecutive-identical-failure count in the task's `## Attempt Log`. Same failure mode as
N-1 → increment; different → reset to 1; hits 3 → fire.

## Task Status Lifecycle

A task's `Status:` takes one of five values (canonical enumeration):

- **`backlog`** — spec exists; not yet picked up.
- **`in-progress`** — agent dispatched; implementation underway.
- **`review`** — submission gate passed; awaiting SDET (or IO-as-reviewer for `Impl: io`) approval.
- **`done`** — SDET-approved; archived to `tasks/done/` at slice close.
- **`needs-user-direction`** — set by the Stuck-Loop Killswitch. The task is unrunnable as specified; the IO
  has halted; user input is required. Not a rejection — SDET does not review it, the IO does not block
  slice-close on it; it sits until the user moves it back to `backlog` or `in-progress`.

## Gate Authoring Rules

Any new **required** quality gate must demonstrate a documented green run on a **real code path** before
becoming required. A real code path exercises production source in its production shape — not a synthetic
fixture, not a "should work in theory" claim.

**Applies to:** required CI status checks, blocking DoD checkboxes, pre-push hook additions, new SDET
reject-on-fail criteria, new agent-spec blocking startup steps. **Does not apply to:** unit tests (the test is
its own evidence), non-blocking ergonomic checks, documentation polish, sandbox experiments.

**Evidence requirement (three items, all mandatory)** in the introducing task's Work Log:

1. **Run URL + specific job/step name** — proves which job actually ran the gate green on the real path. A bare
   run URL is insufficient. For local CI: a log-file path + grep-locatable marker line naming the step.
2. **Named code path** — the specific production source line(s) the gate would catch if regressed.
3. **Counterfactual** — one concrete change to that path that would red the gate, proving specificity.

**Exceptions:** in-flight regression (red-then-green sequence satisfies the rule); pre-existing gates are
grandfathered; hotfix urgency (gate lands `advisory`, promoted once the incident resolves).

**Enforcement:** SDET rejects at review if the three items are absent for a newly-introduced gate; the IO
rejects at Plan if a task requires a gate it cannot demonstrate green.

## Bug Fixes

Bug fixes for gated-path code follow the same pipeline: BUG file → IO orchestration → developer → submission
gate → SDET review. The IO decides orchestration weight (small fix may be self-implemented; larger gets full
dispatch).

**BUG file required before any fix code** — with reproduction steps, root cause, scope, severity, owner.
**Regression test required** — a test that would have caught the bug; the only escape is an explicit
`## Testability` section with IO approval in the Work Log. **Pre-push 3× run for e2e-heavy commits:** when a
fix touches e2e specs, run the affected spec 3 times sequentially with zero flakes before `review`.

## Removal Sweep

When a task **removes a shared artifact (a file)** from the repo, four obligations apply before marking
`review`. This rule closes retro-012-017 (BRIEF-LOE-012 `/pr-review` MAJOR: a `.orchestration/` consumer was
missed because the sweep was scoped to `.implementation/` only). Cite: retro-012-017 / BRIEF-LOE-013.
<!-- CS-GEN-003: retro-012-017 / BRIEF-LOE-013 -->

1. **Pass `check_removed_artifact_orphans`** — this is `scripts/validate-gates.sh` check 10. It runs as part
   of the existing gate run; no separate CI wiring is needed or added.

2. **Re-point every EXECUTABLE consumer across EVERY layer** — `.sh`, `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`,
   `.py`, `.yml`, `.yaml`, `package.json` files in **all** repo layers (`.implementation/`, `.orchestration/`,
   `.planning/`, `apps/`, `packages/`, `scripts/`, `.github/`, etc.) that reference the removed file must be
   updated before the task reaches `review`. Scoping the sweep to the owning layer only is the precise failure
   mode retro-012-017 caught.

3. **Record intentional retained references in `.implementation/removal-sweep-allow.txt`** — format is
   `<removed-path> | <consumer-path> | <mandatory reason>`. An entry with an empty reason field **fails the
   gate**; every suppression must be documented.

4. **Doc-only (`.md`) references are allowed by rule** — historical retro, handoff, and archive pointers in
   Markdown files are permanent and legitimate. They require no allowlist entry and do not fail the gate.

**Applies to:** developer agents removing a file as part of a task. **Does not apply to:** file *renames*
(which `check_removed_artifact_orphans` detects as moves, not deletions) or symbol/section-level removal
within a file (out of scope for this gate by design).

## Retro Finding Classification

At Close-prep retro, the IO classifies each finding that clears the **retro promotion bar** (concrete quality
gate failure only):

- **`gated-path-fix`** — needs a gated-path code change; the IO creates the work item during Close-prep.
- **`ungated-fix`** — fixable by editing ungated files; added to `state.json` `openRetroItems` via `pnpm task retro-add`.
- **`acknowledged`** — already resolved or a known limitation.

Findings that don't clear the bar stay as observations — no action items, no rule changes. Never commit to
`main` directly — ungated changes still need a branch + PR.

## How to Invoke

```
User (or upstream orchestrator) → build brief → IO (drives the slice autonomously)
```

The **IO** is invoked directly by the user (or by the main session as the dispatch executor between turns).
The IO does **not** spawn subagents directly: Claude Code does not support nested-Agent-from-subagent (the
`Agent` tool is stripped from subagent tool surfaces — see https://code.claude.com/docs/en/agent-teams.md
§ Limitations). Instead the IO composes dispatch prompts in a `## Next Dispatch` handoff block. The **main
session** reads the block, calls the `Agent` tool with the verbatim prompt, captures the result, and re-invokes
the IO with that result appended.

**Agent identification (mandatory):** every spawn prompt must include: (1) read `.implementation/ENGINE.md`
for workflow rules, (2) read the agent file (`.implementation/agents/{role}.md`, or `.implementation/AGENT.md`
for the IO) for role instructions, and (3) the self-identification instruction: _"You are the **{role name}**.
Begin every response with `[{role-tag}]`."_ Developer agents update task files; the IO updates `state.json` (via `pnpm task phase-transition`/`merge-checkpoint`/`post-merge`) and the SDET records gate verdicts.

**Main-session dispatch executor — minimal contract:**

1. On user invocation, spawn the IO via `Agent(subagent_type="io", prompt=…)`.
2. When the IO returns a `## Next Dispatch` block, parse `Subagent type` and the verbatim prompt body.
3. Call `Agent(subagent_type=<that type>, prompt=<verbatim body>)`.
4. When the implementer returns, re-invoke the IO with its full output appended after `## Implementer result`.
   Repeat from step 2.
5. When the IO returns without a `## Next Dispatch` block, surface its `## Next` text to the user.

The main session does not paraphrase, narrow, or edit the IO-composed prompt. If it looks wrong, re-invoke the
IO with a `## Main session note: <reason>` rather than editing.

## Git Operations

**The `main` branch is off-limits.** No agent and no main session may commit to, push to, or directly modify
`main`. The only way into `main` is a PR from a feature branch. No exceptions.

1. Create a branch from `main` (e.g. `brief-NNN-short-description`).
2. Commit changes to the branch.
3. Push and open a PR (squash merge to `main`).
4. Delete the branch after merge.

One branch per slice/logical unit of work. No long-lived branches. If a brief is too large for one branch, the
upstream producer should split it before the IO begins Plan.

### `git add` hygiene

**Never use `git add -A` or `git add .`** — always stage specific files by name. Parallel sessions may have
edited files you didn't touch. Review `git diff --cached` before every commit; `git status --short` first when
in doubt.

## Ambiguity During Implementation

Undecided design points are resolved by picking the most consistent approach, noted as a `// DECISION:` comment
or in the post-implementation summary. If ambiguity would change task scope, surface it to the IO before
writing code. The IO reviews `// DECISION:` comments during Close-prep — any with cross-task implications are
recorded; any that are genuinely architectural are **raised** to `.architecture/` via `OPEN-QUESTIONS.md`
(the team does not author system ADRs).

## Escalation Protocol

Any agent can escalate to the **IO** when stuck or when a problem exceeds its capacity. Escalate early — don't
waste attempts on problems that need orchestration-level reasoning.

**How:** note `**Escalation: IO consultation requested**` in the Work Log (developers) or in a `pnpm task trace` note (SDET)
with a clear problem description. **When:** a problem needs cross-task reasoning or a decision beyond task
scope; an issue that can't be fully diagnosed; an ambiguity with implications beyond the slice (raise upstream
if it belongs to a `.requirements/`/`.architecture/`/`.planning/` layer); **after 2+ failed attempts** on the
same task (record what was tried in the Attempt Log; do not repeat a failed approach); **hard stop at 4 failed
attempts** (mark `Escalated: yes`). Escalated tasks take priority in the IO's dispatch order.
